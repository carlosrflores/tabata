import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { fetchAllFollowing } from '@/lib/peloton'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getSupabaseAdmin()

  // Fetch owner's ID and their Peloton user ID together
  const { data: owner } = await db
    .from('members')
    .select('id, peloton_user_id')
    .eq('is_owner', true)
    .single()

  if (!owner) {
    return NextResponse.json({ users: [] })
  }

  const { data: ownerCreds } = await db
    .from('member_credentials')
    .select('peloton_bearer_token')
    .eq('member_id', owner.id)
    .single()

  if (!ownerCreds?.peloton_bearer_token || !owner.peloton_user_id) {
    return NextResponse.json({ users: [], message: 'Owner credentials or user ID not found' })
  }

  const { data: existingMembers } = await db
    .from('members')
    .select('peloton_user_id')

  const existingIds = new Set((existingMembers ?? []).map((m) => m.peloton_user_id as string))

  const userId = owner.peloton_user_id as string
  const token = ownerCreds.peloton_bearer_token

  // tmp: probe multiple Peloton endpoints from this specific function to check IP/region
  const hdrs = { 'Authorization': `Bearer ${token}`, 'Peloton-Platform': 'web', 'Accept': 'application/json' }
  const [meRes, followRes] = await Promise.all([
    fetch(`https://api.onepeloton.com/api/me`, { headers: hdrs, cache: 'no-store' }),
    fetch(`https://api.onepeloton.com/api/user/${userId}/following?limit=5&page=0`, { headers: hdrs, cache: 'no-store' }),
  ])
  if (!meRes.ok || !followRes.ok) {
    return NextResponse.json({
      error: 'probe failed',
      me_status: meRes.status,
      follow_status: followRes.status,
      userId,
      token_prefix: token.slice(0, 20),
      token_length: token.length,
    }, { status: 500 })
  }

  // Build the session directly from stored data — no need to call /api/me
  // since we already have the owner's Peloton user ID in the members table.
  const session = { token, userId }

  try {
    const allFollowing = await fetchAllFollowing(session)
    const available = allFollowing.filter((u) => u.id && !existingIds.has(u.id))
    return NextResponse.json({ users: available })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
