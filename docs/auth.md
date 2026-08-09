# Magic-link auth

Passwordless sign-in for the two humans who administer the app. Public
pages (leaderboard, /tabata, rides, member pages) remain open — auth only
gates admin surfaces.

## Model

- **Allowlist**: `app_users` (see `supabase/app_users_migration.sql`).
  Only listed emails can sign in; `/api/auth/request-link` answers
  identically for unknown emails (no membership oracle) and lazily creates
  the Supabase auth user for allowlisted emails on first login.
- **Roles**: `admin` (everything) and `picker` (may only set the weekly
  Tabata class — the paste box appears inline on `/tabata` when a picker
  or admin is signed in).
- **Dual auth on APIs** (`lib/auth.ts` → `isAuthorized`): every admin API
  accepts *either* a signed-in session with a sufficient role *or* the
  `CRON_SECRET` bearer header. Machines (GitHub Actions, Vercel cron,
  curl, the iOS Shortcut) keep using the secret; humans use sessions.
  `/api/admin/tabata-week` additionally allows the `picker` role.
- **Admin UI**: `app/admin/layout.tsx` redirects non-admins to `/login`.
  The old paste-the-CRON_SECRET prompts are gone.

## Flow

1. `/login` → email → `POST /api/auth/request-link` → Supabase sends a
   magic link (built-in mailer; low rate limit, a handful of emails/hour).
2. Link lands on `/auth/callback` → session cookie set → `app_users`
   stamped (`auth_user_id`, `last_login_at`) → redirect (`admin` → /admin,
   `picker` → /tabata).
3. `middleware.ts` keeps the session cookie refreshed on every request.
4. Sign out: button in the admin header → `POST /auth/signout`.

## Managing users

/admin → "Sign-in access" card: add an email + role, or remove one
(removal also deletes the auth user, so live sessions die at next
refresh). Roles can be changed by re-adding the same email with the new
role.

## One-time Supabase dashboard setup

Authentication → URL Configuration:
- **Site URL**: `https://<host>` (the deployed domain)
- **Redirect URLs**: add `https://<host>/auth/callback` and
  `http://localhost:3000/auth/callback`

The Email provider (magic links) is enabled by default. If sign-in emails
become rate-limited or land in spam, configure custom SMTP (e.g. Resend)
under Authentication → Emails → SMTP settings — no code change needed.
