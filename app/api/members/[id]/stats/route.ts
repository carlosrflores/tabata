import { NextRequest, NextResponse } from 'next/server'
import { getMemberStats } from '@/lib/data'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const stats = await getMemberStats(params.id)
    if (!stats) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    return NextResponse.json(stats)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
