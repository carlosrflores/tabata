// One-off backfill: populate members.image_url for every active member by
// calling Peloton /api/user/{peloton_user_id} via the owner's session cookie.
//
// Prereq: apply supabase/member_image_migration.sql first.
//
// Run from repo root:
//   node scripts/migrations/2026-05-01-backfill-member-images.mjs

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
if (!SUPA_URL || !SVC) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sbHeaders = {
  apikey: SVC,
  Authorization: `Bearer ${SVC}`,
  'Content-Type': 'application/json',
}

async function getOwnerToken() {
  const m = await fetch(
    `${SUPA_URL}/rest/v1/members?is_owner=eq.true&active=eq.true&select=id,name`,
    { headers: sbHeaders }
  ).then((r) => r.json())
  if (!m?.[0]) throw new Error('no active owner')
  // Try bearer token first (newer auth path), fall back to session cookie.
  const c = await fetch(
    `${SUPA_URL}/rest/v1/member_credentials?member_id=eq.${m[0].id}&select=peloton_bearer_token,peloton_session_cookie`,
    { headers: sbHeaders }
  ).then((r) => r.json())
  const cred = c?.[0]
  if (cred?.peloton_bearer_token) return { type: 'bearer', value: cred.peloton_bearer_token }
  if (cred?.peloton_session_cookie) return { type: 'cookie', value: `peloton_session_id=${cred.peloton_session_cookie}` }
  throw new Error('owner has no Peloton auth on file')
}

function authHeaders(auth) {
  if (auth.type === 'bearer') {
    return {
      Authorization: `Bearer ${auth.value}`,
      'Peloton-Platform': 'web',
    }
  }
  return { Cookie: auth.value }
}

async function fetchPelotonUser(userId, auth) {
  const res = await fetch(`${PELOTON}/api/user/${userId}`, {
    headers: authHeaders(auth),
  })
  if (!res.ok) return { ok: false, status: res.status }
  const data = await res.json()
  return { ok: true, image_url: data?.image_url ?? null }
}

async function main() {
  const auth = await getOwnerToken()
  console.log(`got owner ${auth.type} auth`)

  const members = await fetch(
    `${SUPA_URL}/rest/v1/members?active=eq.true&select=id,name,peloton_user_id,image_url`,
    { headers: sbHeaders }
  ).then((r) => r.json())

  console.log(`active members: ${members.length}`)
  let ok = 0, skipped = 0, failed = 0

  for (const m of members) {
    if (m.image_url) {
      skipped++
      continue
    }
    const r = await fetchPelotonUser(m.peloton_user_id, auth)
    if (!r.ok) {
      console.log(`  ${m.name}: FAIL (${r.status})`)
      failed++
    } else if (r.image_url) {
      const upd = await fetch(`${SUPA_URL}/rest/v1/members?id=eq.${m.id}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ image_url: r.image_url }),
      })
      if (!upd.ok) {
        console.log(`  ${m.name}: update FAIL ${upd.status}`)
        failed++
      } else {
        console.log(`  ${m.name}: ✓`)
        ok++
      }
    } else {
      console.log(`  ${m.name}: no image_url on Peloton profile`)
      skipped++
    }
    await new Promise((res) => setTimeout(res, 250))
  }

  console.log(`done. ok=${ok} skipped=${skipped} failed=${failed}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
