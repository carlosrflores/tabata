import { NextRequest, NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  noStore()
  const db = getSupabaseAdmin()
  const memberId = params.id
  try {
    const { data: member, error: memberErr } = await db.from('members')
      .select('id, name, initials, peloton_username, image_url').eq('id', memberId).single()
    if (memberErr || !member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

    const { data: recentWorkouts } = await db.from('workouts')
      .select('id, workout_date, title, instructor_name, duration_seconds, total_output_kj, leaderboard_rank, leaderboard_total, fitness_discipline, ride_id')
      .eq('member_id', memberId).eq('fitness_discipline', 'cycling')
      .order('workout_date', { ascending: false }).limit(10)

    const { data: personalRecords } = await db.from('personal_records')
      .select('*').eq('member_id', memberId).order('duration_seconds', { ascending: true })

    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const { data: monthlyData } = await db.from('workouts')
      .select('workout_date, total_output_kj').eq('member_id', memberId)
      .eq('fitness_discipline', 'cycling').gte('workout_date', sixMonthsAgo.toISOString())

    const monthlyTotals: Record<string, number> = {}
    for (const w of monthlyData ?? []) {
      const month = w.workout_date.substring(0, 7)
      monthlyTotals[month] = (monthlyTotals[month] ?? 0) + (w.total_output_kj ?? 0)
    }
    const trend = Object.entries(monthlyTotals).map(([month, kj]) => ({
      month, total_output_kj: Math.round(kj)
    }))

    // Aggregated server-side via the member_cycling_totals view — a raw
    // select capped at PostgREST's 1000-row limit and would understate
    // members with >1000 lifetime cycling workouts.
    const { data: totals } = await db.from('member_cycling_totals')
      .select('total_workouts, total_output_kj').eq('member_id', memberId).maybeSingle()
    const totalWorkouts = Number(totals?.total_workouts ?? 0)
    const allTimeOutput = Number(totals?.total_output_kj ?? 0)

    return NextResponse.json({
      member,
      recent_workouts: recentWorkouts ?? [],
      personal_records: personalRecords ?? [],
      monthly_trend: trend,
      all_time: { total_workouts: totalWorkouts, total_output_kj: Math.round(allTimeOutput) },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
