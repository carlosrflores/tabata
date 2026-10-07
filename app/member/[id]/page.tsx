import Link from 'next/link'
import type { ComponentProps } from 'react'
import MemberStatsClient from './MemberStatsClient'
import Breadcrumbs from '@/app/components/Breadcrumbs'

import { getMemberStats } from '@/lib/data'

// Rendered on first visit, then cached; refreshed on demand after each
// sync (see lib/data.ts).
export const revalidate = 900

// No pages are built ahead of time; each one is rendered on first visit
// and then served from cache (an empty list is what enables that).
export async function generateStaticParams() {
  return []
}

async function loadMemberStats(id: string) {
  try {
    return await getMemberStats(id)
  } catch {
    return null
  }
}

export default async function MemberPage({
  params,
}: {
  params: { id: string }
}) {
  const data = await loadMemberStats(params.id)

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
            className="link-text mt-2 inline-block text-sm font-medium"
          >
            Back to leaderboard
          </Link>
        </div>
      </div>
    )
  }

  // Same JSON shape the stats API returns; the client's types are narrower.
  return (
    <MemberStatsClient
      data={data as unknown as ComponentProps<typeof MemberStatsClient>['data']}
    />
  )
}
