import { Suspense } from 'react'
import { unstable_noStore as noStore } from 'next/cache'
import LeaderboardClient from './LeaderboardClient'

export const dynamic = 'force-dynamic'

async function getLeaderboardData() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
  try {
    const res = await fetch(`${baseUrl}/api/leaderboard`, {
      cache: 'no-store',
    })
    if (!res.ok) return null
    return res.json()
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
  noStore()
  const data = await getLeaderboardData()
  return (
    <Suspense fallback={<div className="text-center py-12 text-gray-400">Loading...</div>}>
      <LeaderboardClient data={data ?? emptyData} />
    </Suspense>
  )
}
