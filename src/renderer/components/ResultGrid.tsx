import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { QueryResult, ForeignKeyDef } from '../../shared/types';
import { computeVirtRange } from '../../shared/grid-virt';
import { rowsToTsv } from '../../shared/grid-clipboard';
import type { ColumnFilter, FilterOp } from '../../shared/grid-filters';
import { FILTER_OP_GROUPS, opLabel, isNullary, isBinary } from '../../shared/grid-filters';
import { Filter, ExternalLink, X as XIcon } from 'lucide-react';

interface CellPos { row: number; col: number; }

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return Number(n.toFixed(6)).toString();
}

const ROW_HEIGHT = 26;
const HEADER_HEIGHT = 28;
const FILTER_ROW_HEIGHT = 32;
const OVERSCAN = 12;
const SELECT_COL_W = 36;
const ROWNUM_COL_W = 48;

export interface SortKey { col: number; dir: 'asc' | 'desc'; }

export interface ResultGridProps {
  result: QueryResult;
  // Optional editing surface.
  editable?: boolean;
  edits?: Map<string, Record<string, any>>;
  pendingNewRows?: Record<string, any>[]; // appended *after* result.rows
  deletedKeys?: Set<string>;
  pkCols?: string[];
  onCellEdit?: (rowIdx: number, columnName: string, newValue: any) => void;
  onNewRowEdit?: (newRowIdx: number, columnName: string, newValue: any) => void;
  /** Called when the selected cell changes — used to drive the CellInspector. */
  onActiveCellChange?: (info: { rowIdx: number; columnIdx: number; columnName: string; columnType: string; value: any } | null) => void;
  /** Row right-click context menu. */
  onRowContextMenu?: (e: React.MouseEvent, rowIdx: number) => void;
  // Selection.
  selectedRowIdxs?: Set<number>;
  onSelectionChange?: (next: Set<number>) => void;
  // Per-column filters.
  filters?: ColumnFilter[];
  onFiltersChange?: (next: ColumnFilter[]) => void;
  // Foreign key click-through.
  foreignKeys?: ForeignKeyDef[];
  onForeignKeyJump?: (fk: ForeignKeyDef, values: Record<string, any>) => void;
  // Visible columns by name. Undefined => all visible.
  visibleColumns?: Set<string> | null;
  onColumnVisibilityChange?: (next: Set<string>) => void;
  // Empty-state override (e.g. "No rows match filters").
  emptyMessage?: string;
  /** Sticky-left first column. */
  freezeFirstColumn?: boolean;
  /** Allow row cells to wrap onto multiple lines instead of truncating. */
  wrapCells?: boolean;
  /** Substring filter applied client-side to rendered cell text. */
  findText?: string;
}

export function ResultGrid(props: ResultGridProps) {
  const {
    result,
    editable = false,
    edits,
    pendingNewRows = [],
    deletedKeys,
    pkCols = [],
    onCellEdit,
    onNewRowEdit,
    selectedRowIdxs,
    onSelectionChange,
    onActiveCellChange,
    onRowContextMenu,
    filters = [],
    onFiltersChange,
    foreignKeys = [],
    onForeignKeyJump,
    visibleColumns,
    emptyMessage = '0 rows',
    freezeFirstColumn = false,
    wrapCells = false,
    findText = '',
  } = props;

  const [sortKeys, setSortKeys] = useState<SortKey[]>([]);
  const [selected, _setSelected] = useState<CellPos | null>(null);
  const setSelected = (s: CellPos | null) => {
    _setSelected(s);
    if (!s) { onActiveCellChange?.(null); return; }
    const origIdx = sortedRowsRef.current?.[s.row]?.[0];
    if (origIdx == null) return;
    const col = result.columns[s.col];
    if (!col) return;
    const val = effectiveValueRef.current?.(origIdx, s.col);
    onActiveCellChange?.({ rowIdx: origIdx, columnIdx: s.col, columnName: col.name, columnType: col.dataType, value: val });
  };
  const [colWidths, setColWidths] = useState<number[]>(() => result.columns.map(() => 160));
  const [inspect, setInspect] = useState<any>(null);
  const [showFilterRow, setShowFilterRow] = useState<boolean>((filters?.length ?? 0) > 0);
  const [editing, setEditing] = useState<CellPos | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  // Refs used by the setSelected closure (declared above before sortedRows is
  // defined to keep the JSX simple).
  const sortedRowsRef = useRef<readonly (readonly [number, any[]])[]>([]);
  const effectiveValueRef = useRef<((origIdx: number, ci: number) => any) | null>(null);

  // Reset width measurements when columns change.
  useEffect(() => {
    setColWidths(result.columns.map((c, i) => {
      let w = Math.max(80, c.name.length * 8 + 30);
      for (let j = 0; j < Math.min(20, result.rows.length); j++) {
        const v = result.rows[j][i];
        if (v != null) {
          const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
          w = Math.max(w, Math.min(360, s.length * 7 + 16));
        }
      }
      return w;
    }));
    setSortKeys([]);
  }, [result]);

  // Combined row set: original rows + pending new rows (appended).
  const allRows = useMemo(() => [...result.rows, ...pendingNewRows.map((r) => {
    return result.columns.map((c) => (r[c.name] ?? null));
  })], [result.rows, pendingNewRows, result.columns]);

  const fkByCol = useMemo(() => {
    const m = new Map<string, ForeignKeyDef>();
    for (const fk of foreignKeys) {
      // Show the badge on every single-column FK only (multi-column FKs are still
      // navigable but UX gets noisy if we badge every column).
      if (fk.columns.length === 1) m.set(fk.columns[0], fk);
    }
    return m;
  }, [foreignKeys]);

  const visibleColIdx = useMemo(() => {
    if (!visibleColumns) return result.columns.map((_, i) => i);
    return result.columns
      .map((c, i) => (visibleColumns.has(c.name) ? i : -1))
      .filter((i) => i >= 0);
  }, [result.columns, visibleColumns]);

  // Client-side find: a substring filter applied against the joined-row text.
  const findFiltered = useMemo(() => {
    if (!findText) return allRows;
    const needle = findText.toLowerCase();
    return allRows.filter((row) => {
      for (const v of row) {
        if (v == null) continue;
        const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
        if (s.toLowerCase().includes(needle)) return true;
      }
      return false;
    });
  }, [allRows, findText]);

  // Sorting.
  const sortedRows = useMemo(() => {
    if (!sortKeys.length) return findFiltered.map((r, i) => [allRows.indexOf(r), r] as const);
    const indexed = findFiltered.map((r) => [allRows.indexOf(r), r] as const);
    indexed.sort(([_, a], [__, b]) => {
      for (const sk of sortKeys) {
        const av = a[sk.col], bv = b[sk.col];
        if (av == null && bv == null) continue;
        if (av == null) return 1;
        if (bv == null) return -1;
        let cmp = 0;
        if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
        else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
        if (cmp !== 0) return sk.dir === 'asc' ? cmp : -cmp;
      }
      return 0;
    });
    return indexed;
  }, [allRows, sortKeys, findFiltered]);

  // Keep the ref in sync so the (lifted) setSelected closure can resolve rows.
  sortedRowsRef.current = sortedRows as any;

  function toggleSort(i: number, additive: boolean) {
    setSortKeys((cur) => {
      const existing = cur.findIndex((sk) => sk.col === i);
      if (!additive) {
        if (existing >= 0) {
          const sk = cur[existing];
          if (sk.dir === 'asc') return [{ col: i, dir: 'desc' }];
          return []; // third click clears
        }
        return [{ col: i, dir: 'asc' }];
      }
      // shift-click: additive multi-sort
      if (existing >= 0) {
        const sk = cur[existing];
        const next = [...cur];
        if (sk.dir === 'asc') next[existing] = { col: i, dir: 'desc' };
        else next.splice(existing, 1);
        return next;
      }
      return [...cur, { col: i, dir: 'asc' }];
    });
  }

  function startResize(i: number, e: React.MouseEvent) {
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidths[i];
    const onMove = (ev: MouseEvent) => {
      const next = [...colWidths];
      next[i] = Math.max(40, startW + (ev.clientX - startX));
      setColWidths(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  /**
   * Double-click the column resizer to auto-fit the column to the widest
   * content currently in the page slice (capped to a sane max).
   */
  function autoFitColumn(i: number) {
    const c = result.columns[i];
    let w = Math.max(80, c.name.length * 8 + 30);
    for (let j = 0; j < result.rows.length; j++) {
      const v = result.rows[j][i];
      if (v == null) continue;
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      // 7px per char is an empirical average for JetBrains Mono at 13px.
      w = Math.max(w, Math.min(720, s.length * 7 + 24));
    }
    const next = [...colWidths]; next[i] = w; setColWidths(next);
  }

  function rowKeyAt(origIdx: number): string {
    if (origIdx >= result.rows.length) return ''; // pending insert row
    if (!pkCols.length) return '';
    const row = result.rows[origIdx];
    const colIdx = (n: string) => result.columns.findIndex((c) => c.name === n);
    return pkCols.map((p) => String(row[colIdx(p)])).join('|');
  }

  function effectiveValue(origIdx: number, ci: number): any {
    // For pending new rows, value lives in pendingNewRows.
    if (origIdx >= result.rows.length) {
      const ni = origIdx - result.rows.length;
      return pendingNewRows[ni]?.[result.columns[ci].name] ?? null;
    }
    const k = rowKeyAt(origIdx);
    if (k && edits?.has(k)) {
      const patch = edits.get(k)!;
      const name = result.columns[ci].name;
      if (Object.prototype.hasOwnProperty.call(patch, name)) return patch[name];
    }
    return result.rows[origIdx][ci];
  }
  // Expose latest closures for the setSelected setter declared earlier.
  effectiveValueRef.current = effectiveValue;
  // sortedRowsRef updated below once sortedRows exists.

  function isCellEdited(origIdx: number, ci: number): boolean {
    if (origIdx >= result.rows.length) return false;
    const k = rowKeyAt(origIdx);
    if (!k || !edits?.has(k)) return false;
    return Object.prototype.hasOwnProperty.call(edits.get(k)!, result.columns[ci].name);
  }

  function isRowDeleted(origIdx: number): boolean {
    if (origIdx >= result.rows.length) return false;
    const k = rowKeyAt(origIdx);
    return !!k && !!deletedKeys?.has(k);
  }
  function isRowNew(origIdx: number): boolean {
    return origIdx >= result.rows.length;
  }

  function commitEdit() {
    if (!editing) return;
    const origIdx = sortedRows[editing.row][0];
    const name = result.columns[editing.col].name;
    let parsed: any = editValue;
    // Try to keep numeric / bool types intact when input matches.
    const dt = result.columns[editing.col].dataType.toLowerCase();
    if (editValue === '') parsed = null;
    else if (/(int|numeric|float|real|double)/.test(dt)) {
      const n = Number(editValue);
      parsed = Number.isFinite(n) ? n : editValue;
    } else if (dt === 'bool' && /^(t|true|f|false|1|0)$/i.test(editValue)) {
      parsed = /^(t|true|1)$/i.test(editValue);
    }
    if (origIdx >= result.rows.length) {
      onNewRowEdit?.(origIdx - result.rows.length, name, parsed);
    } else {
      onCellEdit?.(origIdx, name, parsed);
    }
    setEditing(null);
  }

  function startEditCell(rowDisplayIdx: number, ci: number) {
    if (!editable || !onCellEdit) return;
    const origIdx = sortedRows[rowDisplayIdx][0];
    if (isRowDeleted(origIdx)) return;
    const cur = effectiveValue(origIdx, ci);
    setEditValue(cur == null ? '' : typeof cur === 'object' ? JSON.stringify(cur) : String(cur));
    setEditing({ row: rowDisplayIdx, col: ci });
    setTimeout(() => editInputRef.current?.focus(), 0);
  }

  // --- Selection helpers (multi-row) ---
  function toggleRowSelection(origIdx: number, additive: boolean) {
    if (!onSelectionChange) return;
    const cur = selectedRowIdxs ? new Set(selectedRowIdxs) : new Set<number>();
    if (additive) {
      cur.has(origIdx) ? cur.delete(origIdx) : cur.add(origIdx);
    } else {
      if (cur.size === 1 && cur.has(origIdx)) {
        cur.clear();
      } else {
        cur.clear();
        cur.add(origIdx);
      }
    }
    onSelectionChange(cur);
  }

  function selectAll() {
    if (!onSelectionChange) return;
    const all = new Set<number>();
    for (let i = 0; i < result.rows.length; i++) all.add(i);
    onSelectionChange(all);
  }
  function clearSelection() { onSelectionChange?.(new Set()); }

  // Keyboard handling.
  const onKey = useCallback((e: React.KeyboardEvent) => {
    if (editing) return; // let the input handle keys
    // Cmd+A select all rows
    if ((e.metaKey || e.ctrlKey) && e.key === 'a' && onSelectionChange) {
      e.preventDefault();
      selectAll();
      return;
    }
    // Cmd+C copy: prefer selected rows; else selected cell.
    if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
      e.preventDefault();
      if (selectedRowIdxs && selectedRowIdxs.size > 0) {
        const idxs = [...selectedRowIdxs].sort((a, b) => a - b);
        navigator.clipboard.writeText(rowsToTsv(result, idxs));
      } else if (selected) {
        const origIdx = sortedRows[selected.row][0];
        const v = effectiveValue(origIdx, selected.col);
        navigator.clipboard.writeText(
          v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v),
        );
      }
      return;
    }
    if (e.key === 'Escape') {
      if (selectedRowIdxs && selectedRowIdxs.size) clearSelection();
      setSelected(null);
      return;
    }
    if (!selected) return;
    if (e.key === 'ArrowDown') { setSelected({ ...selected, row: Math.min(sortedRows.length - 1, selected.row + 1) }); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { setSelected({ ...selected, row: Math.max(0, selected.row - 1) }); e.preventDefault(); }
    else if (e.key === 'Home') { setSelected({ ...selected, row: 0 }); e.preventDefault(); }
    else if (e.key === 'End') { setSelected({ ...selected, row: sortedRows.length - 1 }); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { setSelected({ ...selected, col: Math.max(0, selected.col - 1) }); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { setSelected({ ...selected, col: Math.min(result.columns.length - 1, selected.col + 1) }); e.preventDefault(); }
    else if (e.key === 'Enter') {
      const origIdx = sortedRows[selected.row][0];
      const v = effectiveValue(origIdx, selected.col);
      if (editable) startEditCell(selected.row, selected.col);
      else if (v && typeof v === 'object') setInspect(v);
    }
    else if (e.key === ' ' && onSelectionChange) {
      const origIdx = sortedRows[selected.row][0];
      toggleRowSelection(origIdx, true);
      e.preventDefault();
    }
  }, [editing, selected, sortedRows, result, selectedRowIdxs, editable]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight - HEADER_HEIGHT));
    el.addEventListener('scroll', onScroll, { passive: true });
    ro.observe(el);
    setViewportH(el.clientHeight - HEADER_HEIGHT);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, []);

  const virt = useMemo(
    () => computeVirtRange({
      rowCount: sortedRows.length,
      rowHeight: ROW_HEIGHT,
      viewportHeight: Math.max(0, viewportH),
      scrollTop,
      overscan: OVERSCAN,
    }),
    [sortedRows.length, viewportH, scrollTop]
  );
  const sliceStart = virt.startIndex;
  const sliceEnd = virt.endIndex;
  const slice = sortedRows.slice(sliceStart, sliceEnd);

  // Aggregate stats for the selected column (numeric only).
  const aggregate = useMemo(() => {
    if (!selected) return null;
    const col = result.columns[selected.col];
    if (!col) return null;
    const dt = col.dataType.toLowerCase();
    const numeric = /(int|numeric|float|real|double|decimal)/.test(dt);
    let sum = 0, count = 0, min = Infinity, max = -Infinity, nulls = 0;
    const distinct = new Set<string>();
    for (const r of result.rows) {
      const v = r[selected.col];
      if (v == null) { nulls++; continue; }
      distinct.add(typeof v === 'object' ? JSON.stringify(v) : String(v));
      if (numeric) {
        const n = Number(v);
        if (Number.isFinite(n)) {
          sum += n; count++;
          if (n < min) min = n;
          if (n > max) max = n;
        }
      }
    }
    return {
      col: col.name,
      numeric,
      sum: count ? sum : null,
      avg: count ? sum / count : null,
      min: count ? min : null,
      max: count ? max : null,
      distinct: distinct.size,
      nulls,
      total: result.rows.length,
    };
  }, [selected, result]);

  // --- Filter row handlers ---
  function setFilterFor(colName: string, patch: Partial<ColumnFilter>) {
    if (!onFiltersChange) return;
    const cur = [...filters];
    const i = cur.findIndex((f) => f.column === colName);
    if (i >= 0) cur[i] = { ...cur[i], ...patch };
    else cur.push({ column: colName, op: 'ilike', value: '', ...patch });
    onFiltersChange(cur.filter((f) => isNullary(f.op) || (f.value && f.value !== '')));
  }
  function getFilterFor(colName: string): ColumnFilter | undefined {
    return filters.find((f) => f.column === colName);
  }

  const sortKeyOf = (i: number) => sortKeys.find((sk) => sk.col === i);
  const sortKeyPriority = (i: number) => sortKeys.findIndex((sk) => sk.col === i);

  function renderCellBody(v: any, col: number, origIdx: number) {
    const colName = result.columns[col].name;
    const fk = fkByCol.get(colName);
    if (v === null || v === undefined) {
      return <span style={{ color: 'var(--ink-4)', fontStyle: 'italic' }}>NULL</span>;
    }
    if (v === '') {
      return <span style={{ color: 'var(--ink-4)', fontStyle: 'italic' }}>EMPTY</span>;
    }
    if (typeof v === 'boolean') {
      return (
        <span style={{ color: v ? 'var(--success)' : 'var(--ink-3)' }}>
          {v ? 'true' : 'false'}
        </span>
      );
    }
    if (typeof v === 'object') {
      return <span style={{ color: 'var(--info)' }}>{JSON.stringify(v)}</span>;
    }
    const text = String(v);
    if (fk && onForeignKeyJump && origIdx < result.rows.length) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, width: '100%' }}>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
          <button
            className="btn-icon"
            title={`Jump to ${fk.refSchema}.${fk.refTable}`}
            style={{ padding: 1, color: 'var(--accent)', flexShrink: 0 }}
            onClick={(e) => {
              e.stopPropagation();
              const values: Record<string, any> = {};
              const colIdx = (n: string) => result.columns.findIndex((c) => c.name === n);
              for (let i = 0; i < fk.columns.length; i++) {
                values[fk.refColumns[i]] = result.rows[origIdx][colIdx(fk.columns[i])];
              }
              onForeignKeyJump(fk, values);
            }}
          >
            <ExternalLink size={11} />
          </button>
        </span>
      );
    }
    return text;
  }

  return (
    <div
      ref={scrollRef}
      style={{ position: 'relative', height: '100%', overflow: 'auto', contain: 'strict' as any, outline: 'none' }}
      tabIndex={0}
      onKeyDown={onKey}
    >
      <div style={{ display: 'inline-block', minWidth: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 3, height: HEADER_HEIGHT, boxShadow: scrollTop > 0 ? '0 1px 0 var(--hairline-strong)' : undefined }}>
          {onSelectionChange && (
            <div className="grid-header grid-cell" style={{ width: SELECT_COL_W, justifyContent: 'center' }}>
              <input
                type="checkbox"
                checked={selectedRowIdxs?.size === result.rows.length && result.rows.length > 0}
                ref={(el) => { if (el) el.indeterminate = !!selectedRowIdxs && selectedRowIdxs.size > 0 && selectedRowIdxs.size < result.rows.length; }}
                onChange={(e) => (e.target.checked ? selectAll() : clearSelection())}
              />
            </div>
          )}
          <div className="grid-header grid-cell" style={{ width: ROWNUM_COL_W, justifyContent: 'center' }}>
            <button
              className="btn-icon"
              title={showFilterRow ? 'Hide filter row' : 'Show filter row'}
              onClick={() => setShowFilterRow((v) => !v)}
              style={{ padding: 2, color: showFilterRow ? 'var(--accent)' : 'var(--ink-3)' }}
            >
              <Filter size={11} />
            </button>
          </div>
          {visibleColIdx.map((i) => {
            const c = result.columns[i];
            const sk = sortKeyOf(i);
            const prio = sortKeyPriority(i);
            const fk = fkByCol.get(c.name);
            return (
              <div
                key={i}
                className="grid-header grid-cell"
                style={{ width: colWidths[i], position: 'relative', cursor: 'pointer', userSelect: 'none' }}
                onClick={(e) => toggleSort(i, e.shiftKey)}
                title={`${c.name} (${c.dataType})${fk ? ` → ${fk.refSchema}.${fk.refTable}` : ''} — Shift+click for multi-sort`}
              >
                {fk && (
                  <span title={`FK → ${fk.refSchema}.${fk.refTable}`} style={{ color: 'var(--accent)', marginRight: 4 }}>↗</span>
                )}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{c.dataType}</span>
                {sk && (
                  <span style={{ marginLeft: 6, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                    {sk.dir === 'asc' ? '↑' : '↓'}
                    {sortKeys.length > 1 && <sub style={{ fontSize: 9 }}>{prio + 1}</sub>}
                  </span>
                )}
                <div
                  onMouseDown={(e) => startResize(i, e)}
                  onDoubleClick={(e) => { e.stopPropagation(); autoFitColumn(i); }}
                  title="Drag to resize · double-click to auto-fit"
                  style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'col-resize' }}
                />
              </div>
            );
          })}
        </div>

        {/* Filter row */}
        {showFilterRow && onFiltersChange && (
          <div style={{ display: 'flex', position: 'sticky', top: HEADER_HEIGHT, zIndex: 2, background: 'var(--surface-base)', height: FILTER_ROW_HEIGHT, borderBottom: '1px solid var(--hairline)' }}>
            {onSelectionChange && <div className="grid-cell" style={{ width: SELECT_COL_W }} />}
            <div className="grid-cell" style={{ width: ROWNUM_COL_W }} />
            {visibleColIdx.map((i) => {
              const c = result.columns[i];
              const f = getFilterFor(c.name);
              const op = f?.op || 'ilike';
              return (
                <div key={i} className="grid-cell" style={{ width: colWidths[i], padding: 2, display: 'flex', gap: 2 }}>
                  <select
                    value={op}
                    onChange={(e) => setFilterFor(c.name, { op: e.target.value as FilterOp })}
                    className="input-sm"
                    style={{ width: 88, padding: '2px 4px', fontSize: 11 }}
                    title="Filter operator"
                  >
                    {FILTER_OP_GROUPS.map((g) => (
                      <optgroup key={g.label} label={g.label}>
                        {g.ops.filter((o) => o !== 'raw').map((o) => (
                          <option key={o} value={o}>{opLabel(o)}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {!isNullary(op) ? (
                    <input
                      className="input-sm"
                      value={f?.value || ''}
                      placeholder={isBinary(op) ? 'lo, hi' : '…'}
                      onChange={(e) => setFilterFor(c.name, { value: e.target.value })}
                      style={{ flex: 1, fontSize: 11, padding: '2px 6px' }}
                    />
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--ink-3)', flex: 1, padding: '2px 4px' }}>—</span>
                  )}
                  {f && (
                    <button
                      className="btn-icon"
                      title="Clear filter"
                      onClick={() => onFiltersChange(filters.filter((x) => x.column !== c.name))}
                      style={{ padding: 1 }}
                    >
                      <XIcon size={10} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Body */}
        <div style={{ position: 'relative', height: virt.totalHeight + (showFilterRow ? 0 : 0) }}>
          <div style={{ position: 'absolute', top: virt.offsetTop, left: 0, right: 0 }}>
            {slice.map(([origIdx, row], idx) => {
              const ri = sliceStart + idx;
              const deleted = isRowDeleted(origIdx);
              const isNew = isRowNew(origIdx);
              const isSelected = selectedRowIdxs?.has(origIdx) ?? false;
              return (
                <div
                  key={ri}
                  onContextMenu={(e) => {
                    if (onRowContextMenu) {
                      e.preventDefault();
                      onRowContextMenu(e, origIdx);
                    }
                  }}
                  style={{
                    display: 'flex',
                    height: ROW_HEIGHT,
                    background: isSelected ? 'var(--accent-tint)' : undefined,
                  }}
                >
                  {onSelectionChange && (
                    <div
                      className="grid-cell"
                      style={{ width: SELECT_COL_W, justifyContent: 'center', background: 'var(--surface-base)' }}
                      onClick={(e) => { e.stopPropagation(); toggleRowSelection(origIdx, e.metaKey || e.ctrlKey || true); }}
                    >
                      <input type="checkbox" checked={isSelected} readOnly />
                    </div>
                  )}
                  <div
                    className="grid-cell"
                    style={{
                      width: ROWNUM_COL_W,
                      justifyContent: 'center',
                      color: isNew ? 'var(--success)' : 'var(--ink-3)',
                      background: 'var(--surface-base)',
                    }}
                  >
                    {isNew ? '+' : (origIdx + 1)}
                  </div>
                  {visibleColIdx.map((ci, displayCi) => {
                    const v = effectiveValue(origIdx, ci);
                    const edited = isCellEdited(origIdx, ci);
                    const sel = selected?.row === ri && selected?.col === ci;
                    const isEditing = editing?.row === ri && editing?.col === ci;
                    const baseClass = `grid-cell ${v === null ? 'null' : ''} ${edited ? 'edited' : ''} ${deleted ? 'deleted-row' : ''} ${isNew ? 'new-row' : ''}`;
                    const isFirstDataCol = displayCi === 0;
                    return (
                      <div
                        key={ci}
                        className={baseClass}
                        style={{
                          width: colWidths[ci],
                          background: sel
                            ? 'color-mix(in srgb, var(--accent) 22%, var(--surface-deep))'
                            : (freezeFirstColumn && isFirstDataCol ? 'var(--surface-deep)' : undefined),
                          padding: isEditing ? 0 : undefined,
                          whiteSpace: wrapCells ? 'pre-wrap' : 'nowrap',
                          position: freezeFirstColumn && isFirstDataCol ? 'sticky' : undefined,
                          left: freezeFirstColumn && isFirstDataCol
                            ? (onSelectionChange ? SELECT_COL_W : 0) + ROWNUM_COL_W
                            : undefined,
                          zIndex: freezeFirstColumn && isFirstDataCol ? 1 : undefined,
                          borderRight: freezeFirstColumn && isFirstDataCol ? '1px solid var(--hairline-strong)' : undefined,
                        }}
                        onClick={() => setSelected({ row: ri, col: ci })}
                        onDoubleClick={() => {
                          if (editable) startEditCell(ri, ci);
                          else if (v != null) setInspect(typeof v === 'object' ? v : String(v));
                        }}
                      >
                        {isEditing ? (
                          result.columns[ci].dataType === 'bool' ? (
                            <select
                              ref={editInputRef as any}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={commitEdit}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                                else if (e.key === 'Escape') { setEditing(null); }
                              }}
                              style={{
                                width: '100%', height: '100%',
                                border: 0, background: 'var(--surface-deep)', color: 'var(--ink)',
                                fontFamily: 'var(--font-mono)', fontSize: 12,
                                padding: '0 8px', outline: '2px solid var(--accent)',
                              }}
                            >
                              <option value="">NULL</option>
                              <option value="true">TRUE</option>
                              <option value="false">FALSE</option>
                            </select>
                          ) : (
                            <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                              <input
                                ref={editInputRef}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                                  else if (e.key === 'Escape') { setEditing(null); }
                                  else if (e.key === 'Backspace' && (e.metaKey || e.ctrlKey)) {
                                    e.preventDefault();
                                    setEditValue('');
                                    setTimeout(commitEdit, 0);
                                  }
                                }}
                                placeholder="NULL"
                                style={{
                                  flex: 1, height: '100%',
                                  border: 0, background: 'var(--surface-deep)', color: 'var(--ink)',
                                  fontFamily: 'var(--font-mono)', fontSize: 12,
                                  padding: '0 8px', outline: '2px solid var(--accent)',
                                }}
                              />
                              <button
                                title="Set NULL (⌘⌫)"
                                onClick={() => { setEditValue(''); setTimeout(commitEdit, 0); }}
                                style={{
                                  border: 0, background: 'var(--surface-raised)', color: 'var(--ink-3)',
                                  fontFamily: 'var(--font-mono)', fontSize: 10, padding: '0 8px',
                                  cursor: 'pointer',
                                }}
                              >NULL</button>
                            </div>
                          )
                        ) : (
                          renderCellBody(v, ci, origIdx)
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        {sortedRows.length === 0 && (
          <div style={{ padding: 24, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {emptyMessage}
          </div>
        )}

        {aggregate && (
          <div
            style={{
              position: 'sticky', bottom: 0, zIndex: 2,
              background: 'var(--surface-raised)', borderTop: '1px solid var(--hairline)',
              padding: '4px 14px',
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)',
              display: 'flex', gap: 14, flexWrap: 'wrap',
            }}
          >
            <span><b style={{ color: 'var(--accent)' }}>{aggregate.col}</b></span>
            <span>distinct {aggregate.distinct}</span>
            <span>nulls {aggregate.nulls}</span>
            {aggregate.numeric && aggregate.sum != null && (
              <>
                <span>sum {fmtNum(aggregate.sum)}</span>
                <span>avg {fmtNum(aggregate.avg!)}</span>
                <span>min {fmtNum(aggregate.min!)}</span>
                <span>max {fmtNum(aggregate.max!)}</span>
              </>
            )}
            <span style={{ marginLeft: 'auto' }}>over {aggregate.total} rows</span>
          </div>
        )}
      </div>

      {inspect !== null && (
        <div className="modal-backdrop" onClick={() => setInspect(null)}>
          <div className="modal" style={{ width: 720, maxHeight: '80vh' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: 12, borderBottom: '1px solid var(--hairline)', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
              <span>Cell value</span>
              <button
                className="btn-icon"
                title="Copy to clipboard"
                onClick={() => navigator.clipboard.writeText(typeof inspect === 'object' ? JSON.stringify(inspect, null, 2) : String(inspect))}
              >
                Copy
              </button>
            </div>
            <pre style={{
              padding: 14, margin: 0, overflow: 'auto',
              fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.55,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {typeof inspect === 'object' ? JSON.stringify(inspect, null, 2) : String(inspect)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
