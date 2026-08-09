-- ============================================================
-- App users — magic-link auth allowlist + roles
-- Run this entire file in your Supabase SQL editor. Idempotent.
--
-- Only emails in this table can sign in (the login route refuses
-- to send links to anyone else). Roles:
--   admin  — full admin UI + APIs
--   picker — may set the weekly Tabata class, nothing else
--
-- auth_user_id / last_login_at are stamped on first/each login.
-- ============================================================

create table if not exists app_users (
  email text primary key check (email = lower(email)),
  role text not null check (role in ('admin', 'picker')),
  member_id uuid references members(id) on delete set null,
  auth_user_id uuid unique,
  created_at timestamptz default now(),
  last_login_at timestamptz
);

-- Data API grants (new public tables no longer auto-receive role grants).
-- Service-role only: role lookups happen server-side.
grant select, insert, update, delete on public.app_users to service_role;

alter table app_users enable row level security;

do $$ begin
  create policy "service role only on app_users"
    on app_users for all
    using (auth.role() = 'service_role');
exception when duplicate_object then null; end $$;

-- Seed the owner as admin.
insert into app_users (email, role)
values ('carlos@humantag.com', 'admin')
on conflict (email) do nothing;
