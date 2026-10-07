import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { fetchRide } from '@/lib/peloton'
import { getFreshPelotonSession, transformRide } from '@/lib/sync'
import { parseScheduledClassUrl, tabataWeekStart } from '@/lib/tabata'
import { isAuthorized } from '@/lib/auth'
import { revalidatePublicData } from '@/lib/data'

export const dynamic = 'force-dynamic'
// Edge runtime: may need to fetch the ride from Peloton (blocked from
// Vercel Lambda egress) when nobody in the group has ridden it yet.
export const runtime = 'edge'

// POST /api/admin/tabata-week — set the week's Tabata Tuesday class from a
// pasted scheduled-class share link.
//
//   body: { url: "<members.onepeloton.com/scheduled/class/... link>" }
//
// - Decodes ride_id + scheduled time from the link's join_token (path
//   fallback for truncated links).
// - Ensures the ride exists in `rides` (fetches from Peloton with the
//   owner's session if it isn't cached yet — the FK requires it).
// - Upserts tabata_weeks keyed on the Tue→Tue week of the scheduled time
//   (falling back to the current week when the link has no timestamp).

export async function POST(req: NextRequest) {
  // Pickers may set the week too — this is the one non-admin write.
  if (!(await isAuthorized(req, ['admin', 'picker']))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { url?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const url = typeof body.url === 'string' ? body.url : ''
  const parsed = parseScheduledClassUrl(url)
  if (!parsed) {
    return NextResponse.json(
      {
        error:
          'Could not find a class in that link. Paste the full scheduled-class share link from Peloton.',
      },
      { status: 400 }
    )
  }

  const db = getSupabaseAdmin()

  // Make sure the ride is cached (FK on tabata_weeks.ride_id).
  let { data: ride } = await db
    .from('rides')
    .select('id, title, instructor_name, duration_seconds, image_url, fitness_discipline')
    .eq('id', parsed.rideId)
    .maybeSingle()

  if (!ride) {
    const { data: owner } = await db
      .from('members')
      .select('id, peloton_user_id')
      .eq('is_owner', true)
      .single()
    if (!owner) {
      return NextResponse.json(
        { error: 'No owner member exists; cannot fetch the class from Peloton.' },
        { status: 400 }
      )
    }
    const session = await getFreshPelotonSession(db, owner.id, owner.peloton_user_id)
    if (!session) {
      return NextResponse.json(
        { error: 'Owner has no Peloton token stored; cannot fetch the class.' },
        { status: 400 }
      )
    }
    let fetched
    try {
      fetched = await fetchRide(session, parsed.rideId)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return NextResponse.json(
        { error: `Could not fetch the class from Peloton: ${message}` },
        { status: 502 }
      )
    }
    const { error: upsertErr } = await db
      .from('rides')
      .upsert(transformRide(fetched), { onConflict: 'id' })
    if (upsertErr) {
      return NextResponse.json(
        { error: `Failed to cache the class: ${upsertErr.message}` },
        { status: 500 }
      )
    }
    const { data: cached } = await db
      .from('rides')
      .select('id, title, instructor_name, duration_seconds, image_url, fitness_discipline')
      .eq('id', parsed.rideId)
      .single()
    ride = cached
  }

  const weekStart = tabataWeekStart(parsed.scheduledStart ?? new Date())

  const weekPayload = {
    week_start: weekStart,
    ride_id: parsed.rideId,
    scheduled_start: parsed.scheduledStart?.toISOString() ?? null,
    host_peloton_user_id: parsed.hostPelotonUserId,
    source_url: url,
    updated_at: new Date().toISOString(),
  }
  const { error: weekErr } = await db
    .from('tabata_weeks')
    .upsert(weekPayload, { onConflict: 'week_start' })
  if (weekErr) {
    return NextResponse.json(
      { error: `Failed to save the week: ${weekErr.message}` },
      { status: 500 }
    )
  }

  revalidatePublicData()
  return NextResponse.json({
    ok: true,
    week_start: weekStart,
    scheduled_start: weekPayload.scheduled_start,
    ride,
  })
}
