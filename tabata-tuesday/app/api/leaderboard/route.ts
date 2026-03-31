import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const revalidate = 3600

export async function GET(req: NextRequest) {
  try {
    // Optional: caller can pass ?you=<member_id> to highlight one row
    const youId = req.nextUrl.searchParams.get('you')

    // Fetch the weekly leaderboard from our pre-built view
    const { data: leaderboard, error: lbErr } = await supabaseAdmin
      .from('weekly_leaderboard')
      .select('*')
      .order('rank', { ascending: true })

    if (lbErr) throw lbErr

    // Fetch streak data: count consecutive weeks each member has worked out
    const { data: streakData, error: streakErr } = await supabaseAdmin
      .rpc('get_member_streaks')
      .select('*')

    // Streak RPC is optional - don't fail if it doesn't exist yet
    const streaks: Record<string, number> = {}
    if (!streakErr && streakData) {
      for (const row of streakData) {
        streaks[row.member_id] = row.streak_weeks
      }
    }

    // Group stats for the summary cards
    const activeMembers = (leaderboard ?? []).filter(
      (m) => m.workout_count > 0
    )
    const totalOutputKj = activeMembers.reduce(
      (sum: number, m) => sum + (m.total_output_kj ?? 0),
      0
    )
    const topPerformer = leaderboard?.[0] ?? null

    // Total member count
    const { count: totalMembers } = await supabaseAdmin
      .from('members')
      .select('*', { count: 'exact', head: true })
      .eq('active', true)

    // Current week bounds (most recent Tuesday)
    const now = new Date()
    const dayOfWeek = now.getDay() // 0=Sun, 2=Tue
    const daysSinceTuesday = (dayOfWeek + 5) % 7 // days back to Tuesday
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - daysSinceTuesday)
    weekStart.setHours(0, 0, 0, 0)

    return NextResponse.json({
      leaderboard: (leaderboard ?? []).map((entry) => ({
        ...entry,
        streak_weeks: streaks[entry.member_id] ?? 0,
      })),
      week_stats: {
        week_start: weekStart.toISOString(),
        group_total_output_kj: Math.round(totalOutputKj),
        active_members: activeMembers.length,
        total_members: totalMembers ?? 0,
        top_performer_name: topPerformer?.name ?? null,
        top_performer_kj: topPerformer?.total_output_kj ?? 0,
      },
      synced_at: new Date().toISOString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
