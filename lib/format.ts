// Formatting helpers shared across the rides pages.

export function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

export function formatRelativeDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

export function formatExactDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatNumber(value: number | null, decimals = 0): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// Higher percentile = better. ride_comparison.leaderboard_percentile already
// inverts rank to "top X%" for us, matching weekly_leaderboard's convention.
export function formatPercentile(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return `${value}%`;
}

// Returns 0..1 representing this value's position vs. the column max.
// Used to size the sparkline bar behind each numeric cell.
export function relativeWidth(
  value: number | null,
  max: number | null
): number {
  if (value === null || max === null || max === 0) return 0;
  return Math.max(0, Math.min(1, value / max));
}
