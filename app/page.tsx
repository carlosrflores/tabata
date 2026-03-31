import { Suspense } from 'react'
import LeaderboardClient from './LeaderboardClient'

// Revalidate every hour so data stays fresh without a full rebuild
export const revalidate = 3600

async function getLeaderboardData() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
  const res = await fetch(`${baseUrl}/api/leaderboard`, {
    next: { revalidate: 3600 },
  })
  if (!res.ok) throw new Error('Failed to fetch leaderboard')
  return res.json()
}

export default async function HomePage() {
  const data = await getLeaderboardData()
  return (
    <Suspense fallback={<div className="text-center py-12 text-gray-400">Loading...</div>}>
      <LeaderboardClient data={data} />
    </Suspense>
  )
}
