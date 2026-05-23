import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/** Inline changelog. Versions are listed newest-first. */
const CHANGELOG = [
  {
    version: '1.2.1',
    date: '2026-05-23',
    changes: [
      'Operate panel: drop-index button per row (Indexes view)',
      'Maintenance: SET SESSION READ ONLY / READ WRITE buttons',
      'SQL editor: "Wrap in COUNT(*)" + create VIEW / MATERIALIZED VIEW from current query',
      'Result grid: aggregate footer (sum/avg/min/max/distinct/nulls) for selected column',
      'Result grid: double-click column resizer to auto-fit',
      'Welcome screen: sample queries (schemas / size / sessions / db size)',
      'Schema tree: right-click schema for refresh / pin / new / drop CASCADE',
      'Schema tree: toggle for pg_catalog & information_schema',
      'Quick switcher: ⌘; (in addition to ⌘P and ⌘K)',
      'Import CSV/TSV modal — column mapping, single-transaction inserts',
      'Pinned schemas (right-click a schema → Pin)',
      'Per-connection default schema + Read-only mode toggle',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-05-23',
    changes: [
      'New "Operate" tab — sessions, locks, storage, indexes, maintenance',
      'pg_stat_activity panel with pg_cancel_backend / pg_terminate_backend buttons',
      'Top tables by total size with dead-row counts and last-vacuum timestamps',
      'Index scan-count view (zero-scan = candidate to drop)',
      'VACUUM ANALYZE / ANALYZE / CHECKPOINT one-click actions',
      'DDL flows: add/drop/rename columns, create indexes, create/drop schemas',
      'Structure tab: per-column actions (rename, change type, set/drop default, NOT NULL)',
      'Settings: accent color picker, line numbers, word wrap, tab size',
      'Keyboard cheatsheet (⌘/)',
      'About modal with platform info',
      'Notifications panel (bell icon) keeps last 50 toasts',
      'Connection URL import / export (postgres://… ↔ form fields)',
      'Pro gate removed from file export and row editing',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-05-21',
    changes: [
      'Right-side Cell Inspector — column type, value editor, distinct-values picker',
      'Connection breadcrumb header (LOCAL · pg17 · host · db · schema.table)',
      'Per-row right-click context menu (copy as TSV/CSV/JSON/INSERT/MD, clone, delete)',
      'Quick switcher ⌘P',
      'Show generated SQL modal',
      'Boolean cell editor → dropdown',
      'EMPTY string distinguished from NULL in cells',
      'Auto-refresh interval dropdown (off / 5s / 15s / 30s / 60s)',
      'Freeze first column · cell wrap toggle · find within result (⌘F)',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-05-21',
    changes: [
      'Initial release — Studio Quiet design system',
      'Schema browser, SQL editor (Monaco), inline row edit, multi-connection',
      'Foreign-key click-through, multi-column sort, per-column filters',
      'Copy / export as TSV / CSV / JSON / INSERT / Markdown',
      'Apple-signed + notarized DMG (arm64 + Intel)',
    ],
  },
];

export function ChangelogModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 640, maxHeight: '80vh' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <strong style={{ fontSize: 14 }}>Changelog</strong>
          <button className="btn-icon" onClick={onClose}><X size={14} /></button>
        </div>
        <div style={{ padding: 20, overflow: 'auto' }}>
          {CHANGELOG.map((r) => (
            <div key={r.version} style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 28, color: 'var(--accent)' }}>v{r.version}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-3)' }}>{r.date}</span>
              </div>
              <ul style={{ margin: '8px 0 0', padding: '0 0 0 18px', listStyle: 'disc' }}>
                {r.changes.map((c, i) => (
                  <li key={i} style={{ padding: '3px 0', color: 'var(--ink-2)', fontSize: 13 }}>{c}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
