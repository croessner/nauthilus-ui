// Common formatting utilities
// Note: Keep this file free of React/MUI dependencies.

/**
 * Formats a duration in seconds into a compact human-readable string, e.g.:
 *  - 65 -> "1m"
 *  - 3661 -> "1h 1m"
 *  - 90061 -> "1d 1h"
 * If all larger units are zero, seconds are shown (e.g., 42 -> "42s").
 */
export function formatDuration(total: number): string {
  let s = Math.max(0, Math.floor(total));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const mnt = Math.floor(s / 60); s -= mnt * 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (mnt) parts.push(`${mnt}m`);
  if (!parts.length) parts.push(`${s}s`);
  return parts.join(' ');
}
