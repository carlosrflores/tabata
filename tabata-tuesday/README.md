# Tabata Tuesday — Setup Guide

A private group Peloton leaderboard for your Tabata Tuesday crew.

---

## What you'll need (15–20 minutes total)

- A GitHub account (free) — github.com
- A Vercel account (free) — vercel.com  
- A Supabase account (free) — supabase.com
- Your Peloton username and password
- Your Peloton User ID (instructions below)

---

## Step 1 — Set up Supabase

1. Go to supabase.com → New Project
2. Give it a name (e.g. "tabata-tuesday"), pick a region close to you, set a database password
3. Once created, go to **Settings → API**
4. Copy these three values — you'll need them later:
   - Project URL
   - anon public key
   - service_role secret key

5. Go to **SQL Editor** in Supabase
6. Paste the entire contents of `supabase/schema.sql` and click Run
7. Then paste and run `supabase/functions.sql`

**That's it for Supabase setup.** You add yourself and other members through the `/admin`
page after deploying — no SQL needed. The app retrieves your Peloton User ID
automatically when it verifies your login.

---

## Step 3 — Deploy to Vercel

1. Push this folder to a new GitHub repository
2. Go to vercel.com → New Project → Import your GitHub repo
3. Before deploying, click **Environment Variables** and add:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key |
| `NEXT_PUBLIC_BASE_URL` | Your Vercel URL (e.g. https://tabata-tuesday.vercel.app) |
| `CRON_SECRET` | Any random string (you make this up — keep it secret) |

4. Click Deploy

---

## Step 4 — Run your first sync

Once deployed, visit:
```
https://your-app.vercel.app/api/sync
```

This will pull all your Peloton workouts into the database. It may take 1–2 minutes the first time.

After that, the sync runs automatically every day at 6am.

---

## Step 5 — Add more members

For each new person, add them in Supabase SQL Editor:

```sql
-- Add the member
insert into members (name, initials, peloton_username, peloton_user_id)
values ('Their Name', 'TN', 'their_username', 'their_peloton_user_id');

-- Add their credentials
insert into member_credentials (member_id, peloton_password_encrypted)
select id, 'their_peloton_password'
from members where peloton_username = 'their_username';
```

Then trigger a sync to pull their history:
```
https://your-app.vercel.app/api/sync
```

---

## Sharing with the group

Once deployed, just share the Vercel URL with your group. No login required — 
anyone with the link can see the leaderboard.

---

## Troubleshooting

**Sync isn't working**: Check Vercel's function logs (Vercel dashboard → your project → Functions)

**A member's data isn't showing**: Make sure their Peloton User ID is correct — 
re-check the URL on their profile page

**Workouts from other days are showing**: The leaderboard filters to the current week 
(Tuesday to Tuesday). All workouts are stored — you can see full history on each member's page.
