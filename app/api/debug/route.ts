import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

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
  return NextResponse.json({
    owner: owner?.name,
    token_prefix: token.slice(0, 40),
    token_length: token.length,
    updated_at: creds?.updated_at,
    iat, exp,
  })
}
