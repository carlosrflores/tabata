import { getSupabaseAdmin } from '@/lib/supabase'
import {
  authenticatePeloton,
  fetchNewWorkouts,
  fetchWorkoutSummary,
  fetchWorkoutPerformance,
  extractAvgMetric,
} from '@/lib/peloton'
import type { PelotonWorkoutSummary, PelotonWorkoutPerformance } from '@/types'

interface SyncResult {
  memberId: string
  memberName: string
  workoutsAdded: number
  error?: string
}

function transformWorkout(
  memberId: string,
  summary: PelotonWorkoutSummary,
  perf: PelotonWorkoutPerformance
) {
  const outputKj = summary.total_work
    ? Math.round((summary.total_work / 1000) * 10) / 10
    : null

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
    .select('peloton_password_encrypted')
    .eq('member_id', memberId)
    .single()

  if (credsErr || !creds) {
    return { memberId, memberName: member.name, workoutsAdded: 0, error: 'No credentials stored' }
  }

  const { data: logEntry } = await db
    .from('sync_log')
    .insert({ member_id: memberId, status: 'running' })
    .select()
    .single()

  const logId = logEntry?.id

  try {
    const session = await authenticatePeloton(
      member.peloton_username,
      creds.peloton_password_encrypted
    )

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

    const rows = []
    for (const workout of newWorkouts) {
      try {
        const summary = await fetchWorkoutSummary(session, workout.id)
        let perf: PelotonWorkoutPerformance = { duration: 0, avg_summaries: [], summaries: [] }
        if (workout.fitness_discipline === 'cycling') {
          perf = await fetchWorkoutPerformance(session, workout.id)
        }
        rows.push(transformWorkout(memberId, summary, perf))
        await new Promise((r) => setTimeout(r, 200))
      } catch (e) {
        console.error(`Failed to process workout ${workout.id}:`, e)
      }
    }

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
