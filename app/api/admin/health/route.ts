import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/admin/health — returns the last 30 sync_runs rows.
// Gated by CRON_SECRET bearer; same posture as the rest of /admin.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getSupabaseAdmin()
  const { data: runs, error } = await db
    .from('sync_runs')
    .select(
      'id, started_at, finished_at, trigger, status, members_processed, members_failed, workouts_added, last_error, token_expires_at, duration_ms'
    )
    .order('started_at', { ascending: false })
    .limit(30)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ runs: runs ?? [] })
}
