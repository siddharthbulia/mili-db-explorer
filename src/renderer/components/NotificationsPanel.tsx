import React, { useEffect, useState, useMemo } from 'react';
import { X, Trash2, AlertTriangle, CheckCircle, Info, Play } from 'lucide-react';
import { useApp } from '../store';

type Category = 'all' | 'error' | 'success' | 'info';

export function NotificationsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const notifications = useApp((s) => s.notifications);
  const clearNotifications = useApp((s) => s.clearNotifications);
  const newSqlTab = useApp((s) => s.newSqlTab);
  const updateTab = useApp((s) => s.updateTab);
  const activeConnectionId = useApp((s) => s.activeConnectionId);
  const [category, setCategory] = useState<Category>('all');

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  const counts = useMemo(() => {
    return {
      all: notifications.length,
      error: notifications.filter((n) => n.kind === 'error').length,
      success: notifications.filter((n) => n.kind === 'success').length,
      info: notifications.filter((n) => n.kind === 'info').length,
    };
  }, [notifications]);

  const filtered = category === 'all'
    ? notifications
    : notifications.filter((n) => n.kind === category);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', top: 0, right: 0, height: '100%',
        width: 380, background: 'var(--surface-base)',
        borderLeft: '1px solid var(--hairline-strong)',
        boxShadow: '-12px 0 30px -10px rgba(0,0,0,0.6)',
        zIndex: 150, display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 13 }}>Notifications</strong>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn-icon" onClick={clearNotifications} title="Clear all"><Trash2 size={13} /></button>
          <button className="btn-icon" onClick={onClose} title="Close"><X size={13} /></button>
        </div>
      </div>

      {/* Category tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--hairline)', padding: '0 4px' }}>
        {(['all', 'error', 'success', 'info'] as Category[]).map((c) => {
          const active = category === c;
          const color = c === 'error' ? 'var(--danger)' : c === 'success' ? 'var(--success)' : c === 'info' ? 'var(--info)' : 'var(--ink-2)';
          return (
            <button
              key={c}
              onClick={() => setCategory(c)}
              style={{
                flex: 1,
                padding: '8px 6px',
                background: 'transparent',
                border: 0,
                borderBottom: `2px solid ${active ? color : 'transparent'}`,
                color: active ? color : 'var(--ink-3)',
                fontSize: 11.5,
                fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                cursor: 'pointer',
              }}
            >
              {c} {counts[c] > 0 && <span style={{ color: 'var(--ink-4)' }}>· {counts[c]}</span>}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 6 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 24, color: 'var(--ink-3)', textAlign: 'center', fontSize: 13 }}>
            No notifications.
          </div>
        ) : filtered.map((n) => {
          const Icon = n.kind === 'error' ? AlertTriangle : n.kind === 'success' ? CheckCircle : Info;
          const color = n.kind === 'error' ? 'var(--danger)' : n.kind === 'success' ? 'var(--success)' : 'var(--info)';
          // v2 click-to-rerun: if the message contains SQL-looking text after
          // "SQL:" or "Query:" we expose a re-run button.
          const sql = extractSql(n.message);
          return (
            <div key={n.ts} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--hairline)' }}>
              <Icon size={14} style={{ flexShrink: 0, marginTop: 2, color }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--ink)', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{n.message}</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 4, fontFamily: 'var(--font-mono)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{new Date(n.ts).toLocaleTimeString()}</span>
                  {sql && (
                    <button
                      className="btn-icon"
                      title="Open this SQL in a new tab"
                      onClick={() => {
                        const id = newSqlTab(activeConnectionId);
                        if (id) updateTab(id, { sql, title: 'Re-run from notification' } as any);
                        onClose();
                      }}
                      style={{ padding: 2 }}
                    >
                      <Play size={10} /> Open
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Best-effort SQL extraction from a toast message — looks for the substring
 * after "SQL:" or after a backtick code-fence. Returns null when nothing looks
 * like SQL, so the Open button stays hidden for ordinary messages.
 */
function extractSql(msg: string): string | null {
  if (!msg) return null;
  const tagMatch = msg.match(/(?:SQL|Query):\s*([\s\S]+)$/i);
  if (tagMatch) return tagMatch[1].trim();
  const tickMatch = msg.match(/`([^`]{8,})`/);
  if (tickMatch && /\b(select|insert|update|delete|with|create|alter|drop)\b/i.test(tickMatch[1])) {
    return tickMatch[1];
  }
  return null;
}
