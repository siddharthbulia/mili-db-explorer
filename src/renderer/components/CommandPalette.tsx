import React, { useState, useMemo } from 'react';
import { useApp } from '../store';
import { api } from '../ipc';
import { Search } from 'lucide-react';

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  action: () => void;
}

export function CommandPalette() {
  const setShowCommandPalette = useApp((s) => s.setShowCommandPalette);
  const setShowSettings = useApp((s) => s.setShowSettings);
  const setShowLicenseModal = useApp((s) => s.setShowLicenseModal);
  const setConnectionForm = useApp((s) => s.setConnectionForm);
  const connections = useApp((s) => s.connections);
  const openConnections = useApp((s) => s.openConnections);
  const activeConnectionId = useApp((s) => s.activeConnectionId);
  const openConnection = useApp((s) => s.openConnection);
  const newSqlTab = useApp((s) => s.newSqlTab);
  const schemas = useApp((s) => s.schemasByConnection);
  const openTableTab = useApp((s) => s.openTableTab);
  const setSettings = useApp((s) => s.setSettings);
  const settings = useApp((s) => s.settings);
  const showToast = useApp((s) => s.showToast);

  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);

  const close = () => setShowCommandPalette(false);

  const cmds = useMemo<Cmd[]>(() => {
    const list: Cmd[] = [
      { id: 'new-conn', label: 'New connection…', hint: '⌘N', action: () => { setConnectionForm('new'); close(); } },
      { id: 'new-sql', label: 'New SQL tab', hint: '⌘T', action: () => { newSqlTab(activeConnectionId); close(); } },
      { id: 'operate', label: 'Open Operate panel', hint: 'sessions · locks · storage', action: () => {
        if (activeConnectionId) useApp.getState().openOperateTab(activeConnectionId);
        close();
      } },
      { id: 'keymap', label: 'Show keyboard shortcuts', hint: '⌘/', action: () => { window.dispatchEvent(new CustomEvent('mili:show-keymap')); close(); } },
      { id: 'about', label: 'About Mili DB Explorer', action: () => { window.dispatchEvent(new CustomEvent('mili:show-about')); close(); } },
      { id: 'changelog', label: 'Show changelog', action: () => { window.dispatchEvent(new CustomEvent('mili:show-changelog')); close(); } },
      { id: 'settings', label: 'Open settings', action: () => { setShowSettings(true); close(); } },
      { id: 'license', label: 'License & Pro upgrade', action: () => { setShowLicenseModal(true); close(); } },
      { id: 'reload-schemas', label: 'Reload schema tree', action: () => {
        if (activeConnectionId) useApp.getState().loadSchemas(activeConnectionId, true);
        close();
      } },
      { id: 'theme-light', label: 'Theme: Light', action: () => { setSettings({ theme: 'light' }); close(); } },
      { id: 'theme-dark', label: 'Theme: Dark', action: () => { setSettings({ theme: 'dark' }); close(); } },
      { id: 'theme-system', label: 'Theme: System', action: () => { setSettings({ theme: 'system' }); close(); } },
    ];
    for (const c of connections) {
      list.push({
        id: `conn-${c.id}`,
        label: `Connect: ${c.name}`,
        hint: `${c.host}/${c.database}`,
        action: async () => {
          close();
          if (!openConnections.has(c.id)) {
            const r = await openConnection(c.id);
            if (!r.ok) showToast('error', r.error || 'Failed');
          } else {
            useApp.getState().setActiveConnection(c.id);
          }
        },
      });
    }
    if (activeConnectionId && schemas[activeConnectionId]) {
      for (const s of schemas[activeConnectionId]) {
        for (const t of [...s.tables, ...s.views, ...s.matViews]) {
          list.push({
            id: `tbl-${s.schema}-${t.name}`,
            label: `${s.schema}.${t.name}`,
            hint: t.kind === 'v' ? 'view' : t.kind === 'm' ? 'matview' : 'table',
            action: () => { openTableTab(activeConnectionId, s.schema, t.name, 'data'); close(); },
          });
        }
      }
    }
    return list;
  }, [connections, openConnections, activeConnectionId, schemas, settings]);

  const filtered = useMemo(() => {
    if (!q) return cmds.slice(0, 50);
    const ql = q.toLowerCase();
    return cmds
      .filter((c) => c.label.toLowerCase().includes(ql) || (c.hint || '').toLowerCase().includes(ql))
      .slice(0, 50);
  }, [cmds, q]);

  React.useEffect(() => { setIdx(0); }, [q]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { setIdx((i) => Math.min(i + 1, filtered.length - 1)); e.preventDefault(); }
    if (e.key === 'ArrowUp') { setIdx((i) => Math.max(i - 1, 0)); e.preventDefault(); }
    if (e.key === 'Enter') { filtered[idx]?.action(); e.preventDefault(); }
  }

  return (
    <div className="modal-backdrop" onClick={close} style={{ alignItems: 'flex-start', paddingTop: '12vh' }}>
      <div className="modal" style={{ width: 560 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Search size={14} color="var(--fg-muted)" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Type a command, table, or connection…"
            style={{ flex: 1, border: 'none', background: 'transparent', boxShadow: 'none', padding: 4, fontSize: 14 }}
          />
        </div>
        <div style={{ maxHeight: 420, overflow: 'auto', padding: 4 }}>
          {filtered.length === 0 && <div style={{ padding: 12, color: 'var(--fg-muted)' }}>No matches.</div>}
          {filtered.map((c, i) => (
            <div
              key={c.id}
              onMouseEnter={() => setIdx(i)}
              onClick={c.action}
              style={{
                padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                background: i === idx ? 'var(--bg-hover)' : 'transparent',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <span style={{ flex: 1 }}>{c.label}</span>
              {c.hint && <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{c.hint}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
