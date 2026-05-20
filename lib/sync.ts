import { getSupabaseAdmin } from '@/lib/supabase'
import {
  createSession,
  fetchNewWorkouts,
  fetchWorkoutSummary,
  fetchWorkoutPerformance,
  fetchRide,
  extractAvgMetric,
  extractSummaryMetric,
  refreshPelotonToken,
  PERFORMANCE_GRAPH_DISCIPLINES,
} from '@/lib/peloton'
import type { PelotonSession } from '@/lib/peloton'
import type {
  PelotonWorkoutSummary,
  PelotonWorkoutPerformance,
  PelotonRide,
} from '@/types'

// Skip refetching rides whose cached metadata is fresher than this.
// Ride metadata rarely changes after the original air date.
const RIDE_CACHE_TTL_DAYS = 30

// Refresh the access token if it expires within this window. A sync run
// takes minutes, the token has ~48h of life — a one-minute buffer is plenty.
const REFRESH_BUFFER_MS = 60 * 1000

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>

interface StoredCreds {
  peloton_bearer_token: string | null
  peloton_refresh_token: string | null
  peloton_token_expires_at: string | null
  peloton_auth0_client_id: string | null
}

// Read a member's stored credentials, refreshing the access token if it's
// within REFRESH_BUFFER_MS of expiry (or already expired) and we have both
// the refresh token and the Auth0 client_id needed to do so. Persists the
// new tokens back to member_credentials before returning.
//
// Falls back to the stored access token if the refresh call fails — the
// stored token may still be valid for a few seconds, and if not, the next
// Peloton API call will 401 and surface through the existing error paths.
//
// Pre-refresh-token rows (refresh_token / client_id NULL) skip the refresh
// path entirely and return whatever access token is stored. This is the
// graceful-fallback that lets the sync keep running before bootstrap is
// updated to capture refresh tokens.
async function getFreshPelotonSession(
  db: SupabaseAdmin,
  memberId: string,
  pelotonUserId: string
): Promise<PelotonSession | null> {
  const { data: creds } = await db
    .from('member_credentials')
    .select(
      'peloton_bearer_token, peloton_refresh_token, peloton_token_expires_at, peloton_auth0_client_id'
    )
    .eq('member_id', memberId)
    .single<StoredCreds>()

  if (!creds?.peloton_bearer_token) return null

  // Prefer the stored expires_at; for rows written before the auth-refresh
  // migration it's null, so decode from the JWT instead.
  const expiresAtIso =
    creds.peloton_token_expires_at ?? decodeJwtExp(creds.peloton_bearer_token)
  const expiresAtMs = expiresAtIso ? new Date(expiresAtIso).getTime() : null
  const needsRefresh =
    expiresAtMs != null && expiresAtMs - Date.now() < REFRESH_BUFFER_MS

  if (
    needsRefresh &&
    creds.peloton_refresh_token &&
    creds.peloton_auth0_client_id
  ) {
    try {
      const fresh = await refreshPelotonToken(
        creds.peloton_refresh_token,
        creds.peloton_auth0_client_id
      )
      await db
        .from('member_credentials')
        .update({
          peloton_bearer_token: fresh.accessToken,
          peloton_refresh_token: fresh.refreshToken,
          peloton_token_expires_at: fresh.expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('member_id', memberId)
      return createSession(fresh.accessToken, pelotonUserId)
    } catch (e) {
      console.error(`Token refresh failed for member ${memberId}:`, e)
      // Fall through and use the stored access token below.
    }
  }

  return createSession(creds.peloton_bearer_token, pelotonUserId)
}

function transformRide(ride: PelotonRide, fallbackInstructorName?: string | null) {
  return {
    id: ride.id,
    title: ride.title ?? null,
    description: ride.description ?? null,
    // /api/ride/{id}?joins=instructor often returns only instructor_id, not a
    // nested instructor object, so fall back to the name resolved from the
    // workout summary's ride.instructor join (which does populate reliably).
    instructor_name: ride.instructor?.name ?? fallbackInstructorName ?? null,
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
  // Peloton emits this sentinel ride id for class-less sessions (e.g. "Just
  // Ride", scenic rides). Fetching it 404s; filter it upfront so the log
  // stays clean. The owning workout still gets ride_id=null safely.
  const SENTINEL_RIDE_ID = '00000000000000000000000000000000'

  const rideIds = new Set<string>()
  const instructorByRide = new Map<string, string>()
  for (const s of summaries) {
    const id = s.ride?.id
    if (id && id !== SENTINEL_RIDE_ID) {
      rideIds.add(id)
      const name = s.ride?.instructor?.name
      if (name && !instructorByRide.has(id)) instructorByRide.set(id, name)
    }
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
        .upsert(transformRide(ride, instructorByRide.get(rideId) ?? null), {
          onConflict: 'id',
        })
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
    avg_watts: extractAvgMetric(perf, 'Avg Output'),
    avg_cadence: extractAvgMetric(perf, 'Avg Cadence'),
    avg_resistance: extractAvgMetric(perf, 'Avg Resistance'),
    avg_speed: extractAvgMetric(perf, 'Avg Speed'),
    distance_miles: extractSummaryMetric(perf, 'Distance'),
    calories: extractSummaryMetric(perf, 'Calories'),
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

  // Try the member's own stored token first; fall back to the owner's token.
  // This allows friends to be added by username alone without providing their own token.
  // getFreshPelotonSession handles the refresh-token dance internally.
  let session: PelotonSession
  const targetUserId = member.peloton_user_id

  const ownSession = await getFreshPelotonSession(
    db,
    memberId,
    member.peloton_user_id ?? ''
  )

  if (ownSession) {
    session = ownSession
  } else {
    const { data: owner } = await db
      .from('members')
      .select('id, peloton_user_id')
      .eq('is_owner', true)
      .single()
    if (!owner) {
      return { memberId, memberName: member.name, workoutsAdded: 0, error: 'No credentials and no owner found' }
    }
    const ownerSession = await getFreshPelotonSession(
      db,
      owner.id,
      owner.peloton_user_id ?? ''
    )
    if (!ownerSession) {
      return { memberId, memberName: member.name, workoutsAdded: 0, error: 'Owner has no credentials stored' }
    }
    // Owner's token with owner's userId; targetUserId routes the workout fetch
    // to the right member via fetchNewWorkouts.
    session = ownerSession
  }

  const { data: logEntry } = await db
    .from('sync_log')
    .insert({ member_id: memberId, status: 'running' })
    .select()
    .single()

  const logId = logEntry?.id

  try {
    const { data: existingWorkouts } = await db
      .from('workouts')
      .select('peloton_workout_id')
      .eq('member_id', memberId)

    const knownIds = new Set((existingWorkouts ?? []).map((w) => w.peloton_workout_id))

    const newWorkouts = await fetchNewWorkouts(session, knownIds, 10, targetUserId ?? undefined)

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
        let perf: PelotonWorkoutPerformance = { duration: 0, average_summaries: [], summaries: [] }
        if (PERFORMANCE_GRAPH_DISCIPLINES.has(workout.fitness_discipline)) {
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

export type SyncTrigger = 'cron' | 'manual' | 'backfill'

// Decode the `exp` claim from a Peloton JWT and return it as ISO.
// Returns null on any parse failure — never throws.
function decodeJwtExp(token: string): string | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const payload = JSON.parse(atob(parts[1]))
    if (typeof payload.exp !== 'number') return null
    return new Date(payload.exp * 1000).toISOString()
  } catch {
    return null
  }
}

async function fetchOwnerTokenExp(db: SupabaseAdmin): Promise<string | null> {
  const { data: owner } = await db
    .from('members')
    .select('id')
    .eq('is_owner', true)
    .single()
  if (!owner) return null
  const { data: creds } = await db
    .from('member_credentials')
    .select('peloton_bearer_token')
    .eq('member_id', owner.id)
    .single()
  if (!creds?.peloton_bearer_token) return null
  return decodeJwtExp(creds.peloton_bearer_token)
}

export async function syncAllMembers(
  trigger: SyncTrigger = 'manual'
): Promise<SyncResult[]> {
  const db = getSupabaseAdmin()

  const tokenExpiresAt = await fetchOwnerTokenExp(db).catch(() => null)

  // Open a sync_runs row. Observability must never block sync work, so
  // failures here are logged but not propagated.
  let runId: string | null = null
  try {
    const { data: run } = await db
      .from('sync_runs')
      .insert({ trigger, status: 'running', token_expires_at: tokenExpiresAt })
      .select('id')
      .single()
    runId = run?.id ?? null
  } catch (e) {
    console.error('Failed to insert sync_runs row:', e)
  }

  const finalize = async (
    status: 'success' | 'partial' | 'failed',
    membersProcessed: number,
    membersFailed: number,
    workoutsAdded: number,
    lastError: string | null
  ) => {
    if (!runId) return
    try {
      await db
        .from('sync_runs')
        .update({
          status,
          finished_at: new Date().toISOString(),
          members_processed: membersProcessed,
          members_failed: membersFailed,
          workouts_added: workoutsAdded,
          last_error: lastError ? lastError.slice(0, 2000) : null,
        })
        .eq('id', runId)
    } catch (e) {
      console.error('Failed to update sync_runs row:', e)
    }
  }

  const { data: members, error } = await db
    .from('members')
    .select('id')
    .eq('active', true)
  if (error || !members) {
    const msg = error
      ? `Member query failed: ${error.message}`
      : 'Member query returned no data'
    await finalize('failed', 0, 0, 0, msg)
    return []
  }

  const results: SyncResult[] = []
  let workoutsTotal = 0
  let failed = 0
  let firstError: string | null = null

  for (const member of members) {
    const result = await syncMember(member.id)
    results.push(result)
    workoutsTotal += result.workoutsAdded
    if (result.error) {
      failed++
      if (!firstError) firstError = `${result.memberName}: ${result.error}`
    }
    await new Promise((r) => setTimeout(r, 1000))
  }

  // Empty member list counts as success (nothing to fail).
  const status =
    failed === 0
      ? 'success'
      : failed >= members.length
      ? 'failed'
      : 'partial'

  await finalize(status, members.length, failed, workoutsTotal, firstError)
  return results
}
