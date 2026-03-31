import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { authenticatePeloton } from '@/lib/peloton'

export async function POST(req: NextRequest) {
  // Protect this endpoint with the admin secret
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { name, initials, peloton_username, peloton_password } = body

  if (!name || !initials || !peloton_username || !peloton_password) {
    return NextResponse.json(
      { error: 'name, initials, peloton_username, and peloton_password are required' },
      { status: 400 }
    )
  }

  try {
    // Verify Peloton credentials actually work before storing
    const session = await authenticatePeloton(peloton_username, peloton_password)

    // Check we got a valid user ID back
    if (!session.userId) {
      return NextResponse.json(
        { error: 'Peloton login succeeded but no user ID returned — check username' },
        { status: 400 }
      )
    }

    // Generate initials if not provided cleanly
    const cleanInitials = initials.toUpperCase().slice(0, 2)

    // Insert member record
    const { count: existingCount } = await supabaseAdmin
      .from('members')
      .select('*', { count: 'exact', head: true })
    const isFirstMember = (existingCount ?? 0) === 0
    const { data: member, error: memberErr } = await supabaseAdmin
      .from('members')
      .insert({
        name,
        initials: cleanInitials,
        peloton_username,
        peloton_user_id: session.userId,
        is_owner: isFirstMember,
        active: true,
      })
      .select()
      .single()

    if (memberErr) {
      if (memberErr.code === '23505') {
        return NextResponse.json(
          { error: 'A member with this Peloton username already exists' },
          { status: 409 }
        )
      }
      throw memberErr
    }

    // Store password (plaintext for now — future: encrypt with Supabase Vault)
    const { error: credsErr } = await supabaseAdmin
      .from('member_credentials')
      .insert({
        member_id: member.id,
        peloton_password_encrypted: peloton_password,
      })

    if (credsErr) throw credsErr

    return NextResponse.json({
      success: true,
      member: {
        id: member.id,
        name: member.name,
        peloton_username: member.peloton_username,
        peloton_user_id: member.peloton_user_id,
      },
      message: `${name} added. Trigger /api/sync to pull their workout history.`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // Peloton auth failure is a user error, not a server error
    if (message.includes('auth failed')) {
      return NextResponse.json(
        { error: 'Peloton login failed — double-check the username and password' },
        { status: 400 }
      )
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// GET: list all members and their sync status
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: members, error } = await supabaseAdmin
    .from('members')
    .select(`
      id, name, initials, peloton_username, is_owner, active, created_at,
      workouts(count)
    `)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get last sync time per member
  const { data: syncLogs } = await supabaseAdmin
    .from('sync_log')
    .select('member_id, completed_at, status, workouts_added')
    .order('completed_at', { ascending: false })

  const lastSync: Record<string, { completed_at: string; status: string }> = {}
  for (const log of syncLogs ?? []) {
    if (!lastSync[log.member_id]) {
      lastSync[log.member_id] = log
    }
  }

  return NextResponse.json({
    members: (members ?? []).map((m) => ({
      ...m,
      workout_count: (m.workouts as unknown as { count: number }[])?.[0]?.count ?? 0,
      last_sync: lastSync[m.id] ?? null,
    })),
  })
}
