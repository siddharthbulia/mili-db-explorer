import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, XCircle, Skull, AlertTriangle, HardDrive, Activity, Lock, Wrench,
  Database,
} from 'lucide-react';
import { api } from '../ipc';
import { useApp } from '../store';
import type { QueryResult } from '../../shared/types';
import { ResultGrid } from './ResultGrid';

type View = 'sessions' | 'locks' | 'storage' | 'indexes' | 'maintenance';

/**
 * Postgres "Operate" panel — anything that's useful for diagnosing or
 * maintaining a database that isn't about reading user data.
 *
 * Every query here is a plain SELECT against a system catalog or view, so
 * everything we display is real, never invented.
 */
export function OperatePanel({ tabId }: { tabId: string }) {
  const tab = useApp((s) => s.tabs.find((t) => t.id === tabId));
  const updateTab = useApp((s) => s.updateTab);
  if (!tab || tab.kind !== 'operate') return null;

  const view = (tab as any).view as View || 'sessions';
  const setView = (v: View) => updateTab(tabId, { view: v } as any);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--hairline)', background: 'var(--surface-base)' }}>
        <SubTab active={view === 'sessions'} onClick={() => setView('sessions')} icon={<Activity size={12} />} label="Sessions" />
        <SubTab active={view === 'locks'} onClick={() => setView('locks')} icon={<Lock size={12} />} label="Locks" />
        <SubTab active={view === 'storage'} onClick={() => setView('storage')} icon={<HardDrive size={12} />} label="Storage" />
        <SubTab active={view === 'indexes'} onClick={() => setView('indexes')} icon={<Database size={12} />} label="Indexes" />
        <SubTab active={view === 'maintenance'} onClick={() => setView('maintenance')} icon={<Wrench size={12} />} label="Maintenance" />
        <div style={{ flex: 1 }} />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {view === 'sessions' && <SessionsView connectionId={tab.connectionId} />}
        {view === 'locks' && <LocksView connectionId={tab.connectionId} />}
        {view === 'storage' && <StorageView connectionId={tab.connectionId} />}
        {view === 'indexes' && <IndexesView connectionId={tab.connectionId} />}
        {view === 'maintenance' && <MaintenanceView connectionId={tab.connectionId} />}
      </div>
    </div>
  );
}

function SubTab({ active, onClick, icon, label }: any) {
  return (
    <div className={`tab ${active ? 'active' : ''}`} onClick={onClick} style={{ borderRight: '1px solid var(--hairline)' }}>
      {icon}
      <span>{label}</span>
    </div>
  );
}

/** Auto-refreshing toolbar shared by every Operate sub-view. */
function Toolbar({ onRefresh, interval, setInterval: setI, children }: {
  onRefresh: () => void;
  interval: number;
  setInterval: (n: number) => void;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', gap: 6, padding: 6, borderBottom: '1px solid var(--hairline)', background: 'var(--surface-base)', alignItems: 'center' }}>
      <button className="btn" onClick={onRefresh} title="Refresh"><RefreshCw size={12} /> Refresh</button>
      <select
        className="input-sm"
        value={interval}
        onChange={(e) => setI(Number(e.target.value))}
        title="Auto-refresh"
        style={{ padding: '2px 6px', fontSize: 11, width: 86 }}
      >
        <option value={0}>↻ off</option>
        <option value={2}>↻ 2s</option>
        <option value={5}>↻ 5s</option>
        <option value={15}>↻ 15s</option>
      </select>
      {children}
    </div>
  );
}

/** Hook: run a SQL query, refetch on interval. */
function useLiveQuery(connectionId: string, sql: string, intervalSec: number, deps: any[] = []) {
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.runQuery(connectionId, sql);
      if (r.ok) { setResult(r.results[0]); setError(null); }
      else { setError(r.error.message); setResult(null); }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, sql, ...deps]);

  useEffect(() => { run(); }, [run]);
  useEffect(() => {
    if (!intervalSec) return;
    const h = setInterval(run, intervalSec * 1000);
    return () => clearInterval(h);
  }, [intervalSec, run]);

  return { result, error, loading, refresh: run };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sessions

function SessionsView({ connectionId }: { connectionId: string }) {
  const showToast = useApp((s) => s.showToast);
  const [interval_, setInterval_] = useState(5);
  const sql = `
    select pid,
           usename as user,
           application_name as app,
           client_addr::text as client,
           state,
           wait_event_type as wait_type,
           wait_event,
           extract(epoch from now() - xact_start)::int as xact_age_s,
           extract(epoch from now() - query_start)::int as query_age_s,
           left(coalesce(query, ''), 300) as query
    from pg_stat_activity
    where pid <> pg_backend_pid()
      and datname = current_database()
    order by query_start desc nulls last
  `;
  const { result, error, loading, refresh } = useLiveQuery(connectionId, sql, interval_);

  async function killSession(pid: number, mode: 'cancel' | 'terminate') {
    const fn = mode === 'cancel' ? 'pg_cancel_backend' : 'pg_terminate_backend';
    if (!confirm(`${fn}(${pid})?`)) return;
    const r = await api.runQuery(connectionId, `select ${fn}($1)`, [pid]);
    if (r.ok) { showToast('success', `${fn}(${pid}) called`); refresh(); }
    else showToast('error', r.error.message);
  }

  // Add a column of action buttons after the grid by augmenting result.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar onRefresh={refresh} interval={interval_} setInterval={setInterval_}>
        <span style={{ fontSize: 12, color: 'var(--ink-3)', marginLeft: 8 }}>
          {result?.rowCount ?? 0} active session{result?.rowCount === 1 ? '' : 's'} {loading && '· loading'}
        </span>
      </Toolbar>
      {error && <ErrorBox text={error} />}
      {result && <SessionsTable rows={result.rows} columns={result.columns} onKill={killSession} />}
    </div>
  );
}

function SessionsTable({ rows, columns, onKill }: {
  rows: any[][];
  columns: { name: string; dataType: string }[];
  onKill: (pid: number, mode: 'cancel' | 'terminate') => void;
}) {
  // Find the column indexes we care about.
  const ci = (name: string) => columns.findIndex((c) => c.name === name);
  const idx = {
    pid: ci('pid'),
    user: ci('user'),
    app: ci('app'),
    state: ci('state'),
    wait_type: ci('wait_type'),
    wait_event: ci('wait_event'),
    query_age_s: ci('query_age_s'),
    xact_age_s: ci('xact_age_s'),
    query: ci('query'),
  };

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
        <thead>
          <tr style={{ position: 'sticky', top: 0, background: 'var(--surface-raised)' }}>
            {['PID', 'user', 'app', 'state', 'wait', 'query age', 'xact age', 'query', ''].map((h) => (
              <th key={h} style={{ padding: '8px 12px', borderBottom: '1px solid var(--hairline)', textAlign: 'left', color: 'var(--ink-3)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const state = String(r[idx.state] ?? '');
            const isActive = state === 'active';
            const isIdleTx = state.startsWith('idle in transaction');
            return (
              <tr key={i} style={{ borderBottom: '1px solid var(--hairline)' }}>
                <td style={{ padding: '6px 12px', color: 'var(--accent)' }}>{r[idx.pid]}</td>
                <td style={{ padding: '6px 12px' }}>{r[idx.user]}</td>
                <td style={{ padding: '6px 12px', color: 'var(--ink-2)' }}>{r[idx.app] || '—'}</td>
                <td style={{ padding: '6px 12px', color: isActive ? 'var(--success)' : isIdleTx ? 'var(--warning)' : 'var(--ink-3)' }}>
                  {state}
                </td>
                <td style={{ padding: '6px 12px', color: 'var(--ink-3)' }}>
                  {r[idx.wait_type] ? `${r[idx.wait_type]}: ${r[idx.wait_event]}` : '—'}
                </td>
                <td style={{ padding: '6px 12px', textAlign: 'right' }}>{fmtSecs(r[idx.query_age_s])}</td>
                <td style={{ padding: '6px 12px', textAlign: 'right' }}>{fmtSecs(r[idx.xact_age_s])}</td>
                <td style={{ padding: '6px 12px', maxWidth: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--ink-2)' }} title={String(r[idx.query] || '')}>
                  {r[idx.query] || '—'}
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <button className="btn-icon" title="Cancel query (pg_cancel_backend)" onClick={() => onKill(r[idx.pid], 'cancel')}>
                    <XCircle size={13} />
                  </button>
                  <button className="btn-icon" title="Terminate (pg_terminate_backend)" onClick={() => onKill(r[idx.pid], 'terminate')}>
                    <Skull size={13} color="var(--danger)" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <Empty>No active sessions other than yours.</Empty>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Locks

function LocksView({ connectionId }: { connectionId: string }) {
  const [interval_, setInterval_] = useState(5);
  const sql = `
    select l.locktype,
           l.mode,
           l.granted,
           l.relation::regclass::text as relation,
           l.pid,
           a.usename as user,
           a.state,
           a.wait_event_type as wait_type,
           a.wait_event,
           left(coalesce(a.query, ''), 200) as query
    from pg_locks l
    left join pg_stat_activity a on a.pid = l.pid
    where l.pid <> pg_backend_pid()
    order by l.granted, l.locktype, l.pid
    limit 200
  `;
  const { result, error, loading, refresh } = useLiveQuery(connectionId, sql, interval_);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar onRefresh={refresh} interval={interval_} setInterval={setInterval_}>
        <span style={{ fontSize: 12, color: 'var(--ink-3)', marginLeft: 8 }}>
          {result?.rowCount ?? 0} lock{result?.rowCount === 1 ? '' : 's'} {loading && '· loading'}
        </span>
      </Toolbar>
      {error && <ErrorBox text={error} />}
      {result && <GridReadOnly result={result} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage

function StorageView({ connectionId }: { connectionId: string }) {
  const [interval_, setInterval_] = useState(0);
  const sql = `
    with tables as (
      select n.nspname as schema,
             c.relname as table,
             c.relkind as kind,
             pg_total_relation_size(c.oid)        as total_bytes,
             pg_relation_size(c.oid)              as table_bytes,
             pg_indexes_size(c.oid)               as index_bytes,
             pg_total_relation_size(c.oid)
               - pg_relation_size(c.oid)
               - pg_indexes_size(c.oid)           as toast_bytes,
             c.reltuples::bigint                  as est_rows,
             s.n_live_tup                         as live_rows,
             s.n_dead_tup                         as dead_rows,
             s.last_vacuum,
             s.last_autovacuum,
             s.last_analyze,
             s.last_autoanalyze
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_stat_user_tables s on s.relid = c.oid
      where c.relkind in ('r', 'p', 'm', 'f')
        and n.nspname not in ('pg_catalog','information_schema','pg_toast')
    )
    select schema, "table",
           pg_size_pretty(total_bytes) as size,
           total_bytes,
           pg_size_pretty(table_bytes) as data,
           pg_size_pretty(index_bytes) as indexes,
           pg_size_pretty(toast_bytes) as toast,
           coalesce(live_rows, est_rows) as rows,
           dead_rows,
           greatest(last_vacuum, last_autovacuum) as last_vacuum,
           greatest(last_analyze, last_autoanalyze) as last_analyze
    from tables
    order by total_bytes desc
    limit 100
  `;
  const { result, error, loading, refresh } = useLiveQuery(connectionId, sql, interval_);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar onRefresh={refresh} interval={interval_} setInterval={setInterval_}>
        <span style={{ fontSize: 12, color: 'var(--ink-3)', marginLeft: 8 }}>
          Top 100 tables by total size {loading && '· loading'}
        </span>
      </Toolbar>
      {error && <ErrorBox text={error} />}
      {result && <GridReadOnly result={result} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Indexes

function IndexesView({ connectionId }: { connectionId: string }) {
  const [interval_, setInterval_] = useState(0);
  const showToast = useApp((s) => s.showToast);
  const sql = `
    select s.schemaname as schema,
           s.relname    as table,
           s.indexrelname as index,
           pg_size_pretty(pg_relation_size(s.indexrelid)) as size,
           s.idx_scan   as scans,
           s.idx_tup_read as tup_read,
           s.idx_tup_fetch as tup_fetch,
           case when s.idx_scan = 0 then 'never used'
                when s.idx_scan < 100 then 'low usage'
                else 'ok' end as status
    from pg_stat_user_indexes s
    order by s.idx_scan asc, pg_relation_size(s.indexrelid) desc
    limit 200
  `;
  const { result, error, loading, refresh } = useLiveQuery(connectionId, sql, interval_);
  async function dropIndex(schema: string, name: string) {
    if (!confirm(`DROP INDEX "${schema}"."${name}"?`)) return;
    const r = await api.runQuery(connectionId, `DROP INDEX "${schema}"."${name}"`);
    if (r.ok) { showToast('success', `Dropped ${name}`); refresh(); }
    else showToast('error', r.error.message);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar onRefresh={refresh} interval={interval_} setInterval={setInterval_}>
        <span style={{ fontSize: 12, color: 'var(--ink-3)', marginLeft: 8 }}>
          Indexes ordered by scan count (zero-scan = candidate for drop) {loading && '· loading'}
        </span>
      </Toolbar>
      {error && <ErrorBox text={error} />}
      {result && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            <thead>
              <tr style={{ position: 'sticky', top: 0, background: 'var(--surface-raised)' }}>
                {['schema', 'table', 'index', 'size', 'scans', 'tup_read', 'tup_fetch', 'status', ''].map((h) => (
                  <th key={h} style={{ padding: '8px 12px', borderBottom: '1px solid var(--hairline)', textAlign: 'left', color: 'var(--ink-3)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r, i) => {
                const colIdx = (n: string) => result.columns.findIndex((c) => c.name === n);
                const schema = String(r[colIdx('schema')]);
                const tbl = String(r[colIdx('table')]);
                const idx = String(r[colIdx('index')]);
                const status = String(r[colIdx('status')]);
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--hairline)' }}>
                    <td style={{ padding: '6px 12px', color: 'var(--ink-2)' }}>{schema}</td>
                    <td style={{ padding: '6px 12px' }}>{tbl}</td>
                    <td style={{ padding: '6px 12px', color: 'var(--accent)' }}>{idx}</td>
                    <td style={{ padding: '6px 12px' }}>{r[colIdx('size')]}</td>
                    <td style={{ padding: '6px 12px', textAlign: 'right' }}>{r[colIdx('scans')]}</td>
                    <td style={{ padding: '6px 12px', textAlign: 'right' }}>{r[colIdx('tup_read')]}</td>
                    <td style={{ padding: '6px 12px', textAlign: 'right' }}>{r[colIdx('tup_fetch')]}</td>
                    <td style={{ padding: '6px 12px', color: status === 'never used' ? 'var(--danger)' : status === 'low usage' ? 'var(--warning)' : 'var(--success)' }}>
                      {status}
                    </td>
                    <td style={{ padding: '4px 8px' }}>
                      <button className="btn-icon" title="DROP INDEX" onClick={() => dropIndex(schema, idx)}>
                        <Skull size={13} color="var(--danger)" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Maintenance

function MaintenanceView({ connectionId }: { connectionId: string }) {
  const showToast = useApp((s) => s.showToast);
  const [stats, setStats] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sql = `
      select
        current_database()                       as database,
        pg_size_pretty(pg_database_size(current_database())) as db_size,
        version()                                 as version,
        current_user                              as user,
        pg_postmaster_start_time()::text          as started_at,
        (select setting from pg_settings where name = 'server_version') as server_version,
        (select setting from pg_settings where name = 'max_connections') as max_connections,
        (select setting from pg_settings where name = 'shared_buffers')  as shared_buffers,
        (select setting from pg_settings where name = 'work_mem')        as work_mem,
        (select setting from pg_settings where name = 'effective_cache_size') as effective_cache_size,
        (select count(*) from pg_stat_activity where datname = current_database()) as connections_in_db,
        (select count(*) from pg_stat_activity)  as connections_total,
        txid_current_if_assigned()::text          as current_txid,
        pg_blocks_fetched(oid) as _ignored
      from pg_database where datname = current_database()
    `;
    // Simpler fallback: omit pg_blocks_fetched which may not exist.
    const safe = sql.replace(/, pg_blocks_fetched\(oid\) as _ignored/, '');
    const r = await api.runQuery(connectionId, safe);
    if (r.ok) { setStats(r.results[0]); setError(null); }
    else { setError(r.error.message); }
  }, [connectionId]);

  useEffect(() => { load(); }, [load]);

  async function runMaint(label: string, sql: string) {
    if (!confirm(`Run: ${sql}?`)) return;
    setRunning(label);
    try {
      const r = await api.runQuery(connectionId, sql);
      if (r.ok) showToast('success', `${label} done`);
      else showToast('error', r.error.message);
    } finally {
      setRunning(null);
      load();
    }
  }

  const rowToObj = (): Record<string, string> => {
    if (!stats || !stats.rows[0]) return {};
    const o: Record<string, string> = {};
    stats.columns.forEach((c, i) => { o[c.name] = String(stats.rows[0][i] ?? ''); });
    return o;
  };
  const s = rowToObj();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
      <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <StatCard label="Database" value={s.database} />
        <StatCard label="Size" value={s.db_size} />
        <StatCard label="Version" value={(s.version || '').split(',')[0]} />
        <StatCard label="Started" value={(s.started_at || '').slice(0, 19)} />
        <StatCard label="Connections (db / total)" value={`${s.connections_in_db} / ${s.connections_total}`} />
        <StatCard label="Max connections" value={s.max_connections} />
        <StatCard label="Shared buffers" value={s.shared_buffers} />
        <StatCard label="Work mem" value={s.work_mem} />
        <StatCard label="Effective cache" value={s.effective_cache_size} />
        <StatCard label="Current TXID" value={s.current_txid || '—'} />
      </div>

      <div style={{ padding: '0 16px 12px' }}>
        <div className="section-title" style={{ padding: '8px 0' }}>Database-wide actions</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" disabled={!!running} onClick={() => runMaint('VACUUM (verbose, analyze)', 'VACUUM (VERBOSE, ANALYZE)')}>
            <Wrench size={12} /> VACUUM ANALYZE
          </button>
          <button className="btn" disabled={!!running} onClick={() => runMaint('ANALYZE', 'ANALYZE')}>
            <Activity size={12} /> ANALYZE
          </button>
          <button className="btn" disabled={!!running} onClick={() => runMaint('CHECKPOINT', 'CHECKPOINT')}>
            CHECKPOINT
          </button>
          <button className="btn" disabled={!!running} onClick={() => runMaint(
            'Session READ ONLY',
            'SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY'
          )} title="Sets the current session to refuse any DDL/UPDATE/INSERT/DELETE until reset">
            🔒 Read-only mode
          </button>
          <button className="btn" disabled={!!running} onClick={() => runMaint(
            'Session READ WRITE',
            'SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE'
          )}>
            🔓 Read-write mode
          </button>
          {running && <span style={{ fontSize: 12, color: 'var(--ink-3)', alignSelf: 'center' }}>Running: {running}…</span>}
        </div>
      </div>

      {error && <ErrorBox text={error} />}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 14, border: '1px solid var(--hairline)', borderRadius: 8, background: 'var(--surface-base)' }}>
      <div style={{ fontSize: 10.5, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{label}</div>
      <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--ink)', wordBreak: 'break-all' }}>{value || '—'}</div>
    </div>
  );
}

function GridReadOnly({ result }: { result: QueryResult }) {
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <ResultGrid result={result} />
    </div>
  );
}

function Empty({ children }: any) {
  return <div style={{ padding: 18, color: 'var(--ink-3)', fontSize: 13 }}>{children}</div>;
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div style={{ margin: 10, padding: 10, borderRadius: 6, background: 'rgba(242,111,111,0.1)', color: 'var(--danger)', fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'pre-wrap', display: 'flex', gap: 8 }}>
      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{text}</span>
    </div>
  );
}

function fmtSecs(v: any): string {
  if (v == null) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (n < 60) return `${n}s`;
  if (n < 3600) return `${Math.floor(n / 60)}m ${n % 60}s`;
  return `${Math.floor(n / 3600)}h ${Math.floor((n % 3600) / 60)}m`;
}
