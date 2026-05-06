# Rider sync — stability & performance review

This is a handoff document for the next Claude Code session. The first half is a **review of the current system** (no changes were made). The second half is a **prompt** the next session can use as its working brief, plus a checklist of credentials/permissions you should provide it before it starts.

The current session reviewed only the source on disk + git history. It did **not** have access to live Supabase data, Vercel logs, or the Peloton API, so anything labeled "verify in live data" must be confirmed by the next session before it changes behavior.

---

## 1. System as it exists today

### Architecture (one-paragraph)
A Next.js 14 app on Vercel, backed by Supabase Postgres. A daily cron at `0 6 * * *` UTC hits `/api/debug?mode=sync`, which iterates every active member sequentially and pulls new Peloton workouts via the owner's stored bearer token (or the member's own token if present). Workouts go into `workouts`; class metadata into `rides`. The leaderboard reads a Postgres view that windows on the most recent UTC Tuesday.

### Key files (with line refs)
- `vercel.json:1` — cron config (single daily run)
- `lib/peloton.ts:1` — Peloton API client (token auth, list/summary/perf/ride/following endpoints)
- `lib/sync.ts:1` — `syncMember` and `syncAllMembers` orchestration
- `app/api/debug/route.ts:1` — kitchen-sink Edge route, where the cron actually lands
- `app/api/sync/route.ts:1` — older Lambda sync route, **likely dead** (see F2)
- `app/api/owner/token/route.ts:1` — manual token refresh endpoint
- `app/api/members/route.ts:1` — add-member POST, member-list GET
- `app/admin/page.tsx:1` — single admin UI (token paste, add-member, manual sync)
- `supabase/schema.sql:1` — initial schema (out of sync with reality, see F4)
- `supabase/functions.sql:1` — `get_member_streaks()`, `current_week_stats` view
- `supabase/rides_migration.sql:1` — `rides` table + `ride_comparison`/`ride_popularity` views
- `scripts/db.mjs:1` — local query helper
- `scripts/migrations/2026-05-01-*` — historical one-shot backfills (already applied)

### Data model
- `members` — one row per friend; `is_owner` marks the bootstrap account.
- `member_credentials` — bearer token per member (only the owner reliably has one in practice).
- `workouts` — one row per Peloton workout. Has `raw_data jsonb` with the full API response.
- `rides` — class metadata, populated lazily by sync.
- `sync_log` — one row per member-sync attempt (no run-level row).
- Views: `weekly_leaderboard`, `current_week_stats`, `personal_records`, `ride_comparison`, `ride_popularity`.

### Sync flow today (per cron run)
1. Cron → `GET /api/debug?mode=sync` with `Authorization: Bearer ${CRON_SECRET}`.
2. `syncAllMembers` walks `members where active = true` serially, sleeping 1s between members.
3. For each member, `syncMember`:
   a. Pick a token: member's own if stored, else **the owner's**.
   b. Insert a `sync_log` row with `status=running`.
   c. Read all `peloton_workout_id`s already in DB into a `Set`.
   d. Page through `/api/user/{id}/workouts?joins=ride,ride.instructor&limit=20`, up to 10 pages, **stopping at the first known ID**.
   e. For each new workout: `fetchWorkoutSummary` (joins ride+instructor — same join as the list call) + `fetchWorkoutPerformance` (cycling only). 200ms between calls.
   f. `ensureRidesCached`: for every ride id seen, upsert into `rides` unless it was cached within 30 days.
   g. Upsert `workouts` rows in one batch.
   h. Update `sync_log` to `success` / `error`.

---

## 2. Why sync is fragile — the 13 issues found

### F1. The owner's token is a single point of failure, and it expires every ~48 hours
Every non-owner sync uses `member_credentials` for the owner. So when the owner's bearer expires (and tokens copied from DevTools have ~48h lifetime, no refresh token captured), **every** member's sync fails until someone manually pastes a fresh token via `/admin`. With cron only running once a day, a token that expires Tuesday at 8am leaves the entire group's Tuesday data unsynced until Wednesday 6am at the earliest — and only if the owner happened to refresh in between.

### F2. The cron lands on a route literally called `/api/debug`
- `vercel.json:5` → `path: "/api/debug?mode=sync"`
- The "real" `/api/sync` route exists but is on default Lambda runtime, while `/api/debug` is forced to Edge runtime (see `app/api/debug/route.ts:7`). The comment there is explicit: Vercel Lambda IPs get a 3020 error from Peloton; Edge (Cloudflare) IPs work. So the only way the cron actually fetches Peloton is via the Edge route — `/api/sync` is dead code that would 401 if anything tried to use it.
- This means the route name is a bug-magnet ("why is the cron pointed at debug?") and the working-cron / dead-cron asymmetry isn't documented anywhere.

### F3. No retries, no rate-limit handling, no run-level alerting
- `syncMember` has try/catch around the loop body so per-workout fetch failures don't kill the run, but per-call failures aren't retried. A flaky Peloton response just drops a workout silently (you'll see it next sync, since it's not in `knownIds`).
- `sync_log` has no parent "run" record. There's no place to record "the 6am run started, hit X members, Y failed" — so no easy alert hook.
- No metric exposure / no error capture (no Sentry / no Logflare / no Slack webhook on failure).

### F4. Schema drift between `supabase/schema.sql` and production
- `schema.sql:23` defines `member_credentials.peloton_password_encrypted text not null` — the column was renamed/removed long ago. Current code only reads `peloton_bearer_token`. Old backfill scripts even reference `peloton_session_cookie`.
- Running `schema.sql` on a fresh Supabase project would produce a database that doesn't match the app.
- No migration tooling (no `supabase/migrations/` numbered files, no `dbmate`, no `prisma migrate`, no Supabase CLI workflow).

### F5. Pagination caps the first sync at 200 workouts
`fetchNewWorkouts` walks 10 pages × 20 = 200, then stops. For new members it silently truncates older history. **OK per your note — manual backfill is acceptable for history**, but the limit should be documented.

### F6. Two redundant Peloton calls per workout
- The workout list call already includes `joins=ride,ride.instructor`, so the response has the ride + instructor.
- `syncMember` then calls `fetchWorkoutSummary(id)` **with the same joins** — a second round-trip per new workout for the same data. Eliminating it would roughly halve the Peloton call count per new workout.
- Confirm against a live API response that the list payload contains `total_work`, `is_total_work_personal_record`, `leaderboard_rank`, `total_leaderboard_users`, `ride.difficulty_rating_avg` — if any are missing, keep the summary call but only fetch the missing fields.
- The `performance_graph` call is the only one with truly new data (avg watts/cadence/resistance/speed, distance, calories) and is the one that should stay.

### F7. Ride cache is per-member, not per-run
`ensureRidesCached` runs inside each `syncMember`. If 5 members all took the same Tuesday class, the run could refetch that ride 5 times. It only skips when `updated_at` is < 30 days, so you'd typically only refetch once per ride per month — but during the first month, this is wasted volume. Move it to a single dedupe pass at the end of the run.

### F8. Cron is daily; "going forward, timely" needs hourly+
- `0 6 * * *` is once a day at 6am UTC (= 11pm PT, 1am CT, 2am ET previous calendar day).
- Vercel Hobby tier only allows daily cron schedules. If you want hourly, you need Vercel **Pro** (~$20/month) **or** move the cron to GitHub Actions on a schedule (free, can run every 5–15 min, hits the sync URL with `Authorization: Bearer $CRON_SECRET`).
- Recommendation: GitHub Actions hourly. Cheap and visible.

### F9. Workout volume is genuinely small — confirm
Your hypothesis (2–5 classes/member/week) implies ~20–50 new workouts per week across the whole group. Confirm with the live DB query in §6 below. If the numbers match, the entire sync should fit in a single Edge function invocation under 10 seconds with parallelized fetches, even with ~10 members.

### F10. `/api/debug` is a 226-line kitchen sink
Six modes (`following`, `test-workouts`, `test-perf`, `backfill-perf`, `sync`, `sync-member`) plus a default diagnostic that probes 6 Peloton endpoints on every uncategorized GET. `backfill-perf` is dead one-shot code from May 2026 (commits `7b2e349`, `297e177`). Default mode probes Peloton 6 times every time it's called, wasting calls and exposing token internals (returns first 40 chars of the bearer + JWT iat/exp).

### F11. Serial-with-sleep amplifies latency
`syncAllMembers` sleeps 1000ms between members. With ~10 members and ~3 fetches per member at ~250ms each plus 200ms sleeps, even a clean run takes ~30s — close to or past Edge's typical 25–30s default budget on Hobby. A single slow member can push the whole run into a timeout, after which subsequent members never sync that day.

### F12. `weekly_leaderboard` is timezone-sensitive
- The view uses `date_trunc('week', now()) + interval '1 day'` to land on Tuesday. `date_trunc('week', ...)` returns Monday **in the session's timezone**. Supabase defaults to UTC.
- A workout completed locally Monday evening 9pm Pacific = UTC Tuesday 5am. It will be assigned to the **next** week's leaderboard on the UI, even though the rider thinks of it as "Monday's ride".
- The streak function (`get_member_streaks`) is named "streak" but really counts "weeks active in the last 12" — it doesn't enforce consecutiveness.

### F13. Dead/legacy column: `member_credentials.peloton_password_encrypted`
Defined `not null` in schema.sql; no code writes or reads it; bootstrapped data presumably has dummy values. Drop it.

---

## 3. Recommended direction (in priority order)

1. **Stop relying on the owner's manually-pasted bearer token.** Pick one of:
   - **(easy)** Capture token expiry from JWT `exp` and proactively email/Slack/SMS the owner ~6 hours before expiry; build a one-click "I just refreshed" flow on `/admin`. Mitigates F1 without changing auth.
   - **(better)** Implement the Auth0 PKCE flow against `auth.onepeloton.com`. The owner logs in once with username + password (or via their browser), and we capture both `access_token` and `refresh_token`. Refresh token usually lasts 30+ days. Cron uses refresh to get a fresh access token.
   - **(best)** Per-rider PKCE: each member does the OAuth dance once, stores their own refresh token, syncs use **the member's own** token rather than the owner's. Removes single-point-of-failure entirely. Higher onboarding friction.

   This is the most important change — every other improvement is a smaller multiplier.

2. **Move cron to GitHub Actions, run hourly.** Add `.github/workflows/sync.yml` with a `schedule: cron '0 * * * *'` that does `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>.vercel.app/api/sync`. Free, runs reliably, gives you GitHub-native logs for every run.

3. **Consolidate the sync route.** Pick one path (`/api/sync` is the obvious name), force it to Edge runtime, copy/paste-port the `mode=sync` body from `debug/route.ts`. Update the cron and `admin/page.tsx`. Delete `/api/debug` entirely or rename it to `/api/admin/diagnostic` and trim it to the bare minimum.

4. **Eliminate the redundant per-workout summary call (F6).** Verify the list-with-joins payload has every field we use, then remove `fetchWorkoutSummary`. Halves Peloton API volume for new workouts.

5. **Parallelize within a run, with concurrency cap.** Replace serial member loop with `pMap`/hand-rolled concurrency (3–5 in flight at once). Same for ride fetches: dedupe globally, then `Promise.all` with cap. Drops a 30s run to ~5s.

6. **Add run-level logging + alerting.** New `sync_runs` table (`id, started_at, completed_at, status, members_total, members_failed, error_summary`). Each `sync_log` gets a `run_id`. Send a Slack/email/SMS webhook when a run has any errors, or when no workouts were ingested in the last N hours.

7. **Add token-health diagnostics to `/admin`.** Show: token expires-in-X-hours, last successful sync per member, last error per member.

8. **Clean up schema drift.** Generate the *real* current schema (`pg_dump --schema-only` from the live DB), check it in as `supabase/schema.sql`, drop `peloton_password_encrypted`, and adopt a migration tool (Supabase CLI or numbered SQL files in `supabase/migrations/`).

9. **Keep the historical backfill flow as-is.** You're OK doing that manually. Document the existing one-shots and give yourself a `scripts/backfill-member.mjs <member_id> [--pages N]` that can pull deeper than the live sync's 200-workout cap.

10. **Tighten timezone in `weekly_leaderboard`.** Add an explicit `at time zone 'America/Los_Angeles'` (or whatever the group is in) wrap so the Tuesday boundary matches user mental model.

---

## 4. Things to leave alone
- The Edge-runtime workaround for IP blocking — it works, just label it clearly and stop pretending `/api/sync` is the cron target.
- Public-read RLS on `members`/`workouts`/`rides` — appropriate for a group leaderboard.
- `ride_comparison` / `ride_popularity` views — design is solid.
- 30-day TTL on ride cache — fine.
- Lazy Supabase client init in `lib/supabase.ts:1`.

---

## 5. Open questions for the user (next session: ask before changing)
1. Are you on Vercel **Hobby** or **Pro**? Cron frequency depends on this.
2. Is hourly sync acceptable, or is the goal "within minutes"? Affects whether GitHub Actions or Vercel cron is right.
3. Are you OK asking each rider to do a one-time OAuth flow (option 1c above), or do you want to keep the friend-of-owner model (1a/1b)?
4. Where do alerts go — your email, Slack, SMS?
5. What's the group size today (members count) and roughly the historical workout volume? You mentioned 2–5 classes/member/week — confirmed against live data.
6. Are you OK deleting `/api/debug` and `/api/sync` (or renaming) in the same PR that adds the new `/api/sync`?

---

## 6. Verification queries the next session should run first
Run these against the live DB before changing code, to validate the assumptions in this document.

```sql
-- Member counts
select count(*) filter (where active) as active,
       count(*) filter (where not active) as inactive,
       count(*) filter (where is_owner) as owners
from members;

-- Workout volume per active member, last 30 / 90 days
select m.name,
       count(w.id) filter (where w.workout_date > now() - interval '30 days') as last_30d,
       count(w.id) filter (where w.workout_date > now() - interval '90 days') as last_90d,
       count(w.id) as all_time,
       max(w.workout_date) as latest
from members m
left join workouts w
  on w.member_id = m.id and w.fitness_discipline = 'cycling'
where m.active
group by m.name
order by last_30d desc;

-- Sync health: last successful sync per member, plus recent errors
select m.name,
       max(s.completed_at) filter (where s.status = 'success') as last_success,
       max(s.completed_at) filter (where s.status = 'error')   as last_error,
       (
         select error_message from sync_log s2
         where s2.member_id = m.id and s2.status = 'error'
         order by completed_at desc nulls last limit 1
       ) as last_error_message
from members m
left join sync_log s on s.member_id = m.id
where m.active
group by m.name
order by last_success desc nulls last;

-- Stuck "running" rows (sync crashed mid-flight)
select id, member_id, started_at, now() - started_at as age
from sync_log
where status = 'running' and started_at < now() - interval '1 hour'
order by started_at desc;

-- Token age (we want to know how often it goes stale)
select m.name, mc.updated_at, now() - mc.updated_at as token_age
from member_credentials mc
join members m on m.id = mc.member_id
order by mc.updated_at desc;

-- Rides table coverage
select count(*) as total_workouts,
       count(*) filter (where ride_id is null) as null_ride,
       count(*) filter (where raw_data is null) as null_raw
from workouts;

-- Discipline breakdown (we only score cycling)
select fitness_discipline, count(*) from workouts group by 1 order by 2 desc;
```

Also worth checking on Vercel:
- Function logs for the last 7 days of cron runs at `/api/debug` — what's the duration distribution? any timeouts?
- The token's actual lifetime: pull the JWT, decode `exp` - `iat` from the diagnostic mode.

---

## 7. Constraints discovered while reviewing
- Peloton's `auth/login` endpoint was shut down Oct 2025 (per `lib/peloton.ts:32` comment). All auth is now via Auth0 access tokens.
- Peloton blocks most Vercel Lambda egress IPs with error_code 3020 (per `app/api/debug/route.ts:9`). Edge runtime via Cloudflare's network works.
- Tokens copied from `members.onepeloton.com` DevTools last ~48h (no refresh token).
- The `following` endpoint is required to populate the add-member dropdown — it 401s when the owner's token is expired, which is the user-visible signal that token refresh is overdue.

---

# 8. Prompt for the next Claude Code session

Below this line is the actual brief to paste/give to the next session. Everything above is supporting context. The next session should also be given this same file in the working directory.

---

```
You are continuing work on the Tabata Tuesday app (a private group Peloton leaderboard, ~10 friends). Read RIDER_SYNC_REVIEW.md in the repo root for the full context — that document was produced by a prior review session. It contains a code/architecture audit, a list of 13 fragility issues (F1–F13), prioritized recommendations, open questions, and live-data verification queries.

YOUR TASK
Improve the stability and timeliness of the Peloton rider sync. The user has explicitly said:
- Historical/backfill data load can be handled MANUALLY by the user — don't optimize for it.
- "Going forward" timeliness is the priority — workouts should appear on the leaderboard within a reasonable time of being completed.
- The data volume is small (~2–5 classes/rider/week, ~10 riders) — verify this against live data before assuming.

PHASING — do these in order, stop at each checkpoint and confirm with the user.

PHASE 0 — Verify assumptions (read-only)
1. Read RIDER_SYNC_REVIEW.md end to end.
2. Run every query in §6 ("Verification queries") against Supabase. Use scripts/db.mjs or a fresh script. Capture results.
3. Pull the last 7 days of Vercel function logs for /api/debug and report:
   - Avg / p95 / max duration
   - Any 5xx or timeouts
   - Cron run cadence (was 0 6 * * * actually firing?)
4. Decode the owner's bearer JWT (from member_credentials) and report token_age, exp, time-to-expiry.
5. Summarize findings in a short report and ASK the user the open questions in §5 of RIDER_SYNC_REVIEW.md before writing any code.

PHASE 1 — Stop the bleeding (tiny, safe changes)
Goal: reduce the number of times the user has to manually paste a token, and surface failures.
1. Add a /api/health endpoint (Edge) that returns: token_expires_at, hours_until_expiry, last_successful_sync (most recent across all members), count_of_recent_errors_24h. No auth required, but redact the token itself.
2. Add a banner to /admin when token expires in <12h.
3. Add a /api/notify endpoint or Slack/email webhook fired by the cron when a run has any error or token <6h from expiry. Use the user's preferred destination from the Phase 0 Q&A.
4. Add a sync_runs table (id, started_at, completed_at, status, members_total, members_failed, error_summary) and a run_id FK on sync_log. New migration file in supabase/migrations/ with a numeric/date prefix.
5. Commit + push + verify in production.

PHASE 2 — Cron + route consolidation
Goal: move cron off the misleadingly-named /api/debug, increase frequency.
1. Create a clean /api/sync (Edge runtime, with comment explaining the IP-block reason). Move the sync logic out of /api/debug?mode=sync into it. Keep behavior identical for now.
2. Update vercel.json (or move to GitHub Actions if user picked that in Phase 0). If GitHub Actions: create .github/workflows/sync.yml with a cron schedule and a curl step.
3. Trim /api/debug to ONLY the modes still in use by /admin (probably just `following`). Delete `test-workouts`, `test-perf`, `backfill-perf`, `sync`, `sync-member`, and the default diagnostic. Rename to /api/admin/diagnostic if any survives.
4. Delete /api/sync's old Lambda implementation if it's not the new home.
5. Commit + push + verify cron fires.

PHASE 3 — Reduce Peloton API volume + parallelize
Goal: faster, cheaper, less likely to hit rate limits.
1. Verify against a live workout-list response that the joined ride/instructor + workout fields cover everything we need. If yes, remove fetchWorkoutSummary. If partial, keep it only for fields the list lacks.
2. Move ensureRidesCached out of per-member into a single post-pass over the whole run.
3. Parallelize syncAllMembers with concurrency cap of 3. Parallelize ride fetches with cap of 3.
4. Add per-call retry with exponential backoff (3 tries, 1/2/4s).
5. Measure: full-group sync should drop from ~30s to <10s. Capture before/after numbers in the PR.

PHASE 4 — Token lifecycle (the big one — DO NOT START WITHOUT USER APPROVAL)
This is where the user decides between options 1a / 1b / 1c in §3 of RIDER_SYNC_REVIEW.md:
- 1a: keep manual paste, just add good alerting (already mostly Phase 1).
- 1b: implement Auth0 PKCE for the owner only, store refresh token, auto-refresh in cron.
- 1c: per-rider PKCE — every rider onboards with their own OAuth flow.

If user picks 1b or 1c, design the OAuth flow first, write a brief, get sign-off before coding. PKCE against auth.onepeloton.com requires reverse-engineering the client_id and audience that Peloton's web app uses — search the Peloton web bundle or DevTools network log. This is the highest-risk change in the whole project.

PHASE 5 — Schema cleanup
1. Dump the current production schema with pg_dump (or via Supabase CLI), commit it as supabase/schema.sql, replacing the stale version.
2. Drop members_credentials.peloton_password_encrypted column with a migration.
3. Adopt supabase/migrations/ folder convention going forward.
4. Fix the weekly_leaderboard timezone (wrap now() in `at time zone 'America/Los_Angeles'` or whatever the user picks).
5. Rename get_member_streaks to count_active_recent_weeks OR re-implement to actually count consecutive streaks, per user's preference.

GENERAL RULES
- This branch is claude/review-rider-sync-5DTiV (already checked out). Commit and push there. Don't open a PR unless asked.
- The user has given you Bash/Read/Write/Edit permission already; you don't need to ask for those.
- Don't introduce new dependencies without justification. Current stack: Next 14, @supabase/supabase-js, recharts.
- Don't touch RLS policies without explicit approval — leaderboard is meant to be publicly readable within the group.
- The user explicitly said NO destructive operations without confirmation; in particular, don't drop tables, don't truncate, don't rotate the CRON_SECRET unless asked.

CREDENTIALS YOU'LL NEED — ask the user upfront in your first message:
- NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (write a .env.local)
- CRON_SECRET (for hitting the deployed sync URL during testing)
- Vercel CLI auth (`vercel login` or VERCEL_TOKEN env)
- Peloton bearer token (current valid one, for a one-shot test only — don't store)
- Slack webhook URL or email forwarding address (for Phase 1 alerting)

Acknowledge this brief, confirm the verifications you'll run in Phase 0, and then start.
```
