import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { authenticatePeloton, fetchAllFollowing } from '@/lib/peloton'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getSupabaseAdmin()

  const { data: owner } = await db
    .from('members')
    .select('id')
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

  if (!ownerCreds?.peloton_bearer_token) {
    return NextResponse.json({ users: [] })
  }

  const { data: existingMembers } = await db
    .from('members')
    .select('peloton_user_id')

  const existingIds = new Set((existingMembers ?? []).map((m) => m.peloton_user_id as string))

  // tmp debug: surface token info alongside any error
  const _tokenPrefix = ownerCreds.peloton_bearer_token.slice(0, 20)
  try {
    const session = await authenticatePeloton(ownerCreds.peloton_bearer_token)
    const allFollowing = await fetchAllFollowing(session)
    const available = allFollowing.filter((u) => u.id && !existingIds.has(u.id))
    return NextResponse.json({ users: available })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message, _debug_token_prefix: _tokenPrefix, _debug_token_len: ownerCreds.peloton_bearer_token.length }, { status: 500 })
  }
}
