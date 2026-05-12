# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Next.js dev server on `:3000`
- `npm run build` — production build (Next.js)
- `npm run lint` — `next lint` (ESLint with `eslint-config-next`). Note: ESLint isn't configured yet; first run prompts for setup.
- `npx tsc --noEmit` — type-check the whole project. The only check that runs in CI today.
- No test suite exists — there is no `npm test`.

Ad-hoc DB queries against the Supabase project (loads `.env.local`, uses service-role key):

```
node scripts/db.mjs members
node scripts/db.mjs workouts <member_id> [<since_iso>]
node scripts/db.mjs ride <ride_id>
node scripts/db.mjs synclog <member_id>
node scripts/db.mjs raw <table> <select-string> '[{"col":"x","op":"eq","val":"y"}]'
```

Trigger a sync manually:

```
# From the GitHub Actions UI (primary path):
gh workflow run "Peloton sync" -f trigger=manual

# Or from the deployed Vercel UI:
curl -H "Authorization: Bearer $CRON_SECRET" "https://<host>/api/debug?mode=sync&trigger=manual"
curl -H "Authorization: Bearer $CRON_SECRET" "https://<host>/api/debug?mode=sync-member&memberId=<uuid>"
```

The admin pages at `/admin/health` ("Sync all members" button) and `/admin` ("sync" link per row) wrap these endpoints.

## Architecture

Next.js 14 App Router + TypeScript (strict) + Tailwind, backed by Supabase Postgres. Path alias `@/*` → repo root.

**Where things run:**
- Vercel hosts the UI and admin API routes.
- `.github/workflows/peloton-sync.yml` runs the daily sync at 06:00 UTC from a GitHub Actions runner. GitHub's Azure egress isn't on Peloton's WAF blocklist; Vercel Lambda is. This is the primary cron.
- `vercel.json` runs a second cron at the same time as a temporary backup during the GitHub-Actions cutover. Once it's been clean for a week, delete the `crons` entry.

**Three layers worth understanding before editing:**

### 1. Peloton ingestion (`lib/peloton.ts` + `lib/sync.ts`)

Peloton's `/auth/login` endpoint was shut down in Oct 2025. **All Peloton calls now require an OAuth Bearer token** obtained via the Auth0 PKCE flow. The owner bootstraps once by pasting `access_token` + `refresh_token` + `client_id` (or running the iOS Shortcut from `docs/ios-shortcut-bootstrap.md`); the app refreshes automatically thereafter.

Stored per-owner in `member_credentials`:
- `peloton_bearer_token` — current access token (JWT, ~48h life)
- `peloton_refresh_token` — long-lived refresh token; rotates on use, always persist whatever comes back
- `peloton_token_expires_at` — decoded from the JWT `exp` claim at store time
- `peloton_auth0_client_id` — captured at bootstrap; required to call `/oauth/token`

`pelotonFetch()` in `lib/peloton.ts` wraps every HTTP call against `api.onepeloton.com` and `auth.onepeloton.com` with 5xx retry (2 retries, 500ms then 1500ms with jitter). 4xx is returned as-is — auth or bad-request errors need caller attention, not retries.

`getFreshPelotonSession()` in `lib/sync.ts` is the entry point for any sync work. It reads the member's stored credentials and, if the access token is within 60s of expiry, calls `refreshPelotonToken()` and persists the new bundle before returning a `PelotonSession`. Rows that don't have the refresh bundle yet (pre-bootstrap) skip the refresh path and fall back to the stored access token.

`syncMember(memberId)` is the unit of work:
1. Calls `getFreshPelotonSession(memberId)`. Falls back to the owner's session if the member has no own token (non-owner members rely on owner-follow).
2. Fetches the existing `peloton_workout_id` set, then pages `/api/user/{id}/workouts` until a known ID is hit. The fetch keeps scanning the current page past the known ID and fetches one extra lookahead page — cheap insurance against Peloton returning records out of order. Max 10 pages total.
3. For each new workout: fetches `/api/workout/{id}` (summary) and, for any discipline in `PERFORMANCE_GRAPH_DISCIPLINES` (currently just `cycling`; tread will join when needed), `/api/workout/{id}/performance_graph` (avg metrics).
4. **Ride caching:** `ensureRidesCached` upserts every referenced class into the `rides` table, skipping rows updated within `RIDE_CACHE_TTL_DAYS` (30 days). Workouts whose ride fetch fails are inserted with `ride_id = null` rather than failing the whole run — the FK on `workouts.ride_id` would otherwise trip.
5. Writes a `sync_log` row (per-member: `running` → `success`/`error`).

`syncAllMembers(trigger)` wraps the per-member loop with `sync_runs` writes (one row per bulk invocation, captures `started_at`, `finished_at`, totals, and the first error). Runs members serially with a 1s delay; per-workout fetches sleep 200–300ms. Don't parallelize without thinking about Peloton rate limits.

`/admin/health` reads the last 30 `sync_runs` rows. Red banner if no `success` in the last 36h; yellow banner if the captured `token_expires_at` is <8h away. `/admin/peloton-bootstrap` updates the owner's full credential bundle via `POST /api/admin/peloton-bootstrap`.

### 2. Supabase clients (`lib/supabase.ts`)

Two clients, **both lazy-initialized** so build-time imports don't crash without env vars:
- `getSupabase()` — anon key, client-safe.
- `getSupabaseAdmin()` — service-role key, **server-only**. Used by every API route and the sync job.

Never import `getSupabaseAdmin` from a `'use client'` file.

### 3. Database schema (`supabase/`)

Migrations are **plain SQL files applied manually in the Supabase SQL editor** — there is no framework-managed migration runner. Files are written to be idempotent (`if not exists`, `do $$ ... end $$` guards, `create or replace view`). Apply order if rebuilding from scratch:

1. `schema.sql` — members, workouts, sync_log, `weekly_leaderboard` view, RLS
2. `functions.sql` — `get_member_streaks` rpc, `current_week_stats` view
3. `rides_migration.sql` — `rides` table, `workouts.ride_id` FK + backfill, `ride_comparison` and `ride_popularity` views
4. `member_image_migration.sql`
5. `sync_runs_migration.sql` — observability table feeding `/admin/health`
6. `auth_refresh_migration.sql` — adds the three refresh-token columns to `member_credentials` and drops the vestigial `peloton_password_encrypted` / `peloton_session_cookie`

When adding schema changes, write a new dated migration file under `supabase/` rather than mutating an existing one — and keep it idempotent so it can be re-run safely.

**The "week" is Tuesday → Tuesday.** Both `weekly_leaderboard` and `current_week_stats` compute their bounds as `date_trunc('week', now()) + interval '1 day'` (Postgres weeks start Monday, +1 day = Tuesday). Anything UI-side that talks about "this week" must agree with that boundary.

**RLS posture:** `members`, `workouts`, and `rides` are publicly readable (the leaderboard is intentionally public within the group — no end-user auth exists). `member_credentials` and `sync_runs` are service-role only. Admin and sync API routes are gated by a `CRON_SECRET` bearer header rather than by user auth.

## Conventions

- API routes that hit Supabase set `export const dynamic = 'force-dynamic'` to opt out of static rendering. Keep this on any new route that reads server-only env vars.
- API routes that call Peloton from Vercel set `export const runtime = 'edge'` — Vercel Lambda egress is blocked by Peloton's WAF, Cloudflare Edge currently isn't. The GitHub Actions runner doesn't need this — it runs on Azure IPs.
- The home page (`app/page.tsx`) fetches its own `/api/leaderboard` via `NEXT_PUBLIC_BASE_URL` — needed so SSR works in production. Locally that env var should point at `http://localhost:3000`.
- Raw Peloton responses are stashed in `workouts.raw_data` / `rides.raw_data` (jsonb). Prefer adding a typed column + populating it in `transformWorkout`/`transformRide` over re-deriving from `raw_data` at read time.
- The `workouts.ride_id` FK is `on delete set null` — fine to delete a ride row without cascading workouts.
- `PERFORMANCE_GRAPH_DISCIPLINES` in `lib/peloton.ts` is the source of truth for "which disciplines have a performance graph?". Use it instead of hardcoding `'cycling'`.

## Environment

Required in `.env.local` (see `.env.example`):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_BASE_URL` — used by the home page's internal `fetch('/api/leaderboard')`
- `CRON_SECRET` — gates `/api/debug`, `/api/members`, `/api/admin/*`

GitHub Actions secrets (configure via `gh secret set` or repo Settings → Secrets):
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Reference docs

- [`docs/tabata-tuesday-hardening-brief.md`](./docs/tabata-tuesday-hardening-brief.md) — the design brief this architecture is built from. Cross-reference for "why this way".
- [`docs/ios-shortcut-bootstrap.md`](./docs/ios-shortcut-bootstrap.md) — the iPhone Shortcut for `/admin/peloton-bootstrap`.
