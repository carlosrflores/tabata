-- ============================================================
-- Tabata Tuesday — auth refresh-token migration
-- Apply in Supabase SQL editor AFTER schema.sql.
-- ============================================================
--
-- Replaces the vestigial password / session-cookie columns on
-- `member_credentials` with the three columns needed for the
-- refresh-token flow (Path A in docs/tabata-tuesday-hardening-brief.md).
--
-- After this runs, member_credentials carries:
--   peloton_bearer_token       (existing) — current OAuth access token
--   peloton_refresh_token      (new)      — long-lived refresh token
--   peloton_token_expires_at   (new)      — decoded JWT exp
--   peloton_auth0_client_id    (new)      — captured at bootstrap
-- and no longer carries peloton_password_encrypted or peloton_session_cookie.
--
-- Idempotent: safe to run multiple times. Adds are guarded by
-- `if not exists`; drops by `if exists`.
-- ============================================================

-- Add new columns ---------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'member_credentials' and column_name = 'peloton_refresh_token'
  ) then
    alter table member_credentials add column peloton_refresh_token text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'member_credentials' and column_name = 'peloton_token_expires_at'
  ) then
    alter table member_credentials add column peloton_token_expires_at timestamptz;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'member_credentials' and column_name = 'peloton_auth0_client_id'
  ) then
    alter table member_credentials add column peloton_auth0_client_id text;
  end if;
end $$;

-- Drop vestigial columns --------------------------------------------------
-- peloton_password_encrypted was the original NOT NULL column from
-- schema.sql; it has not been read or written by any live code path since
-- the OAuth migration. peloton_session_cookie was used by one-shot backfill
-- scripts under scripts/migrations/ that already ran on 2026-05-01.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'member_credentials' and column_name = 'peloton_password_encrypted'
  ) then
    alter table member_credentials drop column peloton_password_encrypted;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_name = 'member_credentials' and column_name = 'peloton_session_cookie'
  ) then
    alter table member_credentials drop column peloton_session_cookie;
  end if;
end $$;

-- ============================================================
-- Done.
-- ============================================================
-- Follow-up not handled here:
--   - README.md step 5 still shows an insert into peloton_password_encrypted.
--     Section 3 of the brief (refresh-token implementation) will replace
--     /admin/peloton-bootstrap and the README example should be rewritten
--     in that PR rather than partially-corrected here.
