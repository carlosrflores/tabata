import { NextRequest, NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  noStore()
  const db = getSupabaseAdmin()
  try {
    const youId = req.nextUrl.searchParams.get('you')
    const weekOffset = Math.max(
      0,
      parseInt(req.nextUrl.searchParams.get('weekOffset') ?? '0', 10) || 0
    )

    const { data: rows, error: lbErr } = await db.rpc('leaderboard_for_week', {
      p_week_offset: weekOffset,
    })
    if (lbErr) throw lbErr
    const leaderboard = (rows ?? []) as Array<{
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
    }>

    // Streaks are inherently "as of now" — only meaningful for the current week.
    const streaks: Record<string, number> = {}
    if (weekOffset === 0) {
      const { data: streakRows } = await db.rpc('get_member_streaks')
      for (const row of (streakRows ?? []) as { member_id: string; streak_weeks: number }[]) {
        streaks[row.member_id] = row.streak_weeks
      }
    }

    // Derive the week's summary cards from the rows (every active member is
    // present via the RPC's left join, so length = total members).
    const groupTotal = leaderboard.reduce((s, r) => s + Number(r.total_output_kj ?? 0), 0)
    const activeMembers = leaderboard.filter((r) => Number(r.workout_count) > 0).length
    const top = leaderboard[0]
    const week_stats = {
      week_start: top?.week_start ?? new Date().toISOString(),
      group_total_output_kj: Math.round(groupTotal),
      active_members: activeMembers,
      total_members: leaderboard.length,
      top_performer_name: top && Number(top.total_output_kj) > 0 ? top.name : null,
      top_performer_kj: top ? Math.round(Number(top.total_output_kj)) : 0,
    }

    const enriched = leaderboard.map((entry) => ({
      ...entry,
      streak_weeks: streaks[entry.member_id] ?? 0,
      is_you: youId ? entry.member_id === youId : false,
    }))

    return NextResponse.json({
      leaderboard: enriched,
      week_stats,
      week_offset: weekOffset,
      synced_at: new Date().toISOString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
