// /rides/[ride_id] — head-to-head comparison page for one Peloton class.
//
// Server component: fetches ride metadata, comparison rows, and active members
// in parallel, then hands off to <RideDetailClient> for sortable interaction.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase';
import { formatDuration, formatExactDate } from '@/lib/format';
import RideDetailClient from './RideDetailClient';
import type {
  Ride,
  RideComparisonRow,
  ActiveMember,
} from '@/types';

export const dynamic = 'force-dynamic';

type Props = { params: { ride_id: string } };

export default async function RideDetailPage({ params }: Props) {
  const rideId = params.ride_id;
  const db = getSupabaseAdmin();

  const [rideRes, comparisonRes, membersRes] = await Promise.all([
    db.from('rides').select('*').eq('id', rideId).single(),
    db.from('ride_comparison').select('*').eq('ride_id', rideId),
    db.from('members').select('id, name, initials').eq('active', true),
  ]);

  if (rideRes.error || !rideRes.data) {
    notFound();
  }

  const ride = rideRes.data as Ride;
  const comparison = (comparisonRes.data ?? []) as RideComparisonRow[];
  const allMembers = (membersRes.data ?? []) as ActiveMember[];

  // Members who haven't taken this ride yet → footer.
  const takenMemberIds = new Set(comparison.map((r) => r.member_id));
  const notTaken = allMembers.filter((m) => !takenMemberIds.has(m.id));

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-2">
        <Link
          href="/rides"
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          ← All rides
        </Link>
      </div>

      {/* Class header — identical for every member */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
        <div className="flex flex-col gap-4 sm:flex-row">
          {ride.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ride.image_url}
              alt=""
              className="h-32 w-full sm:w-48 flex-shrink-0 rounded-xl object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-wide text-gray-400">
              {ride.fitness_discipline ?? 'Workout'} ·{' '}
              {formatDuration(ride.duration_seconds)}
            </div>
            <h1 className="mt-1 text-xl font-medium text-gray-900">
              {ride.title ?? 'Untitled ride'}
            </h1>
            {ride.instructor_name && (
              <div className="mt-3 flex items-center gap-2">
                {ride.instructor_image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ride.instructor_image_url}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover"
                  />
                )}
                <div>
                  <div className="text-sm font-medium text-gray-700">
                    {ride.instructor_name}
                  </div>
                  {ride.original_air_time && (
                    <div className="text-xs text-gray-400">
                      Aired {formatExactDate(ride.original_air_time)}
                    </div>
                  )}
                </div>
              </div>
            )}
            {ride.description && (
              <p className="mt-3 text-sm text-gray-600">{ride.description}</p>
            )}
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs">
              {ride.difficulty_estimate !== null && (
                <Stat
                  label="Difficulty"
                  value={ride.difficulty_estimate?.toFixed(1)}
                />
              )}
              {ride.overall_rating_avg !== null && (
                <Stat
                  label="Rating"
                  value={ride.overall_rating_avg?.toFixed(2)}
                />
              )}
              {ride.total_workouts !== null && (
                <Stat
                  label="Total workouts"
                  value={ride.total_workouts?.toLocaleString()}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Group leaderboard for this ride */}
      <h2 className="text-sm font-medium text-gray-900 mb-3">
        Group leaderboard
      </h2>
      {comparison.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 px-5 py-12 text-center">
          <p className="text-xs text-gray-300">
            No one in the group has taken this ride yet.{' '}
            <span className="text-purple-500 font-medium">Be the first!</span>
          </p>
        </div>
      ) : (
        <RideDetailClient rows={comparison} />
      )}

      {/* "Haven't taken yet" footer */}
      {notTaken.length > 0 && comparison.length > 0 && (
        <div className="mt-6 bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
            Haven&rsquo;t taken this yet ({notTaken.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {notTaken.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 bg-gray-50 rounded-full px-3 py-1.5"
              >
                <div className="w-5 h-5 rounded-full bg-purple-100 text-purple-800 flex items-center justify-center text-[10px] font-medium">
                  {m.initials}
                </div>
                <span className="text-xs text-gray-600">{m.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-gray-400">
        {label}
      </div>
      <div className="font-medium text-gray-700">{value ?? '—'}</div>
    </div>
  );
}
