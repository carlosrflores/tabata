import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const db = getSupabaseAdmin()
  try {
    const youId = req.nextUrl.searchParams.get('you')
    const { data: leaderboard, error: lbErr } = await db.from('weekly_leaderboard').select('*').order('rank', { ascending: true })
    if (lbErr) throw lbErr

    const { data: streakRows } = await db.rpc('get_member_streaks')
    const streaks: Record<string, number> = {}
    for (const row of (streakRows ?? []) as { member_id: string; streak_weeks: number }[]) {
      streaks[row.member_id] = row.streak_weeks
    }

    const { data: weekStats, error: weekErr } = await db.from('current_week_stats').select('*').single()
    if (weekErr) throw weekErr

    const enriched = (leaderboard ?? []).map((entry) => ({
      ...entry,
      streak_weeks: streaks[entry.member_id] ?? 0,
      is_you: youId ? entry.member_id === youId : false,
    }))

    return NextResponse.json({ leaderboard: enriched, week_stats: weekStats, synced_at: new Date().toISOString() })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
