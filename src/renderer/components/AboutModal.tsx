import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export function AboutModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [info, setInfo] = useState<any>(null);

  useEffect(() => {
    if (!open) return;
    setInfo({
      productName: 'Mili DB Explorer',
      version: '1.1.0',
      platform: (window as any).platform || {},
    });
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open || !info) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 14 }}>About</strong>
          <button className="btn-icon" onClick={onClose}><X size={14} /></button>
        </div>
        <div style={{ padding: 22, textAlign: 'center' }}>
          <svg width="56" height="56" viewBox="0 0 64 64" fill="none" style={{ marginBottom: 12 }}>
            <rect width="64" height="64" rx="14" fill="#0B0D11"/>
            <path fill="#F5F6F8" d="M 19 44.5 L 19 19.5 L 28.75 19.5 L 32 25.5 L 35.25 19.5 L 45 19.5 L 45 44.5 L 39 44.5 L 39 30.5 L 34.5 39 L 29.5 39 L 25 30.5 L 25 44.5 Z" />
            <rect x="26.5" y="35.5" width="11" height="3.5" rx="0.5" fill="#F5A524" />
          </svg>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>
            Mili <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'var(--accent)' }}>db</span>
          </div>
          <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-3)' }}>
            v{info.version}
          </div>
          <div style={{ marginTop: 18, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>
            A native macOS Postgres client built by Mili.<br/>
            No telemetry, no cloud sync, no account required.
          </div>
          <div style={{ marginTop: 18, padding: 12, background: 'var(--surface-raised)', borderRadius: 8, textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>
            Electron {info.platform.electron} · Chrome {info.platform.chrome} · Node {info.platform.node} · {info.platform.os}
          </div>
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center', gap: 12 }}>
            <a className="btn" href="https://mili-db-explorer-mili-0175b53b.vercel.app" target="_blank" rel="noreferrer">Website</a>
            <a className="btn" href="mailto:siddharth@getmili.ai">Report a bug</a>
          </div>
        </div>
      </div>
    </div>
  );
}
