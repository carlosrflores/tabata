'use client'

import Link from 'next/link'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { Workout, PersonalRecord } from '@/types'
import Breadcrumbs from '@/app/components/Breadcrumbs'

interface MemberData {
  member: { id: string; name: string; initials: string; peloton_username: string }
  recent_workouts: Workout[]
  personal_records: PersonalRecord[]
  monthly_trend: { month: string; total_output_kj: number }[]
  all_time: { total_workouts: number; total_output_kj: number }
}

export default function MemberStatsClient({ data }: { data: MemberData }) {
  const { member, recent_workouts, personal_records, monthly_trend, all_time } = data

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumbs
        items={[{ label: 'Home', href: '/' }, { label: member.name }]}
      />

      {/* Member header */}
      <section className="ring-card mb-6 flex items-center gap-4 rounded-3xl border border-gray-100 bg-white p-5">
        <div className="grid h-14 w-14 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-purple-500 to-purple-700 text-base font-semibold text-white shadow ring-4 ring-white">
          {member.initials}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-gray-900">
            {member.name}
          </h1>
          <p className="text-xs text-gray-500">@{member.peloton_username}</p>
        </div>
      </section>

      {/* All-time stats */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="ring-card rounded-2xl border border-gray-100 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
            Total workouts
          </p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">
            {all_time.total_workouts}
          </p>
        </div>
        <div className="ring-card rounded-2xl border border-gray-100 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
            Total output
          </p>
          <p className="mt-2 flex items-baseline gap-1 text-2xl font-semibold text-gray-900">
            {all_time.total_output_kj.toLocaleString()}
            <span className="text-sm font-normal text-gray-400">kj</span>
          </p>
        </div>
      </div>

      {monthly_trend.length > 0 && (
        <section className="ring-card mb-6 rounded-3xl border border-gray-100 bg-white p-5">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-widest text-gray-400">
            Output trend
          </p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={monthly_trend}>
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickFormatter={(v: string) => v.substring(5)}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide />
              <Tooltip
                formatter={(v: number) => [`${Math.round(v)} kj`, 'Output']}
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 12,
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                }}
              />
              <Line
                type="monotone"
                dataKey="total_output_kj"
                stroke="#7F77DD"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: '#7F77DD' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </section>
      )}

      {personal_records.length > 0 && (
        <section className="ring-card mb-6 overflow-hidden rounded-3xl border border-gray-100 bg-white">
          <div className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-medium text-gray-900">
              Personal records
            </h2>
          </div>
          <ul>
            {personal_records.map((pr: PersonalRecord) => (
              <li
                key={pr.duration_minutes}
                className="flex items-center border-b border-gray-50 px-5 py-3 last:border-0"
              >
                <div className="w-12 text-sm font-semibold text-purple-600">
                  {pr.duration_minutes}m
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-900">
                    {pr.workout_title}
                  </div>
                  <div className="text-xs text-gray-500">
                    {pr.instructor_name ?? 'Unknown'} ·{' '}
                    {new Date(pr.workout_date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: '2-digit',
                    })}
                  </div>
                </div>
                <div className="text-sm font-semibold text-emerald-600 tabular-nums">
                  {Math.round(pr.total_output_kj)}
                  <span className="ml-0.5 text-[11px] font-normal text-emerald-500">
                    kj
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recent_workouts.length > 0 && (
        <section className="ring-card overflow-hidden rounded-3xl border border-gray-100 bg-white">
          <div className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-medium text-gray-900">Recent rides</h2>
          </div>
          <ul>
            {recent_workouts.map((w: Workout) => {
              const percentile =
                w.leaderboard_rank && w.leaderboard_total
                  ? Math.round(
                      (1 - w.leaderboard_rank / w.leaderboard_total) * 100
                    )
                  : null
              const RowInner = (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900">
                      {w.title}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      {new Date(w.workout_date).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                      {w.instructor_name ? ` · ${w.instructor_name}` : ''}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    {w.total_output_kj ? (
                      <div className="text-sm font-semibold text-gray-900 tabular-nums">
                        {Math.round(w.total_output_kj)}
                        <span className="ml-0.5 text-[11px] font-normal text-gray-400">
                          kj
                        </span>
                      </div>
                    ) : null}
                    {percentile !== null && (
                      <div className="text-xs text-gray-500">
                        top {100 - percentile}%
                      </div>
                    )}
                  </div>
                </div>
              )
              return (
                <li
                  key={w.id}
                  className="border-b border-gray-50 last:border-0"
                >
                  {w.ride_id ? (
                    <Link
                      href={`/rides/${w.ride_id}`}
                      className="block px-5 py-3 transition-colors hover:bg-gray-50"
                    >
                      {RowInner}
                    </Link>
                  ) : (
                    <div className="px-5 py-3">{RowInner}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
