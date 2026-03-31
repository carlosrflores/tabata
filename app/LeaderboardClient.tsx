'use client'

import { useState } from 'react'
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

function Avatar({
  initials,
  rank,
  size = 'md',
}: {
  initials: string
  rank: number
  size?: 'sm' | 'md' | 'lg'
}) {
  const colors: Record<number, string> = {
    1: 'bg-purple-100 text-purple-800 ring-purple-400',
    2: 'bg-gray-200 text-gray-700 ring-gray-400',
    3: 'bg-orange-100 text-orange-800 ring-orange-400',
  }
  const colorClass = colors[rank] ?? 'bg-gray-100 text-gray-600 ring-gray-200'

  const sizeClass = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  }[size]

  return (
    <div
      className={`${sizeClass} ${colorClass} rounded-full ring-2 flex items-center justify-center font-medium flex-shrink-0`}
    >
      {initials}
    </div>
  )
}

function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  if (entries.length < 3) return null
  const [second, first, third] = [entries[1], entries[0], entries[2]]

  const heights = { first: 'h-20', second: 'h-14', third: 'h-10' }
  const blockColors = {
    first: 'bg-purple-400',
    second: 'bg-gray-400',
    third: 'bg-orange-400',
  }

  function PodiumSlot({
    entry,
    position,
    rank,
  }: {
    entry: LeaderboardEntry
    position: 'first' | 'second' | 'third'
    rank: number
  }) {
    return (
      <div className="flex flex-col items-center flex-1">
        <div className="text-xs text-gray-400 mb-1">
          {rank === 1 ? '1st' : rank === 2 ? '2nd' : '3rd'}
        </div>
        <Avatar initials={entry.initials} rank={rank} size={rank === 1 ? 'lg' : 'md'} />
        <div className="text-xs font-medium text-gray-800 mt-1 text-center leading-tight">
          {entry.name.split(' ')[0]}
        </div>
        <div className="text-xs text-gray-400">{Math.round(entry.total_output_kj)} kj</div>
        <div
          className={`${heights[position]} ${blockColors[position]} w-full mt-2 rounded-t-md`}
        />
      </div>
    )
  }

  return (
    <div className="flex items-end gap-2 mb-6 px-4 h-44">
      <PodiumSlot entry={second} position="second" rank={2} />
      <PodiumSlot entry={first} position="first" rank={1} />
      <PodiumSlot entry={third} position="third" rank={3} />
    </div>
  )
}

function StreakDots({ weeks, total = 4 }: { weeks: number; total?: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`w-2 h-2 rounded-full ${i < weeks ? 'bg-green-500' : 'bg-gray-200'}`}
        />
      ))}
    </div>
  )
}

export default function LeaderboardClient({ data }: { data: LeaderboardData }) {
  const [showAll, setShowAll] = useState(false)
  const { leaderboard, week_stats } = data

  const weekDate = new Date(week_stats.week_start).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })

  const visibleRows = showAll ? leaderboard : leaderboard.slice(0, 5)

  // Find the owner/you row - first member marked is_you, or owner
  const ownerEntry = leaderboard.find((e) => e.is_you)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-medium text-gray-900">Tabata Tuesday</h1>
        <span className="text-xs text-gray-500 bg-white border border-gray-200 rounded-full px-3 py-1">
          Week of {weekDate}
        </span>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Group output</p>
          <p className="text-xl font-medium text-gray-900">
            {week_stats.group_total_output_kj.toLocaleString()}
          </p>
          <p className="text-xs text-gray-400">kj this week</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Showing up</p>
          <p className="text-xl font-medium text-gray-900">
            {week_stats.active_members}/{week_stats.total_members}
          </p>
          <p className="text-xs text-gray-400">members active</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Top output</p>
          <p className="text-xl font-medium text-gray-900">
            {Math.round(week_stats.top_performer_kj)}
          </p>
          <p className="text-xs text-gray-400 truncate">
            kj · {week_stats.top_performer_name?.split(' ')[0]}
          </p>
        </div>
      </div>

      {/* Podium */}
      {leaderboard.length >= 3 && (
        <>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">
            This week&apos;s podium
          </p>
          <Podium entries={leaderboard} />
        </>
      )}

      {/* Leaderboard table */}
      <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">
        Full leaderboard
      </p>
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6">
        {visibleRows.map((entry, idx) => {
          const isYou = entry.is_you
          const rank = idx + 1
          const rankColors: Record<number, string> = {
            1: 'text-purple-500',
            2: 'text-gray-400',
            3: 'text-orange-500',
          }
          const rankColor = rankColors[rank] ?? 'text-gray-300'
          const percentileStr = entry.leaderboard_percentile
            ? `top ${Math.round(100 - entry.leaderboard_percentile)}%`
            : null

          return (
            <Link
              key={entry.member_id}
              href={`/member/${entry.member_id}`}
              className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-b-0 hover:bg-gray-50 transition-colors ${
                isYou ? 'bg-blue-50' : ''
              }`}
            >
              <span className={`text-sm font-medium w-5 text-center ${rankColor}`}>
                {rank}
              </span>
              <Avatar initials={entry.initials} rank={rank} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {entry.name}
                  </span>
                  {isYou && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                      you
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-400">
                  {entry.workout_count} ride{entry.workout_count !== 1 ? 's' : ''}
                  {percentileStr ? ` · ${percentileStr} globally` : ''}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-gray-900">
                  {Math.round(entry.total_output_kj)} kj
                </div>
                {entry.best_leaderboard_rank && (
                  <div className="text-xs text-gray-400">
                    #{entry.best_leaderboard_rank.toLocaleString()}
                  </div>
                )}
              </div>
            </Link>
          )
        })}

        {!showAll && leaderboard.length > 5 && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full py-2.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Show {leaderboard.length - 5} more members
          </button>
        )}
      </div>

      {/* Consistency streaks */}
      <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">
        Consistency streaks
      </p>
      <div className="grid grid-cols-2 gap-2 mb-6">
        {leaderboard.slice(0, 4).map((entry) => (
          <div
            key={entry.member_id}
            className="bg-white rounded-xl border border-gray-100 p-3"
          >
            <p className="text-xs text-gray-400 mb-2 truncate">{entry.name}</p>
            <StreakDots weeks={entry.streak_weeks} />
            <p className="text-xs font-medium text-gray-700 mt-1.5">
              {entry.streak_weeks} week{entry.streak_weeks !== 1 ? 's' : ''}
            </p>
          </div>
        ))}
      </div>

      {/* Navigation */}
      <div className="flex justify-around bg-white rounded-2xl border border-gray-100 py-3">
        <Link href="/" className="flex flex-col items-center gap-1 text-purple-600">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="2" y="9" width="5" height="9" rx="1" fill="currentColor" opacity="0.8"/>
            <rect x="7.5" y="6" width="5" height="12" rx="1" fill="currentColor"/>
            <rect x="13" y="2" width="5" height="16" rx="1" fill="currentColor" opacity="0.6"/>
          </svg>
          <span className="text-xs">Leaderboard</span>
        </Link>
        <Link href={ownerEntry ? `/member/${ownerEntry.member_id}` : '#'} className="flex flex-col items-center gap-1 text-gray-400 hover:text-gray-600">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M10 6v4l2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          <span className="text-xs">My stats</span>
        </Link>
      </div>

      {/* Last synced footer */}
      <p className="text-center text-xs text-gray-300 mt-4">
        Syncs daily · {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
      </p>
    </div>
  )
}
