import React, { useEffect } from 'react';
import { useApp } from './store';
import { Sidebar } from './components/Sidebar';
import { TabBar } from './components/TabBar';
import { WorkArea } from './components/WorkArea';
import { ConnectionForm } from './components/ConnectionForm';
import { SettingsModal } from './components/SettingsModal';
import { CommandPalette } from './components/CommandPalette';
import { LicenseModal } from './components/LicenseModal';
import { Toast } from './components/Toast';
import { KeymapModal, useKeymapModal } from './components/KeymapModal';
import { AboutModal } from './components/AboutModal';
import { NotificationsPanel } from './components/NotificationsPanel';
import { ChangelogModal } from './components/ChangelogModal';
import { Bell } from 'lucide-react';

export default function App() {
  const init = useApp((s) => s.init);
  const route = useApp((s) => s.route);
  const connections = useApp((s) => s.connections);
  const serverVersions = useApp((s) => s.serverVersions);
  const tabs = useApp((s) => s.tabs);
  const activeTabId = useApp((s) => s.activeTabId);
  const setActiveTab = useApp((s) => s.setActiveTab);
  const closeTab = useApp((s) => s.closeTab);
  const reopenLastClosedTab = useApp((s) => s.reopenLastClosedTab);
  const duplicateActiveTab = useApp((s) => s.duplicateActiveTab);
  const newSqlTab = useApp((s) => s.newSqlTab);
  const showConnectionForm = useApp((s) => s.showConnectionForm);
  const showSettings = useApp((s) => s.showSettings);
  const showCommandPalette = useApp((s) => s.showCommandPalette);
  const showLicenseModal = useApp((s) => s.showLicenseModal);
  const setShowCommandPalette = useApp((s) => s.setShowCommandPalette);
  const keymap = useKeymapModal();
  const [aboutOpen, setAboutOpen] = React.useState(false);
  const [changelogOpen, setChangelogOpen] = React.useState(false);
  const [notifsOpen, setNotifsOpen] = React.useState(false);
  const notificationsCount = useApp((s) => s.notifications.length);

  // Listen for "show about" event from menu / palette.
  React.useEffect(() => {
    const a = () => setAboutOpen(true);
    const c = () => setChangelogOpen(true);
    window.addEventListener('mili:show-about', a);
    window.addEventListener('mili:show-changelog', c);
    return () => {
      window.removeEventListener('mili:show-about', a);
      window.removeEventListener('mili:show-changelog', c);
    };
  }, []);

  const workspaceConn = route.kind === 'connection'
    ? connections.find((c) => c.id === route.connectionId)
    : null;

  useEffect(() => {
    init();
  }, [init]);

  // Keep the OS window title and document title in sync with the workspace.
  useEffect(() => {
    if (workspaceConn) {
      document.title = `${workspaceConn.name} — ${workspaceConn.database}`;
    } else {
      document.title = 'Mili DB Explorer';
    }
  }, [workspaceConn]);

  // Persist open tabs to localStorage (per-window route).
  useEffect(() => {
    const key = 'mili.tabs.' + (route.kind === 'connection' ? route.connectionId : 'home');
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length && tabs.length === 0) {
          useApp.setState({ tabs: parsed, activeTabId: parsed[parsed.length - 1]?.id || null });
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  useEffect(() => {
    const key = 'mili.tabs.' + (route.kind === 'connection' ? route.connectionId : 'home');
    // Strip transient state from saved tabs.
    const slim = tabs.map((t) => {
      if (t.kind === 'sql') return { ...t, running: false, runningQueryId: undefined, results: [], error: undefined };
      return t;
    });
    try { localStorage.setItem(key, JSON.stringify(slim)); } catch {}
  }, [tabs, route]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && (e.key === 'k' || e.key === 'p' || e.key === ';')) {
        e.preventDefault();
        setShowCommandPalette(true);
        return;
      }
      if (cmd && e.key === 'w') {
        e.preventDefault();
        if (activeTabId) closeTab(activeTabId);
        return;
      }
      if (cmd && e.shiftKey && (e.key === 'T' || e.key === 't')) {
        e.preventDefault();
        reopenLastClosedTab();
        return;
      }
      if (cmd && (e.key === 't' || e.key === 'T') && !e.shiftKey) {
        e.preventDefault();
        const connId = workspaceConn?.id || useApp.getState().activeConnectionId;
        newSqlTab(connId);
        return;
      }
      if (cmd && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        duplicateActiveTab();
        return;
      }
      if (cmd && /^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        const t = tabs[idx];
        if (t) { e.preventDefault(); setActiveTab(t.id); }
        return;
      }
      if (cmd && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('mili:refresh-table'));
        return;
      }
      if (cmd && e.key === 'Backspace') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('mili:delete-selected'));
        return;
      }
      if (cmd && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('mili:focus-sidebar-search'));
        return;
      }
      if (e.key === 'Escape') {
        if (useApp.getState().showCommandPalette) setShowCommandPalette(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setShowCommandPalette, activeTabId, tabs, workspaceConn, closeTab, reopenLastClosedTab, duplicateActiveTab, newSqlTab, setActiveTab]);

  // Visible workspace cue: a colored bar at the top + a chip in the titlebar
  // showing exactly which DB this window is acting on.
  const accent = workspaceConn?.color || 'var(--accent)';

  return (
    <div className="h-screen w-screen flex flex-col" style={{ background: 'var(--bg-primary)', color: 'var(--fg-primary)' }}>
      {workspaceConn && (
        <div
          aria-label="Workspace connection indicator"
          style={{
            height: 4,
            background: accent,
            flexShrink: 0,
            // The bar is the strongest "what window am I in" cue — keep it on
            // top of everything, including the titlebar's translucent area.
          }}
        />
      )}
      <div
        className="titlebar flex items-center"
        style={{
          height: 40,
          paddingLeft: window.platform?.os === 'darwin' ? 80 : 12,
          paddingRight: 12,
          background: workspaceConn ? `color-mix(in srgb, ${accent} 8%, var(--bg-secondary))` : undefined,
          borderBottom: workspaceConn ? `1px solid color-mix(in srgb, ${accent} 30%, var(--border))` : undefined,
        }}
      >
        <div className="flex items-center gap-2.5 flex-1">
          {/* Studio Quiet mark — matches brand/mark.svg */}
          <svg width="20" height="20" viewBox="0 0 64 64" fill="none" style={{ flexShrink: 0 }}>
            <path
              fill="var(--ink)"
              d="M 19 44.5 L 19 19.5 L 28.75 19.5 L 32 25.5 L 35.25 19.5 L 45 19.5 L 45 44.5 L 39 44.5 L 39 30.5 L 34.5 39 L 29.5 39 L 25 30.5 L 25 44.5 Z"
            />
            <rect x="26.5" y="35.5" width="11" height="3.5" rx="0.5" fill="var(--accent)" />
          </svg>
          <div style={{ fontWeight: 500, fontSize: 13, letterSpacing: '-0.005em' }}>
            Mili <span style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              color: 'var(--accent)',
              fontWeight: 400,
              paddingLeft: 1,
            }}>db</span>
          </div>
          {workspaceConn && (
            <div
              title={`${workspaceConn.user}@${workspaceConn.host}:${workspaceConn.port}/${workspaceConn.database}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 10px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                color: accent,
                background: `color-mix(in srgb, ${accent} 14%, transparent)`,
                border: `1px solid color-mix(in srgb, ${accent} 35%, var(--border))`,
                marginLeft: 4,
              }}
            >
              <span
                style={{
                  width: 8, height: 8, borderRadius: 999,
                  background: accent, display: 'inline-block', boxShadow: `0 0 0 2px color-mix(in srgb, ${accent} 25%, transparent)`,
                }}
              />
              {workspaceConn.name}
              <span style={{ color: 'var(--fg-muted)', fontWeight: 500 }}>· {workspaceConn.database}</span>
            </div>
          )}
          {workspaceConn && serverVersions[workspaceConn.id] && (
            <code
              title={serverVersions[workspaceConn.id]}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10.5,
                color: 'var(--ink-3)',
                padding: '2px 8px',
                background: 'var(--surface-raised)',
                border: '1px solid var(--hairline)',
                borderRadius: 4,
                marginLeft: 4,
              }}
            >
              {extractPgVersion(serverVersions[workspaceConn.id])}
            </code>
          )}
          {workspaceConn && (
            <LatencyChip connId={workspaceConn.id} />
          )}
          <TabBar />
          <button
            className="btn-icon"
            onClick={() => setNotifsOpen(true)}
            title="Notifications"
            style={{ marginLeft: 6, position: 'relative' }}
          >
            <Bell size={14} />
            {notificationsCount > 0 && (
              <span style={{
                position: 'absolute', top: -3, right: -3,
                background: 'var(--accent)', color: 'var(--surface-deep)',
                fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)',
                padding: '0 4px', borderRadius: 999, minWidth: 14, textAlign: 'center',
              }}>{notificationsCount > 9 ? '9+' : notificationsCount}</span>
            )}
          </button>
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <WorkArea />
      </div>

      <LatencyMonitor />

      {showConnectionForm && <ConnectionForm />}
      {showSettings && <SettingsModal />}
      {showCommandPalette && <CommandPalette />}
      {showLicenseModal && <LicenseModal />}
      <KeymapModal open={keymap.open} onClose={() => keymap.setOpen(false)} />
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <NotificationsPanel open={notifsOpen} onClose={() => setNotifsOpen(false)} />
      <ChangelogModal open={changelogOpen} onClose={() => setChangelogOpen(false)} />
      <Toast />
    </div>
  );
}

/** Extract "PostgreSQL 16.2" out of the long "select version()" string. */
function extractPgVersion(s: string): string {
  const m = /PostgreSQL\s+([0-9]+(?:\.[0-9]+)*)/i.exec(s);
  return m ? `pg ${m[1]}` : s.split(' ').slice(0, 2).join(' ');
}

/**
 * Background ping for the active workspace connection. Updates the latency
 * map on the store every ~6 seconds. Cheap: it's a `SELECT 1`.
 */
function LatencyChip({ connId }: { connId: string }) {
  const ping = useApp((s) => s.latencies[connId]);
  const pid = useApp((s) => s.backendPids[connId]);
  if (ping == null) return null;
  const color = ping < 50 ? 'var(--success)' : ping < 200 ? 'var(--warning)' : 'var(--danger)';
  return (
    <span
      title={`Server ping ${ping} ms · backend PID ${pid ?? '?'}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontFamily: 'var(--font-mono)', fontSize: 10.5,
        color: 'var(--ink-3)',
        padding: '2px 8px',
        background: 'var(--surface-raised)',
        border: '1px solid var(--hairline)',
        borderRadius: 4,
        marginLeft: 4,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color }} />
      {ping} ms
      {pid != null && <span style={{ color: 'var(--ink-4)' }}>· pid {pid}</span>}
    </span>
  );
}

function LatencyMonitor() {
  const route = useApp((s) => s.route);
  const openConnections = useApp((s) => s.openConnections);
  useEffect(() => {
    if (route.kind !== 'connection') return;
    const id = route.connectionId;
    if (!openConnections.has(id)) return;
    let alive = true;
    async function tick() {
      const t0 = performance.now();
      try {
        // Fetch ping + backend pid in one round-trip.
        const r = await (window as any).api.runQuery(id, 'select pg_backend_pid()');
        const dt = performance.now() - t0;
        const pid = r?.ok && r.results[0]?.rows[0]?.[0];
        if (alive) {
          useApp.setState((s) => ({
            latencies: { ...s.latencies, [id]: Math.round(dt) },
            backendPids: { ...(s as any).backendPids, [id]: pid },
          } as any));
        }
      } catch {/* ignore */}
    }
    tick();
    const h = setInterval(tick, 6000);
    return () => { alive = false; clearInterval(h); };
  }, [route, openConnections]);
  return null;
}
