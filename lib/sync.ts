import { getSupabaseAdmin } from '@/lib/supabase'
import {
  authenticatePeloton,
  fetchNewWorkouts,
  fetchWorkoutSummary,
  fetchWorkoutPerformance,
  fetchRide,
  extractAvgMetric,
} from '@/lib/peloton'
import type {
  PelotonWorkoutSummary,
  PelotonWorkoutPerformance,
  PelotonRide,
} from '@/types'

// Skip refetching rides whose cached metadata is fresher than this.
// Ride metadata rarely changes after the original air date.
const RIDE_CACHE_TTL_DAYS = 30

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>
type PelotonSession = Awaited<ReturnType<typeof authenticatePeloton>>

function transformRide(ride: PelotonRide) {
  return {
    id: ride.id,
    title: ride.title ?? null,
    description: ride.description ?? null,
    instructor_name: ride.instructor?.name ?? null,
    instructor_image_url: ride.instructor?.image_url ?? null,
    duration_seconds: ride.duration ?? null,
    fitness_discipline: ride.fitness_discipline ?? null,
    difficulty_estimate: ride.difficulty_estimate ?? null,
    overall_rating_avg: ride.overall_rating_avg ?? null,
    total_workouts: ride.total_workouts ?? null,
    total_ratings: ride.total_ratings ?? null,
    image_url: ride.image_url ?? null,
    original_air_time: ride.original_air_time
      ? new Date(ride.original_air_time * 1000).toISOString()
      : null,
    has_pedaling_metrics: ride.has_pedaling_metrics ?? false,
    is_explicit: ride.is_explicit ?? false,
    raw_data: ride,
    updated_at: new Date().toISOString(),
  }
}

// Ensure every ride referenced by `summaries` exists in the `rides` table.
// Skips fetches for rides whose cached row was updated within RIDE_CACHE_TTL_DAYS.
// Returns the set of ride_ids safe to assign to workouts (i.e. present in the
// rides table) so we don't trip the FK on `workouts.ride_id`.
async function ensureRidesCached(
  db: SupabaseAdmin,
  session: PelotonSession,
  summaries: PelotonWorkoutSummary[]
): Promise<Set<string>> {
  const rideIds = new Set<string>()
  for (const s of summaries) {
    const id = s.ride?.id
    if (id) rideIds.add(id)
  }
  if (rideIds.size === 0) return new Set()

  const cutoffIso = new Date(
    Date.now() - RIDE_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

  const { data: existing } = await db
    .from('rides')
    .select('id, updated_at')
    .in('id', Array.from(rideIds))

  const existingIds = new Set((existing ?? []).map((r) => r.id as string))
  const freshIds = new Set(
    (existing ?? [])
      .filter((r) => (r.updated_at as string) >= cutoffIso)
      .map((r) => r.id as string)
  )

  const safeIds = new Set(existingIds)
  const toFetch = Array.from(rideIds).filter((id) => !freshIds.has(id))

  for (const rideId of toFetch) {
    try {
      const ride = await fetchRide(session, rideId)
      const { error } = await db
        .from('rides')
        .upsert(transformRide(ride), { onConflict: 'id' })
      if (error) throw error
      safeIds.add(rideId)
      await new Promise((r) => setTimeout(r, 200))
    } catch (e) {
      // Log and skip — better to lose ride metadata for one class than
      // fail the whole sync run.
      console.error(`Failed to upsert ride ${rideId}:`, e)
    }
  }

  return safeIds
}

interface SyncResult {
  memberId: string
  memberName: string
  workoutsAdded: number
  error?: string
}

function transformWorkout(
  memberId: string,
  summary: PelotonWorkoutSummary,
  perf: PelotonWorkoutPerformance,
  safeRideIds: Set<string>
) {
  const outputKj = summary.total_work
    ? Math.round((summary.total_work / 1000) * 10) / 10
    : null

  // Only set ride_id if the ride is present in the rides table —
  // otherwise the FK would fail. Workouts whose ride fetch failed
  // get inserted with ride_id null and can be backfilled later.
  const rideId = summary.ride?.id
  const safeRideId = rideId && safeRideIds.has(rideId) ? rideId : null

  return {
    member_id: memberId,
    peloton_workout_id: summary.id,
    workout_date: new Date(summary.start_time * 1000).toISOString(),
    fitness_discipline: summary.fitness_discipline,
    title: summary.ride?.title ?? summary.title ?? 'Workout',
    instructor_name: summary.ride?.instructor?.name ?? null,
    duration_seconds: summary.ride?.duration ?? null,
    total_output_kj: outputKj,
    avg_watts: extractAvgMetric(perf, 'Output') ?? extractAvgMetric(perf, 'Avg. Watts'),
    avg_cadence: extractAvgMetric(perf, 'Cadence'),
    avg_resistance: extractAvgMetric(perf, 'Resistance'),
    avg_speed: extractAvgMetric(perf, 'Speed'),
    distance_miles: extractAvgMetric(perf, 'Distance'),
    calories: extractAvgMetric(perf, 'Calories'),
    leaderboard_rank: summary.leaderboard_rank ?? null,
    leaderboard_total: summary.total_leaderboard_users ?? null,
    difficulty_rating: summary.ride?.difficulty_rating_avg ?? null,
    ride_id: safeRideId,
    is_personal_record: summary.is_total_work_personal_record ?? false,
    raw_data: summary,
  }
}

export async function syncMember(memberId: string): Promise<SyncResult> {
  const db = getSupabaseAdmin()

  const { data: member, error: memberErr } = await db
    .from('members')
    .select('id, name, peloton_username, peloton_user_id')
    .eq('id', memberId)
    .single()

  if (memberErr || !member) {
    return { memberId, memberName: 'Unknown', workoutsAdded: 0, error: 'Member not found' }
  }

  const { data: creds, error: credsErr } = await db
    .from('member_credentials')
    .select('peloton_bearer_token')
    .eq('member_id', memberId)
    .single()

  if (credsErr || !creds?.peloton_bearer_token) {
    return { memberId, memberName: member.name, workoutsAdded: 0, error: 'No bearer token stored' }
  }

  const { data: logEntry } = await db
    .from('sync_log')
    .insert({ member_id: memberId, status: 'running' })
    .select()
    .single()

  const logId = logEntry?.id

  try {
    const session = await authenticatePeloton(creds.peloton_bearer_token)

    const { data: existingWorkouts } = await db
      .from('workouts')
      .select('peloton_workout_id')
      .eq('member_id', memberId)

    const knownIds = new Set((existingWorkouts ?? []).map((w) => w.peloton_workout_id))

    const newWorkouts = await fetchNewWorkouts(session, knownIds)

    if (newWorkouts.length === 0) {
      await db.from('sync_log').update({ status: 'success', completed_at: new Date().toISOString(), workouts_added: 0 }).eq('id', logId)
      return { memberId, memberName: member.name, workoutsAdded: 0 }
    }

    const fetched: Array<{
      summary: PelotonWorkoutSummary
      perf: PelotonWorkoutPerformance
    }> = []
    for (const workout of newWorkouts) {
      try {
        const summary = await fetchWorkoutSummary(session, workout.id)
        let perf: PelotonWorkoutPerformance = { duration: 0, avg_summaries: [], summaries: [] }
        if (workout.fitness_discipline === 'cycling') {
          perf = await fetchWorkoutPerformance(session, workout.id)
        }
        fetched.push({ summary, perf })
        await new Promise((r) => setTimeout(r, 200))
      } catch (e) {
        console.error(`Failed to process workout ${workout.id}:`, e)
      }
    }

    // Populate the rides table for every unique ride encountered this run,
    // skipping any cached within the last RIDE_CACHE_TTL_DAYS.
    const safeRideIds = await ensureRidesCached(
      db,
      session,
      fetched.map((f) => f.summary)
    )

    const rows = fetched.map(({ summary, perf }) =>
      transformWorkout(memberId, summary, perf, safeRideIds)
    )

    if (rows.length > 0) {
      const { error: insertErr } = await db
        .from('workouts')
        .upsert(rows, { onConflict: 'peloton_workout_id' })
      if (insertErr) throw insertErr
    }

    await db.from('sync_log').update({ status: 'success', completed_at: new Date().toISOString(), workouts_added: rows.length }).eq('id', logId)

    return { memberId, memberName: member.name, workoutsAdded: rows.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db.from('sync_log').update({ status: 'error', completed_at: new Date().toISOString(), error_message: message }).eq('id', logId)
    return { memberId, memberName: member.name, workoutsAdded: 0, error: message }
  }
}

export async function syncAllMembers(): Promise<SyncResult[]> {
  const db = getSupabaseAdmin()
  const { data: members, error } = await db.from('members').select('id').eq('active', true)
  if (error || !members) return []

  const results: SyncResult[] = []
  for (const member of members) {
    const result = await syncMember(member.id)
    results.push(result)
    await new Promise((r) => setTimeout(r, 1000))
  }
  return results
}
