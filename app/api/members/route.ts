import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { authenticatePeloton } from '@/lib/peloton'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json()
  const { name, initials, peloton_username, peloton_bearer_token } = body
  if (!name || !initials || !peloton_username || !peloton_bearer_token) {
    return NextResponse.json({ error: 'All fields required' }, { status: 400 })
  }
  try {
    const db = getSupabaseAdmin()
    const session = await authenticatePeloton(peloton_bearer_token)
    if (!session.userId) {
      return NextResponse.json({ error: 'Bearer token is valid but no user ID returned' }, { status: 400 })
    }
    const cleanInitials = initials.toUpperCase().slice(0, 2)
    const { count: existingCount } = await db.from('members').select('*', { count: 'exact', head: true })
    const isFirstMember = (existingCount ?? 0) === 0
    const { data: member, error: memberErr } = await db.from('members').insert({
      name, initials: cleanInitials, peloton_username,
      peloton_user_id: session.userId, is_owner: isFirstMember, active: true,
    }).select().single()
    if (memberErr) {
      if (memberErr.code === '23505') return NextResponse.json({ error: 'Username already exists' }, { status: 409 })
      throw memberErr
    }
    if (!member) throw new Error('Member insert returned no data')
    const { error: credsErr } = await db.from('member_credentials').insert({
      member_id: member.id, peloton_bearer_token: session.token,
    })
    if (credsErr) throw credsErr
    return NextResponse.json({ success: true, member: { id: member.id, name: member.name }, message: `${name} added.` })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = getSupabaseAdmin()
  const { data: members, error } = await db.from('members')
    .select('id, name, initials, peloton_username, is_owner, active, created_at')
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: syncLogs } = await db.from('sync_log').select('member_id, completed_at, status').order('completed_at', { ascending: false })
  const lastSync: Record<string, { completed_at: string; status: string }> = {}
  for (const log of syncLogs ?? []) {
    if (!lastSync[log.member_id]) lastSync[log.member_id] = log
  }
  const { data: workoutCounts } = await db.from('workouts').select('member_id')
  const countMap: Record<string, number> = {}
  for (const w of workoutCounts ?? []) countMap[w.member_id] = (countMap[w.member_id] ?? 0) + 1
  return NextResponse.json({
    members: (members ?? []).map((m) => ({ ...m, workout_count: countMap[m.id] ?? 0, last_sync: lastSync[m.id] ?? null })),
  })
}
