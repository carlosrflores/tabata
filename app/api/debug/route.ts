import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { authenticatePeloton, fetchAllFollowing, fetchFollowing } from '@/lib/peloton'
import { syncMember, syncAllMembers } from '@/lib/sync'

export const dynamic = 'force-dynamic'
export const runtime = 'edge'

// Edge Runtime uses Cloudflare's network — different IPs than Lambda.
// Peloton blocks most Vercel Lambda egress IPs (error_code 3020).
// All Peloton API work (following list, sync) is routed through here.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const mode = req.nextUrl.searchParams.get('mode')
  const db = getSupabaseAdmin()

  // ?mode=following — return the full following list for the admin dropdown
  if (mode === 'following') {
    const { data: owner } = await db.from('members').select('id, peloton_user_id').eq('is_owner', true).single()
    const { data: creds } = await db.from('member_credentials').select('peloton_bearer_token').eq('member_id', owner?.id ?? '').single()
    const token = creds?.peloton_bearer_token
    if (!token || !owner?.peloton_user_id) {
      return NextResponse.json({ users: [], message: 'Owner credentials or user ID not found' })
    }
    const { data: existingMembers } = await db.from('members').select('peloton_user_id')
    const existingIds = new Set((existingMembers ?? []).map((m) => m.peloton_user_id as string))
    try {
      const session = await authenticatePeloton(token)
      const allFollowing = await fetchAllFollowing(session)
      const available = allFollowing.filter((u) => u.id && !existingIds.has(u.id))
      return NextResponse.json({ users: available })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  // ?mode=test-workouts — probe multiple workout URL variations to isolate 401 cause
  if (mode === 'test-workouts') {
    const { data: owner } = await db.from('members').select('id, peloton_user_id').eq('is_owner', true).single()
    const { data: creds } = await db.from('member_credentials').select('peloton_bearer_token').eq('member_id', owner?.id ?? '').single()
    const token = creds?.peloton_bearer_token ?? ''
    const userId = owner?.peloton_user_id ?? ''
    const hdrs = { 'Authorization': `Bearer ${token}`, 'Peloton-Platform': 'web', 'Accept': 'application/json' }
    const tests: Record<string, string> = {
      me: `https://api.onepeloton.com/api/me`,
      workouts_plain_1: `https://api.onepeloton.com/api/user/${userId}/workouts?limit=1`,
      workouts_plain_20: `https://api.onepeloton.com/api/user/${userId}/workouts?limit=20`,
      workouts_joins_1: `https://api.onepeloton.com/api/user/${userId}/workouts?joins=ride,ride.instructor&limit=1&page=0&sort_by=-created`,
      workouts_joins_20: `https://api.onepeloton.com/api/user/${userId}/workouts?joins=ride,ride.instructor&limit=20&page=0&sort_by=-created`,
    }
    const results: Record<string, { status: number; body: string }> = {}
    for (const [name, url] of Object.entries(tests)) {
      try {
        const r = await fetch(url, { headers: hdrs, cache: 'no-store' })
        const body = await r.text()
        results[name] = { status: r.status, body: body.slice(0, 150) }
      } catch (e) {
        results[name] = { status: -1, body: String(e) }
      }
    }
    return NextResponse.json({ token_prefix: token.slice(0, 20), token_length: token.length, results })
  }

  // ?mode=test-perf&workoutId=X — fetch raw performance graph to inspect avg_summaries display names
  if (mode === 'test-perf') {
    const workoutId = req.nextUrl.searchParams.get('workoutId')
    if (!workoutId) return NextResponse.json({ error: 'workoutId required' }, { status: 400 })
    const { data: owner } = await db.from('members').select('id, peloton_user_id').eq('is_owner', true).single()
    const { data: creds } = await db.from('member_credentials').select('peloton_bearer_token').eq('member_id', owner?.id ?? '').single()
    const token = creds?.peloton_bearer_token ?? ''
    const hdrs = { 'Authorization': `Bearer ${token}`, 'Peloton-Platform': 'web', 'Accept': 'application/json' }
    const r = await fetch(`https://api.onepeloton.com/api/workout/${workoutId}/performance_graph?every_n=5`, { headers: hdrs, cache: 'no-store' })
    const body = await r.json().catch(() => ({}))
    return NextResponse.json({ status: r.status, avg_summaries: body.avg_summaries, summaries_count: body.summaries?.length })
  }

  // ?mode=sync — sync all active members (used by cron and admin "Sync all" button)
  if (mode === 'sync') {
    try {
      const results = await syncAllMembers()
      const totalAdded = results.reduce((sum, r) => sum + r.workoutsAdded, 0)
      return NextResponse.json({ results, total_workouts_added: totalAdded, synced_at: new Date().toISOString() })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  // ?mode=sync-member&memberId=X — sync a single member
  if (mode === 'sync-member') {
    const memberId = req.nextUrl.searchParams.get('memberId')
    if (!memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 })
    try {
      const result = await syncMember(memberId)
      return NextResponse.json({ results: [result], synced_at: new Date().toISOString() })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  // Default: diagnostic info
  const { data: owner } = await db.from('members').select('id, name, peloton_user_id').eq('is_owner', true).single()
  const { data: creds } = await db.from('member_credentials').select('peloton_bearer_token, updated_at').eq('member_id', owner?.id ?? '').single()
  const token = creds?.peloton_bearer_token ?? ''

  const parts = token.split('.')
  let iat = null, exp = null
  try {
    const payload = JSON.parse(atob(parts[1] ?? ''))
    iat = payload.iat
    exp = payload.exp
  } catch { /* ignore */ }

  let pelotonStatus: number | null = null
  let pelotonError: string | null = null
  try {
    const r = await fetch('https://api.onepeloton.com/api/me', {
      headers: { 'Authorization': `Bearer ${token}`, 'Peloton-Platform': 'web', 'Accept': 'application/json' },
      cache: 'no-store',
    })
    pelotonStatus = r.status
    if (!r.ok) pelotonError = await r.text().then(t => t.slice(0, 200))
  } catch (e) {
    pelotonError = e instanceof Error ? e.message : String(e)
  }

  const userId = owner?.peloton_user_id ?? ''
  const endpoints: Record<string, string> = {
    'me': 'https://api.onepeloton.com/api/me',
    'workouts_plain': `https://api.onepeloton.com/api/user/${userId}/workouts?limit=1`,
    'workouts_joins': `https://api.onepeloton.com/api/user/${userId}/workouts?joins=ride,ride.instructor&limit=1&page=0&sort_by=-created`,
    'following_1': `https://api.onepeloton.com/api/user/${userId}/following?limit=1&page=0`,
    'following_100': `https://api.onepeloton.com/api/user/${userId}/following?limit=100&page=0`,
    'search': `https://api.onepeloton.com/api/user/search?user_query=humantag&limit=5`,
  }
  const endpointResults: Record<string, number> = {}
  for (const [name, url] of Object.entries(endpoints)) {
    try {
      const r = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Peloton-Platform': 'web', 'Accept': 'application/json' }, cache: 'no-store' })
      endpointResults[name] = r.status
    } catch { endpointResults[name] = -1 }
  }

  let authStatus: string | null = null
  let followingCount: number | null = null
  let authError: string | null = null
  try {
    const session = await authenticatePeloton(token)
    authStatus = `OK userId=${session.userId}`
    const { users } = await fetchFollowing(session, 0, 5)
    followingCount = users.length
  } catch (e) {
    authError = e instanceof Error ? e.message : String(e)
  }

  return NextResponse.json({
    owner: owner?.name,
    token_prefix: token.slice(0, 40),
    token_length: token.length,
    updated_at: creds?.updated_at,
    iat, exp,
    endpoint_results: endpointResults,
    peloton_direct_status: pelotonStatus,
    peloton_direct_error: pelotonError,
    auth_via_lib: authStatus,
    following_sample: followingCount,
    auth_lib_error: authError,
  })
}
