import React, { useState } from 'react';
import { v4 as uuid } from 'uuid';
import { X } from 'lucide-react';
import { useApp } from '../store';
import { api } from '../ipc';
import type { ConnectionConfig } from '../../shared/types';

export function ConnectionForm() {
  const showConnectionForm = useApp((s) => s.showConnectionForm);
  const setConnectionForm = useApp((s) => s.setConnectionForm);
  const refreshConnections = useApp((s) => s.refreshConnections);
  const showToast = useApp((s) => s.showToast);

  const initial: ConnectionConfig =
    showConnectionForm === 'new' || !showConnectionForm
      ? {
          id: uuid(),
          name: 'New Connection',
          host: 'localhost',
          port: 5432,
          database: 'postgres',
          user: 'postgres',
          password: '',
          ssl: 'disable',
          createdAt: Date.now(),
        }
      : (showConnectionForm as ConnectionConfig);

  const [form, setForm] = useState<ConnectionConfig>(initial);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [urlInput, setUrlInput] = useState('');

  if (!showConnectionForm) return null;

  function applyUrl() {
    try {
      const u = new URL(urlInput.trim());
      if (!/^postgres(ql)?:$/.test(u.protocol)) {
        showToast('error', 'Expected a postgres:// URL');
        return;
      }
      setForm((f) => ({
        ...f,
        host: u.hostname || f.host,
        port: u.port ? Number(u.port) : f.port,
        database: (u.pathname || '/').slice(1) || f.database,
        user: decodeURIComponent(u.username || f.user),
        password: u.password ? decodeURIComponent(u.password) : f.password,
        ssl: (u.searchParams.get('sslmode') === 'require' || u.searchParams.get('ssl') === 'true')
          ? 'require' : f.ssl,
        name: f.name === 'New Connection' && u.hostname ? u.hostname : f.name,
      }));
      setUrlInput('');
      showToast('success', 'Parsed URL into fields');
    } catch (e: any) {
      showToast('error', 'Invalid URL: ' + (e?.message || String(e)));
    }
  }

  function copyAsUrl() {
    const usr = encodeURIComponent(form.user || '');
    const pw = form.password ? `:${encodeURIComponent(form.password)}` : '';
    const sslArg = form.ssl === 'require' || form.ssl === 'verify-full' ? '?sslmode=require' : '';
    const url = `postgresql://${usr}${pw}@${form.host}:${form.port}/${form.database}${sslArg}`;
    navigator.clipboard.writeText(url);
    showToast('success', 'Connection URL copied');
  }

  function update<K extends keyof ConnectionConfig>(k: K, v: ConnectionConfig[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleTest() {
    setTesting(true);
    try {
      const r = await api.testConnection(form);
      if (r.ok) showToast('success', `Connected — ${r.serverVersion?.split(' ').slice(0, 2).join(' ') || 'ok'}`);
      else showToast('error', r.error || 'Failed');
    } catch (e: any) {
      showToast('error', e?.message || String(e));
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.saveConnection(form);
      await refreshConnections();
      setConnectionForm(null);
      showToast('success', 'Saved');
    } catch (e: any) {
      showToast('error', e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => setConnectionForm(null)}>
      <div className="modal" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, flex: 1 }}>
            {showConnectionForm === 'new' ? 'New connection' : 'Edit connection'}
          </h2>
          <button className="btn-icon" onClick={() => setConnectionForm(null)}><X size={14} /></button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ padding: 10, background: 'var(--surface-raised)', border: '1px dashed var(--hairline-strong)', borderRadius: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              className="input-sm"
              style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11.5 }}
              placeholder="Paste postgres://user:pass@host:5432/db?sslmode=require"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applyUrl(); }}
            />
            <button className="btn" onClick={applyUrl} disabled={!urlInput}>Parse</button>
            <button className="btn" onClick={copyAsUrl} title="Copy current values as a postgres:// URL">Copy URL</button>
          </div>
          <Field label="Name">
            <input value={form.name} onChange={(e) => update('name', e.target.value)} />
          </Field>
          <Field label="Host">
            <input value={form.host} onChange={(e) => update('host', e.target.value)} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Port">
              <input
                type="number"
                value={form.port}
                onChange={(e) => update('port', parseInt(e.target.value || '5432', 10))}
              />
            </Field>
            <Field label="Database">
              <input value={form.database} onChange={(e) => update('database', e.target.value)} />
            </Field>
          </div>
          <Field label="User">
            <input value={form.user} onChange={(e) => update('user', e.target.value)} />
          </Field>
          <Field label="Password">
            <input
              type="password"
              value={form.password || ''}
              onChange={(e) => update('password', e.target.value)}
              placeholder="Leave empty if none"
              autoComplete="new-password"
            />
          </Field>
          <Field label="SSL">
            <select value={form.ssl} onChange={(e) => update('ssl', e.target.value as any)}>
              <option value="disable">Disable</option>
              <option value="require">Require</option>
              <option value="verify-full">Verify-full</option>
            </select>
          </Field>
          <Field label="Color">
            <input
              type="color"
              value={form.color || '#4c8bf5'}
              onChange={(e) => update('color', e.target.value)}
              style={{ width: 60, height: 30, padding: 0 }}
            />
          </Field>
          <Field label="Default schema (search_path)">
            <input
              value={form.defaultSchema || ''}
              onChange={(e) => update('defaultSchema', e.target.value)}
              placeholder="public"
            />
          </Field>
          <Field label="Open read-only sessions">
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-2)' }}>
              <input
                type="checkbox"
                checked={!!form.readOnly}
                onChange={(e) => update('readOnly', e.target.checked)}
                style={{ width: 16 }}
              />
              Prevent any DDL / writes by default
            </label>
          </Field>
        </div>
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={handleTest} disabled={testing}>
            {testing && <span className="spinner" />} Test
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={() => setConnectionForm(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving && <span className="spinner" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: any) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-secondary)', textTransform: 'uppercase', letterSpacing: 0.04 }}>{label}</span>
      {children}
    </label>
  );
}
