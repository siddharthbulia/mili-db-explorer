import { useEffect, useState } from 'react';

/**
 * Returns the milliseconds elapsed since `startedAt` (ms epoch),
 * refreshed roughly every 80ms. Returns 0 when startedAt is null.
 */
export function useElapsedMs(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt == null) return;
    let raf = 0;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      setNow(Date.now());
      // ~12 fps is plenty for a clock readout and cheap.
      raf = window.setTimeout(tick as any, 80) as any;
    };
    tick();
    return () => {
      cancelled = true;
      if (raf) clearTimeout(raf);
    };
  }, [startedAt]);
  return startedAt == null ? 0 : Math.max(0, now - startedAt);
}

export function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)} s`;
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}
