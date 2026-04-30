'use client';

// Sortable comparison table for /rides/[ride_id].
// Sort state persists in the URL (?sort=...&dir=...) so links are shareable.
// Each numeric cell has a faint purple sparkline behind it showing the value's
// position vs. the column max — instant visual ranking without reading numbers.

import { useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  formatNumber,
  formatRelativeDate,
  formatExactDate,
  formatPercentile,
  relativeWidth,
} from '@/lib/format';
import type {
  RideComparisonRow,
  SortableColumn,
  SortDirection,
} from '@/types';

type Props = { rows: RideComparisonRow[] };

const COLUMNS: {
  key: SortableColumn;
  label: string;
  align?: 'left' | 'right';
  numeric?: boolean;
  decimals?: number;
}[] = [
  { key: 'member_name', label: 'Member', align: 'left' },
  { key: 'workout_date', label: 'Date', align: 'left' },
  { key: 'total_output_kj', label: 'kj', align: 'right', numeric: true },
  { key: 'avg_watts', label: 'Avg W', align: 'right', numeric: true },
  { key: 'avg_cadence', label: 'Cadence', align: 'right', numeric: true },
  {
    key: 'avg_resistance',
    label: 'Resist',
    align: 'right',
    numeric: true,
  },
  { key: 'avg_speed', label: 'Speed', align: 'right', numeric: true, decimals: 1 },
  {
    key: 'distance_miles',
    label: 'Distance',
    align: 'right',
    numeric: true,
    decimals: 2,
  },
  { key: 'calories', label: 'Cal', align: 'right', numeric: true },
  {
    key: 'leaderboard_percentile',
    label: 'Global',
    align: 'right',
  },
];

const DEFAULT_SORT: SortableColumn = 'total_output_kj';
const DEFAULT_DIR: SortDirection = 'desc';

export default function RideDetailClient({ rows }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const sort = (params.get('sort') as SortableColumn) || DEFAULT_SORT;
  const dir = (params.get('dir') as SortDirection) || DEFAULT_DIR;

  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      const av = a[sort];
      const bv = b[sort];
      // Nulls always last regardless of direction.
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      let cmp: number;
      if (typeof av === 'number' && typeof bv === 'number') {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv));
      }
      return dir === 'desc' ? -cmp : cmp;
    });
    return out;
  }, [rows, sort, dir]);

  // Column max for sparkline sizing.
  const maxes = useMemo(() => {
    const m: Partial<Record<SortableColumn, number>> = {};
    for (const col of COLUMNS) {
      if (!col.numeric) continue;
      const values = rows
        .map((r) => r[col.key])
        .filter((v): v is number => typeof v === 'number');
      m[col.key] = values.length > 0 ? Math.max(...values) : 0;
    }
    return m;
  }, [rows]);

  function setSort(col: SortableColumn) {
    const newDir: SortDirection =
      sort === col ? (dir === 'desc' ? 'asc' : 'desc') : 'desc';
    const sp = new URLSearchParams(params);
    sp.set('sort', col);
    sp.set('dir', newDir);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-50">
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className={`px-3 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide ${
                  col.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                <button
                  onClick={() => setSort(col.key)}
                  className="inline-flex items-center gap-1 hover:text-purple-600 transition-colors"
                >
                  {col.label}
                  {sort === col.key && (
                    <span className="text-[9px]">
                      {dir === 'desc' ? '▼' : '▲'}
                    </span>
                  )}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, idx) => {
            const isLeader =
              idx === 0 && sort === DEFAULT_SORT && dir === DEFAULT_DIR;
            return (
              <tr
                key={row.member_id}
                className={`border-b border-gray-50 last:border-0 ${
                  isLeader ? 'bg-purple-50/50' : ''
                }`}
              >
                {/* Member */}
                <td className="whitespace-nowrap px-3 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-800 flex items-center justify-center text-xs font-medium flex-shrink-0">
                      {row.member_initials}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-gray-800">
                          {row.member_name}
                        </span>
                        {row.is_personal_record && (
                          <span title="Personal record">🏆</span>
                        )}
                        {isLeader && <span title="Group leader">👑</span>}
                      </div>
                      {row.total_attempts > 1 && (
                        <div className="text-[10px] text-gray-400">
                          best of {row.total_attempts}
                        </div>
                      )}
                    </div>
                  </div>
                </td>

                {/* Date */}
                <td
                  className="whitespace-nowrap px-3 py-3 text-xs text-gray-500"
                  title={formatExactDate(row.workout_date)}
                >
                  {formatRelativeDate(row.workout_date)}
                </td>

                {/* Numeric columns with sparkline */}
                <NumericCell
                  value={row.total_output_kj}
                  max={maxes.total_output_kj}
                />
                <NumericCell
                  value={row.avg_watts}
                  max={maxes.avg_watts}
                />
                <NumericCell
                  value={row.avg_cadence}
                  max={maxes.avg_cadence}
                />
                <NumericCell
                  value={row.avg_resistance}
                  max={maxes.avg_resistance}
                  suffix="%"
                />
                <NumericCell
                  value={row.avg_speed}
                  max={maxes.avg_speed}
                  decimals={1}
                />
                <NumericCell
                  value={row.distance_miles}
                  max={maxes.distance_miles}
                  decimals={2}
                />
                <NumericCell value={row.calories} max={maxes.calories} />

                {/* Global percentile */}
                <td className="whitespace-nowrap px-3 py-3 text-right">
                  <div className="text-sm font-medium text-gray-800">
                    {formatPercentile(row.leaderboard_percentile)}
                  </div>
                  {row.leaderboard_rank !== null &&
                    row.leaderboard_total !== null && (
                      <div className="text-[10px] text-gray-400">
                        {formatNumber(row.leaderboard_rank)} /{' '}
                        {formatNumber(row.leaderboard_total)}
                      </div>
                    )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NumericCell({
  value,
  max,
  decimals = 0,
  suffix = '',
}: {
  value: number | null;
  max: number | undefined;
  decimals?: number;
  suffix?: string;
}) {
  const width = relativeWidth(value, max ?? null) * 100;
  return (
    <td className="relative whitespace-nowrap px-3 py-3 text-right tabular-nums">
      {value !== null && max && max > 0 && (
        <div
          className="absolute inset-y-1.5 right-1.5 rounded bg-purple-100/60"
          style={{ width: `${width}%` }}
          aria-hidden
        />
      )}
      <span className="relative text-sm font-medium text-gray-800">
        {formatNumber(value, decimals)}
        {suffix}
      </span>
    </td>
  );
}
