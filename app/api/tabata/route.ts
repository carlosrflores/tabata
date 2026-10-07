import { NextResponse } from 'next/server'
import { getTabataData } from '@/lib/data'

export const dynamic = 'force-dynamic'

// GET /api/tabata — the Tabata Tuesday picks and per-week results.
// Logic and caching live in lib/data.ts (shared with the /tabata page).
export async function GET() {
  try {
    return NextResponse.json(await getTabataData())
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
