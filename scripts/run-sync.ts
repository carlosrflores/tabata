// Entrypoint for running syncAllMembers outside Next.js.
// Used by .github/workflows/peloton-sync.yml to do the daily sync from a
// GitHub Actions runner — which (a) has Azure egress IPs that Peloton's WAF
// currently doesn't block, and (b) has 30-minute timeouts vs. the Edge
// runtime's ~25-second budget.
//
// Usage:
//   npx tsx scripts/run-sync.ts [trigger]
// where trigger is 'cron' | 'manual' | 'backfill' (defaults to 'cron').

import { syncAllMembers, type SyncTrigger } from '@/lib/sync'

async function main() {
  const arg = process.argv[2]
  const trigger: SyncTrigger =
    arg === 'cron' || arg === 'manual' || arg === 'backfill' ? arg : 'cron'

  console.log(`[run-sync] starting with trigger=${trigger}`)
  const started = Date.now()
  const results = await syncAllMembers(trigger)
  const durationSec = ((Date.now() - started) / 1000).toFixed(1)

  const totalAdded = results.reduce((sum, r) => sum + r.workoutsAdded, 0)
  const failed = results.filter((r) => r.error).length
  console.log(
    `[run-sync] done in ${durationSec}s — members=${results.length} failed=${failed} workouts_added=${totalAdded}`
  )
  for (const r of results) {
    if (r.error) console.log(`  FAIL ${r.memberName}: ${r.error}`)
    else console.log(`  OK   ${r.memberName}: ${r.workoutsAdded}`)
  }

  // Exit non-zero so the workflow is visibly failed in the Actions UI when
  // every member failed (a total outage). Partial failures stay green; check
  // /admin/health for the detail.
  if (results.length > 0 && failed === results.length) {
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('[run-sync] fatal:', e)
  process.exit(2)
})
