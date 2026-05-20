# Tabata Tuesday

A private group Peloton leaderboard for a friend group. The app syncs the
owner's followed Peloton riders into a Supabase database and surfaces a
weekly leaderboard at the root URL.

## Architecture at a glance

- **Next.js 14 (App Router) on Vercel** — serves the UI.
- **Supabase Postgres** — members, workouts, rides, sync history.
- **GitHub Actions cron** — runs the daily Peloton sync from an unblocked IP.
- **Auth0 OAuth + refresh tokens** — owner bootstraps once, the app refreshes.

Deep details for editing the code live in [CLAUDE.md](./CLAUDE.md).

## What you'll need (~30 minutes total)

- A Supabase account — supabase.com (free tier)
- A Vercel account — vercel.com (free tier)
- A GitHub account with this repo pushed (free tier; runs the daily cron)
- A Peloton account that follows the riders you want to track

## Setup

### 1. Supabase

Create a project. Open the SQL editor and run, in order:

1. `supabase/schema.sql` — members, workouts, sync_log, weekly_leaderboard
2. `supabase/functions.sql` — streaks RPC, current_week_stats view
3. `supabase/rides_migration.sql` — rides table + ride_comparison/popularity views
4. `supabase/member_image_migration.sql` — member profile images
5. `supabase/sync_runs_migration.sql` — observability table for `/admin/health`
6. `supabase/auth_refresh_migration.sql` — refresh-token columns on `member_credentials`

Migrations are idempotent — safe to re-run if you're unsure whether one took.

From **Settings → API**, capture:
- Project URL
- anon public key
- service_role secret key

### 2. Vercel

Push this repo to GitHub, then import on Vercel. Add these environment
variables before the first deploy:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL from step 1 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key from step 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key from step 1 |
| `NEXT_PUBLIC_BASE_URL` | Your Vercel URL (e.g. `https://tabata.example.com`) |
| `CRON_SECRET` | A random string you generate — gates `/admin` and admin API routes |

Deploy.

### 3. Bootstrap yourself as owner

1. Visit `/admin` on your deployed site, enter the `CRON_SECRET`.
2. Add yourself as the first member. The form needs your Peloton bearer
   token to verify; grab one from `members.onepeloton.com` (DevTools →
   Network → any `api.onepeloton.com` request → copy the `Authorization`
   header value).
3. Then visit `/admin/peloton-bootstrap` and paste the **full token
   bundle**: `access_token`, `refresh_token`, and `client_id`. All three
   come from the same Auth0 entry in `localStorage` under the key
   `@@auth0spajs@@::<client_id>::...`. With all three stored, the app
   auto-refreshes the access token and you never need to bootstrap again
   until the refresh token itself rotates (months, typically).

   On iPhone, use the Shortcut described in
   [`docs/ios-shortcut-bootstrap.md`](./docs/ios-shortcut-bootstrap.md) —
   one tap from Safari, no DevTools required.

### 4. GitHub Actions cron

The daily sync runs from a GitHub Actions runner, not Vercel — GitHub's
Azure egress isn't on Peloton's WAF blocklist (Vercel Lambda is). The
workflow lives at `.github/workflows/peloton-sync.yml`; it runs at 06:00
UTC daily and can be triggered manually from the Actions tab.

Configure two repo secrets:

```
gh secret set NEXT_PUBLIC_SUPABASE_URL --body "<value>"
gh secret set SUPABASE_SERVICE_ROLE_KEY --body "<value>"
```

A second cron in `vercel.json` runs at the same time as a temporary backup
during cutover. Remove it from `vercel.json` once GitHub Actions has been
clean for ~a week.

### 5. Add more members

Visit `/admin`, pick a rider you follow on Peloton from the dropdown.
Initials are auto-filled and editable. No SQL required.

## Day-to-day

- **`/admin/health`** — last 30 sync runs, red banner if the most recent
  success is >36h old, yellow banner if the owner's token is <8h from
  expiry, "Sync all members" button.
- **`/admin/peloton-bootstrap`** — re-paste the token bundle if the
  refresh chain ever breaks.
- **Leaderboard** — visit the root URL. No login (the group is
  intentionally public-within-the-group; there is no end-user auth).

## Privacy & terms of service

**Peloton TOS.** Peloton's terms of service almost certainly prohibit
automated access. The realistic risk is account suspension for the owner,
not legal exposure. Tens of thousands of users of similar third-party
tools (peloton-to-garmin, etc.) have done this for years without
consequence — but the risk is real.

**Member consent.** Friends are added by the owner picking them from a
dropdown of Peloton users they follow; the friend never affirmatively
opts in. For a private friend-group app this is fine — the owner is the
trust root and everyone knows what's happening. If a member later asks
to be removed, delete their row from the `members` table; the
`on delete cascade` FK clears their workouts.

## Troubleshooting

Most operational issues surface on `/admin/health`. For deeper digging:

- GitHub Actions logs — the Actions tab on the repo (per-run, with the
  full sync output).
- Supabase logs — Supabase dashboard.
- Local ad-hoc queries — `node scripts/db.mjs members` and friends; see
  `scripts/db.mjs` for the available commands.
