// /rides/[ride_id] — head-to-head comparison page for one Peloton class.
//
// Server component: fetches ride metadata, comparison rows, and active members
// in parallel, then hands off to <RideDetailClient> for sortable interaction.

import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase';
import { formatDuration, formatExactDate } from '@/lib/format';
import RideDetailClient from './RideDetailClient';
import ShareButton from './ShareButton';
import Breadcrumbs from '@/app/components/Breadcrumbs';
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
    <div className="mx-auto max-w-5xl">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Rides', href: '/rides' },
          { label: ride.title ?? 'Untitled ride' },
        ]}
      />

      {/* Class header — identical for every member */}
      <section className="ring-card relative mb-6 overflow-hidden rounded-3xl border border-gray-100 bg-white">
        {ride.image_url && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ride.image_url}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-2xl"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-white via-white/85 to-white/70" />
          </>
        )}

        <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
          {ride.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ride.image_url}
              alt=""
              className="h-40 w-full flex-shrink-0 rounded-2xl object-cover ring-1 ring-black/5 sm:h-32 sm:w-52"
            />
          ) : (
            <div className="grid h-40 w-full flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-purple-100 to-purple-50 sm:h-32 sm:w-52">
              <span className="text-xs font-medium text-purple-400">
                No image
              </span>
            </div>
          )}

          <div className="min-w-0 flex-1 pr-12">
            <div className="text-xs font-medium uppercase tracking-wider text-purple-600">
              {ride.fitness_discipline ?? 'Workout'} ·{' '}
              {formatDuration(ride.duration_seconds)}
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
              {ride.title ?? 'Untitled ride'}
            </h1>

            {ride.instructor_name && (
              <div className="mt-3 flex items-center gap-3">
                {ride.instructor_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ride.instructor_image_url}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover ring-2 ring-white shadow"
                  />
                ) : (
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-purple-100 text-sm font-medium text-purple-700 ring-2 ring-white shadow">
                    {ride.instructor_name
                      .split(' ')
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join('')}
                  </div>
                )}
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {ride.instructor_name}
                  </div>
                  {ride.original_air_time && (
                    <div className="text-xs text-gray-500">
                      Aired {formatExactDate(ride.original_air_time)}
                    </div>
                  )}
                </div>
              </div>
            )}

            {ride.description && (
              <p className="mt-3 line-clamp-3 text-sm text-gray-600">
                {ride.description}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-xs">
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

          <ShareButton
            rideId={ride.id}
            title={ride.title ?? 'Untitled ride'}
            instructor={ride.instructor_name}
            className="absolute right-4 top-4"
          />
        </div>
      </section>

      {/* Group leaderboard for this ride */}
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-base font-semibold text-gray-900">
          Group leaderboard
        </h2>
        {comparison.length > 0 && (
          <span className="text-xs text-gray-500">
            {comparison.length} member{comparison.length === 1 ? '' : 's'} taken
          </span>
        )}
      </div>

      {comparison.length === 0 ? (
        <div className="ring-card rounded-3xl border border-gray-100 bg-white px-5 py-16 text-center">
          <p className="text-sm text-gray-400">
            No one in the group has taken this ride yet.{' '}
            <span className="font-medium text-purple-600">Be the first!</span>
          </p>
        </div>
      ) : (
        <RideDetailClient rows={comparison} />
      )}

      {/* "Haven't taken yet" footer */}
      {notTaken.length > 0 && comparison.length > 0 && (
        <section className="ring-card mt-6 rounded-3xl border border-gray-100 bg-white p-5">
          <h3 className="mb-3 text-[11px] font-medium uppercase tracking-widest text-gray-400">
            Haven&rsquo;t taken this yet ({notTaken.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {notTaken.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1.5 ring-1 ring-gray-100"
              >
                <div className="grid h-5 w-5 place-items-center rounded-full bg-purple-100 text-[10px] font-medium text-purple-700">
                  {m.initials}
                </div>
                <span className="text-xs text-gray-700">{m.name}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-gray-900">
        {value ?? '—'}
      </div>
    </div>
  );
}
