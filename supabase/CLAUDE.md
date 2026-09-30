# supabase/

Migrations are **plain SQL files applied manually in the Supabase SQL editor** — there is no framework-managed migration runner. Files are written to be idempotent (`if not exists`, `do $$ ... end $$` guards, `create or replace view`). Apply order if rebuilding from scratch:

1. `schema.sql` — members, workouts, sync_log, `weekly_leaderboard` view, RLS
2. `functions.sql` — `get_member_streaks` rpc, `current_week_stats` view
3. `rides_migration.sql` — `rides` table, `workouts.ride_id` FK + backfill, `ride_comparison` and `ride_popularity` views
4. `member_image_migration.sql`
5. `leaderboard_history_migration.sql` — weekly leaderboard history (prior-week navigation)
6. `sync_runs_migration.sql` — observability table feeding `/admin/health`
7. `auth_refresh_migration.sql` — adds the three refresh-token columns to `member_credentials` and drops the vestigial `peloton_password_encrypted` / `peloton_session_cookie`
8. `member_connect_codes_migration.sql` — per-member self-serve token bootstrap codes (see `docs/member-connect.md`)
9. `tabata_weeks_migration.sql` — the weekly Tabata Tuesday class pick, feeds `/tabata`
10. `app_users_migration.sql` — magic-link sign-in allowlist + roles (see `docs/auth.md`)

When adding schema changes, write a new dated migration file under `supabase/` rather than mutating an existing one — and keep it idempotent so it can be re-run safely.
