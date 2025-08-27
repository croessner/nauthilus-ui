import React from 'react';

/**
 * Hook to persist a refresh interval in sessionStorage and periodically call the provided callback.
 * - Persists the interval under the given sessionKey.
 * - Immediately invokes the callback on mount/change.
 * - Skips ticks when document is not visible (to avoid background work).
 */
export function usePersistedAutoRefresh(
  callback: () => void | Promise<void>,
  sessionKey: string,
  defaultMs: number = 5000
): [number, React.Dispatch<React.SetStateAction<number>>] {
  const [refreshMs, setRefreshMs] = React.useState<number>(() => {
    try {
      const v = typeof window !== 'undefined' ? window.sessionStorage.getItem(sessionKey) : null;
      const n = v ? parseInt(v, 10) : NaN;
      // Accept 0 as a valid value (OFF). Use default only if NaN or negative.
      return Number.isFinite(n) && n >= 0 ? n : defaultMs;
    } catch {
      return defaultMs;
    }
  });

  React.useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(sessionKey, String(refreshMs));
      }
    } catch {}
  }, [refreshMs, sessionKey]);

  React.useEffect(() => {
    // initial invocation
    void callback();
    // When refreshMs <= 0, treat as OFF: no interval ticks.
    if (refreshMs <= 0) {
      return;
    }
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void callback();
    }, refreshMs);
    return () => clearInterval(id);
  }, [callback, refreshMs]);

  return [refreshMs, setRefreshMs];
}
