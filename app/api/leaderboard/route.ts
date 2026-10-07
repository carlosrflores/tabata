import { NextRequest, NextResponse } from 'next/server'
import { getLeaderboard } from '@/lib/data'

export const dynamic = 'force-dynamic'

// GET /api/leaderboard?weekOffset=N&you=<memberId>
// The week's data is cached in lib/data.ts; only the per-viewer `is_you`
// flag is applied here.
export async function GET(req: NextRequest) {
  try {
    const youId = req.nextUrl.searchParams.get('you')
    const weekOffset = Math.max(
      0,
      parseInt(req.nextUrl.searchParams.get('weekOffset') ?? '0', 10) || 0
    )
    const data = await getLeaderboard(weekOffset)
    return NextResponse.json({
      ...data,
      leaderboard: data.leaderboard.map((entry) => ({
        ...entry,
        is_you: youId ? entry.member_id === youId : false,
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
