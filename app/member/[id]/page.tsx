import Link from 'next/link'
import MemberStatsClient from './MemberStatsClient'
import Breadcrumbs from '@/app/components/Breadcrumbs'

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
      <div className="mx-auto max-w-3xl">
        <Breadcrumbs
          items={[{ label: 'Home', href: '/' }, { label: 'Member not found' }]}
        />
        <div className="ring-card rounded-3xl border border-gray-100 bg-white px-5 py-16 text-center">
          <p className="text-sm text-gray-400">Member not found.</p>
          <Link
            href="/"
            className="mt-2 inline-block text-sm font-medium text-purple-600 hover:text-purple-700"
          >
            Back to leaderboard
          </Link>
        </div>
      </div>
    )
  }

  return <MemberStatsClient data={data} />
}
