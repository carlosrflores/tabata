import { NextRequest, NextResponse } from 'next/server'
import { syncAllMembers, syncMember } from '@/lib/sync'

// This route is called by Vercel's built-in cron scheduler daily
// It's also callable manually for testing
export async function GET(req: NextRequest) {
  // Validate the cron secret to prevent unauthorized triggers
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Optional: sync a single member by passing ?memberId=xxx
  const memberId = req.nextUrl.searchParams.get('memberId')

  try {
    if (memberId) {
      const result = await syncMember(memberId)
      return NextResponse.json({ results: [result], synced_at: new Date().toISOString() })
    }

    const results = await syncAllMembers()
    const totalAdded = results.reduce((sum, r) => sum + r.workoutsAdded, 0)
    const errors = results.filter((r) => r.error)

    return NextResponse.json({
      results,
      total_workouts_added: totalAdded,
      errors: errors.length,
      synced_at: new Date().toISOString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
