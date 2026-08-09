import { NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase'
import { tabataWeekStart } from '@/lib/tabata'

export const dynamic = 'force-dynamic'

// GET /api/tabata — the Tabata Tuesday picks and per-week results.
//
// A week's result set = each member's best attempt at THAT week's ride,
// ridden any time within the Tue→Tue week window. Riding the same class in
// a different week (or months earlier) doesn't count for this week.

interface RideRow {
  id: string
  title: string | null
  instructor_name: string | null
  instructor_image_url: string | null
  duration_seconds: number | null
  fitness_discipline: string | null
  difficulty_estimate: number | null
  image_url: string | null
}

interface WeekRow {
  week_start: string
  ride_id: string
  scheduled_start: string | null
  rides: RideRow | RideRow[] | null
}

interface WorkoutRow {
  member_id: string
  ride_id: string | null
  workout_date: string
  total_output_kj: number | null
  avg_watts: number | null
  duration_seconds: number | null
  leaderboard_rank: number | null
  leaderboard_total: number | null
}

const MAX_WEEKS = 13 // current week + a quarter of history

function weekWindow(weekStart: string): { from: string; to: string } {
  const from = new Date(`${weekStart}T00:00:00.000Z`)
  const to = new Date(from)
  to.setUTCDate(to.getUTCDate() + 7)
  return { from: from.toISOString(), to: to.toISOString() }
}

export async function GET() {
  noStore()
  const db = getSupabaseAdmin()
  try {
    const { data: weekRows, error: weeksErr } = await db
      .from('tabata_weeks')
      .select(
        'week_start, ride_id, scheduled_start, rides ( id, title, instructor_name, instructor_image_url, duration_seconds, fitness_discipline, difficulty_estimate, image_url )'
      )
      .order('week_start', { ascending: false })
      .limit(MAX_WEEKS)
    if (weeksErr) throw weeksErr

    const weeks = (weekRows ?? []) as unknown as WeekRow[]

    const { data: memberRows, error: membersErr } = await db
      .from('members')
      .select('id, name, initials, image_url')
      .eq('active', true)
    if (membersErr) throw membersErr
    const members = memberRows ?? []
    const memberById = new Map(members.map((m) => [m.id as string, m]))

    // One workouts query covering every listed week, bucketed in JS by each
    // week's own window (handles a class being re-picked in a later week).
    let workouts: WorkoutRow[] = []
    if (weeks.length > 0) {
      const oldest = weekWindow(weeks[weeks.length - 1].week_start).from
      const { data: workoutRows, error: workoutsErr } = await db
        .from('workouts')
        .select(
          'member_id, ride_id, workout_date, total_output_kj, avg_watts, duration_seconds, leaderboard_rank, leaderboard_total'
        )
        .in('ride_id', Array.from(new Set(weeks.map((w) => w.ride_id))))
        .gte('workout_date', oldest)
      if (workoutsErr) throw workoutsErr
      workouts = (workoutRows ?? []) as WorkoutRow[]
    }

    const payloadWeeks = weeks.map((week) => {
      const { from, to } = weekWindow(week.week_start)
      const ride = Array.isArray(week.rides) ? week.rides[0] ?? null : week.rides

      // Best attempt per member: highest output, then longest duration.
      const bestByMember = new Map<string, WorkoutRow>()
      for (const w of workouts) {
        if (w.ride_id !== week.ride_id) continue
        if (w.workout_date < from || w.workout_date >= to) continue
        if (!memberById.has(w.member_id)) continue
        const prev = bestByMember.get(w.member_id)
        const better =
          !prev ||
          Number(w.total_output_kj ?? 0) > Number(prev.total_output_kj ?? 0) ||
          (Number(w.total_output_kj ?? 0) === Number(prev.total_output_kj ?? 0) &&
            Number(w.duration_seconds ?? 0) > Number(prev.duration_seconds ?? 0))
        if (better) bestByMember.set(w.member_id, w)
      }

      const results = Array.from(bestByMember.entries())
        .map(([memberId, w]) => {
          const m = memberById.get(memberId)!
          return {
            member_id: memberId,
            name: m.name as string,
            initials: m.initials as string,
            image_url: (m.image_url as string | null) ?? null,
            workout_date: w.workout_date,
            total_output_kj: w.total_output_kj,
            avg_watts: w.avg_watts,
            duration_seconds: w.duration_seconds,
            leaderboard_rank: w.leaderboard_rank,
            leaderboard_total: w.leaderboard_total,
          }
        })
        .sort(
          (a, b) =>
            Number(b.total_output_kj ?? 0) - Number(a.total_output_kj ?? 0)
        )

      const riddenIds = new Set(results.map((r) => r.member_id))
      const not_yet = members
        .filter((m) => !riddenIds.has(m.id as string))
        .map((m) => ({
          member_id: m.id as string,
          name: m.name as string,
          initials: m.initials as string,
          image_url: (m.image_url as string | null) ?? null,
        }))

      return {
        week_start: week.week_start,
        scheduled_start: week.scheduled_start,
        ride,
        results,
        not_yet,
      }
    })

    // "Current" strictly means this Tue→Tue week. If Stephanie hasn't set
    // it yet, current is null and the newest row stays in the archive.
    const thisWeek = tabataWeekStart(new Date())
    const current = payloadWeeks.find((w) => w.week_start === thisWeek) ?? null
    const past = payloadWeeks.filter((w) => w.week_start !== thisWeek)

    return NextResponse.json({ current, past })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
