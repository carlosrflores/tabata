// Historical migration (2026-05-01): backfilled 337 missing rides into the
// rides table. Production database has already had this run; kept for
// reference and in case the same shape of fix is needed again.
//
// For every distinct ride id referenced by a workout that has NULL ride_id
// and is NOT in the rides table, fetch the ride from Peloton and upsert it.
// Run before 2026-05-01-backfill-ride-ids.mjs.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnvLocal() {
  try {
    const text = readFileSync(resolve(__dirname, '..', '..', '.env.local'), 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  } catch {}
}
loadEnvLocal()

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY
const PELOTON = 'https://api.onepeloton.com'
const OUTDOOR = '00000000000000000000000000000000'
if (!SUPA_URL || !SVC) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sbHeaders = {
  apikey: SVC,
  Authorization: `Bearer ${SVC}`,
  'Content-Type': 'application/json',
}

async function getOwnerCookie() {
  const m = await fetch(`${SUPA_URL}/rest/v1/members?is_owner=eq.true&active=eq.true&select=id,name`, {
    headers: sbHeaders,
  }).then((r) => r.json())
  if (!m?.[0]) throw new Error('no active owner')
  const c = await fetch(
    `${SUPA_URL}/rest/v1/member_credentials?member_id=eq.${m[0].id}&select=peloton_session_cookie`,
    { headers: sbHeaders }
  ).then((r) => r.json())
  if (!c?.[0]?.peloton_session_cookie) throw new Error('owner has no peloton cookie on file')
  return `peloton_session_id=${c[0].peloton_session_cookie}`
}

async function fetchAllRideIds() {
  const ids = new Set()
  const pageSize = 1000
  let from = 0
  for (;;) {
    const res = await fetch(`${SUPA_URL}/rest/v1/rides?select=id`, {
      headers: { ...sbHeaders, Range: `${from}-${from + pageSize - 1}` },
    })
    if (!res.ok) throw new Error(`rides fetch ${res.status}: ${await res.text()}`)
    const rows = await res.json()
    for (const r of rows) ids.add(r.id)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return ids
}

async function fetchMissingRideTargets(existingRides) {
  const wanted = new Set()
  const pageSize = 1000
  let from = 0
  for (;;) {
    const res = await fetch(
      `${SUPA_URL}/rest/v1/workouts?ride_id=is.null&select=raw_data`,
      { headers: { ...sbHeaders, Range: `${from}-${from + pageSize - 1}` } }
    )
    if (!res.ok) throw new Error(`workouts fetch ${res.status}: ${await res.text()}`)
    const rows = await res.json()
    for (const w of rows) {
      const rid = w?.raw_data?.ride?.id
      if (!rid || rid === OUTDOOR) continue
      if (!existingRides.has(rid)) wanted.add(rid)
    }
    if (rows.length < pageSize) break
    from += pageSize
  }
  return wanted
}

function buildRideRow(ride) {
  return {
    id: ride.id,
    title: ride.title ?? null,
    description: ride.description ?? null,
    instructor_name: ride.instructor?.name ?? null,
    instructor_image_url: ride.instructor?.image_url ?? null,
    duration_seconds: ride.duration ?? null,
    fitness_discipline: ride.fitness_discipline ?? null,
    difficulty_estimate: ride.difficulty_estimate ?? null,
    overall_rating_avg: ride.overall_rating_avg ?? null,
    total_workouts: ride.total_workouts ?? null,
    total_ratings: ride.total_ratings ?? null,
    image_url: ride.image_url ?? null,
    original_air_time: ride.original_air_time
      ? new Date(ride.original_air_time * 1000).toISOString()
      : null,
    has_pedaling_metrics: ride.has_pedaling_metrics ?? null,
    is_explicit: ride.is_explicit ?? null,
    raw_data: ride,
  }
}

async function fetchRide(rideId, cookie) {
  const url = `${PELOTON}/api/ride/${rideId}?joins=instructor`
  const res = await fetch(url, { headers: { Cookie: cookie } })
  if (!res.ok) {
    return { ok: false, status: res.status }
  }
  const ride = await res.json()
  if (!ride?.id) return { ok: false, status: 0, reason: 'no id in response' }
  return { ok: true, ride }
}

async function upsertRides(rows) {
  if (rows.length === 0) return
  const res = await fetch(`${SUPA_URL}/rest/v1/rides`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error(`rides upsert ${res.status}: ${await res.text()}`)
}

async function main() {
  const cookie = await getOwnerCookie()
  console.log('got owner cookie')

  const existing = await fetchAllRideIds()
  console.log(`rides already in DB: ${existing.size}`)

  const wanted = await fetchMissingRideTargets(existing)
  console.log(`distinct missing rides to fetch: ${wanted.size}`)

  const fetched = []
  const failures = []
  let i = 0
  for (const rid of wanted) {
    i++
    const r = await fetchRide(rid, cookie)
    if (r.ok) {
      fetched.push(buildRideRow(r.ride))
    } else {
      failures.push({ rid, status: r.status, reason: r.reason })
    }
    if (i % 25 === 0 || i === wanted.size) {
      process.stdout.write(`  fetched ${i}/${wanted.size}, ok=${fetched.length}, fail=${failures.length}\n`)
    }
    // gentle rate limit
    await new Promise((res) => setTimeout(res, 250))
  }

  console.log(`upserting ${fetched.length} rides...`)
  // chunk upsert to keep payload reasonable
  const CHUNK = 100
  for (let j = 0; j < fetched.length; j += CHUNK) {
    await upsertRides(fetched.slice(j, j + CHUNK))
  }

  console.log('done.')
  if (failures.length) {
    console.log('failures:')
    for (const f of failures.slice(0, 20)) console.log(` ${f.rid} -> ${f.status}${f.reason ? ' '+f.reason : ''}`)
    if (failures.length > 20) console.log(` ...and ${failures.length - 20} more`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
