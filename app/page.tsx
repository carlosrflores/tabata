import { Suspense } from 'react'
import LeaderboardClient from './LeaderboardClient'
import { getLeaderboard } from '@/lib/data'

// Statically cached; refreshed on demand after each sync (see lib/data.ts).
export const revalidate = 900

async function getLeaderboardData() {
  try {
    return await getLeaderboard(0)
  } catch {
    return null
  }
}

const emptyData = {
  leaderboard: [],
  week_stats: {
    week_start: new Date().toISOString(),
    group_total_output_kj: 0,
    active_members: 0,
    total_members: 0,
    top_performer_name: null,
    top_performer_kj: 0,
  },
}

export default async function HomePage() {
  const data = await getLeaderboardData()
  return (
    <Suspense fallback={<div className="text-center py-12 text-gray-400">Loading...</div>}>
      <LeaderboardClient data={data ?? emptyData} />
    </Suspense>
  )
}
