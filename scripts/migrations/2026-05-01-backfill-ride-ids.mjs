// Historical migration (2026-05-01): linked 603 workouts to their rides.
// Production database has already had this run; kept for reference.
//
// For every workouts row where ride_id IS NULL, look at raw_data.ride.id;
// if that ride exists in the rides table and isn't the outdoor sentinel,
// set workouts.ride_id to it. Run AFTER 2026-05-01-backfill-rides.mjs.

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
if (!SUPA_URL || !SVC) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const OUTDOOR = '00000000000000000000000000000000'

const headers = {
  apikey: SVC,
  Authorization: `Bearer ${SVC}`,
  'Content-Type': 'application/json',
}

async function fetchAllRideIds() {
  const ids = new Set()
  const pageSize = 1000
  let from = 0
  for (;;) {
    const res = await fetch(`${SUPA_URL}/rest/v1/rides?select=id`, {
      headers: { ...headers, Range: `${from}-${from + pageSize - 1}` },
    })
    if (!res.ok) throw new Error(`rides fetch ${res.status}: ${await res.text()}`)
    const rows = await res.json()
    for (const r of rows) ids.add(r.id)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return ids
}

async function fetchNullRideWorkouts() {
  const out = []
  const pageSize = 1000
  let from = 0
  for (;;) {
    const url = `${SUPA_URL}/rest/v1/workouts?ride_id=is.null&select=peloton_workout_id,raw_data&order=peloton_workout_id.asc`
    const res = await fetch(url, {
      headers: { ...headers, Range: `${from}-${from + pageSize - 1}` },
    })
    if (!res.ok) throw new Error(`workouts fetch ${res.status}: ${await res.text()}`)
    const rows = await res.json()
    out.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return out
}

async function patchBatch(rideId, peltonWorkoutIds) {
  // Use POST + PATCH via PostgREST; encode each id (they look hex-only, but be safe).
  const inList = peltonWorkoutIds.map((s) => encodeURIComponent(s)).join(',')
  const url = `${SUPA_URL}/rest/v1/workouts?peloton_workout_id=in.(${inList})&ride_id=is.null`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ ride_id: rideId }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`patch ${res.status} for ride ${rideId}: ${body}`)
  }
}

async function main() {
  console.log('fetching ride id set...')
  const rideIds = await fetchAllRideIds()
  console.log(`  rides in DB: ${rideIds.size}`)

  console.log('fetching workouts with NULL ride_id...')
  const workouts = await fetchNullRideWorkouts()
  console.log(`  candidate workouts: ${workouts.length}`)

  const groups = new Map() // ride_id -> [peloton_workout_id]
  let skippedOutdoor = 0
  let skippedMissingRide = 0
  let skippedNoRideField = 0

  for (const w of workouts) {
    const rid = w?.raw_data?.ride?.id
    if (!rid) { skippedNoRideField++; continue }
    if (rid === OUTDOOR) { skippedOutdoor++; continue }
    if (!rideIds.has(rid)) { skippedMissingRide++; continue }
    if (!groups.has(rid)) groups.set(rid, [])
    groups.get(rid).push(w.peloton_workout_id)
  }

  const targetCount = [...groups.values()].reduce((s, a) => s + a.length, 0)
  console.log(`  groups: ${groups.size}, workouts to update: ${targetCount}`)
  console.log(`  skipped: outdoor=${skippedOutdoor}, missing-ride=${skippedMissingRide}, no-ride-field=${skippedNoRideField}`)

  let done = 0
  for (const [rid, ids] of groups) {
    // chunk to keep URLs sane
    const CHUNK = 100
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK)
      await patchBatch(rid, slice)
      done += slice.length
      if (done % 200 === 0 || done === targetCount) {
        process.stdout.write(`  patched ${done}/${targetCount}\n`)
      }
    }
  }

  console.log('done.')
}

main().catch((e) => { console.error(e); process.exit(1) })
