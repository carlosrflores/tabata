# Context for review

I'm sharing a technical brief on the Peloton data access layer in my
Next.js + Supabase + Vercel app ("Tabata Tuesday" — a private group
Peloton leaderboard). The reviewer hasn't seen the code. The two files
that matter are `lib/peloton.ts` (HTTP client) and `lib/sync.ts`
(adapter / orchestrator that writes to Supabase). API routes under
`app/api/**` are thin wrappers; cron hits `/api/debug?mode=sync` on
Vercel's Edge runtime. Peloton's API is undocumented and we use a
bearer token harvested from browser DevTools.

Please read the brief below and tell me:
1. Anything that looks fragile, wrong, or under-tested.
2. Whether the auth model (single owner token shared across all
   members' syncs) is defensible.
3. Suggestions for the Vercel-Lambda IP-block workaround that
   don't depend on a single CDN region staying unblocked.

---

# Peloton Data Access Layer — Technical Brief

## 1. Auth flow

### Token model
Peloton retired its public `/auth/login` (session-cookie) endpoint in
**Oct 2025**. The API now requires an OAuth access token issued by
Auth0 (`auth.onepeloton.com`, PKCE flow). The app **does not
implement the OAuth dance** — tokens are obtained out-of-band:

- The owner logs into `onepeloton.com` in a browser.
- They copy the `Authorization: Bearer <jwt>` value from DevTools.
- They POST it to `/api/owner/token` (admin UI), which validates and
  stores it.

Tokens are JWTs whose `exp` claim is **~48 hours** out — the debug
endpoint decodes `iat`/`exp` for visibility
(`app/api/debug/route.ts:163–169`).

### Validation: `authenticatePeloton(bearerToken)` (`lib/peloton.ts:36`)
```ts
const res = await fetch(`${PELOTON_BASE}/api/me`, {
  headers: pelotonHeaders(token),
  cache: 'no-store',
})
```
Accepts either `"Bearer xxx"` or raw `"xxx"`. Returns
`{ token, userId }` where `userId` is `data.id` from `/api/me`. On 401
it raises an actionable error ("token may be expired — they last
~48 hours").

`createSession(token, userId)` is the bypass: it skips `/api/me` and
is used inside the sync path because routinely re-hitting `/api/me`
was redundant and, more importantly, was sometimes the call that
tripped Peloton's IP filter (see §4).

### Headers (`lib/peloton.ts:24`)
Every Peloton request carries:
```ts
{
  Authorization: `Bearer ${token}`,
  'Peloton-Platform': 'web',
  Accept: 'application/json',
}
```
The `Peloton-Platform: web` header is **load-bearing** — without it
some endpoints return 401 even with a valid token.

### Token storage
Stored in `member_credentials.peloton_bearer_token` (text). Only the
**owner** row has a token; non-owner members are added by username /
`peloton_user_id` only, and their syncs reuse the owner's token by
passing a `targetUserId`. The schema also still has
`peloton_password_encrypted` (`supabase/schema.sql:23`) and
`peloton_session_cookie` (referenced in
`scripts/migrations/2026-05-01-backfill-rides.mjs:51`) — these are
vestigial from the pre-Oct-2025 auth model and are no longer written.

### Endpoint protection
`/api/owner/token`, `/api/members`, `/api/sync`, and `/api/debug` all
require `Authorization: Bearer ${process.env.CRON_SECRET}` — a shared
secret unrelated to Peloton's. Vercel Cron is the only automated
caller; admins call them from the `/admin` page with the same secret.

## 2. Client / adapter structure

### `lib/peloton.ts` — the client
Pure functions, no DB. Surface:

| Signature | Purpose |
|---|---|
| `createSession(token, userId): PelotonSession` | Construct a session without calling Peloton. |
| `authenticatePeloton(bearerToken): Promise<PelotonSession>` | Validate via `/api/me`. |
| `fetchFollowing(session, page=0, limit=100): Promise<{users, total}>` | One page of who-I-follow. |
| `fetchAllFollowing(session): Promise<PelotonFollowingUser[]>` | Auto-paginated; 200ms delay between pages. |
| `fetchWorkoutList(session, page=0, limit=20, targetUserId?): Promise<{workouts, total}>` | List workouts for `targetUserId ?? session.userId`. |
| `fetchWorkoutSummary(session, workoutId): Promise<PelotonWorkoutSummary>` | Per-workout detail incl. leaderboard rank. |
| `fetchWorkoutPerformance(session, workoutId): Promise<PelotonWorkoutPerformance>` | Performance graph metrics. |
| `fetchRide(session, rideId): Promise<PelotonRide>` | Class metadata. |
| `fetchNewWorkouts(session, knownIds, maxPages=10, targetUserId?)` | Page until we hit a known id. |
| `extractAvgMetric(perf, name): number\|null` | Case-insensitive lookup in `average_summaries`. |
| `extractSummaryMetric(perf, name): number\|null` | Case-insensitive lookup in `summaries`. |

`PelotonSession = { token: string; userId: string }`. Helpers strip a
leading `"Bearer "` if present so the same value can be pasted from
DevTools or stored raw.

### `lib/sync.ts` — the adapter
Owns DB writes. Top-level entry points:
- `syncMember(memberId)` — full pipeline for one member.
- `syncAllMembers()` — iterates active members with a 1-second pause
  between each.

Internal helpers:
- `transformRide(ride)` — Peloton ride → `rides` row.
- `transformWorkout(memberId, summary, perf, safeRideIds)` —
  summary + perf → `workouts` row.
- `ensureRidesCached(db, session, summaries)` — upserts missing rides,
  returns the set of `ride_id`s that exist in the `rides` table after
  the run (used to avoid FK violations on `workouts.ride_id`).

### Routes
- `app/api/sync/route.ts` — thin wrapper that calls
  `syncMember` / `syncAllMembers`. **Not used in production**; kept
  for local development.
- `app/api/debug/route.ts` — `export const runtime = 'edge'`. This is
  the route that Vercel Cron actually hits (`vercel.json` schedules
  `/api/debug?mode=sync` at `0 6 * * *`). It's also the
  swiss-army-knife: `mode=following`, `mode=sync`, `mode=sync-member`,
  `mode=test-workouts`, `mode=test-perf`, `mode=backfill-perf`,
  default = diagnostic dump.
- `app/api/owner/token/route.ts` — POST to rotate the owner's token
  (validates via `authenticatePeloton`, then UPSERTs
  `member_credentials`).
- `app/api/members/route.ts` — POST adds a member; for the **first**
  member it requires a bearer token and runs `authenticatePeloton` to
  harvest `peloton_user_id`. For later members `peloton_user_id`
  comes from the following-list dropdown (no per-member token).

## 3. Peloton endpoints called

All against `https://api.onepeloton.com`. Headers as in §1.

### `GET /api/me`
Caller: `authenticatePeloton`. Reads: `data.id` (the owner's
`peloton_user_id`).

### `GET /api/user/{userId}/following?limit={n}&page={p}`
Caller: `fetchFollowing` / `fetchAllFollowing`. Reads:
```ts
data.data[].{ id, username, name, image_url }
data.total
```
Used by the admin UI to populate the "add member" dropdown — group
members must be people the owner follows on Peloton.

### `GET /api/user/{userId}/workouts?joins=ride,ride.instructor&limit=20&page={p}&sort_by=-created`
Caller: `fetchWorkoutList`. The `joins` query param inlines `ride`
and `ride.instructor` into each workout summary, which avoids a
per-workout ride fetch for fields we want on the workout row (title,
instructor name, duration). Reads:
```ts
data.data[]  // array of PelotonWorkoutSummary
data.total
```

### `GET /api/workout/{workoutId}?joins=ride,ride.instructor`
Caller: `fetchWorkoutSummary`. Same `PelotonWorkoutSummary` shape as
list items, but the per-workout endpoint reliably includes
`leaderboard_rank` / `total_leaderboard_users`. Fields consumed (see
`transformWorkout`):
- `id`, `fitness_discipline`, `start_time` (unix s), `status`
- `total_work` (joules), `is_total_work_personal_record`
- `leaderboard_rank`, `total_leaderboard_users`
- `ride.{id, title, duration, difficulty_rating_avg}`,
  `ride.instructor.name`
- `title` (workout-level fallback if `ride.title` is absent)

### `GET /api/workout/{workoutId}/performance_graph?every_n=5`
Caller: `fetchWorkoutPerformance`. Reads two arrays of
`{display_name, display_unit, value}`:
- `average_summaries`: `Avg Output` → `avg_watts`, `Avg Cadence`,
  `Avg Resistance`, `Avg Speed`
- `summaries`: `Distance` → `distance_miles`, `Calories`

Lookup is case-insensitive on `display_name`. Only called for
`fitness_discipline === 'cycling'` (gated in `lib/sync.ts:228`);
non-cycling workouts often 404 or 500 on this endpoint and the client
swallows those into
`{duration: 0, average_summaries: [], summaries: []}`.

### `GET /api/ride/{rideId}?joins=instructor`
Caller: `fetchRide` (via `ensureRidesCached`). Field mapping in
`transformRide` (`lib/sync.ts:24`):

| Peloton field | `rides` column |
|---|---|
| `id` | `id` (PK, text) |
| `title`, `description` | `title`, `description` |
| `instructor.name`, `instructor.image_url` | `instructor_name`, `instructor_image_url` |
| `duration` (s) | `duration_seconds` |
| `fitness_discipline` | `fitness_discipline` |
| `difficulty_estimate` (1–10) | `difficulty_estimate` |
| `overall_rating_avg` | `overall_rating_avg` |
| `total_workouts`, `total_ratings` | (same) |
| `image_url` | `image_url` |
| `original_air_time` (unix s) | `original_air_time` (ISO via `new Date(s*1000).toISOString()`) |
| `has_pedaling_metrics`, `is_explicit` | (same) |
| entire response | `raw_data` (jsonb) |

### `GET /api/user/{userId}` (one-off backfill only)
Used in `scripts/migrations/2026-05-01-backfill-member-images.mjs` to
populate `members.image_url`. Not part of the running sync.

## 4. Fragility points and workarounds

### a) Peloton blocks Vercel Lambda egress IPs
The single largest pain point. Production cycled through these
symptoms during the Oct/Nov 2025 auth migration (commits `b2a32d8`,
`5063568`, `ac7b468`, `851d001`):
- A token that worked from local `curl` returned 401 with
  `error_code 3020` from Vercel Lambda.
- Adding `cache: 'no-store'` everywhere ruled out Next.js fetch
  caching as the cause (commits `125412e`, `81d66f9`).
- Switching the runtime to Edge (Cloudflare egress) made the same
  code/token work.

**Workaround in code**: `app/api/debug/route.ts:7` declares
`export const runtime = 'edge'`, and `vercel.json` points cron at
`/api/debug?mode=sync` rather than `/api/sync`. The `/api/sync` route
still exists but lives on Node runtime and is unreliable in prod.

### b) Tokens expire every ~48 hours
There is no refresh token in the system. When the cron fails with
401, an admin manually pastes a new token into the `/admin` page →
`POST /api/owner/token`. Diagnostic-mode `/api/debug` (no `mode`)
decodes the JWT `iat`/`exp` and probes a half-dozen endpoints in
parallel so the owner can see immediately whether the issue is token
expiry vs IP block vs endpoint-specific.

### c) `/api/me` bypass during sync
`syncMember` uses `createSession(token, owner.peloton_user_id)`
instead of `authenticatePeloton(token)` (`lib/sync.ts:175,194`).
Rationale captured in `lib/peloton.ts:14`: when `/api/me` was the
only endpoint being blocked, calling it would fail the entire sync
even though the workout endpoints would have worked. Storing
`peloton_user_id` on the `members` row removes the dependency.

### d) Non-cycling workouts have no performance graph
`fetchWorkoutPerformance` returns
`{duration: 0, average_summaries: [], summaries: []}` on 404/500
rather than throwing (`lib/peloton.ts:177`). `syncMember` also gates
the call on `fitness_discipline === 'cycling'` to save a request.

### e) FK risk on `workouts.ride_id`
A workout's `ride.id` may reference a ride we failed to fetch
(deleted class, network error). `ensureRidesCached` returns a
`safeRideIds: Set<string>` of ride ids that are now present in the
`rides` table, and `transformWorkout` writes `ride_id` only when the
id is in that set — otherwise null, to be backfilled later
(`lib/sync.ts:122–123`).

### f) Outdoor cycling sentinel
Peloton uses the all-zeros id
`'00000000000000000000000000000000'` for outdoor rides (no class
metadata). The backfill scripts explicitly skip it
(`scripts/migrations/2026-05-01-backfill-rides.mjs:29`). The runtime
sync doesn't special-case it — `fetchRide` will 404 and the ride is
dropped, which produces the same outcome (null `ride_id`).

### g) Performance-metric field naming
Spent a few commits (`975cb91`, `c5b612b`) discovering the exact
field naming on `performance_graph`:
- The array is `average_summaries`, **not** `avg_summaries` (early
  code had it wrong).
- Each entry's `display_name` matches what Peloton shows in the UI:
  `"Avg Output"`, `"Avg Cadence"`, `"Avg Resistance"`, `"Avg Speed"`,
  `"Distance"`, `"Calories"`.

The `mode=test-perf` endpoint exists specifically to dump raw
`display_name`s when a new metric naming question comes up.

### h) Workouts incomplete at the time of sync
`fetchNewWorkouts` filters `workout.status === 'COMPLETE'` before
adding to the upsert batch (`lib/peloton.ts:257`) — Peloton briefly
returns in-flight workouts with partial data.

### i) Stale-pagination guard in `fetchNewWorkouts`
The list endpoint is sorted `-created`. We page until either an
empty page, `maxPages=10` (200 workouts default cap), or — critically
— we encounter a workout id already in the DB, at which point we
break out. This makes incremental sync cheap; the trade-off is that
an out-of-order insert upstream could theoretically be missed. In
practice Peloton's `-created` sort is monotonic.

### j) `backfill-perf` uses offset, not "where IS NULL"
The original backfill filtered on `where avg_watts is null`, which
meant rows updated to 0 (or to the `-1` sentinel) would be re-scanned
every call. Commit `297e177` switched to
`.range(offset, offset + batchSize - 1)` with caller-supplied offset
so each call processes a disjoint slice. The route returns
`{done, updated, failed, next_offset}` so a driver script can loop
until `done: true`.

### k) Rate limit courtesy
Peloton has no published rate limit; the code inserts conservative
pauses to avoid tripping unknown thresholds:
- 200ms between workouts within a member (`lib/sync.ts:232`)
- 200ms between ride fetches (`lib/sync.ts:91`)
- 200ms between following pages (`lib/peloton.ts:113`)
- 300ms between workout-list pages (`lib/peloton.ts:267`)
- 1000ms between members (`lib/sync.ts:276`)
- 120ms inside `backfill-perf` (`app/api/debug/route.ts:127`)

## 5. End-to-end mapping (summary)

```
Peloton /api/user/{id}/workouts?joins=ride,ride.instructor
  → PelotonWorkoutSummary[]
       └─ filter status==='COMPLETE', stop at known id
            → for each:
                 fetchWorkoutSummary(id)           → leaderboard fields, ride.*
                 if cycling: fetchWorkoutPerformance(id)
                                                   → average_summaries[], summaries[]
                 collect unique ride ids
                      → ensureRidesCached:
                           for each not cached or > 30d old:
                              fetchRide(rideId) → upsert into `rides`
                           return set of ride ids now present
                 transformWorkout(member_id, summary, perf, safeRideIds)
                      → upsert into `workouts` ON CONFLICT (peloton_workout_id)
```

Notable transforms in `transformWorkout`:
- `total_output_kj = round(total_work / 1000, 1)` (Peloton returns
  joules; we store kilojoules to one decimal)
- `workout_date = new Date(summary.start_time * 1000).toISOString()`
  (unix s → ISO)
- `title` falls back:
  `summary.ride?.title ?? summary.title ?? 'Workout'`
- The full Peloton summary is stashed in `workouts.raw_data` (jsonb)
  for ad-hoc backfills — both migrations under `scripts/migrations/`
  depend on this.

## 6. Decisions made under uncertainty

Worth flagging to a reviewer:

1. **"Owner token covers everyone" is a deliberate trust model.**
   Non-owner members provide no credentials of their own; sync uses
   the owner's token with the friend's `peloton_user_id`
   (`lib/sync.ts:194`). This works only because Peloton lets you see
   workouts of anyone you follow. If a member is unfollowed on
   Peloton, their sync will silently start failing — there is no
   monitoring for this.
2. **Edge runtime is a workaround, not a stable contract.** Routing
   through `/api/debug` on Edge sidesteps the IP block as of late
   2025, but Peloton could block Cloudflare egress at any time. If
   that happens, this whole layer needs to move to a residential-IP
   relay or to a user-owned device.
3. **No OAuth refresh.** Implementing PKCE against
   `auth.onepeloton.com` would remove the 48-hour manual rotation; I
   left it out because the flow isn't documented, requires capturing
   the PKCE callback, and a single user (the owner) rotating a token
   twice a week is operationally acceptable for a friend-group app.
4. **`raw_data` jsonb columns on both `workouts` and `rides`** are
   intentional. Both migrations in `scripts/migrations/` depend on
   `raw_data` to backfill columns added later. The cost is roughly
   2× row size but is fine at the current volume (~900 workouts).
5. **The pre-Oct-2025 auth columns
   (`peloton_password_encrypted`, `peloton_session_cookie`) are still
   in the schema.** Removing them would be a destructive migration;
   they are unused by current code and harmless.
6. **`PelotonRide` field names** were inferred from the `rides` SQL
   schema, not from a live response (acknowledged in the type
   definition `types/index.ts:89–110`). The 2026-05-01 ride backfill
   ran cleanly so the names are correct in practice, but a brand-new
   field on Peloton's side would not be picked up automatically.
7. **`difficulty_rating` vs `difficulty_estimate`.**
   `workouts.difficulty_rating` comes from
   `summary.ride?.difficulty_rating_avg` on the workout summary;
   `rides.difficulty_estimate` comes from the ride detail. These are
   two different Peloton fields with similar meanings and we store
   both — neither is normalized into the other.
