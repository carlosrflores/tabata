---
name: tabata-ops
description: Run ad-hoc Supabase DB queries (scripts/db.mjs) or trigger a Peloton sync manually (GitHub Actions workflow, /api/debug endpoints, admin pages). Use when inspecting members/workouts/rides/sync logs or kicking off a sync.
---

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
