import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { authenticatePeloton, fetchFollowing } from '@/lib/peloton'

export const dynamic = 'force-dynamic'

// Temporary debug endpoint — returns first 40 chars of stored token and its updated_at.
// DELETE after debugging is done.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = getSupabaseAdmin()
  const { data: owner } = await db.from('members').select('id, name').eq('is_owner', true).single()
  const { data: creds } = await db.from('member_credentials').select('peloton_bearer_token, updated_at').eq('member_id', owner?.id ?? '').single()
  const token = creds?.peloton_bearer_token ?? ''
  const parts = token.split('.')
  let iat = null, exp = null
  try {
    const payload = JSON.parse(Buffer.from(parts[1] ?? '', 'base64').toString())
    iat = payload.iat
    exp = payload.exp
  } catch { /* ignore */ }
  // Test the token live against Peloton from this server
  let pelotonStatus: number | null = null
  let pelotonError: string | null = null
  try {
    const r = await fetch('https://api.onepeloton.com/api/me', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Peloton-Platform': 'web',
        'Accept': 'application/json',
      },
    })
    pelotonStatus = r.status
    if (!r.ok) pelotonError = await r.text().then(t => t.slice(0, 200))
  } catch (e) {
    pelotonError = e instanceof Error ? e.message : String(e)
  }

  // Test other Peloton endpoints from this server
  const endpoints: Record<string, string> = {
    'me': 'https://api.onepeloton.com/api/me',
    'workouts': `https://api.onepeloton.com/api/user/${token ? 'cd6010de851244008c4c89319c220700' : ''}/workouts?limit=1`,
    'following_1': `https://api.onepeloton.com/api/user/cd6010de851244008c4c89319c220700/following?limit=1&page=0`,
    'following_100': `https://api.onepeloton.com/api/user/cd6010de851244008c4c89319c220700/following?limit=100&page=0`,
    'search': `https://api.onepeloton.com/api/user/search?user_query=humantag&limit=5`,
  }
  const endpointResults: Record<string, number> = {}
  for (const [name, url] of Object.entries(endpoints)) {
    try {
      const r = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Peloton-Platform': 'web', 'Accept': 'application/json' } })
      endpointResults[name] = r.status
    } catch { endpointResults[name] = -1 }
  }

  // Also run through the exact same code path as the following endpoint
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
