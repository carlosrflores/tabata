import { NextRequest, NextResponse } from 'next/server'
import { isAuthorized } from '@/lib/auth'
import { revalidatePublicData } from '@/lib/data'

export const dynamic = 'force-dynamic'

// POST /api/revalidate — drops the cached public pages and data so the next
// visit re-reads Supabase. Called by the GitHub Actions sync workflow after
// each run (CRON_SECRET bearer); admins can call it too.
export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  revalidatePublicData()
  return NextResponse.json({ revalidated: true, at: new Date().toISOString() })
}
