'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { LeaderboardEntry } from '@/types'

interface LeaderboardData {
  leaderboard: LeaderboardEntry[]
  week_stats: {
    week_start: string
    group_total_output_kj: number
    active_members: number
    total_members: number
    top_performer_name: string | null
    top_performer_kj: number
  }
}

const RANK_RING: Record<number, string> = {
  1: 'ring-purple-300 bg-purple-100 text-purple-800',
  2: 'ring-gray-300 bg-gray-100 text-gray-700',
  3: 'ring-amber-300 bg-amber-100 text-amber-800',
}

const RANK_RING_COLOR: Record<number, string> = {
  1: 'ring-purple-300',
  2: 'ring-gray-300',
  3: 'ring-amber-300',
}

const RANK_TEXT: Record<number, string> = {
  1: 'text-purple-600',
  2: 'text-gray-500',
  3: 'text-amber-600',
}

function Avatar({
  initials,
  rank,
  size = 'md',
  imageUrl,
}: {
  initials: string
  rank: number
  size?: 'sm' | 'md' | 'lg'
  imageUrl?: string | null
}) {
  const sizeClass = {
    sm: 'h-9 w-9 text-xs',
    md: 'h-11 w-11 text-sm',
    lg: 'h-14 w-14 text-base',
  }[size]

  if (imageUrl) {
    const ringColor = RANK_RING_COLOR[rank] ?? 'ring-gray-200'
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={initials}
        className={`${sizeClass} flex-shrink-0 rounded-full object-cover ring-2 ${ringColor}`}
      />
    )
  }

  const ring = RANK_RING[rank] ?? 'ring-gray-200 bg-white text-gray-600'
  return (
    <div
      className={`${sizeClass} ${ring} flex flex-shrink-0 items-center justify-center rounded-full font-medium ring-2`}
    >
      {initials}
    </div>
  )
}

function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  if (entries.length < 3) return null
  const [first, second, third] = entries

  function PodiumSlot({
    entry,
    rank,
  }: {
    entry: LeaderboardEntry
    rank: 1 | 2 | 3
  }) {
    const heights = { 1: 'h-24', 2: 'h-16', 3: 'h-10' }[rank]
    const block = {
      1: 'bg-gradient-to-t from-purple-500 to-purple-300',
      2: 'bg-gradient-to-t from-gray-400 to-gray-300',
      3: 'bg-gradient-to-t from-amber-500 to-amber-300',
    }[rank]
    const order = { 1: 'order-2', 2: 'order-1', 3: 'order-3' }[rank]
    return (
      <div className={`${order} flex flex-1 flex-col items-center`}>
        <span className={`mb-1 text-[10px] font-medium uppercase tracking-wider ${RANK_TEXT[rank]}`}>
          {rank === 1 ? '1st' : rank === 2 ? '2nd' : '3rd'}
        </span>
        <Link
          href={`/member/${entry.member_id}`}
          className="group flex flex-col items-center"
        >
          <Avatar
            initials={entry.initials}
            rank={rank}
            size={rank === 1 ? 'lg' : 'md'}
            imageUrl={entry.image_url}
          />
          <div className="mt-1.5 text-center text-xs font-medium text-gray-800 leading-tight group-hover:text-purple-700">
            {entry.name.split(' ')[0]}
          </div>
          <div className="text-[11px] text-gray-400">
            {Math.round(entry.total_output_kj)} kj
          </div>
        </Link>
        <div className={`${heights} ${block} mt-2 w-full rounded-t-md`} />
      </div>
    )
  }

  return (
    <div className="mb-8 flex items-end gap-2 px-2 sm:gap-4 sm:px-6">
      <PodiumSlot entry={first} rank={1} />
      <PodiumSlot entry={second} rank={2} />
      <PodiumSlot entry={third} rank={3} />
    </div>
  )
}

function StreakDots({ weeks, total = 4 }: { weeks: number; total?: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-2 w-2 rounded-full ${
            i < weeks ? 'bg-emerald-500' : 'bg-gray-200'
          }`}
        />
      ))}
    </div>
  )
}

function StatCard({
  label,
  value,
  unit,
  detail,
}: {
  label: string
  value: string
  unit?: string
  detail?: string
}) {
  return (
    <div className="ring-card flex flex-col rounded-2xl border border-gray-100 bg-white p-4">
      <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
        {label}
      </p>
      <p className="mt-2 flex items-baseline gap-1 text-2xl font-semibold text-gray-900">
        {value}
        {unit && (
          <span className="text-sm font-normal text-gray-400">{unit}</span>
        )}
      </p>
      {detail && (
        <p className="mt-0.5 truncate text-xs text-gray-500">{detail}</p>
      )}
    </div>
  )
}

function ChevronLeft() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

export default function LeaderboardClient({
  data: initialData,
}: {
  data: LeaderboardData
}) {
  const [showAll, setShowAll] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)
  const [data, setData] = useState<LeaderboardData>(initialData)
  const [loading, setLoading] = useState(false)

  const MAX_WEEKS_BACK = 52

  // Offset 0 uses the server-rendered data; older weeks are fetched on demand.
  useEffect(() => {
    if (weekOffset === 0) {
      setData(initialData)
      return
    }
    let cancelled = false
    setLoading(true)
    fetch(`/api/leaderboard?weekOffset=${weekOffset}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setData(d)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [weekOffset, initialData])

  const { leaderboard, week_stats } = data
  const isCurrentWeek = weekOffset === 0

  const weekDate = new Date(week_stats.week_start).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
  const weekLabel =
    weekOffset === 0
      ? 'This week'
      : weekOffset === 1
      ? 'Last week'
      : `${weekOffset} weeks ago`

  const visibleRows = showAll ? leaderboard : leaderboard.slice(0, 5)

  return (
    <div className="mx-auto max-w-3xl">
      {/* Page heading */}
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
            Leaderboard
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {isCurrentWeek
              ? 'Where the group stands this week.'
              : 'Results from a past week.'}
          </p>
        </div>
        {/* Week navigation */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setWeekOffset((o) => Math.min(MAX_WEEKS_BACK, o + 1))}
            disabled={loading || weekOffset >= MAX_WEEKS_BACK}
            aria-label="Previous week"
            className="grid h-7 w-7 place-items-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-purple-600 disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-gray-500"
          >
            <ChevronLeft />
          </button>
          <span className="min-w-[8rem] rounded-full border border-gray-200 bg-white px-3 py-1 text-center text-xs text-gray-500">
            {loading ? 'Loading…' : `${weekLabel} · ${weekDate}`}
          </span>
          <button
            type="button"
            onClick={() => setWeekOffset((o) => Math.max(0, o - 1))}
            disabled={loading || weekOffset === 0}
            aria-label="Next week"
            className="grid h-7 w-7 place-items-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-purple-600 disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-gray-500"
          >
            <ChevronRight />
          </button>
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Group output"
          value={week_stats.group_total_output_kj.toLocaleString()}
          unit="kj"
          detail="this week"
        />
        <StatCard
          label="Showing up"
          value={`${week_stats.active_members}/${week_stats.total_members}`}
          detail="members active"
        />
        <StatCard
          label="Top output"
          value={Math.round(week_stats.top_performer_kj).toLocaleString()}
          unit="kj"
          detail={week_stats.top_performer_name ?? '—'}
        />
      </div>

      {/* Podium */}
      {week_stats.group_total_output_kj > 0 && leaderboard.length >= 3 ? (
        <section className="ring-card mb-8 rounded-3xl border border-gray-100 bg-white p-5 sm:p-6">
          <p className="mb-4 text-[11px] font-medium uppercase tracking-widest text-gray-400">
            {isCurrentWeek ? "This week's podium" : 'Podium'}
          </p>
          <Podium entries={leaderboard} />
        </section>
      ) : week_stats.group_total_output_kj === 0 ? (
        <section className="ring-card mb-8 rounded-3xl border border-gray-100 bg-white px-5 py-10 text-center">
          <p className="text-sm text-gray-400">
            No cycling rides logged this week.
          </p>
        </section>
      ) : null}

      {/* Leaderboard table */}
      <section className="ring-card mb-8 overflow-hidden rounded-3xl border border-gray-100 bg-white">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-medium text-gray-900">Full leaderboard</h2>
        </div>
        <ul>
          {visibleRows.map((entry, idx) => {
            const isYou = entry.is_you
            const rank = idx + 1
            const rankColor = RANK_TEXT[rank] ?? 'text-gray-300'
            const percentileStr = entry.leaderboard_percentile
              ? `top ${Math.round(100 - entry.leaderboard_percentile)}% globally`
              : null
            return (
              <li key={entry.member_id}>
                <Link
                  href={`/member/${entry.member_id}`}
                  className={
                    'flex items-center gap-3 border-b border-gray-50 px-5 py-3 transition-colors last:border-b-0 hover:bg-gray-50 sm:gap-4 ' +
                    (isYou ? 'bg-blue-50/60' : '')
                  }
                >
                  <span
                    className={`w-6 text-center text-sm font-semibold ${rankColor}`}
                  >
                    {rank}
                  </span>
                  <Avatar
                    initials={entry.initials}
                    rank={rank}
                    size="sm"
                    imageUrl={entry.image_url}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-gray-900">
                        {entry.name}
                      </span>
                      {isYou && (
                        <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                          you
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">
                      {entry.workout_count} ride
                      {entry.workout_count !== 1 ? 's' : ''}
                      {percentileStr ? ` · ${percentileStr}` : ''}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-gray-900 tabular-nums">
                      {Math.round(entry.total_output_kj)}
                      <span className="ml-0.5 text-[11px] font-normal text-gray-400">
                        kj
                      </span>
                    </div>
                    {entry.best_leaderboard_rank && (
                      <div className="text-xs text-gray-400">
                        #{entry.best_leaderboard_rank.toLocaleString()}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>

        {!showAll && leaderboard.length > 5 && (
          <button
            onClick={() => setShowAll(true)}
            className="block w-full border-t border-gray-50 py-2.5 text-xs text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
          >
            Show {leaderboard.length - 5} more members
          </button>
        )}
      </section>

      {/* Consistency streaks — current week only (streaks are "as of now") */}
      {isCurrentWeek && leaderboard.length > 0 && (
        <section>
          <p className="mb-3 text-[11px] font-medium uppercase tracking-widest text-gray-400">
            Consistency streaks
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {leaderboard.slice(0, 4).map((entry) => (
              <Link
                key={entry.member_id}
                href={`/member/${entry.member_id}`}
                className="ring-card group rounded-2xl border border-gray-100 bg-white p-3 transition-colors hover:border-purple-200"
              >
                <p className="mb-2 truncate text-xs text-gray-500 group-hover:text-gray-700">
                  {entry.name}
                </p>
                <StreakDots weeks={entry.streak_weeks} />
                <p className="mt-2 text-xs font-medium text-gray-700">
                  {entry.streak_weeks} week
                  {entry.streak_weeks !== 1 ? 's' : ''}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Last synced footer */}
      <p className="mt-8 text-center text-xs text-gray-400">
        Syncs daily ·{' '}
        {new Date().toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })}
      </p>
    </div>
  )
}
