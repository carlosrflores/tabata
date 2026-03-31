import { NextRequest, NextResponse } from 'next/server'
import { syncAllMembers, syncMember } from '@/lib/sync'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const memberId = req.nextUrl.searchParams.get('memberId')
  try {
    if (memberId) {
      const result = await syncMember(memberId)
      return NextResponse.json({ results: [result], synced_at: new Date().toISOString() })
    }
    const results = await syncAllMembers()
    const totalAdded = results.reduce((sum, r) => sum + r.workoutsAdded, 0)
    return NextResponse.json({ results, total_workouts_added: totalAdded, synced_at: new Date().toISOString() })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
