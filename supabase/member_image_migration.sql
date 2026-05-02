-- Adds avatar storage to members so the leaderboard / member / ride pages
-- can show real photos instead of just initials.
--
-- Apply via the Supabase SQL editor, then run:
--   node scripts/migrations/2026-05-01-backfill-member-images.mjs
-- to populate image_url for existing members from Peloton.
--
-- Going forward, app/api/members/route.ts (POST handler that adds new members)
-- should fetch and store image_url at creation time too — see TODO in route.ts.

alter table members
  add column if not exists image_url text;

comment on column members.image_url is
  'Peloton profile photo URL (https://...). Fetched from /api/user/{peloton_user_id}.';
