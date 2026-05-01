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
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-lg font-medium text-gray-900">Rides</h1>
        <Link
          href="/"
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          Back to leaderboard →
        </Link>
      </div>

      <p className="text-xs text-gray-400 mb-6">
        Classes anyone in the group has taken, sorted by group popularity.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-xs text-red-700 mb-4">
          {error.message}
        </div>
      )}

      {rides.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 px-5 py-12 text-center">
          <p className="text-xs text-gray-300">
            No rides yet. Once workouts sync with ride metadata, they&rsquo;ll appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rides.map((r) => (
            <Link
              key={r.ride_id}
              href={`/rides/${r.ride_id}`}
              className="flex gap-3 bg-white rounded-2xl border border-gray-100 p-4 hover:border-purple-200 transition-colors"
            >
              {r.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.image_url}
                  alt=""
                  className="h-16 w-24 flex-shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="h-16 w-24 flex-shrink-0 rounded-lg bg-purple-50" />
              )}
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium text-gray-900 truncate">
                  {r.title ?? 'Untitled ride'}
                </h3>
                <p className="text-xs text-gray-400 truncate">
                  {r.instructor_name ?? 'Unknown'} ·{' '}
                  {formatDuration(r.duration_seconds)}
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                  <span className="bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">
                    {r.group_member_count}{' '}
                    {r.group_member_count === 1 ? 'member' : 'members'}
                  </span>
                  <span className="text-gray-400">
                    Best {formatNumber(r.group_best_output_kj)} kj
                  </span>
                  <span className="text-gray-300">·</span>
                  <span className="text-gray-400">
                    {formatRelativeDate(r.most_recent_attempt)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
