import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { authenticatePeloton, fetchAllFollowing, fetchFollowing } from '@/lib/peloton'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getSupabaseAdmin()
  const { data: owner } = await db.from('members').select('id, name, peloton_user_id').eq('is_owner', true).single()
  const { data: creds } = await db.from('member_credentials').select('peloton_bearer_token, updated_at').eq('member_id', owner?.id ?? '').single()
  const token = creds?.peloton_bearer_token ?? ''

  // ?mode=following — return the full following list for the admin dropdown
  if (req.nextUrl.searchParams.get('mode') === 'following') {
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

  // Default: diagnostic info
  const parts = token.split('.')
  let iat = null, exp = null
  try {
    const payload = JSON.parse(Buffer.from(parts[1] ?? '', 'base64').toString())
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

  const userId = owner?.peloton_user_id ?? 'cd6010de851244008c4c89319c220700'
  const endpoints: Record<string, string> = {
    'me': 'https://api.onepeloton.com/api/me',
    'workouts': `https://api.onepeloton.com/api/user/${userId}/workouts?limit=1`,
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
