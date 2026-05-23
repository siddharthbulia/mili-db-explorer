import React from 'react';
import { useElapsedMs, formatElapsed } from '../useElapsed';

/**
 * Indeterminate progress strip — a 2px animated bar shown only while
 * `running` is true. Use at the top of a panel to make activity unmistakable.
 */
export function ProgressBar({ running }: { running: boolean }) {
  if (!running) return null;
  return (
    <div
      aria-label="Query in progress"
      style={{
        height: 2,
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--surface-base)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '35%',
          height: '100%',
          background: 'var(--accent)',
          boxShadow: '0 0 12px var(--accent-glow)',
          animation: 'mili-progress 1.1s cubic-bezier(.4,0,.2,1) infinite',
        }}
      />
      <style>{`
        @keyframes mili-progress {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(120%); }
          100% { transform: translateX(280%); }
        }
      `}</style>
    </div>
  );
}

/**
 * Live elapsed-time badge. Pass the `startedAt` epoch (or null when idle).
 * Renders nothing when idle.
 */
export function ElapsedBadge({ startedAt, label = 'Running' }: { startedAt: number | null; label?: string }) {
  const ms = useElapsedMs(startedAt);
  if (startedAt == null) return null;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        background: 'var(--accent-tint)',
        border: '1px solid color-mix(in srgb, var(--accent) 40%, var(--hairline))',
        borderRadius: 999,
        fontFamily: 'var(--font-mono)',
        fontSize: 11.5,
        color: 'var(--accent)',
      }}
      title={`${label} — elapsed since ${new Date(startedAt).toLocaleTimeString()}`}
    >
      <span
        style={{
          width: 6, height: 6, borderRadius: 999,
          background: 'var(--accent)',
          boxShadow: '0 0 6px var(--accent-glow)',
          animation: 'mili-pulse 1.2s ease-in-out infinite',
        }}
      />
      {label} {formatElapsed(ms)}
      <style>{`@keyframes mili-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }`}</style>
    </span>
  );
}
