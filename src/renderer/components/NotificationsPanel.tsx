import React, { useEffect } from 'react';
import { X, Trash2, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { useApp } from '../store';

export function NotificationsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const notifications = useApp((s) => s.notifications);
  const clearNotifications = useApp((s) => s.clearNotifications);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', top: 0, right: 0, height: '100%',
        width: 360, background: 'var(--surface-base)',
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
      <div style={{ flex: 1, overflow: 'auto', padding: 6 }}>
        {notifications.length === 0 ? (
          <div style={{ padding: 24, color: 'var(--ink-3)', textAlign: 'center', fontSize: 13 }}>
            No notifications yet.
          </div>
        ) : notifications.map((n) => {
          const Icon = n.kind === 'error' ? AlertTriangle : n.kind === 'success' ? CheckCircle : Info;
          const color = n.kind === 'error' ? 'var(--danger)' : n.kind === 'success' ? 'var(--success)' : 'var(--info)';
          return (
            <div key={n.ts} style={{ display: 'flex', gap: 10, padding: '8px 10px', borderBottom: '1px solid var(--hairline)' }}>
              <Icon size={14} style={{ flexShrink: 0, marginTop: 2, color }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--ink)', overflowWrap: 'anywhere' }}>{n.message}</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                  {new Date(n.ts).toLocaleTimeString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
