import React from 'react';
import { Database, Plus, FileCode2, Wrench, BookOpen, Keyboard } from 'lucide-react';
import { useApp } from '../store';
import { api } from '../ipc';

const SAMPLE_QUERIES: { title: string; sql: string }[] = [
  {
    title: 'List schemas',
    sql: 'select schema_name from information_schema.schemata\norder by schema_name;',
  },
  {
    title: 'Top 10 largest tables',
    sql:
      `select n.nspname || '.' || c.relname as table,
       pg_size_pretty(pg_total_relation_size(c.oid)) as size
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
  and n.nspname not in ('pg_catalog','information_schema')
order by pg_total_relation_size(c.oid) desc
limit 10;`,
  },
  {
    title: 'Active sessions',
    sql:
      `select pid, usename, application_name, state, query
from pg_stat_activity
where state = 'active' and pid <> pg_backend_pid();`,
  },
  {
    title: 'Database size',
    sql: `select pg_size_pretty(pg_database_size(current_database())) as size;`,
  },
];

export function WelcomeScreen() {
  const route = useApp((s) => s.route);
  const connections = useApp((s) => s.connections);
  const openConnections = useApp((s) => s.openConnections);
  const openConnection = useApp((s) => s.openConnection);
  const newSqlTab = useApp((s) => s.newSqlTab);
  const setConnectionForm = useApp((s) => s.setConnectionForm);
  const updateTab = useApp((s) => s.updateTab);
  const activeConnectionId = useApp((s) => s.activeConnectionId);
  const showToast = useApp((s) => s.showToast);
  const isHome = route.kind !== 'connection';

  function openSample(sample: { title: string; sql: string }) {
    const connId = activeConnectionId || (route.kind === 'connection' ? route.connectionId : null);
    if (!connId) {
      showToast('error', 'No connection selected');
      return;
    }
    const id = newSqlTab(connId);
    if (id) updateTab(id, { sql: sample.sql, title: sample.title } as any);
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 48, color: 'var(--ink-2)' }}>
      <svg width="56" height="56" viewBox="0 0 64 64" fill="none" style={{ marginBottom: 14 }}>
        <rect width="64" height="64" rx="14" fill="#0B0D11"/>
        <path fill="#F5F6F8" d="M 19 44.5 L 19 19.5 L 28.75 19.5 L 32 25.5 L 35.25 19.5 L 45 19.5 L 45 44.5 L 39 44.5 L 39 30.5 L 34.5 39 L 29.5 39 L 25 30.5 L 25 44.5 Z" />
        <rect x="26.5" y="35.5" width="11" height="3.5" rx="0.5" fill="#F5A524" />
      </svg>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--ink)', margin: 0, letterSpacing: '-0.01em' }}>
        Mili <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'var(--accent)' }}>db</span>
      </h1>
      <p style={{ marginTop: 6, color: 'var(--ink-3)', textAlign: 'center', maxWidth: 480 }}>
        {isHome
          ? "Pick a connection — each one opens in its own window so you always know which database you're working on."
          : 'A great Postgres explorer — connect, browse, query, edit.'}
      </p>

      <div style={{ display: 'flex', gap: 8, marginTop: 22, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="btn btn-primary" onClick={() => setConnectionForm('new')}>
          <Plus size={14} /> New connection
        </button>
        {connections.length > 0 && (
          <button
            className="btn"
            onClick={async () => {
              const c = connections.sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0))[0];
              if (isHome) {
                await api.openConnectionWindow(c.id);
                return;
              }
              if (openConnections.has(c.id)) {
                newSqlTab(c.id);
              } else {
                const r = await openConnection(c.id);
                if (r.ok) newSqlTab(c.id);
                else showToast('error', r.error || 'Failed');
              }
            }}
          >
            <Database size={14} /> {isHome ? 'Open most recent in workspace' : 'Open most recent'}
          </button>
        )}
        {!isHome && activeConnectionId && (
          <button className="btn" onClick={() => useApp.getState().openOperateTab(activeConnectionId)}>
            <Wrench size={14} /> Operate panel
          </button>
        )}
      </div>

      {!isHome && (
        <>
          <div className="section-title" style={{ marginTop: 36, padding: 0, color: 'var(--ink-4)' }}>
            <BookOpen size={11} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Sample queries
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginTop: 6, width: '100%', maxWidth: 720 }}>
            {SAMPLE_QUERIES.map((s) => (
              <button
                key={s.title}
                className="btn"
                onClick={() => openSample(s)}
                style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '10px 12px', minHeight: 48 }}
              >
                <FileCode2 size={14} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.title}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.sql.split('\n')[0]}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: 32, fontSize: 12, color: 'var(--ink-4)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div><span className="kbd">⌘P</span> Quick switcher</div>
        <div><span className="kbd">⌘T</span> New query</div>
        <div><span className="kbd">⌘↵</span> Run query</div>
        <div><span className="kbd">⌘/</span> Show all shortcuts</div>
      </div>
    </div>
  );
}
