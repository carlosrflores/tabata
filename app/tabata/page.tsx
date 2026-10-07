import Link from 'next/link'
import Breadcrumbs from '../components/Breadcrumbs'
import SetWeekBox from './SetWeekBox'
import { formatDuration, formatNumber } from '@/lib/format'
import { getAppUser } from '@/lib/auth'
import { getTabataData } from '@/lib/data'
import PelotonImg from '../components/PelotonImg'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Tabata Tuesday — This Week’s Class',
}

interface Ride {
  id: string
  title: string | null
  instructor_name: string | null
  instructor_image_url: string | null
  duration_seconds: number | null
  fitness_discipline: string | null
  difficulty_estimate: number | null
  image_url: string | null
}

interface Result {
  member_id: string
  name: string
  initials: string
  image_url: string | null
  workout_date: string
  total_output_kj: number | null
  avg_watts: number | null
  duration_seconds: number | null
  leaderboard_rank: number | null
  leaderboard_total: number | null
}

interface NotYet {
  member_id: string
  name: string
  initials: string
  image_url: string | null
}

interface Week {
  week_start: string
  scheduled_start: string | null
  ride: Ride | null
  results: Result[]
  not_yet: NotYet[]
}

interface TabataData {
  current: Week | null
  past: Week[]
}

async function loadTabataData(): Promise<TabataData | null> {
  try {
    return (await getTabataData()) as TabataData
  } catch {
    return null
  }
}

const MEDALS = ['🥇', '🥈', '🥉']

function formatWorkoutTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatWeekLabel(weekStart: string): string {
  return new Date(`${weekStart}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function Avatar({ name, initials, image_url }: { name: string; initials: string; image_url: string | null }) {
  return image_url ? (
    <PelotonImg
      src={image_url}
      displayWidth={36}
      alt={name}
      className="h-9 w-9 flex-shrink-0 rounded-full object-cover"
    />
  ) : (
    <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-purple-100 text-xs font-medium text-purple-800">
      {initials}
    </div>
  )
}

function ClassCard({ week }: { week: Week }) {
  const ride = week.ride
  if (!ride) return null
  return (
    <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white">
      {ride.image_url && (
        <PelotonImg
          src={ride.image_url}
          displayWidth={672}
          loading="eager"
          alt={ride.title ?? 'Class image'}
          className="h-44 w-full object-cover"
        />
      )}
      <div className="p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-purple-500">
          This week&apos;s class
        </div>
        <h2 className="mt-1 text-lg font-semibold text-gray-900">
          <Link href={`/rides/${ride.id}`} className="hover:text-purple-700">
            {ride.title ?? 'Untitled class'}
          </Link>
        </h2>
        <div className="mt-1 text-sm text-gray-500">
          {[
            ride.instructor_name,
            ride.duration_seconds ? formatDuration(ride.duration_seconds) : null,
            ride.difficulty_estimate
              ? `${formatNumber(ride.difficulty_estimate, 1)}/10 difficulty`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
        {week.scheduled_start && (
          <div className="mt-2 text-xs text-gray-400">
            Group session scheduled for{' '}
            {formatWorkoutTime(week.scheduled_start)} — but any ride of this
            class during the week counts.
          </div>
        )}
      </div>
    </div>
  )
}

function ResultsList({ week, compact = false }: { week: Week; compact?: boolean }) {
  const topOutput = Number(week.results[0]?.total_output_kj ?? 0)
  return (
    <div>
      {week.results.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-gray-300">
          Nobody has ridden it yet — results appear after each rider&apos;s
          next sync.
        </div>
      ) : (
        week.results.map((r, i) => (
          <div
            key={r.member_id}
            className="flex items-center gap-3 border-b border-gray-50 px-5 py-3 last:border-0"
          >
            <div className="w-6 text-center text-sm">
              {i < 3 ? MEDALS[i] : <span className="text-gray-400">{i + 1}</span>}
            </div>
            <Avatar name={r.name} initials={r.initials} image_url={r.image_url} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-gray-800">
                {r.name}
              </div>
              <div className="text-xs text-gray-400">
                {formatWorkoutTime(r.workout_date)}
                {!compact && r.avg_watts != null && (
                  <> · {formatNumber(r.avg_watts)} avg watts</>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-gray-900">
                {formatNumber(r.total_output_kj)} kj
              </div>
              {topOutput > 0 && Number(r.total_output_kj ?? 0) < topOutput && (
                <div className="text-xs text-gray-300">
                  −{formatNumber(topOutput - Number(r.total_output_kj ?? 0))}
                </div>
              )}
            </div>
          </div>
        ))
      )}
      {!compact && week.not_yet.length > 0 && (
        <div className="border-t border-gray-50 px-5 py-3">
          <div className="mb-2 text-xs text-gray-300">Hasn&apos;t ridden yet</div>
          <div className="flex flex-wrap gap-3">
            {week.not_yet.map((m) => (
              <div key={m.member_id} className="flex items-center gap-1.5 opacity-60">
                <Avatar name={m.name} initials={m.initials} image_url={m.image_url} />
                <span className="text-xs text-gray-400">{m.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default async function TabataPage() {
  const [data, appUser] = await Promise.all([loadTabataData(), getAppUser()])
  const canPick = appUser?.role === 'admin' || appUser?.role === 'picker'

  return (
    <div className="mx-auto max-w-2xl">
      <Breadcrumbs
        items={[{ label: 'Home', href: '/' }, { label: 'Tabata Tuesday' }]}
      />

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Tabata Tuesday
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          One class, picked each week. Ride it on your own schedule — the
          board ranks everyone&apos;s effort on the same class.
        </p>
      </div>

      {!data ? (
        <div className="rounded-3xl border border-gray-100 bg-white px-5 py-10 text-center text-sm text-gray-300">
          Couldn&apos;t load Tabata data. Try again in a minute.
        </div>
      ) : (
        <>
          {canPick && <SetWeekBox hasCurrent={Boolean(data.current)} />}
          {data.current ? (
            <div className="space-y-4">
              <ClassCard week={data.current} />
              <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white">
                <div className="border-b border-gray-50 px-5 py-4">
                  <h2 className="text-sm font-medium text-gray-900">
                    This week&apos;s board
                  </h2>
                </div>
                <ResultsList week={data.current} />
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-gray-200 bg-white px-5 py-10 text-center">
              <div className="text-sm text-gray-500">
                This week&apos;s class hasn&apos;t been picked yet.
              </div>
              <div className="mt-1 text-xs text-gray-400">
                It gets set from the scheduled-class link when the week&apos;s
                session is created.
              </div>
            </div>
          )}

          {data.past.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-3 text-sm font-medium text-gray-900">
                Past weeks
              </h2>
              <div className="space-y-4">
                {data.past.map((week) => (
                  <div
                    key={week.week_start}
                    className="overflow-hidden rounded-3xl border border-gray-100 bg-white"
                  >
                    <div className="flex items-baseline justify-between border-b border-gray-50 px-5 py-3">
                      <div className="text-sm font-medium text-gray-800">
                        {week.ride ? (
                          <Link
                            href={`/rides/${week.ride.id}`}
                            className="hover:text-purple-700"
                          >
                            {week.ride.title ?? 'Untitled class'}
                          </Link>
                        ) : (
                          'Untitled class'
                        )}
                      </div>
                      <div className="text-xs text-gray-400">
                        Week of {formatWeekLabel(week.week_start)}
                      </div>
                    </div>
                    <ResultsList week={week} compact />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
