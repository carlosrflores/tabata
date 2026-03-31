import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const memberId = params.id

  try {
    // Member info
    const { data: member, error: memberErr } = await supabaseAdmin
      .from('members')
      .select('id, name, initials, peloton_username')
      .eq('id', memberId)
      .single()

    if (memberErr || !member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    // Recent 10 workouts
    const { data: recentWorkouts, error: recentErr } = await supabaseAdmin
      .from('workouts')
      .select(
        'id, workout_date, title, instructor_name, duration_seconds, total_output_kj, avg_watts, avg_cadence, leaderboard_rank, leaderboard_total, fitness_discipline'
      )
      .eq('member_id', memberId)
      .eq('fitness_discipline', 'cycling')
      .order('workout_date', { ascending: false })
      .limit(10)

    if (recentErr) throw recentErr

    // Personal records (best output per duration)
    const { data: personalRecords, error: prErr } = await supabaseAdmin
      .from('personal_records')
      .select('*')
      .eq('member_id', memberId)
      .order('duration_seconds', { ascending: true })

    if (prErr) throw prErr

    // Monthly output trend (last 6 months)
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const { data: monthlyData, error: monthlyErr } = await supabaseAdmin
      .from('workouts')
      .select('workout_date, total_output_kj')
      .eq('member_id', memberId)
      .eq('fitness_discipline', 'cycling')
      .gte('workout_date', sixMonthsAgo.toISOString())
      .order('workout_date', { ascending: true })

    if (monthlyErr) throw monthlyErr

    // Aggregate by month client-side
    const monthlyTotals: Record<string, number> = {}
    for (const w of monthlyData ?? []) {
      const month = w.workout_date.substring(0, 7) // YYYY-MM
      monthlyTotals[month] = (monthlyTotals[month] ?? 0) + (w.total_output_kj ?? 0)
    }

    const trend = Object.entries(monthlyTotals).map(([month, kj]) => ({
      month,
      total_output_kj: Math.round(kj),
    }))

    // All-time stats
    const { data: allTimeStats } = await supabaseAdmin
      .from('workouts')
      .select('total_output_kj, is_personal_record')
      .eq('member_id', memberId)
      .eq('fitness_discipline', 'cycling')

    const totalWorkouts = allTimeStats?.length ?? 0
    const allTimeOutput = (allTimeStats ?? []).reduce(
      (sum, w) => sum + (w.total_output_kj ?? 0),
      0
    )

    return NextResponse.json({
      member,
      recent_workouts: recentWorkouts ?? [],
      personal_records: personalRecords ?? [],
      monthly_trend: trend,
      all_time: {
        total_workouts: totalWorkouts,
        total_output_kj: Math.round(allTimeOutput),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
