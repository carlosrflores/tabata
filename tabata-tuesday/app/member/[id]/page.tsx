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

export const revalidate = 3600

async function getMemberStats(id: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
  const res = await fetch(`${baseUrl}/api/members/${id}/stats`, {
    next: { revalidate: 3600 },
  })
  if (!res.ok) return null
  return res.json()
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

  const { member, recent_workouts, personal_records, monthly_trend, all_time } = data

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-gray-400 hover:text-gray-600">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12 4l-8 6 8 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
        <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-800 ring-2 ring-purple-300 flex items-center justify-center font-medium text-sm">
          {member.initials}
        </div>
        <div>
          <h1 className="text-base font-medium text-gray-900">{member.name}</h1>
          <p className="text-xs text-gray-400">{member.peloton_username}</p>
        </div>
      </div>

      {/* All-time stats */}
      <div className="grid grid-cols-2 gap-2 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-xs text-gray-400 mb-1">Total workouts</p>
          <p className="text-2xl font-medium text-gray-900">{all_time.total_workouts}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-xs text-gray-400 mb-1">Total output</p>
          <p className="text-2xl font-medium text-gray-900">
            {all_time.total_output_kj.toLocaleString()}
          </p>
          <p className="text-xs text-gray-400">kj lifetime</p>
        </div>
      </div>

      {/* Output trend chart */}
      {monthly_trend.length > 0 && (
        <>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">
            Output trend
          </p>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6">
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={monthly_trend}>
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  tickFormatter={(v) => v.substring(5)}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <Tooltip
                  formatter={(v: number) => [`${Math.round(v)} kj`, 'Output']}
                  labelFormatter={(l) => `Month: ${l}`}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: '0.5px solid #e5e7eb',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="total_output_kj"
                  stroke="#7F77DD"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#7F77DD' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* Personal records */}
      {personal_records.length > 0 && (
        <>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">
            Personal records
          </p>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6">
            {personal_records.map((pr: PersonalRecord) => (
              <div
                key={pr.duration_minutes}
                className="flex items-center px-4 py-3 border-b border-gray-50 last:border-0"
              >
                <div className="w-10 text-sm font-medium text-purple-500">
                  {pr.duration_minutes}m
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-800 truncate">{pr.workout_title}</div>
                  <div className="text-xs text-gray-400">
                    {pr.instructor_name ?? 'Unknown instructor'} ·{' '}
                    {new Date(pr.workout_date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: '2-digit',
                    })}
                  </div>
                </div>
                <div className="text-sm font-medium text-green-600">
                  {Math.round(pr.total_output_kj)} kj
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Recent workouts */}
      {recent_workouts.length > 0 && (
        <>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">
            Recent rides
          </p>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {recent_workouts.map((w: Workout) => {
              const percentile =
                w.leaderboard_rank && w.leaderboard_total
                  ? Math.round(
                      (1 - w.leaderboard_rank / w.leaderboard_total) * 100
                    )
                  : null

              return (
                <div
                  key={w.id}
                  className="px-4 py-3 border-b border-gray-50 last:border-0"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">
                        {w.title}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {new Date(w.workout_date).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                        {w.instructor_name ? ` · ${w.instructor_name}` : ''}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {w.total_output_kj ? (
                        <div className="text-sm font-medium text-gray-900">
                          {Math.round(w.total_output_kj)} kj
                        </div>
                      ) : null}
                      {percentile !== null && (
                        <div className="text-xs text-gray-400">top {100 - percentile}%</div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <div className="mt-6">
        <Link
          href="/"
          className="block text-center text-sm text-gray-400 hover:text-gray-600 py-2"
        >
          Back to leaderboard
        </Link>
      </div>
    </div>
  )
}
