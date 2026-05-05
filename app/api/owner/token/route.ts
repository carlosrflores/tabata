import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { authenticatePeloton } from '@/lib/peloton'

export const dynamic = 'force-dynamic'

// Update the owner's stored Peloton bearer token.
// Called from the admin page when the existing token has expired.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { peloton_bearer_token } = body
  if (!peloton_bearer_token) {
    return NextResponse.json({ error: 'peloton_bearer_token is required' }, { status: 400 })
  }

  try {
    const session = await authenticatePeloton(peloton_bearer_token)

    const db = getSupabaseAdmin()
    const { data: owner, error: ownerErr } = await db
      .from('members')
      .select('id')
      .eq('is_owner', true)
      .single()

    if (ownerErr || !owner) {
      return NextResponse.json({ error: 'Owner member not found' }, { status: 404 })
    }

    const { error: updateErr } = await db
      .from('member_credentials')
      .upsert({ member_id: owner.id, peloton_bearer_token: session.token }, { onConflict: 'member_id' })

    if (updateErr) throw updateErr

    return NextResponse.json({ success: true, message: 'Token updated. Following list and syncs will now use the new token.' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
