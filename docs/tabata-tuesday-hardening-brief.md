# Tabata Tuesday: Hardening Brief for the Peloton Data Access Layer

**Audience:** Claude Code, working on the Tabata Tuesday Next.js + Supabase + Vercel app.
**Purpose:** Replace fragile auth and IP-block workarounds with patterns the Peloton community has already proved out, and add observability so failures stop being silent.
**Date prepared:** May 2026.
**Status:** Recommendations, not edicts. Read section 6 (Decision matrix) first, pick a path, then implement.

---

## 0. TL;DR

Three problems, three recommendations:

1. **Manual 48-hour token rotation is unsustainable.** Adopt the same pattern peloton-to-garmin (P2G) and the `ultra-nick/peloton-auth` PHP library use: bootstrap from a browser-extracted token pair (access + refresh), then refresh the access token automatically. Username/password is also viable now that the `/auth/login` endpoint is back, but with rate limits and TOS friction. Refresh-token rotation is the cleanest path.

2. **Single-owner token model is defensible for a friend-group app, but needs guardrails.** Add explicit consent on member add, a "delete my data" path, and an unfollow detector. Document it in the README.

3. **Vercel Lambda IP block is real, the Edge runtime is a temporary reprieve.** Move the sync off Vercel entirely. Best options ranked: GitHub Actions (free, easiest), Render/Fly cron job (cheap, recoverable from), home Raspberry Pi (most durable). Skip residential proxies until you actually need them.

Add a `sync_runs` observability table before any of the above. Without it you are flying blind.

---

## 1. Background: what the Peloton community learned in late 2025

This is not novel territory. The peloton-to-garmin (P2G) project, which has thousands of users, went through the exact same auth migration starting October 2025. The history is documented in `philosowaffle/peloton-to-garmin#795`. Summary of what happened and what they ended up with:

**Timeline:**
- Late Oct 2025: `POST /auth/login` started returning Cloudflare 429 (`error code 1015`) and 403 (`Access forbidden. Endpoint no longer accepting requests`). Affected millions of automated callers.
- Workaround discovered: appending `?=` to the URL bypassed the block (`POST /auth/login?=` works). This is a Cloudflare WAF rule keying on the exact bare path. Not a permanent fix.
- November/December 2025: P2G released a bearer-token paste workflow as a stopgap (this is roughly the pattern Tabata Tuesday is on now).
- January 2026: P2G shipped a full OAuth solution (`@danieljmt` led the implementation). Source of truth is now in `src/Peloton/Auth/PelotonAuthApiClient.cs` on master.

**What P2G's current flow does:**
1. User provides username + password (or a captured bearer token as fallback).
2. P2G runs the PKCE flow against `auth.onepeloton.com` programmatically: hits `/authorize`, parses the hidden HTML form Auth0 returns, submits credentials, captures the authorization code, exchanges it for `access_token` + `refresh_token`.
3. Stores both tokens. Access token lives ~48 hours (`expires_in: 172800`). Refresh token is longer-lived.
4. Before each request, checks expiry. If expired, posts to the token endpoint with `grant_type=refresh_token` to get a new access token. Some refresh responses include a new refresh token; if so, rotates and stores it.
5. Falls back to a full credential login if the refresh token also fails.

**What the `ultra-nick/peloton-auth` PHP library does:** Same three-tier lifecycle (valid → refresh → re-login), no config files, credentials and tokens passed directly. Cleaner reference implementation than P2G's C# if Claude Code wants a model to port. Available at `github.com/ultra-nick/peloton-auth`, MIT licensed.

**Key facts to lock in:**
- Peloton uses Auth0 (`auth.onepeloton.com`).
- The web app uses OAuth 2.0 Authorization Code + PKCE.
- Access tokens are JWTs, `expires_in` is 172800 seconds (48 hours).
- Refresh tokens exist and rotate (assume rotation; always store whatever comes back).
- The `Peloton-Platform: web` header is required on API calls.
- The `client_id` is whatever the web app uses. Extract it from `auth.onepeloton.com` redirects in the browser DevTools Network tab (look for the `/authorize` request) or from local storage. P2G hardcodes the current one; expect it to rotate annually.
- The `/auth/login?=` username/password endpoint also still works as of late 2025. Cloudflare rate limits it aggressively. Treat as fallback only.

---

## 2. Auth: implementation recommendation

Two viable paths. Pick one and commit.

### Path A (recommended): Refresh-token model, bootstrapped from browser

The owner does the DevTools dance **once**. After that, the app refreshes indefinitely.

**Bootstrap (one time):**
1. Owner logs into `members.onepeloton.com` in a normal browser.
2. Opens DevTools → Application → Local Storage → `https://members.onepeloton.com`. Looks for entries from `@@auth0spajs@@` or similar Auth0 keys. The values are JSON blobs containing both `access_token` and `refresh_token`. Also captures the `client_id` from the same blob.
3. Pastes the access token, refresh token, and client_id into `/admin/peloton-bootstrap`. (Replace the current single-token paste flow.)

**Subsequent runs:**
- App checks `member_credentials.token_expires_at` (decoded from JWT `exp` on store).
- If access token is valid → use it.
- If expired and refresh token present → POST to `https://auth.onepeloton.com/oauth/token` with `grant_type=refresh_token`, `client_id=<stored>`, `refresh_token=<stored>`. Update both tokens (refresh tokens rotate, persist whatever the response returns).
- If refresh fails (refresh token expired or revoked) → emit a structured failure event, surface in admin UI, prompt re-bootstrap.

**Schema changes:**

```sql
-- member_credentials additions
alter table member_credentials add column peloton_refresh_token text;
alter table member_credentials add column peloton_token_expires_at timestamptz;
alter table member_credentials add column peloton_auth0_client_id text;

-- Drop vestigial columns now. They're a trap.
alter table member_credentials drop column peloton_password_encrypted;
alter table member_credentials drop column peloton_session_cookie;
```

**Why this path:** Mirrors what every active Peloton third-party app is doing as of 2026. The owner does the manual step once, not twice a week. If the refresh chain ever breaks, the admin UI tells them, and re-bootstrapping is a 60-second task.

**What to NOT do:** Don't try to implement the full PKCE login flow from username + password yet. P2G did it but they have N=thousands of users complaining when it breaks. For a friend-group app the browser bootstrap is fine and removes an entire failure surface.

### Path B (acceptable): Username + password with PKCE flow

If the owner is genuinely uninterested in the one-time bootstrap, port the P2G or `ultra-nick/peloton-auth` flow. The PHP reference is more readable than the C# one. Roughly:

1. Generate `code_verifier` and `code_challenge` (SHA256, base64url).
2. GET `https://auth.onepeloton.com/authorize?response_type=code&client_id=<id>&code_challenge=<challenge>&code_challenge_method=S256&redirect_uri=<redirect>&scope=openid+profile+email+offline_access`.
3. The response is HTML with an Auth0 login form (action URL embedded). Parse it.
4. POST credentials to the form action. Follow the redirect chain to extract the `code` parameter.
5. POST to `/oauth/token` with `grant_type=authorization_code`, `code`, `code_verifier`, `client_id`, `redirect_uri` → get `access_token` and `refresh_token`.
6. From there, same as Path A.

**Caveats:** Parsing HTML forms breaks when Auth0 changes templates (P2G has fixed this twice already). Credential storage in Supabase means encrypted-at-rest (AES with a key in Vercel env vars, not in the DB). MFA is a wall: if the owner ever enables 2FA on their Peloton account, this path stops working. Worth saying out loud.

### Decision

For Tabata Tuesday, **Path A.** The marginal UX win of Path B (no DevTools step ever) isn't worth the maintenance debt for one owner.

---

## 3. The IP block: where to actually run the sync

### What's happening

Peloton's Cloudflare WAF blocks AWS Lambda egress (which is what Vercel Functions on the Node runtime use). The current workaround is to route through `app/api/debug?mode=sync` with `export const runtime = 'edge'`, which uses Cloudflare egress and is currently allowed. Two problems:

1. Peloton can flip a switch and block Cloudflare egress at any time. Multiple sibling projects (Garmin, others) have seen this happen.
2. Edge functions have tight CPU and timeout budgets. As the friend group grows or backlogs accumulate, you will brush against the ceiling and lose mid-run.

### Options ranked

**Option 1: GitHub Actions (recommended first move)**

Effort: ~30 minutes. Cost: free. Reversibility: full.

Move the cron trigger out of Vercel entirely. GitHub Actions runs on GitHub-owned IPs (Azure ranges, not AWS Lambda, not yet on Peloton's blocklist). The workflow just hits your existing `/api/debug?mode=sync` endpoint over HTTPS with the `CRON_SECRET`.

```yaml
# .github/workflows/peloton-sync.yml
name: Peloton sync
on:
  schedule:
    - cron: '0 6 * * *'  # 06:00 UTC daily
  workflow_dispatch:      # manual trigger button
jobs:
  sync:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Trigger sync
        run: |
          curl -fsSL -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            -m 1800 \
            https://tabatatuesday.example.com/api/debug?mode=sync
```

But the GitHub Action's own outbound is not the Peloton call; your Vercel function is still making the Peloton call. So this *alone* doesn't solve the IP block. It's only useful if you also...

**Option 1.5: Move the actual Peloton fetching off Vercel**

The fetch needs to happen on the same machine the cron runs on. Two flavors:

- **GitHub Actions does the full sync.** The workflow runs a Node script (or your existing sync code, bundled) that hits Peloton directly, writes to Supabase directly, and never touches Vercel for the sync path. Vercel keeps serving the UI. Pros: free, version-controlled, replayable from the Actions UI, GitHub IPs are unblocked at the time of writing. Cons: secrets go in GitHub Secrets (Supabase service role key, Peloton tokens). Manageable.

- **Render or Fly cron job.** Render has a first-class "Cron Job" service type. Fly has Cron Manager (boots a Machine on schedule). Either runs a small Node container that does the sync. Outbound IPs are stable enough that you can monitor for blocks; if Render's range gets blocked you redeploy to Fly, or vice versa. Costs ~$5–7/month.

**Option 2: Home Raspberry Pi (most durable long-term)**

Effort: half a day. Cost: $50 hardware + electricity. Reversibility: full.

A Pi 4 (or any always-on home machine, including Carlos's existing smart-home VirtualBox host) running the sync script on a systemd timer. Residential ISP IP, which is the IP class Peloton is least likely to block because it's also where their actual customers come from. Connects to Supabase over the internet, same as everything else.

This is where Tabata Tuesday wants to live long-term. It's also the most operationally durable: cloud cron providers come and go, your house is still there. Worth setting up before Cloudflare egress gets blocked, not after.

**Option 3: Static-IP proxy service**

Effort: 1 hour. Cost: $19–29/month. Reversibility: full.

QuotaGuard or similar gives you 2 dedicated static IPs and a SOCKS5/HTTPS proxy URL. You set `HTTPS_PROXY` in your Vercel env, all outbound traffic flows through it. Peloton sees one consistent IP.

Cons: now the bottleneck is that one IP, which can also get blocked. The IPs are dedicated to you but they live in a known proxy provider ASN, which Peloton's WAF can fingerprint. Useful as insurance, not as a primary strategy.

**Option 4: Decentralize to client-side sync**

Each member runs a small browser extension or bookmarklet that pulls their own workouts (using their own session) and POSTs to your Supabase. IP problem evaporates, token problem evaporates, owner trust burden drops. Major refactor, but it's where the architecture wants to go if Peloton keeps tightening. Park it for now, name it as a Plan C.

### Decision

Implement in this order:

1. **This week:** GitHub Actions cron + GitHub Actions does the full sync (Option 1.5). 30 minutes of work, eliminates the Vercel-IP dependency immediately.
2. **Next month:** Stand up a Pi at home (Option 2). Migrate the GitHub Action to be the backup, not the primary.
3. **If/when both fail:** QuotaGuard (Option 3) as a stopgap while planning the client-side rewrite (Option 4).

The Pi is the right end state. GitHub Actions is the right "deploy this Tuesday" state.

---

## 4. Observability: stop flying blind

This is the single most cost-effective change. Without it, every other improvement here is invisible until someone manually notices.

### `sync_runs` table

```sql
create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text not null,                    -- 'cron' | 'manual' | 'backfill'
  status text not null,                     -- 'running' | 'success' | 'partial' | 'failed'
  members_processed int default 0,
  members_failed int default 0,
  workouts_added int default 0,
  rides_added int default 0,
  last_error text,
  token_expires_at timestamptz,             -- captured at sync start
  duration_ms int generated always as ((extract(epoch from (finished_at - started_at)) * 1000)::int) stored
);

create index on sync_runs (started_at desc);
```

### What the sync should write

At start: insert a row with `status='running'`, `started_at=now()`, `trigger`, and `token_expires_at` decoded from the current JWT.

On per-member error: increment `members_failed`, append to `last_error` (truncate to 2KB).

At end: update `status` ('success' if `members_failed=0`, else 'partial' or 'failed'), `finished_at`, totals.

### Admin UI

A `/admin/health` page that reads the last 30 sync_runs and shows:

- A red banner if the most recent successful run is >36 hours old.
- A yellow banner if `token_expires_at` is <8 hours from now (time to refresh proactively, or to alert the owner if Path B fails to refresh).
- A simple table: timestamp, status, members ok/failed, duration, error preview.
- A "trigger sync now" button that POSTs to the manual sync endpoint.

### Notifications

Optional but cheap: a webhook from Supabase (database webhook on `sync_runs` insert/update where status='failed') to a Slack or email endpoint. Or just check the admin page in your morning routine. Either works at this scale.

---

## 5. Fragility points from the brief, ranked by what to fix first

1. **`extractAvgMetric` string-matching on `display_name`.** Replace with a snapshot test: keep a fixture of the current set of `display_name` values and assert against it in CI. If Peloton localizes or renames anything, the test fails loudly instead of the column silently turning null. Promote `mode=test-perf` to a daily assertion that emits a `sync_runs` warning when display_names drift.

2. **`fetchNewWorkouts` early-exit on known id.** Fetch one extra page past the first known id. Cheap insurance against Peloton returning records out of order during their backend eventual consistency. ~5 line change in `lib/peloton.ts`.

3. **`backfill-perf` offset pagination.** Replace with predicate + cursor: `where avg_watts is null and updated_at < now() - interval '1 hour'`, update `updated_at` on every touched row. Eliminates the race with concurrent syncs. The brief's current offset approach is correct for one specific edge case (avoiding re-scan of -1 sentinels) but loses correctness under concurrency.

4. **No retry on transient 5xx.** Add a 2-retry exponential backoff at the `pelotonFetch` level for 5xx only (not 4xx). Most Peloton blips are 502/503 from their backend, not auth issues. Keep the courtesy sleeps; retries are independent.

5. **`safeRideIds` leaves orphaned workouts.** Either add a "retry null `ride_id`" backfill in the daily sync, or create a sentinel `rides` row for "unknown class" that workouts can point at. The latter is cleaner because the leaderboard query stops needing to handle nulls.

6. **Vestigial schema columns.** Drop `peloton_password_encrypted` and `peloton_session_cookie` in the same migration that adds the new auth columns. Don't leave them as "harmless"; they're a trap for the next person touching this table.

7. **`raw_data` schema versioning.** Add `raw_data_schema_version int default 1 not null` to both `workouts` and `rides`. Set it on every write. Costs nothing now, saves a debugging afternoon when Peloton changes a field shape in two years.

8. **Hardcoded `'cycling'` discipline check.** Centralize in a `PERFORMANCE_GRAPH_DISCIPLINES = new Set(['cycling'])`. Tread workouts also have a performance graph; you'll want this when someone in the group buys a Tread.

---

## 6. Decision matrix

| Decision | Recommendation | Why |
|---|---|---|
| Auth model | Path A (refresh-token bootstrap from browser) | One manual step ever, not weekly. Matches industry pattern. |
| Sync location | GitHub Actions now, Pi later | Free, fast to ship, fully reversible. |
| Vestigial columns | Drop in same migration as auth changes | One destructive deploy, done. |
| `sync_runs` table | Ship this first | Without it, nothing else here is verifiable. |
| Client-side sync rewrite | Park as Plan C | Only if all server-side paths get blocked. |
| Residential proxy | Skip for now | Cost without enough benefit at current scale. |
| MFA on owner account | Don't enable on the Peloton account used for sync | Path A still works under MFA (refresh tokens are post-MFA), but bootstrap becomes painful. Use a separate household Peloton account if security on the personal account matters. |

---

## 7. Concrete next steps for Claude Code

In this order. Don't batch them.

1. **Create the `sync_runs` table and write to it.** Wrap the existing `syncAllMembers` in start/finish writes. Build a basic `/admin/health` page that reads the last 30 runs. This makes everything downstream measurable.

2. **Drop vestigial columns and add the three new auth columns** in a single migration. Update types in `types/index.ts`.

3. **Implement Path A: refresh-token flow.**
   - Update `/admin/peloton-bootstrap` to accept access token + refresh token + client_id.
   - Add `refreshPelotonToken(session)` to `lib/peloton.ts` that POSTs to `https://auth.onepeloton.com/oauth/token`.
   - Wrap `pelotonHeaders` so that if `token_expires_at` is within 60 seconds of now (or in the past), it calls `refreshPelotonToken` first and persists the new tokens before continuing.
   - Add a check in `/api/debug` (default mode) that shows token state and a "force refresh now" button.

4. **Move the cron to GitHub Actions.** Add `.github/workflows/peloton-sync.yml`. Keep Vercel Cron pointed at the same endpoint as a backup for the first week, then disable it.

5. **Port the sync logic itself to run on GitHub Actions runners** (or Render Cron, whichever is more comfortable). The job runs the existing TypeScript via `tsx` or a built bundle, talks to Supabase directly. This is what actually solves the IP problem. Document the rollback path: re-enable Vercel Cron, re-deploy the Edge route.

6. **Add the 5xx retry, the early-exit lookahead in `fetchNewWorkouts`, and the `display_name` snapshot test.** Each is a small PR. Don't combine.

7. **Plan the Pi migration** when the GitHub Actions path has been stable for a month. Write it up as a Github issue with a checklist; defer the work.

---

## 8. Links worth bookmarking

- `philosowaffle/peloton-to-garmin` issue #795 — the canonical thread on the Oct 2025 Peloton auth migration. Read the bottom 30 comments specifically; the top is outdated.
- `philosowaffle/peloton-to-garmin/blob/master/src/Peloton/Auth/PelotonAuthApiClient.cs` — current production OAuth implementation. C# but readable.
- `github.com/ultra-nick/peloton-auth` — cleaner PHP reference for the same flow. Easier to port to TypeScript than the C# version.
- `github.com/geudrik/peloton-client-library` — the long-standing Python client; useful for endpoint shapes and field names even though its auth is now outdated.
- Render outbound IP docs: `render.com/docs/outbound-ip-addresses` — Render publishes the CIDR ranges, useful for verifying you're not in an obviously blocked range.
- Fly Cron Manager: `fly.io/docs/blueprints/task-scheduling` — boots a Machine per scheduled job. Clean isolation.

---

## 9. Honest framing for Carlos

Two things to know that aren't strictly technical:

**The TOS question.** Peloton's terms of service almost certainly prohibit automated access. Risk is account suspension for the owner, not legal exposure. Worth a one-line note in the README so future contributors aren't surprised. Tens of thousands of P2G users have been doing this for years without consequence; the risk is real but small.

**The friend group consent question.** Members are currently added by the owner picking them from a dropdown. They never explicitly agree to having their workouts mirrored into a Supabase database. For Tabata Tuesday this is fine — it's a private group, the owner is the trust root, everyone knows what's happening. But when someone has a falling-out and asks "wait, you've been storing my workout history where?", a one-line consent acknowledgement at member-add time and a "delete my data" button will save the friendship. Add both. They're cheap.
