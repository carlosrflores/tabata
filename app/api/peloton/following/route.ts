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

  // tmp: use authenticatePeloton (same as debug route) to see if the issue is in direct fetch vs lib
  let session
  let authError: string | null = null
  try {
    session = await authenticatePeloton(token)
  } catch (e) {
    authError = e instanceof Error ? e.message : String(e)
    return NextResponse.json({
      error: 'authenticatePeloton failed',
      auth_error: authError,
      token_prefix: token.slice(0, 20),
      token_length: token.length,
    }, { status: 500 })
  }

  try {
    const allFollowing = await fetchAllFollowing(session)
    const available = allFollowing.filter((u) => u.id && !existingIds.has(u.id))
    return NextResponse.json({ users: available })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
