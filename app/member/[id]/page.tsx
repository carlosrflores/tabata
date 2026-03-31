import Link from 'next/link'
import MemberStatsClient from './MemberStatsClient'

export const revalidate = 3600

async function getMemberStats(id: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
  try {
    const res = await fetch(`${baseUrl}/api/members/${id}/stats`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export default async function MemberPage({
  params,
}: {
  params: { id: string }
}) {
  const data = await getMemberStats(params.id)

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">Member not found</p>
        <Link href="/" className="text-purple-500 text-sm mt-2 block">
          Back to leaderboard
        </Link>
      </div>
    )
  }

  return <MemberStatsClient data={data} />
}
