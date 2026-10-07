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
gh workflow run "Peloton sync" -f trigger=manual
gh workflow run "Peloton sync" -f trigger=manual -f member_id=<uuid>   # one member
```

Syncs only run on GitHub Actions. The admin pages at `/admin/health` ("Sync all members" button) and `/admin` ("sync" link per row) call `POST /api/admin/sync`, which dispatches the same workflow. The old `/api/debug?mode=sync` and `/api/sync` paths are gone.
