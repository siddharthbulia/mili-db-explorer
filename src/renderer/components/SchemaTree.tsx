import React, { useState, useMemo } from 'react';
import {
  ChevronDown, ChevronRight, RefreshCw, Table2, Eye, FunctionSquare,
  ListOrdered, Search, Database, Box,
} from 'lucide-react';
import { useApp } from '../store';
import type { SchemaEntry } from '../../shared/types';
import { ContextMenu } from './ContextMenu';
import { api } from '../ipc';
import { AddColumnModal, RenameModal, CreateIndexModal, CreateSchemaModal } from './DDLModal';

export function SchemaTree({ connectionId, onRefresh }: { connectionId: string; onRefresh: () => void }) {
  const schemas = useApp((s) => s.schemasByConnection[connectionId]);
  const loading = useApp((s) => s.schemaLoading[connectionId]);
  const openTableTab = useApp((s) => s.openTableTab);
  const newSqlTab = useApp((s) => s.newSqlTab);
  const updateTab = useApp((s) => s.updateTab);
  const showToast = useApp((s) => s.showToast);
  const [filter, setFilter] = useState('');
  const [openSchemas, setOpenSchemas] = useState<Record<string, boolean>>({});
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [ctx, setCtx] = useState<{ x: number; y: number; items: any[] } | null>(null);
  // Visibility toggles for each kind. All on by default.
  const [show, setShow] = useState({ tables: true, views: true, matViews: true, functions: true, sequences: true });
  const [showSystem, setShowSystem] = useState(false);
  const [ddl, setDdl] = useState<
    | { kind: 'add-col'; schema: string; table: string }
    | { kind: 'rename-table'; schema: string; table: string }
    | { kind: 'create-index'; schema: string; table: string; columns: string[] }
    | { kind: 'create-schema' }
    | null
  >(null);

  React.useEffect(() => {
    if (!schemas) useApp.getState().loadSchemas(connectionId);
  }, [connectionId, schemas]);

  const filtered = useMemo(() => {
    if (!schemas) return [];
    if (!filter) return schemas;
    const q = filter.toLowerCase();
    return schemas
      .map((s) => ({
        ...s,
        tables: s.tables.filter((t) => t.name.toLowerCase().includes(q)),
        views: s.views.filter((t) => t.name.toLowerCase().includes(q)),
        matViews: s.matViews.filter((t) => t.name.toLowerCase().includes(q)),
        functions: s.functions.filter((t) => t.name.toLowerCase().includes(q)),
        sequences: s.sequences.filter((t) => t.name.toLowerCase().includes(q)),
      }))
      .filter(
        (s) =>
          s.tables.length || s.views.length || s.matViews.length ||
          s.functions.length || s.sequences.length || s.schema.toLowerCase().includes(q)
      );
  }, [schemas, filter]);

  React.useEffect(() => {
    // open 'public' + every pinned schema by default
    if (schemas && !Object.keys(openSchemas).length) {
      const next: Record<string, boolean> = {};
      const pinned = useApp.getState().pinnedSchemas.filter((p) => p.connectionId === connectionId);
      for (const s of schemas) {
        if (s.schema === 'public' || pinned.some((p) => p.schema === s.schema)) next[s.schema] = true;
      }
      setOpenSchemas(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemas]);

  function openTableMenu(e: React.MouseEvent, schema: string, table: string, kind: string = 'r') {
    e.preventDefault();
    const isMat = kind === 'm';
    const toggleFav = useApp.getState().toggleFavorite;
    const isFav = useApp.getState().isFavorite({ connectionId, schema, table });
    setCtx({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'View data', onClick: () => openTableTab(connectionId, schema, table, 'data') },
        { label: 'View structure', onClick: () => openTableTab(connectionId, schema, table, 'structure') },
        { divider: true },
        {
          label: isFav ? 'Remove from favorites' : 'Star table',
          onClick: () => toggleFav({ connectionId, schema, table }),
        },
        {
          label: 'Copy schema.table',
          onClick: () => {
            navigator.clipboard.writeText(`${schema}.${table}`);
            showToast('success', 'Copied name');
          },
        },
        { divider: true },
        {
          label: 'Select 100 rows',
          onClick: () => {
            const id = newSqlTab(connectionId);
            if (id) updateTab(id, { sql: `select * from "${schema}"."${table}" limit 100;`, title: `Query ${table}` });
          },
        },
        ...(isMat ? [{
          label: 'Refresh materialized view',
          onClick: async () => {
            const r = await api.runQuery(connectionId, `refresh materialized view "${schema}"."${table}"`);
            if (r.ok) showToast('success', 'Refreshed');
            else showToast('error', r.error.message);
          },
        }] : []),
        { divider: true },
        { label: 'Add column…', onClick: () => setDdl({ kind: 'add-col', schema, table }) },
        { label: 'Rename table…', onClick: () => setDdl({ kind: 'rename-table', schema, table }) },
        {
          label: 'Add index…',
          onClick: async () => {
            // Need the column list for the picker — pull it from cached details
            try {
              const d = await api.getTableDetails(connectionId, schema, table);
              setDdl({ kind: 'create-index', schema, table, columns: d.columns.map((c) => c.name) });
            } catch (e: any) { showToast('error', e?.message || 'Failed to fetch columns'); }
          },
        },
        { label: 'VACUUM ANALYZE', onClick: async () => {
          if (!confirm(`VACUUM ANALYZE "${schema}"."${table}"?`)) return;
          const r = await api.runQuery(connectionId, `VACUUM ANALYZE "${schema}"."${table}"`);
          if (r.ok) showToast('success', 'Vacuumed'); else showToast('error', r.error.message);
        } },
        { label: 'REINDEX', onClick: async () => {
          if (!confirm(`REINDEX TABLE "${schema}"."${table}"?`)) return;
          const r = await api.runQuery(connectionId, `REINDEX TABLE "${schema}"."${table}"`);
          if (r.ok) showToast('success', 'Reindexed'); else showToast('error', r.error.message);
        } },
        {
          label: 'Copy DDL',
          onClick: async () => {
            try {
              const r = await api.runQuery(connectionId, `
                select 'create table "' || $1 || '"."' || $2 || '" (' || string_agg('  "'||a.attname||'" '||format_type(a.atttypid,a.atttypmod),', ') || ');'
                from pg_attribute a
                join pg_class c on c.oid = a.attrelid
                join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = $1 and c.relname = $2 and a.attnum > 0 and not a.attisdropped`,
                [schema, table]
              );
              if (r.ok && r.results[0]?.rows[0]?.[0]) {
                await navigator.clipboard.writeText(r.results[0].rows[0][0]);
                showToast('success', 'DDL copied');
              }
            } catch (e: any) {
              showToast('error', e?.message || 'Failed');
            }
          },
        },
        { divider: true },
        {
          label: 'Truncate',
          danger: true,
          onClick: async () => {
            if (!confirm(`TRUNCATE "${schema}"."${table}"? This deletes all rows.`)) return;
            const r = await api.runQuery(connectionId, `truncate table "${schema}"."${table}"`);
            if (r.ok) { showToast('success', 'Truncated'); onRefresh(); }
            else showToast('error', r.error.message);
          },
        },
        {
          label: 'Drop',
          danger: true,
          onClick: async () => {
            if (!confirm(`DROP TABLE "${schema}"."${table}"?`)) return;
            const r = await api.runQuery(connectionId, `drop table "${schema}"."${table}"`);
            if (r.ok) { showToast('success', 'Dropped'); onRefresh(); }
            else showToast('error', r.error.message);
          },
        },
      ],
    });
  }

  return (
    <div style={{ marginLeft: 16, marginTop: 2 }}>
      <div style={{ display: 'flex', gap: 4, padding: '4px 4px 4px 0' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={11} style={{ position: 'absolute', left: 6, top: 6, color: 'var(--fg-muted)' }} />
          <input
            className="input-sm"
            style={{ width: '100%', paddingLeft: 22 }}
            placeholder="Filter..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <button className="btn-icon" title="Refresh" onClick={onRefresh}><RefreshCw size={11} /></button>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '2px 4px 6px', flexWrap: 'wrap', fontSize: 10 }}>
        {(['tables', 'views', 'matViews', 'functions', 'sequences'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setShow({ ...show, [k]: !show[k] })}
            style={{
              padding: '2px 7px',
              borderRadius: 4,
              border: '1px solid var(--hairline)',
              background: show[k] ? 'var(--accent-tint)' : 'transparent',
              color: show[k] ? 'var(--accent)' : 'var(--ink-3)',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
            }}
            title={`Toggle ${k}`}
          >
            {k === 'matViews' ? 'matviews' : k}
          </button>
        ))}
      </div>

      {loading && <div style={{ padding: 8, color: 'var(--fg-muted)' }}>Loading schema…</div>}
      {!loading && filtered.length === 0 && schemas && <div style={{ padding: 8, color: 'var(--fg-muted)' }}>No matches.</div>}

      {filtered
        .filter((s) => showSystem
          ? true
          : !(s.schema === 'pg_catalog' || s.schema === 'information_schema' || s.schema.startsWith('pg_')))
        .map((s) => (
        <SchemaNode
          key={s.schema}
          schema={s}
          open={openSchemas[s.schema] ?? false}
          onToggle={() => setOpenSchemas({ ...openSchemas, [s.schema]: !openSchemas[s.schema] })}
          openGroups={openGroups}
          setOpenGroups={setOpenGroups}
          show={show}
          onOpenTable={(schema, t) => openTableTab(connectionId, schema, t, 'data')}
          onContext={openTableMenu}
          onSchemaContext={(e, schemaName) => {
            e.preventDefault();
            const isPinned = useApp.getState().isPinnedSchema(connectionId, schemaName);
            setCtx({
              x: e.clientX, y: e.clientY,
              items: [
                { label: `Refresh schema "${schemaName}"`, onClick: onRefresh },
                {
                  label: isPinned ? 'Unpin schema' : 'Pin schema (always expanded)',
                  onClick: () => {
                    useApp.getState().togglePinnedSchema(connectionId, schemaName);
                    if (!isPinned) setOpenSchemas({ ...openSchemas, [schemaName]: true });
                  },
                },
                { label: 'New schema…', onClick: () => setDdl({ kind: 'create-schema' }) },
                { divider: true },
                {
                  label: `Drop schema "${schemaName}" (with CASCADE)…`,
                  danger: true,
                  onClick: async () => {
                    if (!confirm(`DROP SCHEMA "${schemaName}" CASCADE? This deletes every object in it.`)) return;
                    const r = await api.runQuery(connectionId, `DROP SCHEMA "${schemaName}" CASCADE`);
                    if (r.ok) { showToast('success', `Dropped ${schemaName}`); onRefresh(); }
                    else showToast('error', r.error.message);
                  },
                },
              ],
            });
          }}
        />
      ))}
      {/* System-schemas toggle in the footer of the tree. */}
      <div style={{ padding: '8px 10px', borderTop: '1px solid var(--hairline)', marginTop: 4 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-3)', cursor: 'pointer' }}>
          <input type="checkbox" checked={showSystem} onChange={(e) => setShowSystem(e.target.checked)} />
          Show pg_catalog &amp; information_schema
        </label>
      </div>
      {ctx && <ContextMenu {...ctx} onClose={() => setCtx(null)} />}
      {ddl?.kind === 'add-col' && (
        <AddColumnModal
          open
          onClose={() => { setDdl(null); onRefresh(); }}
          connectionId={connectionId}
          schema={ddl.schema}
          table={ddl.table}
        />
      )}
      {ddl?.kind === 'rename-table' && (
        <RenameModal
          open
          onClose={() => { setDdl(null); onRefresh(); }}
          connectionId={connectionId}
          schema={ddl.schema}
          table={ddl.table}
        />
      )}
      {ddl?.kind === 'create-index' && (
        <CreateIndexModal
          open
          onClose={() => { setDdl(null); onRefresh(); }}
          connectionId={connectionId}
          schema={ddl.schema}
          table={ddl.table}
          columnNames={ddl.columns}
        />
      )}
      {ddl?.kind === 'create-schema' && (
        <CreateSchemaModal
          open
          onClose={() => { setDdl(null); onRefresh(); }}
          connectionId={connectionId}
        />
      )}
    </div>
  );
}

function SchemaNode({ schema, open, onToggle, openGroups, setOpenGroups, onOpenTable, onContext, onSchemaContext, show }: {
  schema: SchemaEntry; open: boolean; onToggle: () => void;
  openGroups: Record<string, boolean>;
  setOpenGroups: (v: Record<string, boolean>) => void;
  onOpenTable: (schema: string, t: string) => void;
  onContext: (e: React.MouseEvent, schema: string, t: string, kind?: string) => void;
  onSchemaContext?: (e: React.MouseEvent, schema: string) => void;
  show: { tables: boolean; views: boolean; matViews: boolean; functions: boolean; sequences: boolean };
}) {
  const s: SchemaEntry = schema;
  const groupKey = (name: string) => `${s.schema}:${name}`;
  const isGroupOpen = (name: string) => openGroups[groupKey(name)] ?? true;
  const toggleGroup = (name: string) =>
    setOpenGroups({ ...openGroups, [groupKey(name)]: !isGroupOpen(name) });

  return (
    <div>
      <div
        className="tree-row"
        style={{ fontWeight: 600 }}
        onClick={onToggle}
        onContextMenu={(e) => onSchemaContext?.(e, s.schema)}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Box size={12} />
        <span>{s.schema}</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--fg-muted)' }}>
          {s.tables.length + s.views.length + s.matViews.length}
        </span>
      </div>
      {open && (
        <div style={{ marginLeft: 12 }}>
          {show.tables && (
          <Group
            label="Tables"
            icon={<Table2 size={12} />}
            count={s.tables.length}
            open={isGroupOpen('tables')}
            onToggle={() => toggleGroup('tables')}
          >
            {s.tables.map((t) => (
              <div
                key={t.name}
                className="tree-row"
                onClick={() => onOpenTable(s.schema, t.name)}
                onContextMenu={(e) => onContext(e, s.schema, t.name)}
              >
                <Table2 size={11} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                {!!t.estimatedRows && t.estimatedRows > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--fg-muted)' }}>{formatCount(t.estimatedRows)}</span>
                )}
              </div>
            ))}
          </Group>
          )}
          {show.views && s.views.length > 0 && (
            <Group label="Views" icon={<Eye size={12} />} count={s.views.length}
              open={isGroupOpen('views')} onToggle={() => toggleGroup('views')}>
              {s.views.map((t) => (
                <div key={t.name} className="tree-row" onClick={() => onOpenTable(s.schema, t.name)}
                  onContextMenu={(e) => onContext(e, s.schema, t.name, 'v')}>
                  <Eye size={11} />
                  <span>{t.name}</span>
                </div>
              ))}
            </Group>
          )}
          {show.matViews && s.matViews.length > 0 && (
            <Group label="Materialized" icon={<Eye size={12} />} count={s.matViews.length}
              open={isGroupOpen('mviews')} onToggle={() => toggleGroup('mviews')}>
              {s.matViews.map((t) => (
                <div
                  key={t.name}
                  className="tree-row"
                  onClick={() => onOpenTable(s.schema, t.name)}
                  onContextMenu={(e) => onContext(e, s.schema, t.name, 'm')}
                >
                  <Eye size={11} />
                  <span>{t.name}</span>
                </div>
              ))}
            </Group>
          )}
          {show.functions && s.functions.length > 0 && (
            <Group label="Functions" icon={<FunctionSquare size={12} />} count={s.functions.length}
              open={isGroupOpen('funcs')} onToggle={() => toggleGroup('funcs')}>
              {s.functions.map((f) => (
                <div key={f.name} className="tree-row" title={`${f.name}(${f.args}) returns ${f.returns}`}>
                  <FunctionSquare size={11} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                </div>
              ))}
            </Group>
          )}
          {show.sequences && s.sequences.length > 0 && (
            <Group label="Sequences" icon={<ListOrdered size={12} />} count={s.sequences.length}
              open={isGroupOpen('seqs')} onToggle={() => toggleGroup('seqs')}>
              {s.sequences.map((sq) => (
                <div key={sq.name} className="tree-row">
                  <ListOrdered size={11} />
                  <span>{sq.name}</span>
                </div>
              ))}
            </Group>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ label, icon, count, open, onToggle, children }: any) {
  return (
    <div>
      <div className="tree-row" onClick={onToggle} style={{ color: 'var(--fg-secondary)' }}>
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        {icon}
        <span style={{ flex: 1, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.04, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 10, color: 'var(--fg-muted)' }}>{count}</span>
      </div>
      {open && <div style={{ marginLeft: 8 }}>{children}</div>}
    </div>
  );
}

function formatCount(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(1) + 'k';
  if (n < 1_000_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  return (n / 1_000_000_000).toFixed(1) + 'B';
}
