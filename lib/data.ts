// Read-side data for the public pages and their API routes.
//
// Everything here is wrapped in unstable_cache under PUBLIC_DATA_TAG, so
// page renders and API calls are served from Next's Data Cache instead of
// querying Supabase every time. The data only changes when a sync lands,
// a member is added, or the weekly Tabata class is picked — each of those
// calls revalidatePublicData(). REVALIDATE_SECONDS is a backstop that also
// covers time-based boundaries (the Tuesday week rollover).
//
// Supabase fetches inside unstable_cache run uncached (Next forces
// no-store for nested fetches), so there's a single cache layer to reason
// about. Don't read public data outside these helpers from a page that
// isn't force-dynamic, or supabase-js's fetch can land in the Data Cache
// with no tag and go stale.

import { revalidatePath, revalidateTag, unstable_cache } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase'
import { tabataWeekStart } from '@/lib/tabata'

export const PUBLIC_DATA_TAG = 'public-data'
export const REVALIDATE_SECONDS = 900

const cacheOpts = { tags: [PUBLIC_DATA_TAG], revalidate: REVALIDATE_SECONDS }

// Drop every cached public page and query. Call after any write that
// changes what the leaderboard, member, ride, or Tabata pages show.
export function revalidatePublicData() {
  revalidateTag(PUBLIC_DATA_TAG)
  revalidatePath('/', 'layout')
}

// ---------- Leaderboard ----------

export interface LeaderboardRow {
  member_id: string
  name: string
  initials: string
  image_url: string | null
  total_output_kj: number
  workout_count: number
  best_leaderboard_rank: number | null
  best_leaderboard_total: number | null
  leaderboard_percentile: number | null
  week_start: string
  streak_weeks: number
  is_you: boolean
}

export const getLeaderboard = unstable_cache(
  async (weekOffset: number) => {
    const db = getSupabaseAdmin()
    // Streaks are inherently "as of now" — only meaningful for the current week.
    const [lb, streakRes] = await Promise.all([
      db.rpc('leaderboard_for_week', { p_week_offset: weekOffset }),
      weekOffset === 0 ? db.rpc('get_member_streaks') : Promise.resolve({ data: [] }),
    ])
    if (lb.error) throw lb.error
    const rows = (lb.data ?? []) as Omit<LeaderboardRow, 'streak_weeks' | 'is_you'>[]

    const streaks: Record<string, number> = {}
    for (const row of (streakRes.data ?? []) as { member_id: string; streak_weeks: number }[]) {
      streaks[row.member_id] = row.streak_weeks
    }

    // Derive the week's summary cards from the rows (every active member is
    // present via the RPC's left join, so length = total members).
    const groupTotal = rows.reduce((s, r) => s + Number(r.total_output_kj ?? 0), 0)
    const activeMembers = rows.filter((r) => Number(r.workout_count) > 0).length
    const top = rows[0]
    const week_stats = {
      week_start: top?.week_start ?? new Date().toISOString(),
      group_total_output_kj: Math.round(groupTotal),
      active_members: activeMembers,
      total_members: rows.length,
      top_performer_name: top && Number(top.total_output_kj) > 0 ? top.name : null,
      top_performer_kj: top ? Math.round(Number(top.total_output_kj)) : 0,
    }

    const leaderboard: LeaderboardRow[] = rows.map((entry) => ({
      ...entry,
      streak_weeks: streaks[entry.member_id] ?? 0,
      is_you: false,
    }))

    return { leaderboard, week_stats, week_offset: weekOffset, synced_at: new Date().toISOString() }
  },
  ['leaderboard'],
  cacheOpts
)

// ---------- Member stats ----------

export const getMemberStats = unstable_cache(
  async (memberId: string) => {
    const db = getSupabaseAdmin()
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const [memberRes, recentRes, prRes, monthlyRes, allTimeRes] = await Promise.all([
      db.from('members')
        .select('id, name, initials, peloton_username, image_url').eq('id', memberId).maybeSingle(),
      db.from('workouts')
        .select('id, workout_date, title, instructor_name, duration_seconds, total_output_kj, leaderboard_rank, leaderboard_total, fitness_discipline, ride_id')
        .eq('member_id', memberId).eq('fitness_discipline', 'cycling')
        .order('workout_date', { ascending: false }).limit(10),
      db.from('personal_records')
        .select('*').eq('member_id', memberId).order('duration_seconds', { ascending: true }),
      db.from('workouts')
        .select('workout_date, total_output_kj').eq('member_id', memberId)
        .eq('fitness_discipline', 'cycling').gte('workout_date', sixMonthsAgo.toISOString()),
      db.from('workouts')
        .select('total_output_kj').eq('member_id', memberId).eq('fitness_discipline', 'cycling'),
    ])
    // A malformed id (not a uuid) errors rather than returning no row.
    if (memberRes.error || !memberRes.data) return null

    const monthlyTotals: Record<string, number> = {}
    for (const w of monthlyRes.data ?? []) {
      const month = (w.workout_date as string).substring(0, 7)
      monthlyTotals[month] = (monthlyTotals[month] ?? 0) + (w.total_output_kj ?? 0)
    }
    const trend = Object.entries(monthlyTotals).map(([month, kj]) => ({
      month, total_output_kj: Math.round(kj),
    }))

    const allTime = allTimeRes.data ?? []
    const allTimeOutput = allTime.reduce((sum, w) => sum + (w.total_output_kj ?? 0), 0)

    return {
      member: memberRes.data,
      recent_workouts: recentRes.data ?? [],
      personal_records: prRes.data ?? [],
      monthly_trend: trend,
      all_time: { total_workouts: allTime.length, total_output_kj: Math.round(allTimeOutput) },
    }
  },
  ['member-stats'],
  cacheOpts
)

// ---------- Rides ----------

export const getRidesIndex = unstable_cache(
  async () => {
    const { data, error } = await getSupabaseAdmin()
      .from('ride_popularity')
      .select('*')
      .order('most_recent_attempt', { ascending: false })
      .order('group_member_count', { ascending: false })
      .limit(100)
    if (error) throw error
    return data ?? []
  },
  ['rides-index'],
  cacheOpts
)

export const getRideDetail = unstable_cache(
  async (rideId: string) => {
    const db = getSupabaseAdmin()
    const [rideRes, comparisonRes, membersRes] = await Promise.all([
      db.from('rides').select('*').eq('id', rideId).maybeSingle(),
      db.from('ride_comparison').select('*').eq('ride_id', rideId),
      db.from('members').select('id, name, initials').eq('active', true),
    ])
    if (rideRes.error || !rideRes.data) return null
    return {
      ride: rideRes.data,
      comparison: comparisonRes.data ?? [],
      members: membersRes.data ?? [],
    }
  },
  ['ride-detail'],
  cacheOpts
)

// ---------- Tabata Tuesday ----------
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


const getTabataWeeks = unstable_cache(
  async () => {
    const db = getSupabaseAdmin()
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

    return payloadWeeks
  },
  ['tabata-weeks'],
  cacheOpts
)

// The current/past split depends on today's date, so it happens outside the
// cache — a cached result never pins the wrong week as "current".
export async function getTabataData() {
  const payloadWeeks = await getTabataWeeks()
  // "Current" strictly means this Tue→Tue week. If the picker hasn't set
  // it yet, current is null and the newest row stays in the archive.
  const thisWeek = tabataWeekStart(new Date())
  const current = payloadWeeks.find((w) => w.week_start === thisWeek) ?? null
  const past = payloadWeeks.filter((w) => w.week_start !== thisWeek)
  return { current, past }
}
