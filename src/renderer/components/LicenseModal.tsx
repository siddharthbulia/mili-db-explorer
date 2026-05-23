import React, { useState } from 'react';
import { X, Crown, Check } from 'lucide-react';
import { useApp } from '../store';
import { api } from '../ipc';

const BUY_URL = 'https://getmili.ai/db-explorer/buy';

export function LicenseModal() {
  const setShowLicenseModal = useApp((s) => s.setShowLicenseModal);
  const license = useApp((s) => s.license);
  const activate = useApp((s) => s.activateLicense);
  const refreshLicense = useApp((s) => s.refreshLicense);
  const showToast = useApp((s) => s.showToast);

  const [email, setEmail] = useState(license.email || '');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleActivate() {
    setBusy(true);
    try {
      const r = await activate(key, email);
      if (r.ok) {
        showToast('success', 'Pro activated. Thank you!');
        setShowLicenseModal(false);
      } else {
        showToast('error', r.error || 'Invalid key');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivate() {
    await api.deactivateLicense();
    refreshLicense();
    showToast('info', 'License removed');
  }

  return (
    <div className="modal-backdrop" onClick={() => setShowLicenseModal(false)}>
      <div className="modal" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>
          <Crown size={16} color="var(--warn)" />
          <h2 style={{ margin: 0, marginLeft: 8, fontSize: 15, fontWeight: 600, flex: 1 }}>
            {license.status === 'pro' ? 'Pro license' : 'Upgrade to Pro'}
          </h2>
          <button className="btn-icon" onClick={() => setShowLicenseModal(false)}><X size={14} /></button>
        </div>

        {license.status === 'pro' ? (
          <div style={{ padding: 20 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              <Check size={14} style={{ color: 'var(--success)', display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
              Pro is active
            </div>
            <div style={{ color: 'var(--fg-secondary)', fontSize: 13 }}>
              <div>Email: <code>{license.email}</code></div>
              <div>Key: <code>{license.key}</code></div>
            </div>
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={handleDeactivate}>Remove license</button>
            </div>
          </div>
        ) : (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'var(--bg-secondary)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Pro unlocks</div>
              <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--fg-secondary)', fontSize: 13, lineHeight: 1.65 }}>
                <li>Unlimited saved connections</li>
                <li>Unlimited query tabs</li>
                <li>Edit table rows (insert / update / delete)</li>
                <li>Export query results to CSV / JSON</li>
                <li>SSH tunnel support</li>
                <li>Priority email support</li>
              </ul>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => api.openExternal(BUY_URL)}
              >
                <Crown size={14} /> Buy Pro — $49/yr
              </button>
              <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}>or $99 lifetime</div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Already have a key? Activate:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <input
                  placeholder="PRO-XXXXXXXXXXXX-XXXX"
                  value={key}
                  onChange={(e) => setKey(e.target.value.toUpperCase())}
                  style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}
                />
                <button className="btn btn-primary" onClick={handleActivate} disabled={busy || !email || !key}>
                  {busy && <span className="spinner" />} Activate
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
