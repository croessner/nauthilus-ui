/**
 * Utility providing limits and sanity clamping for RAW JSON inputs
 */

/** Min and Max sane bounds (bytes) */
export const RAW_JSON_MIN_BYTES = 1024;     // 1 KiB
export const RAW_JSON_MAX_BYTES = 1048576;  // 1 MiB

/**
 * Parses an environment variable into a number of bytes, if possible.
 */
function parseEnvNumber(val: any): number | null {
  if (val == null) return null;
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Returns the configured maximum number of bytes allowed for RAW JSON input.
 * 
 * Precedence:
 * - window._env_.REACT_APP_RAW_JSON_MAX_BYTES (when injected at runtime)
 * - process.env.REACT_APP_RAW_JSON_MAX_BYTES (at build-time)
 * - default: 8192 (8 KiB)
 *
 * Sanity limits: clamp to [RAW_JSON_MIN_BYTES, RAW_JSON_MAX_BYTES]
 */
export function getRawJsonMaxBytes(): number {
  const DEFAULT = 8192;    // 8 KiB

  // Prefer window._env_ when available (runtime-injected envs)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w: any = typeof window !== 'undefined' ? (window as any) : undefined;
  let from: string | null = null;
  let rawVal: any = undefined;

  if (w && w._env_ && w._env_.REACT_APP_RAW_JSON_MAX_BYTES != null) {
    from = 'window._env_';
    rawVal = w._env_.REACT_APP_RAW_JSON_MAX_BYTES;
  } else if (typeof process !== 'undefined' && (process as any).env && (process as any).env.REACT_APP_RAW_JSON_MAX_BYTES != null) {
    from = 'process.env';
    rawVal = (process as any).env.REACT_APP_RAW_JSON_MAX_BYTES;
  }

  let configured = parseEnvNumber(rawVal);
  let value = configured ?? DEFAULT;

  if (value < RAW_JSON_MIN_BYTES) {
    console.warn(`[getRawJsonMaxBytes] Configured value too low (${value}). Clamping to ${RAW_JSON_MIN_BYTES}. Source: ${from ?? 'default'}`);
    value = RAW_JSON_MIN_BYTES;
  } else if (value > RAW_JSON_MAX_BYTES) {
    console.warn(`[getRawJsonMaxBytes] Configured value too high (${value}). Clamping to ${RAW_JSON_MAX_BYTES}. Source: ${from ?? 'default'}`);
    value = RAW_JSON_MAX_BYTES;
  }

  return value;
}

/**
 * Session override helpers (per-browser tab)
 */
const RAW_JSON_OVERRIDE_SESSION_KEY = 'ui.rawJsonMaxBytes.override';

export function getRawJsonMaxBytesOverride(): number | null {
  if (typeof sessionStorage === 'undefined') return null;
  const v = sessionStorage.getItem(RAW_JSON_OVERRIDE_SESSION_KEY);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(RAW_JSON_MIN_BYTES, Math.min(RAW_JSON_MAX_BYTES, n)) : null;
}

export function setRawJsonMaxBytesOverride(val: number | null): void {
  if (typeof sessionStorage === 'undefined') return;
  if (val == null) {
    sessionStorage.removeItem(RAW_JSON_OVERRIDE_SESSION_KEY);
    return;
  }
  const clamped = Math.max(RAW_JSON_MIN_BYTES, Math.min(RAW_JSON_MAX_BYTES, Number(val)));
  sessionStorage.setItem(RAW_JSON_OVERRIDE_SESSION_KEY, String(clamped));
}

export function getEffectiveRawJsonMaxBytes(): number {
  return getRawJsonMaxBytesOverride() ?? getRawJsonMaxBytes();
}

/**
 * Returns the UTF-8 byte length of a string.
 */
export function byteLengthUtf8(str: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str).length;
  }
  // Fallback: approximate via encodeURIComponent (slightly larger but safe upper bound)
  try {
    return unescape(encodeURIComponent(str)).length;
  } catch {
    return str.length; // last-resort fallback
  }
}

/**
 * Truncate a large string to a byte limit and return a user-facing banner + content, consistent across pages.
 * The limit is clamped into [RAW_JSON_MIN_BYTES, RAW_JSON_MAX_BYTES].
 */
export function applyPreviewLimit(full: string, limit: number): string {
  const MAX_PREVIEW = Math.max(RAW_JSON_MIN_BYTES, Math.min(RAW_JSON_MAX_BYTES, Number.isFinite(limit) ? limit : RAW_JSON_MIN_BYTES));
  const totalBytes = byteLengthUtf8(full);
  if (totalBytes <= MAX_PREVIEW) {
    return `[Raw preview — limit ${MAX_PREVIEW} bytes — showing ${totalBytes} of ${totalBytes} bytes]\n\n${full}`;
  }
  // approximate truncation by substring while staying under byte limit
  let end = Math.floor(full.length * (MAX_PREVIEW / Math.max(1, totalBytes)));
  end = Math.max(0, Math.min(full.length, end));
  let cut = full.substring(0, end);
  while (byteLengthUtf8(cut) > MAX_PREVIEW && end > 0) {
    end -= Math.max(1, Math.floor(end * 0.05));
    cut = full.substring(0, end);
  }
  const shownBytes = byteLengthUtf8(cut);
  return `[Raw preview — limit ${MAX_PREVIEW} bytes — showing ${shownBytes} of ${totalBytes} bytes]\n\n${cut}\n\n[Note: Output too large – preview has been truncated.]`;
}
