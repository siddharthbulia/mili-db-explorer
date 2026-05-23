import React, { useState } from 'react';
import {
  Database, Plus, Server, Settings as SettingsIcon, Crown, KeyRound,
  ChevronRight, ChevronDown, Table2, Eye, FunctionSquare, ListOrdered, RefreshCw,
  X, X as XIcon, Pencil, Trash2, Search, Wrench, HelpCircle,
} from 'lucide-react';
import { useApp } from '../store';
import { api } from '../ipc';
import { SchemaTree } from './SchemaTree';

export function Sidebar() {
  const route = useApp((s) => s.route);
  const connections = useApp((s) => s.connections);
  const openConnections = useApp((s) => s.openConnections);
  const activeConnectionId = useApp((s) => s.activeConnectionId);
  const setActiveConnection = useApp((s) => s.setActiveConnection);
  const openConnection = useApp((s) => s.openConnection);
  const closeConnection = useApp((s) => s.closeConnection);
  const refreshConnections = useApp((s) => s.refreshConnections);
  const loadSchemas = useApp((s) => s.loadSchemas);
  const showToast = useApp((s) => s.showToast);
  const setConnectionForm = useApp((s) => s.setConnectionForm);
  const setShowSettings = useApp((s) => s.setShowSettings);
  const setShowLicenseModal = useApp((s) => s.setShowLicenseModal);
  const license = useApp((s) => s.license);

  const isWorkspace = route.kind === 'connection';
  const lockedId = isWorkspace ? route.connectionId : null;
  // In workspace mode, only ever show the locked connection.
  const visibleConnections = lockedId
    ? connections.filter((c) => c.id === lockedId)
    : connections;

  const [width, setWidth] = useState(280);
  const [search, setSearch] = useState('');

  React.useEffect(() => {
    refreshConnections();
  }, [refreshConnections]);

  React.useEffect(() => {
    const focusHandler = () => {
      const el = (window as any).__sidebarSearchEl as HTMLInputElement | null;
      el?.focus(); el?.select?.();
    };
    window.addEventListener('mili:focus-sidebar-search', focusHandler);
    return () => window.removeEventListener('mili:focus-sidebar-search', focusHandler);
  }, []);

  function startResize(e: React.MouseEvent) {
    const startX = e.clientX;
    const startW = width;
    const onMove = (e: MouseEvent) => {
      setWidth(Math.max(200, Math.min(500, startW + (e.clientX - startX))));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  async function handleConnect(id: string) {
    // Home window: open a separate workspace window for this connection so the
    // user can never confuse two databases. Workspace window: just connect.
    if (!isWorkspace) {
      await api.openConnectionWindow(id);
      return;
    }
    const r = await openConnection(id);
    if (!r.ok) showToast('error', r.error || 'Failed to connect');
    else showToast('success', 'Connected');
  }

  async function handleDisconnect(id: string) {
    await closeConnection(id);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this connection?')) return;
    await api.deleteConnection(id);
    refreshConnections();
  }

  return (
    <div className="flex" style={{ borderRight: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
      <div style={{ width, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ padding: '12px 8px 6px', display: 'flex', alignItems: 'center', gap: 4 }}>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--ink-4)',
              flex: 1,
              paddingLeft: 6,
              fontFamily: 'var(--font-ui)',
            }}
          >
            Connections
          </div>
          <button className="btn-icon" title="New connection" onClick={() => setConnectionForm('new')}>
            <Plus size={14} />
          </button>
          <button className="btn-icon" title="Refresh" onClick={refreshConnections}>
            <RefreshCw size={14} />
          </button>
        </div>

        <div style={{ padding: '0 8px 6px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: 8, top: 7, color: 'var(--fg-muted)' }} />
            <input
              ref={(el) => {
                // Stable handler reference: window listener focuses this on Cmd+L
                (window as any).__sidebarSearchEl = el;
              }}
              className="input-sm"
              style={{ width: '100%', paddingLeft: 26 }}
              placeholder="Search... (⌘L)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <FavoritesAndRecents isWorkspaceMode={isWorkspace} />


        <div style={{ overflow: 'auto', flex: 1, paddingBottom: 8 }}>
          {connections.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--fg-muted)' }}>
              No connections yet.
              <div style={{ marginTop: 8 }}>
                <button className="btn btn-primary" onClick={() => setConnectionForm('new')}>
                  <Plus size={12} /> Add connection
                </button>
              </div>
            </div>
          )}
          {visibleConnections
            .filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.database.toLowerCase().includes(search.toLowerCase()))
            .map((c) => (
              <ConnectionItem
                key={c.id}
                conn={c}
                isOpen={openConnections.has(c.id)}
                isActive={activeConnectionId === c.id}
                isWorkspaceMode={isWorkspace}
                onConnect={() => handleConnect(c.id)}
                onDisconnect={() => handleDisconnect(c.id)}
                onEdit={() => setConnectionForm(c)}
                onDelete={() => handleDelete(c.id)}
                onSelect={() => setActiveConnection(c.id)}
                onRefresh={() => loadSchemas(c.id, true)}
              />
          ))}
        </div>

        {isWorkspace && activeConnectionId && openConnections.has(activeConnectionId) && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '6px 8px', display: 'flex', gap: 4 }}>
            <button
              className="btn-ghost"
              style={{ padding: '4px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, flex: 1, fontSize: 12 }}
              onClick={() => useApp.getState().openOperateTab(activeConnectionId)}
              title="Sessions / locks / storage / vacuum"
            >
              <Wrench size={13} /> Operate
            </button>
          </div>
        )}
        <div style={{ borderTop: '1px solid var(--border)', padding: 8, display: 'flex', gap: 4 }}>
          <button
            className="btn-ghost"
            style={{ padding: '4px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}
            onClick={() => setShowLicenseModal(true)}
            title={license.status === 'pro' ? 'Pro license active' : 'Activate Pro'}
          >
            {license.status === 'pro' ? <Crown size={14} color="var(--warn)" /> : <KeyRound size={14} />}
            <span style={{ fontSize: 12 }}>{license.status === 'pro' ? 'Pro' : 'Free — Upgrade'}</span>
          </button>
          <button
            className="btn-icon"
            title="Keyboard shortcuts (⌘/)"
            onClick={() => window.dispatchEvent(new CustomEvent('mili:show-keymap'))}
          >
            <HelpCircle size={14} />
          </button>
          <button className="btn-icon" title="Settings" onClick={() => setShowSettings(true)}>
            <SettingsIcon size={14} />
          </button>
        </div>
      </div>
      <div className="split-handle" onMouseDown={startResize} />
    </div>
  );
}

function FavoritesAndRecents({ isWorkspaceMode }: { isWorkspaceMode: boolean }) {
  const favorites = useApp((s) => s.favorites);
  const recents = useApp((s) => s.recents);
  const openConnections = useApp((s) => s.openConnections);
  const route = useApp((s) => s.route);
  const openTableTab = useApp((s) => s.openTableTab);
  const toggleFavorite = useApp((s) => s.toggleFavorite);

  // Only show in workspace mode and scope to current connection.
  if (!isWorkspaceMode || route.kind !== 'connection') return null;
  const cid = route.connectionId;
  if (!openConnections.has(cid)) return null;

  const favsHere = favorites.filter((f) => f.connectionId === cid);
  const recentsHere = recents.filter((r) => r.connectionId === cid).slice(0, 8);

  if (!favsHere.length && !recentsHere.length) return null;

  return (
    <div style={{ padding: '0 0 6px' }}>
      {favsHere.length > 0 && (
        <>
          <div className="section-title">Favorites</div>
          {favsHere.map((f) => (
            <div
              key={`f-${f.schema}.${f.table}`}
              className="tree-row"
              style={{ paddingLeft: 14 }}
              onClick={() => openTableTab(f.connectionId, f.schema, f.table, 'data')}
            >
              <span style={{ color: 'var(--accent)' }}>★</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {f.schema === 'public' ? f.table : `${f.schema}.${f.table}`}
              </span>
              <button
                className="btn-icon"
                title="Unstar"
                style={{ padding: 2 }}
                onClick={(e) => { e.stopPropagation(); toggleFavorite(f); }}
              >
                <XIcon size={10} />
              </button>
            </div>
          ))}
        </>
      )}
      {recentsHere.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 6 }}>Recent</div>
          {recentsHere.map((r) => (
            <div
              key={`r-${r.schema}.${r.table}`}
              className="tree-row"
              style={{ paddingLeft: 14 }}
              onClick={() => openTableTab(r.connectionId, r.schema, r.table, 'data')}
            >
              <span style={{ color: 'var(--ink-4)' }}>↻</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.schema === 'public' ? r.table : `${r.schema}.${r.table}`}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function ConnectionItem({
  conn,
  isOpen,
  isActive,
  isWorkspaceMode,
  onConnect,
  onDisconnect,
  onEdit,
  onDelete,
  onSelect,
  onRefresh,
}: {
  conn: any; isOpen: boolean; isActive: boolean;
  isWorkspaceMode: boolean;
  onConnect: () => void; onDisconnect: () => void;
  onEdit: () => void; onDelete: () => void;
  onSelect: () => void; onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(isActive);

  React.useEffect(() => {
    if (isOpen && isActive) setExpanded(true);
  }, [isOpen, isActive]);

  // In the home window we never show the schema tree — only an Open action,
  // which spawns a dedicated workspace window per click.
  const isHome = !isWorkspaceMode;

  return (
    <div style={{ marginBottom: 2 }}>
      <div
        className={`tree-row ${isActive ? 'active' : ''}`}
        onClick={() => {
          if (isHome) {
            onConnect();
            return;
          }
          if (isOpen) {
            setExpanded((e) => !e);
            onSelect();
          } else {
            onConnect();
          }
        }}
        style={{ fontWeight: 500 }}
        title={isHome ? `Open ${conn.name} in a new workspace window` : undefined}
      >
        {isHome
          ? <span style={{ width: 12 }} />
          : isOpen ? (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span style={{ width: 12 }} />}
        <span
          className="dot"
          style={{
            background: isOpen ? 'var(--success)' : 'var(--border-strong)',
            marginRight: 2,
          }}
        />
        <Database size={13} color={conn.color || 'var(--accent)'} />
        <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {conn.name}
        </div>
        <button
          className="btn-icon"
          style={{ padding: 2 }}
          title="Edit"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
        >
          <Pencil size={11} />
        </button>
        {isOpen ? (
          <button
            className="btn-icon"
            style={{ padding: 2 }}
            title="Disconnect"
            onClick={(e) => { e.stopPropagation(); onDisconnect(); }}
          >
            <X size={12} />
          </button>
        ) : (
          <button
            className="btn-icon"
            style={{ padding: 2 }}
            title="Delete"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>
      <div style={{ paddingLeft: 8, fontSize: 11, color: 'var(--fg-muted)', marginLeft: 22, marginTop: -2 }}>
        {conn.user}@{conn.host}:{conn.port}/{conn.database}
      </div>
      {/* Schema tree only in a workspace window. */}
      {!isHome && isOpen && expanded && <SchemaTree connectionId={conn.id} onRefresh={onRefresh} />}
    </div>
  );
}
