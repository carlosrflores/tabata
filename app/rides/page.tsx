// /rides — index of all rides anyone in the active group has taken.
// Sorted by group popularity (most distinct members first).
//
// Public read, matching the leaderboard's RLS pattern.

import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  formatDuration,
  formatRelativeDate,
  formatNumber,
} from '@/lib/format';
import type { RidePopularityRow } from '@/types';
import Breadcrumbs from '@/app/components/Breadcrumbs';

export const dynamic = 'force-dynamic';

export default async function RidesIndexPage() {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('ride_popularity')
    .select('*')
    .order('group_member_count', { ascending: false })
    .order('most_recent_attempt', { ascending: false })
    .limit(100);

  const rides = (data ?? []) as RidePopularityRow[];

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumbs
        items={[{ label: 'Home', href: '/' }, { label: 'Rides' }]}
      />

      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
            Rides
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Classes anyone in the group has taken, sorted by popularity.
          </p>
        </div>
        <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-500">
          {rides.length} class{rides.length === 1 ? '' : 'es'}
        </span>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error.message}
        </div>
      )}

      {rides.length === 0 ? (
        <div className="ring-card rounded-3xl border border-gray-100 bg-white px-5 py-16 text-center">
          <p className="text-sm text-gray-400">
            No rides yet. Once workouts sync with ride metadata, they&rsquo;ll
            appear here.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {rides.map((r) => (
            <li key={r.ride_id}>
              <Link
                href={`/rides/${r.ride_id}`}
                className="ring-card group flex h-full gap-4 rounded-2xl border border-gray-100 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-purple-200"
              >
                {r.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.image_url}
                    alt=""
                    className="h-20 w-28 flex-shrink-0 rounded-xl object-cover ring-1 ring-black/5"
                  />
                ) : (
                  <div className="grid h-20 w-28 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-purple-100 to-purple-50">
                    <span className="text-xs font-medium text-purple-400">
                      No image
                    </span>
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <h3 className="line-clamp-2 text-sm font-medium text-gray-900 group-hover:text-purple-700">
                    {r.title ?? 'Untitled ride'}
                  </h3>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {r.instructor_name ?? 'Unknown'} ·{' '}
                    {formatDuration(r.duration_seconds)}
                  </p>
                  <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-2 text-xs">
                    <span className="rounded-full bg-purple-50 px-2 py-0.5 font-medium text-purple-700">
                      {r.group_member_count}{' '}
                      {r.group_member_count === 1 ? 'member' : 'members'}
                    </span>
                    <span className="text-gray-500">
                      best{' '}
                      <span className="font-medium text-gray-700">
                        {formatNumber(r.group_best_output_kj)}
                      </span>{' '}
                      kj
                    </span>
                    <span className="text-gray-300">·</span>
                    <span className="text-gray-400">
                      {formatRelativeDate(r.most_recent_attempt)}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
