// Tiny ad-hoc query helper for the Tabata Supabase project.
// Usage:
//   node scripts/db.mjs members
//   node scripts/db.mjs workouts <member_id> <since_iso>
//   node scripts/db.mjs ride <ride_id>
//   node scripts/db.mjs synclog <member_id>
//   node scripts/db.mjs raw "<table>" "<select-string>" '[{"col":"x","op":"eq","val":"y"}, ...]'
//
// Loads .env.local automatically. Service role key is required for full access.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  try {
    const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) process.env[m[1]] ??= m[2];
    }
  } catch { /* ignore */ }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const [, , cmd, ...args] = process.argv;

async function members() {
  const { data, error } = await db
    .from('members')
    .select('id, name, peloton_username, active, is_owner');
  if (error) throw error;
  console.table(data);
}

async function workouts(memberId, sinceIso) {
  let q = db
    .from('workouts')
    .select(
      'id, peloton_workout_id, workout_date, fitness_discipline, title, instructor_name, ride_id, total_output_kj'
    )
    .eq('member_id', memberId)
    .order('workout_date', { ascending: false })
    .limit(50);
  if (sinceIso) q = q.gte('workout_date', sinceIso);
  const { data, error } = await q;
  if (error) throw error;
  console.table(data);
}

async function ride(rideId) {
  const { data, error } = await db
    .from('rides')
    .select('id, title, instructor_name, fitness_discipline, updated_at')
    .eq('id', rideId)
    .maybeSingle();
  if (error) throw error;
  console.log(data);
}

async function syncLog(memberId) {
  const { data, error } = await db
    .from('sync_log')
    .select('started_at, completed_at, status, workouts_added, error_message')
    .eq('member_id', memberId)
    .order('started_at', { ascending: false })
    .limit(15);
  if (error) throw error;
  console.table(data);
}

async function raw(table, select, filtersJson) {
  const filters = filtersJson ? JSON.parse(filtersJson) : [];
  let q = db.from(table).select(select);
  for (const f of filters) {
    q = q[f.op](f.col, f.val);
  }
  const { data, error } = await q;
  if (error) throw error;
  console.log(JSON.stringify(data, null, 2));
}

const dispatch = { members, workouts, ride, synclog: syncLog, raw };
const fn = dispatch[cmd];
if (!fn) {
  console.error(`Unknown command: ${cmd}`);
  console.error(`Available: ${Object.keys(dispatch).join(', ')}`);
  process.exit(1);
}
try {
  await fn(...args);
} catch (e) {
  console.error('Error:', e.message ?? e);
  process.exit(1);
}
