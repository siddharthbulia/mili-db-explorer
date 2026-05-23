import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  RefreshCw, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Plus, Save, Undo2, Trash2, FileDown, Crown, Copy, Eye, EyeOff,
  Star, Filter as FilterIcon, PanelRightOpen, PanelRightClose, Code2, Timer,
} from 'lucide-react';
import { useApp } from '../store';
import { api } from '../ipc';
import { ResultGrid } from './ResultGrid';
import { CellInspector } from './CellInspector';
import { ContextMenu } from './ContextMenu';
import { RenameModal, DropColumnModal } from './DDLModal';
import { ImportCsvModal } from './ImportCsvModal';
import { ProgressBar, ElapsedBadge } from './ProgressBar';
import { formatElapsed } from '../useElapsed';
import { FilterBuilder } from './FilterBuilder';
import type { QueryResult, TableDetails, RowChange, ForeignKeyDef } from '../../shared/types';
import type { ColumnFilter } from '../../shared/grid-filters';
import { filtersToSql, combineWhere, opLabel } from '../../shared/grid-filters';
import {
  rowsToCsv, rowsToJson, rowsToInserts, rowsToMarkdown, rowsToTsv,
} from '../../shared/grid-clipboard';
import { generateCreateScript } from '../../shared/sql-generators';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 500, 1000];

export function TableTab({ tabId }: { tabId: string }) {
  const tab = useApp((s) => s.tabs.find((t) => t.id === tabId));
  const updateTab = useApp((s) => s.updateTab);
  const connections = useApp((s) => s.connections);
  const serverVersions = useApp((s) => s.serverVersions);

  if (!tab || tab.kind !== 'table') return null;

  const conn = connections.find((c) => c.id === tab.connectionId);
  const version = serverVersions[tab.connectionId];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Breadcrumb — LOCAL | pg17 : host : db : schema.table */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
        background: 'var(--surface-deep)', borderBottom: '1px solid var(--hairline)',
        fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-3)',
        flexShrink: 0,
      }}>
        {conn?.color && (
          <span style={{ width: 6, height: 6, borderRadius: 999, background: conn.color, flexShrink: 0 }} />
        )}
        <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{(conn?.name || 'LOCAL').toUpperCase()}</span>
        <span style={{ opacity: 0.5 }}>|</span>
        <span title={version}>{shortVersion(version)}</span>
        <span style={{ opacity: 0.5 }}>:</span>
        <span>{conn?.host}{conn?.port && conn.port !== 5432 ? `:${conn.port}` : ''}</span>
        <span style={{ opacity: 0.5 }}>:</span>
        <span>{conn?.database}</span>
        <span style={{ opacity: 0.5 }}>:</span>
        <span style={{ color: 'var(--accent)' }}>{tab.schema}.{tab.table}</span>
      </div>

      <div style={{
        display: 'flex', gap: 0, borderBottom: '1px solid var(--hairline)',
        background: 'var(--surface-base)',
      }}>
        <div
          className={`tab ${tab.view === 'data' ? 'active' : ''}`}
          style={{ borderRight: '1px solid var(--hairline)' }}
          onClick={() => updateTab(tabId, { view: 'data' })}
        >
          Data
        </div>
        <div
          className={`tab ${tab.view === 'structure' ? 'active' : ''}`}
          style={{ borderRight: '1px solid var(--hairline)' }}
          onClick={() => updateTab(tabId, { view: 'structure' })}
        >
          Structure
        </div>
        <div style={{ flex: 1, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-2)' }}>
            {tab.schema}.{tab.table}
          </code>
          <FavoriteToggle tab={tab} />
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex' }}>
        {tab.view === 'data'
          ? <DataView tab={tab} tabId={tabId} />
          : <StructureView tab={tab} />
        }
      </div>
    </div>
  );
}

function FavoriteToggle({ tab }: { tab: any }) {
  const isFavorite = useApp((s) => s.isFavorite);
  const toggleFavorite = useApp((s) => s.toggleFavorite);
  const ref = { connectionId: tab.connectionId, schema: tab.schema, table: tab.table };
  const starred = isFavorite(ref);
  return (
    <button
      className="btn-icon"
      title={starred ? 'Unstar table' : 'Star table'}
      onClick={() => toggleFavorite(ref)}
      style={{ color: starred ? 'var(--accent)' : 'var(--ink-3)' }}
    >
      <Star size={13} fill={starred ? 'currentColor' : 'none'} />
    </button>
  );
}

function DataView({ tab, tabId }: { tab: any; tabId: string }) {
  const settings = useApp((s) => s.settings);
  const showToast = useApp((s) => s.showToast);
  const openTableTab = useApp((s) => s.openTableTab);
  const recordRecent = useApp((s) => s.recordRecent);

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(settings.pageSize || 100);
  const [where, setWhere] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFilter[]>([]);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [details, setDetails] = useState<TableDetails | null>(null);
  const [edits, setEdits] = useState<Map<string, Record<string, any>>>(new Map());
  const [newRows, setNewRows] = useState<Record<string, any>[]>([]);
  const [deletedKeys, setDeletedKeys] = useState<Set<string>>(new Set());
  const [selectedRowIdxs, setSelectedRowIdxs] = useState<Set<number>>(new Set());
  const [pageInput, setPageInput] = useState('');
  const [visibleColumns, setVisibleColumns] = useState<Set<string> | null>(null);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [lastDeleted, setLastDeleted] = useState<{ rows: any[][]; keys: string[] } | null>(null);
  const [showInspector, setShowInspector] = useState(true);
  const [activeCell, setActiveCell] = useState<{ rowIdx: number; columnIdx: number; columnName: string; columnType: string; value: any } | null>(null);
  const [rowContext, setRowContext] = useState<{ x: number; y: number; rowIdx: number } | null>(null);
  const [showSql, setShowSql] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState<number>(0); // 0 = off
  const [freezeFirstCol, setFreezeFirstCol] = useState(false);
  const [wrapCells, setWrapCells] = useState(false);
  const [findText, setFindText] = useState('');
  const [showFind, setShowFind] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [loadStartedAt, setLoadStartedAt] = useState<number | null>(null);
  const [lastLoadMs, setLastLoadMs] = useState<number | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);

  // Record recents whenever this tab is shown.
  useEffect(() => {
    recordRecent({ connectionId: tab.connectionId, schema: tab.schema, table: tab.table });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.connectionId, tab.schema, tab.table]);

  const composedWhere = useMemo(
    () => combineWhere(
      filtersToSql(columnFilters, result?.columns.map((c) => c.name)),
      where,
    ),
    [columnFilters, where, result?.columns],
  );

  const load = useCallback(async () => {
    const startedAt = Date.now();
    setLoading(true);
    setError(null);
    setLoadStartedAt(startedAt);
    try {
      const [r, c, d] = await Promise.all([
        api.fetchTableRows(tab.connectionId, tab.schema, tab.table, {
          limit: pageSize, offset: page * pageSize, where: composedWhere || undefined,
        }),
        api.runQuery(tab.connectionId,
          `select count(*) from "${tab.schema}"."${tab.table}"` + (composedWhere ? ` where ${composedWhere}` : '')
        ),
        api.getTableDetails(tab.connectionId, tab.schema, tab.table),
      ]);
      if (!r.ok) { setError(r.error.message); setResult(null); }
      else { setResult(r.results[0]); }
      if (c.ok && c.results[0]?.rows[0]?.[0] != null) {
        setTotalCount(Number(c.results[0].rows[0][0]));
      }
      setDetails(d);
      setEdits(new Map());
      setNewRows([]);
      setDeletedKeys(new Set());
      setSelectedRowIdxs(new Set());
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
      setLastLoadMs(Date.now() - startedAt);
      setLoadStartedAt(null);
    }
  }, [tab.connectionId, tab.schema, tab.table, page, pageSize, composedWhere]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh on a configurable interval.
  useEffect(() => {
    if (!refreshInterval) return;
    const h = setInterval(() => load(), refreshInterval * 1000);
    return () => clearInterval(h);
  }, [refreshInterval, load]);

  // Cmd+F toggles the find bar.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setShowFind((v) => !v);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // Custom DOM-event-based shortcuts (Cmd+R / Cmd+Backspace come from App.tsx)
  useEffect(() => {
    const onRefresh = () => load();
    const onDeleteRows = () => deleteSelectedRows();
    window.addEventListener('mili:refresh-table', onRefresh as any);
    window.addEventListener('mili:delete-selected', onDeleteRows as any);
    return () => {
      window.removeEventListener('mili:refresh-table', onRefresh as any);
      window.removeEventListener('mili:delete-selected', onDeleteRows as any);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, selectedRowIdxs, result]);

  const pkCols = details?.columns.filter((c) => c.isPrimaryKey).map((c) => c.name) || [];

  function rowKey(row: any[]): string {
    if (!result || !pkCols.length) return '';
    const colIdx = (n: string) => result.columns.findIndex((c) => c.name === n);
    return pkCols.map((p) => String(row[colIdx(p)])).join('|');
  }

  const pendingChanges = edits.size + newRows.length + deletedKeys.size;

  async function saveChanges() {
    if (!result) return;
    if (!pkCols.length && (edits.size > 0 || deletedKeys.size > 0)) {
      showToast('error', 'Cannot edit/delete: table has no primary key');
      return;
    }
    const changes: RowChange[] = [];
    for (const [key, values] of edits) {
      const row = findRowByKey(result, pkCols, key);
      if (!row.length) continue;
      const pk: Record<string, any> = {};
      const colIdx = (n: string) => result.columns.findIndex((c) => c.name === n);
      for (const p of pkCols) pk[p] = row[colIdx(p)];
      changes.push({ kind: 'update', pk, values });
    }
    for (const k of deletedKeys) {
      const row = findRowByKey(result, pkCols, k);
      const pk: Record<string, any> = {};
      const colIdx = (n: string) => result.columns.findIndex((c) => c.name === n);
      for (const p of pkCols) pk[p] = row[colIdx(p)];
      changes.push({ kind: 'delete', pk });
    }
    for (const r of newRows) changes.push({ kind: 'insert', values: r });
    const res = await api.applyRowChanges(tab.connectionId, tab.schema, tab.table, changes);
    if (res.ok) { showToast('success', `Saved ${changes.length} change(s)`); load(); }
    else { showToast('error', res.error || 'Save failed'); }
  }

  function deleteSelectedRows() {
    if (!result || !selectedRowIdxs.size) return;
    if (!pkCols.length) { showToast('error', 'Cannot delete: table has no primary key'); return; }
    const keys: string[] = [];
    const rowSnaps: any[][] = [];
    for (const idx of selectedRowIdxs) {
      const r = result.rows[idx];
      if (!r) continue;
      keys.push(rowKey(r));
      rowSnaps.push(r);
    }
    setDeletedKeys((s) => {
      const n = new Set(s);
      for (const k of keys) n.add(k);
      return n;
    });
    setLastDeleted({ rows: rowSnaps, keys });
    setSelectedRowIdxs(new Set());
    showToast('info', `Marked ${keys.length} row(s) for delete. Press Save to commit.`);
  }

  function undoLastDelete() {
    if (!lastDeleted) return;
    setDeletedKeys((s) => {
      const n = new Set(s);
      for (const k of lastDeleted.keys) n.delete(k);
      return n;
    });
    setLastDeleted(null);
  }

  function duplicateSelectedRows() {
    if (!result || !selectedRowIdxs.size) return;
    const copies: Record<string, any>[] = [];
    for (const idx of selectedRowIdxs) {
      const row = result.rows[idx];
      if (!row) continue;
      const obj: Record<string, any> = {};
      result.columns.forEach((c, i) => {
        // Skip primary keys so the DB can re-generate them via defaults.
        if (pkCols.includes(c.name) && details?.columns.find((cc) => cc.name === c.name)?.isIdentity) return;
        obj[c.name] = row[i];
      });
      copies.push(obj);
    }
    setNewRows((cur) => [...cur, ...copies]);
    showToast('success', `Cloned ${copies.length} row(s) — review and Save`);
  }

  function copyAs(format: 'tsv' | 'csv' | 'json' | 'insert' | 'markdown', scope: 'selected' | 'all') {
    if (!result) return;
    const idxs = scope === 'all'
      ? result.rows.map((_, i) => i)
      : [...selectedRowIdxs].sort((a, b) => a - b);
    if (!idxs.length) { showToast('error', 'No rows selected'); return; }
    let text = '';
    if (format === 'tsv') text = rowsToTsv(result, idxs);
    else if (format === 'csv') text = rowsToCsv(result, idxs);
    else if (format === 'json') text = rowsToJson(result, idxs);
    else if (format === 'markdown') text = rowsToMarkdown(result, idxs);
    else text = rowsToInserts(result, idxs, { schema: tab.schema, table: tab.table });
    navigator.clipboard.writeText(text);
    showToast('success', `Copied ${idxs.length} row(s) as ${format.toUpperCase()}`);
  }

  function exportAs(format: 'csv' | 'json' | 'insert' | 'markdown') {
    if (!result) return;
    const idxs = result.rows.map((_, i) => i);
    const ext = format === 'insert' ? 'sql' : format === 'markdown' ? 'md' : format;
    let content = '';
    if (format === 'csv') content = rowsToCsv(result, idxs);
    else if (format === 'json') content = rowsToJson(result, idxs);
    else if (format === 'markdown') content = rowsToMarkdown(result, idxs);
    else content = rowsToInserts(result, idxs, { schema: tab.schema, table: tab.table });
    api.exportFile({
      content,
      defaultName: `${tab.table}.${ext}`,
      filters: [{ name: format.toUpperCase(), extensions: [ext] }],
    }).catch((e: any) => showToast('error', e?.message || 'Failed'));
  }

  function handleForeignKeyJump(fk: ForeignKeyDef, values: Record<string, any>) {
    // Build a WHERE clause for the target table and open it in a new tab.
    const conditions = fk.refColumns.map((c) =>
      `"${c}" = ${typeof values[c] === 'number' ? values[c] : `'${String(values[c]).replace(/'/g, "''")}'`}`,
    ).join(' AND ');
    const newId = openTableTab(tab.connectionId, fk.refSchema, fk.refTable, 'data');
    // Pass the where via a small custom event so the new tab can pick it up.
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('mili:apply-table-filter', { detail: { tabId: newId, where: conditions } }),
      );
    }, 50);
  }

  // Listen for FK-jump where clauses targeted at this tab.
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ tabId: string; where: string }>;
      if (ce.detail?.tabId === tabId) {
        setWhere(ce.detail.where);
        setColumnFilters([]);
        setPage(0);
      }
    };
    window.addEventListener('mili:apply-table-filter', handler);
    return () => window.removeEventListener('mili:apply-table-filter', handler);
  }, [tabId]);

  function onCellEdit(rowIdx: number, columnName: string, newValue: any) {
    if (!result) return;
    const row = result.rows[rowIdx];
    if (!row) return;
    const k = rowKey(row);
    if (!k) { showToast('error', 'No primary key — cannot stage edit'); return; }
    setEdits((m) => {
      const n = new Map(m);
      const cur = n.get(k) || {};
      n.set(k, { ...cur, [columnName]: newValue });
      return n;
    });
  }
  function onNewRowEdit(ni: number, columnName: string, newValue: any) {
    setNewRows((cur) => {
      const copy = [...cur];
      copy[ni] = { ...copy[ni], [columnName]: newValue };
      return copy;
    });
  }

  const totalPages = totalCount != null ? Math.max(1, Math.ceil(totalCount / pageSize)) : null;
  const isLastPage = !!result && (totalPages != null ? page >= totalPages - 1 : result.rowCount < pageSize);

  function clearColumnFilters() { setColumnFilters([]); setPage(0); }

  function buildRowContextItems(rowIdx: number): any[] {
    if (!result) return [];
    const copyFormats = ['tsv', 'csv', 'json', 'insert', 'markdown'] as const;
    const fmtIdx = [rowIdx];
    const items: any[] = [
      { label: 'Open cell inspector', onClick: () => setShowInspector(true) },
      { divider: true },
      ...copyFormats.map((f) => ({
        label: `Copy row as ${f.toUpperCase()}`,
        onClick: () => {
          const m = require('../../shared/grid-clipboard');
          let txt = '';
          if (f === 'tsv') txt = m.rowsToTsv(result, fmtIdx);
          else if (f === 'csv') txt = m.rowsToCsv(result, fmtIdx);
          else if (f === 'json') txt = m.rowsToJson(result, fmtIdx);
          else if (f === 'markdown') txt = m.rowsToMarkdown(result, fmtIdx);
          else txt = m.rowsToInserts(result, fmtIdx, { schema: tab.schema, table: tab.table });
          navigator.clipboard.writeText(txt);
          showToast('success', `Copied row as ${f.toUpperCase()}`);
        },
      })),
      { divider: true },
      {
        label: 'Clone row',
        onClick: () => {
          const row = result.rows[rowIdx];
          if (!row) return;
          const obj: Record<string, any> = {};
          result.columns.forEach((c, i) => {
            if (pkCols.includes(c.name) && details?.columns.find((cc) => cc.name === c.name)?.isIdentity) return;
            obj[c.name] = row[i];
          });
          setNewRows((cur) => [...cur, obj]);
          showToast('success', 'Row cloned — review & Save');
        },
      },
      {
        label: 'Delete row',
        danger: true,
        onClick: () => {
          if (!pkCols.length) { showToast('error', 'No primary key — cannot delete'); return; }
          const row = result.rows[rowIdx];
          const k = rowKey(row);
          if (!k) return;
          setDeletedKeys((s) => { const n = new Set(s); n.add(k); return n; });
          setLastDeleted({ rows: [row], keys: [k] });
          showToast('info', 'Row marked for delete — press Save to commit');
        },
      },
    ];
    return items;
  }

  // Build the SELECT statement that drives the current grid (for Show SQL).
  const generatedSql = useMemo(() => {
    const cols = '*';
    const w = composedWhere ? ` WHERE ${composedWhere}` : '';
    const limit = ` LIMIT ${pageSize} OFFSET ${page * pageSize}`;
    return `SELECT ${cols} FROM "${tab.schema}"."${tab.table}"${w}${limit};`;
  }, [tab.schema, tab.table, composedWhere, page, pageSize]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Top toolbar */}
      <div style={{ display: 'flex', gap: 6, padding: 6, borderBottom: '1px solid var(--hairline)', alignItems: 'center', background: 'var(--surface-base)', flexWrap: 'wrap' }}>
        <button className="btn" onClick={() => { load(); }} title="Refresh (⌘R)">
          <RefreshCw size={12} /> Refresh
        </button>

        <input
          className="input-sm"
          placeholder="WHERE filter (SQL)"
          value={where}
          onChange={(e) => setWhere(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { setPage(0); load(); } }}
          style={{ width: 240, fontFamily: 'var(--font-mono)' }}
        />
        <button
          className="btn"
          onClick={() => setShowBuilder((v) => !v)}
          title={showBuilder ? 'Hide filter builder' : 'Show filter builder'}
          style={{ color: showBuilder ? 'var(--accent)' : undefined }}
        >
          <FilterIcon size={12} /> {showBuilder ? 'Filters' : 'Filter…'}
          {columnFilters.length > 0 && (
            <span style={{ background: 'var(--accent)', color: 'var(--surface-deep)', borderRadius: 999, padding: '0 6px', fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
              {columnFilters.length}
            </span>
          )}
        </button>
        {columnFilters.length > 0 && (
          <button className="btn" onClick={clearColumnFilters} title="Clear column filters">
            <FilterIcon size={12} /> Clear {columnFilters.length}
          </button>
        )}

        <button className="btn" onClick={() => setShowColumnPicker((v) => !v)} title="Toggle column visibility">
          {visibleColumns ? <EyeOff size={12} /> : <Eye size={12} />} Columns
        </button>

        <div style={{ flex: 1 }} />

        {selectedRowIdxs.size > 0 && (
          <>
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
              {selectedRowIdxs.size} selected
            </span>
            <button className="btn" onClick={duplicateSelectedRows} title="Duplicate selected rows">
              <Copy size={12} /> Clone
            </button>
            <button className="btn btn-danger" onClick={deleteSelectedRows} title="Delete selected rows (⌘⌫)">
              <Trash2 size={12} /> Delete
            </button>
            <div style={{ borderLeft: '1px solid var(--hairline)', height: 22, margin: '0 4px' }} />
          </>
        )}

        {lastDeleted && (
          <button className="btn" onClick={undoLastDelete} title="Undo last delete">
            <Undo2 size={12} /> Undo delete
          </button>
        )}

        <button className="btn" onClick={() => setNewRows([...newRows, {}])} title="Add row">
          <Plus size={12} /> Row
        </button>
        <button
          className="btn"
          onClick={() => { setEdits(new Map()); setNewRows([]); setDeletedKeys(new Set()); setLastDeleted(null); }}
          disabled={pendingChanges === 0}
          title="Revert all pending changes"
        >
          <Undo2 size={12} /> Revert
        </button>
        <button
          className="btn btn-primary"
          onClick={saveChanges}
          disabled={pendingChanges === 0}
          title="Commit changes"
        >
          <Save size={12} /> Save {pendingChanges ? `(${pendingChanges})` : ''}
        </button>

        <div style={{ borderLeft: '1px solid var(--hairline)', height: 22, margin: '0 4px' }} />

        <CopyMenu onCopy={(fmt, scope) => copyAs(fmt, scope)} hasSelection={selectedRowIdxs.size > 0} />
        <ExportMenu onExport={exportAs} />
        <button className="btn" onClick={() => setShowImport(true)} title="Import CSV / TSV">
          ↑ Import
        </button>
        <button className="btn" onClick={() => setShowSql(true)} title="Show generated SQL">
          <Code2 size={12} /> SQL
        </button>
        <select
          className="input-sm"
          value={refreshInterval}
          onChange={(e) => setRefreshInterval(Number(e.target.value))}
          title="Auto-refresh interval"
          style={{ padding: '2px 6px', fontSize: 11, width: 76 }}
        >
          <option value={0}>↻ off</option>
          <option value={5}>↻ 5s</option>
          <option value={15}>↻ 15s</option>
          <option value={30}>↻ 30s</option>
          <option value={60}>↻ 60s</option>
        </select>
        <button
          className="btn-icon"
          title={freezeFirstCol ? 'Unfreeze first column' : 'Freeze first column'}
          onClick={() => setFreezeFirstCol((v) => !v)}
          style={{ color: freezeFirstCol ? 'var(--accent)' : undefined }}
        >
          ⫷
        </button>
        <button
          className="btn-icon"
          title={wrapCells ? 'Truncate cells' : 'Wrap cell text'}
          onClick={() => setWrapCells((v) => !v)}
          style={{ color: wrapCells ? 'var(--accent)' : undefined }}
        >
          ↩
        </button>
        <button
          className="btn-icon"
          title="Find in result (⌘F)"
          onClick={() => setShowFind((v) => !v)}
          style={{ color: showFind ? 'var(--accent)' : undefined }}
        >
          🔍
        </button>
        <button
          className="btn-icon"
          title={showInspector ? 'Hide cell inspector' : 'Show cell inspector'}
          onClick={() => setShowInspector((v) => !v)}
        >
          {showInspector ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
        </button>
        {loading && <ElapsedBadge startedAt={loadStartedAt} label="Loading" />}
      </div>
      <ProgressBar running={loading} />

      {showBuilder && result && (
        <FilterBuilder
          columns={result.columns.map((c) => ({ name: c.name, dataType: c.dataType }))}
          filters={columnFilters}
          onChange={(next) => { setColumnFilters(next); setPage(0); }}
          onApply={() => { setPage(0); load(); }}
        />
      )}

      {showFind && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--surface-base)', borderBottom: '1px solid var(--hairline)' }}>
          <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>Find in result:</span>
          <input
            autoFocus
            className="input-sm"
            placeholder="substring filter on rendered values"
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setFindText(''); setShowFind(false); } }}
            style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12 }}
          />
          {findText && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>filter active</span>}
          <button className="btn-icon" onClick={() => { setFindText(''); setShowFind(false); }}>×</button>
        </div>
      )}

      {/* Filter chip row */}
      {columnFilters.length > 0 && (
        <div style={{ display: 'flex', gap: 6, padding: '6px 8px', flexWrap: 'wrap', background: 'var(--surface-base)', borderBottom: '1px solid var(--hairline)' }}>
          {columnFilters.map((f, i) => (
            <span
              key={i}
              className="tag"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--accent-tint)', color: 'var(--accent)' }}
            >
              {f.column} {opLabel(f.op)} {f.value && <code>{f.value}</code>}
              <button
                onClick={() => setColumnFilters(columnFilters.filter((_, j) => j !== i))}
                style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Column picker */}
      {showColumnPicker && result && (
        <div style={{ display: 'flex', gap: 8, padding: 8, flexWrap: 'wrap', background: 'var(--surface-base)', borderBottom: '1px solid var(--hairline)' }}>
          <button className="btn" onClick={() => setVisibleColumns(null)}>Show all</button>
          <button
            className="btn"
            onClick={() => setVisibleColumns(new Set(pkCols))}
            disabled={!pkCols.length}
          >Only PK</button>
          {result.columns.map((c) => {
            const isShown = !visibleColumns || visibleColumns.has(c.name);
            return (
              <label key={c.name} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 12, padding: '2px 6px', background: isShown ? 'var(--surface-hover)' : 'transparent', borderRadius: 4 }}>
                <input
                  type="checkbox"
                  checked={isShown}
                  onChange={(e) => {
                    const cur = visibleColumns ? new Set(visibleColumns) : new Set(result.columns.map((c) => c.name));
                    if (e.target.checked) cur.add(c.name);
                    else cur.delete(c.name);
                    setVisibleColumns(cur);
                  }}
                />
                {c.name}
              </label>
            );
          })}
        </div>
      )}

      {/* Grid + inspector */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative', display: 'flex' }}>
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          {loading && (
            <div style={{ position: 'absolute', top: 10, right: 14, zIndex: 10 }}>
              <span className="spinner" />
            </div>
          )}
          {error && (
            <div style={{ padding: 14, color: 'var(--danger)', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              {error}
            </div>
          )}
          {result && !error && (
            <ResultGrid
              result={result}
              editable={pkCols.length > 0}
              edits={edits}
              pendingNewRows={newRows}
              deletedKeys={deletedKeys}
              pkCols={pkCols}
              onCellEdit={onCellEdit}
              onNewRowEdit={onNewRowEdit}
              selectedRowIdxs={selectedRowIdxs}
              onSelectionChange={setSelectedRowIdxs}
              onActiveCellChange={setActiveCell}
              onRowContextMenu={(e, rowIdx) => setRowContext({ x: e.clientX, y: e.clientY, rowIdx })}
              filters={columnFilters}
              onFiltersChange={(next) => { setColumnFilters(next); setPage(0); }}
              foreignKeys={details?.foreignKeys || []}
              onForeignKeyJump={handleForeignKeyJump}
              visibleColumns={visibleColumns}
              freezeFirstColumn={freezeFirstCol}
              wrapCells={wrapCells}
              findText={findText}
              emptyMessage={
                columnFilters.length || where
                  ? 'No rows match the current filters.'
                  : '0 rows.'
              }
            />
          )}
        </div>
        {showInspector && activeCell && result && (
          <div style={{ width: 320, flexShrink: 0 }}>
            <CellInspector
              connectionId={tab.connectionId}
              schema={tab.schema}
              table={tab.table}
              columnName={activeCell.columnName}
              columnType={activeCell.columnType}
              currentValue={activeCell.value}
              editable={pkCols.length > 0}
              onApplyValue={(v) => onCellEdit(activeCell.rowIdx, activeCell.columnName, v)}
              onFilterByValue={(v) => {
                const op = v == null ? 'is-null' : 'eq';
                setColumnFilters([{
                  column: activeCell.columnName,
                  op: op as any,
                  value: v == null ? undefined : String(v),
                }]);
                setPage(0);
              }}
              onClose={() => setShowInspector(false)}
            />
          </div>
        )}
        {rowContext && (
          <ContextMenu
            x={rowContext.x}
            y={rowContext.y}
            items={buildRowContextItems(rowContext.rowIdx)}
            onClose={() => setRowContext(null)}
          />
        )}
      </div>

      {/* Status bar / pagination */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
        background: 'var(--surface-raised)', borderTop: '1px solid var(--hairline)',
        fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)',
      }}>
        <span>
          {result ? (
            <>
              Rows {page * pageSize + 1}–{page * pageSize + result.rowCount}
              {totalCount != null && ` of ${totalCount.toLocaleString()}`}
              {' · '}
              <span title="Wall-clock time including count+details fetches">
                load {lastLoadMs != null ? formatElapsed(lastLoadMs) : `${result.durationMs ?? '?'} ms`}
              </span>
            </>
          ) : '—'}
        </span>
        <div style={{ flex: 1 }} />

        <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          Page size
          <select
            className="input-sm"
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
            style={{ padding: '2px 6px', fontSize: 11 }}
          >
            {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>

        <button className="btn-icon" disabled={page === 0} onClick={() => setPage(0)} title="First page">
          <ChevronsLeft size={13} />
        </button>
        <button className="btn-icon" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} title="Previous page">
          <ChevronLeft size={13} />
        </button>

        <span style={{ minWidth: 80, textAlign: 'center' }}>
          <input
            className="input-sm"
            style={{ width: 40, padding: '2px 4px', fontSize: 11, textAlign: 'center' }}
            value={pageInput || String(page + 1)}
            onChange={(e) => setPageInput(e.target.value)}
            onBlur={() => {
              const n = parseInt(pageInput, 10);
              if (!Number.isNaN(n) && totalPages) setPage(Math.max(0, Math.min(totalPages - 1, n - 1)));
              setPageInput('');
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
          {totalPages ? ` / ${totalPages}` : ''}
        </span>

        <button className="btn-icon" disabled={isLastPage} onClick={() => setPage((p) => p + 1)} title="Next page">
          <ChevronRight size={13} />
        </button>
        <button className="btn-icon" disabled={isLastPage || totalPages == null} onClick={() => totalPages && setPage(totalPages - 1)} title="Last page">
          <ChevronsRight size={13} />
        </button>
      </div>

      {showImport && (
        <ImportCsvModal
          open
          onClose={() => { setShowImport(false); load(); }}
          connectionId={tab.connectionId}
          schema={tab.schema}
          table={tab.table}
        />
      )}

      {showSql && (
        <div className="modal-backdrop" onClick={() => setShowSql(false)}>
          <div className="modal" style={{ width: 700, maxHeight: '70vh' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: 12, borderBottom: '1px solid var(--hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>Generated SQL</strong>
              <button className="btn" onClick={() => { navigator.clipboard.writeText(generatedSql); showToast('success', 'SQL copied'); }}>
                <Copy size={12} /> Copy
              </button>
            </div>
            <pre style={{ padding: 16, margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)', whiteSpace: 'pre-wrap', overflow: 'auto' }}>
              {generatedSql}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function CopyMenu({ onCopy, hasSelection }: { onCopy: (fmt: any, scope: 'selected' | 'all') => void; hasSelection: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button className="btn" onClick={() => setOpen((v) => !v)} title="Copy as...">
        <Copy size={12} /> Copy
      </button>
      {open && (
        <div className="context-menu" style={{ top: 32, right: 0, position: 'absolute' }} onMouseLeave={() => setOpen(false)}>
          {hasSelection && (
            <>
              <div className="section-title" style={{ padding: '4px 10px' }}>Selected rows</div>
              <div className="context-menu-item" onClick={() => { onCopy('tsv', 'selected'); setOpen(false); }}>as TSV (⌘C)</div>
              <div className="context-menu-item" onClick={() => { onCopy('csv', 'selected'); setOpen(false); }}>as CSV</div>
              <div className="context-menu-item" onClick={() => { onCopy('json', 'selected'); setOpen(false); }}>as JSON</div>
              <div className="context-menu-item" onClick={() => { onCopy('insert', 'selected'); setOpen(false); }}>as INSERT statements</div>
              <div className="context-menu-item" onClick={() => { onCopy('markdown', 'selected'); setOpen(false); }}>as Markdown</div>
              <div className="context-menu-divider" />
            </>
          )}
          <div className="section-title" style={{ padding: '4px 10px' }}>All visible rows</div>
          <div className="context-menu-item" onClick={() => { onCopy('tsv', 'all'); setOpen(false); }}>as TSV</div>
          <div className="context-menu-item" onClick={() => { onCopy('csv', 'all'); setOpen(false); }}>as CSV</div>
          <div className="context-menu-item" onClick={() => { onCopy('json', 'all'); setOpen(false); }}>as JSON</div>
          <div className="context-menu-item" onClick={() => { onCopy('insert', 'all'); setOpen(false); }}>as INSERT statements</div>
          <div className="context-menu-item" onClick={() => { onCopy('markdown', 'all'); setOpen(false); }}>as Markdown</div>
        </div>
      )}
    </div>
  );
}

function ExportMenu({ onExport }: { onExport: (fmt: any) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button className="btn" onClick={() => setOpen((v) => !v)} title="Export...">
        <FileDown size={12} /> Export
      </button>
      {open && (
        <div className="context-menu" style={{ top: 32, right: 0, position: 'absolute' }} onMouseLeave={() => setOpen(false)}>
          <div className="context-menu-item" onClick={() => { onExport('csv'); setOpen(false); }}>CSV</div>
          <div className="context-menu-item" onClick={() => { onExport('json'); setOpen(false); }}>JSON</div>
          <div className="context-menu-item" onClick={() => { onExport('insert'); setOpen(false); }}>INSERT script (.sql)</div>
          <div className="context-menu-item" onClick={() => { onExport('markdown'); setOpen(false); }}>Markdown (.md)</div>
        </div>
      )}
    </div>
  );
}

function StructureView({ tab }: { tab: any }) {
  const showToast = useApp((s) => s.showToast);
  const [details, setDetails] = useState<TableDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewSql, setViewSql] = useState<string>('');
  const [ddl, setDdl] = useState<
    | { kind: 'rename-col'; column: string }
    | { kind: 'drop-col'; column: string }
    | null
  >(null);
  const [reload, setReload] = useState(0);
  const refresh = () => setReload((r) => r + 1);

  useEffect(() => {
    (async () => {
      try {
        const d = await api.getTableDetails(tab.connectionId, tab.schema, tab.table);
        setDetails(d);
        if (d.kind === 'v' || d.kind === 'm') {
          try {
            const v = await api.getViewDefinition(tab.connectionId, tab.schema, tab.table);
            setViewSql(v);
          } catch {}
        }
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    })();
  }, [tab.connectionId, tab.schema, tab.table, reload]);

  async function setNullable(col: string, nullable: boolean) {
    const sql = `ALTER TABLE "${tab.schema}"."${tab.table}" ALTER COLUMN "${col}" ${nullable ? 'DROP NOT NULL' : 'SET NOT NULL'}`;
    if (!confirm(sql + '?')) return;
    const r = await api.runQuery(tab.connectionId, sql);
    if (r.ok) { showToast('success', 'Updated'); refresh(); }
    else showToast('error', r.error.message);
  }
  async function setDefaultPrompt(col: string, current: string | null) {
    const next = prompt(`Default expression for "${col}" (blank to DROP DEFAULT):`, current || '');
    if (next === null) return;
    const sql = next
      ? `ALTER TABLE "${tab.schema}"."${tab.table}" ALTER COLUMN "${col}" SET DEFAULT ${next}`
      : `ALTER TABLE "${tab.schema}"."${tab.table}" ALTER COLUMN "${col}" DROP DEFAULT`;
    const r = await api.runQuery(tab.connectionId, sql);
    if (r.ok) { showToast('success', 'Updated'); refresh(); }
    else showToast('error', r.error.message);
  }
  async function setTypePrompt(col: string, current: string) {
    const next = prompt(`New type for "${col}" (current: ${current})`, current);
    if (!next || next === current) return;
    const sql = `ALTER TABLE "${tab.schema}"."${tab.table}" ALTER COLUMN "${col}" TYPE ${next} USING "${col}"::${next}`;
    if (!confirm(sql + '?')) return;
    const r = await api.runQuery(tab.connectionId, sql);
    if (r.ok) { showToast('success', 'Type changed'); refresh(); }
    else showToast('error', r.error.message);
  }

  if (error) return <div style={{ padding: 16, color: 'var(--danger)' }}>{error}</div>;
  if (!details) return <div style={{ padding: 16, color: 'var(--ink-3)' }}>Loading…</div>;

  const createScript = generateCreateScript(details);

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 18 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{details.schema}.{details.name}</h2>
        <span className="tag">{kindLabel(details.kind)}</span>
        <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>
          {details.estimatedRows.toLocaleString()} rows · {details.size}
        </span>
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={() => {
          navigator.clipboard.writeText(`${details.schema}.${details.name}`);
          showToast('success', 'Copied fully-qualified name');
        }}>
          <Copy size={12} /> Copy name
        </button>
        <button className="btn" onClick={() => {
          navigator.clipboard.writeText(createScript);
          showToast('success', 'Copied CREATE statement');
        }}>
          <Copy size={12} /> Copy CREATE
        </button>
      </div>
      {details.comment && <p style={{ color: 'var(--ink-2)' }}>{details.comment}</p>}

      <Section title="Columns">
        <Table headers={['#', 'Name', 'Type', 'Nullable', 'Default', 'PK', 'Comment', '']}>
          {details.columns.map((c) => (
            <tr key={c.name}>
              <td style={{ color: 'var(--ink-3)' }}>{c.position}</td>
              <td style={{ fontWeight: 600 }}>{c.name}</td>
              <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{c.fullType}</td>
              <td>{c.nullable ? 'YES' : 'NO'}</td>
              <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>{c.default || ''}</td>
              <td>{c.isPrimaryKey ? '★' : ''}{c.isIdentity ? ' ID' : ''}</td>
              <td style={{ color: 'var(--ink-3)' }}>{c.comment || ''}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <ColumnActions
                  onRename={() => setDdl({ kind: 'rename-col', column: c.name })}
                  onDrop={() => setDdl({ kind: 'drop-col', column: c.name })}
                  onToggleNullable={() => setNullable(c.name, !c.nullable)}
                  onSetDefault={() => setDefaultPrompt(c.name, c.default)}
                  onSetType={() => setTypePrompt(c.name, c.fullType)}
                  nullable={c.nullable}
                />
              </td>
            </tr>
          ))}
        </Table>
      </Section>

      {details.indexes.length > 0 && (
        <Section title="Indexes">
          <Table headers={['Name', 'Definition', 'Unique', 'Primary', 'Size']}>
            {details.indexes.map((i) => (
              <tr key={i.name}>
                <td style={{ fontWeight: 600 }}>{i.name}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{i.definition}</td>
                <td>{i.isUnique ? 'YES' : ''}</td>
                <td>{i.isPrimary ? 'YES' : ''}</td>
                <td>{i.size}</td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      {details.foreignKeys.length > 0 && (
        <Section title="Foreign keys">
          <Table headers={['Name', 'Columns', 'References', 'On Delete', 'On Update']}>
            {details.foreignKeys.map((f) => (
              <tr key={f.name}>
                <td style={{ fontWeight: 600 }}>{f.name}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{f.columns.join(', ')}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{f.refSchema}.{f.refTable}({f.refColumns.join(', ')})</td>
                <td>{f.onDelete}</td>
                <td>{f.onUpdate}</td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      {details.constraints.length > 0 && (
        <Section title="Constraints">
          <Table headers={['Name', 'Type', 'Definition']}>
            {details.constraints.map((c) => (
              <tr key={c.name}>
                <td style={{ fontWeight: 600 }}>{c.name}</td>
                <td>{conTypeLabel(c.type)}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{c.definition}</td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      {details.triggers.length > 0 && (
        <Section title="Triggers">
          {details.triggers.map((t) => (
            <pre key={t.name} style={{ background: 'var(--surface-base)', padding: 10, borderRadius: 6, fontSize: 11, whiteSpace: 'pre-wrap', margin: '6px 0' }}>
              {t.definition}
            </pre>
          ))}
        </Section>
      )}

      {viewSql && (
        <Section title="View definition">
          <pre style={{ background: 'var(--surface-base)', padding: 12, borderRadius: 6, fontSize: 12, whiteSpace: 'pre-wrap' }}>
            {viewSql}
          </pre>
        </Section>
      )}

      <Section title="CREATE script">
        <pre style={{ background: 'var(--surface-base)', padding: 12, borderRadius: 6, fontSize: 12, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)' }}>
          {createScript}
        </pre>
      </Section>

      {ddl?.kind === 'rename-col' && (
        <RenameModal
          open
          onClose={() => { setDdl(null); refresh(); }}
          connectionId={tab.connectionId}
          schema={tab.schema}
          table={tab.table}
          column={ddl.column}
        />
      )}
      {ddl?.kind === 'drop-col' && (
        <DropColumnModal
          open
          onClose={() => { setDdl(null); refresh(); }}
          connectionId={tab.connectionId}
          schema={tab.schema}
          table={tab.table}
          column={ddl.column}
        />
      )}
    </div>
  );
}

function ColumnActions({ onRename, onDrop, onToggleNullable, onSetDefault, onSetType, nullable }: any) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button className="btn-icon" onClick={() => setOpen((v) => !v)} title="Column actions" style={{ padding: 2 }}>⋯</button>
      {open && (
        <div className="context-menu" style={{ right: 0, top: 22, position: 'absolute', minWidth: 220 }} onMouseLeave={() => setOpen(false)}>
          <div className="context-menu-item" onClick={() => { onRename(); setOpen(false); }}>Rename…</div>
          <div className="context-menu-item" onClick={() => { onSetType(); setOpen(false); }}>Change type…</div>
          <div className="context-menu-item" onClick={() => { onSetDefault(); setOpen(false); }}>Set / drop DEFAULT…</div>
          <div className="context-menu-item" onClick={() => { onToggleNullable(); setOpen(false); }}>
            {nullable ? 'SET NOT NULL' : 'DROP NOT NULL'}
          </div>
          <div className="context-menu-divider" />
          <div className="context-menu-item danger" onClick={() => { onDrop(); setOpen(false); }}>Drop column…</div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: any) {
  return (
    <div style={{ marginTop: 22 }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', fontWeight: 600 }}>{title}</h3>
      {children}
    </div>
  );
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ background: 'var(--surface-raised)', textAlign: 'left' }}>
          {headers.map((h) => (
            <th key={h} style={{ padding: '8px 12px', borderBottom: '1px solid var(--hairline)', fontWeight: 600, fontSize: 10.5, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function shortVersion(v?: string): string {
  if (!v) return 'pg';
  const m = /PostgreSQL\s+([0-9]+(?:\.[0-9]+)*)/i.exec(v);
  return m ? `pg ${m[1]}` : v.split(/\s+/).slice(0, 2).join(' ');
}

function kindLabel(k: string) {
  return { r: 'TABLE', v: 'VIEW', m: 'MATERIALIZED VIEW', p: 'PARTITIONED', f: 'FOREIGN' }[k] || k;
}
function conTypeLabel(t: string) {
  return { p: 'PRIMARY KEY', u: 'UNIQUE', c: 'CHECK', f: 'FOREIGN KEY', x: 'EXCLUSION' }[t] || t;
}

function findRowByKey(result: QueryResult, pkCols: string[], key: string): any[] {
  const colIdx = (n: string) => result.columns.findIndex((c) => c.name === n);
  for (const r of result.rows) {
    const k = pkCols.map((p) => String(r[colIdx(p)])).join('|');
    if (k === key) return r;
  }
  return [];
}
