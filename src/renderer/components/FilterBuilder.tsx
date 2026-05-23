import React, { useEffect, useRef } from 'react';
import { Plus, Minus, X } from 'lucide-react';
import {
  ColumnFilter, FilterOp, FILTER_OP_GROUPS, opLabel, isNullary, isBinary,
} from '../../shared/grid-filters';

interface Props {
  columns: { name: string; dataType: string }[];
  filters: ColumnFilter[];
  onChange: (next: ColumnFilter[]) => void;
  /** Called when the user presses Apply / Apply All (re-runs the query). */
  onApply?: () => void;
}

/**
 * Stacked, TablePlus-style filter builder. Each row: [column ▾] [op ▾] [value]
 * [enable] [+] [−]. Apply all + clear all in the right gutter. Keyboard:
 *   ⌘↩  Apply
 *   ⌘I  Add row
 *   ⌘⇧I Remove active row
 *   ⌘B  Toggle the active row
 */
export function FilterBuilder({ columns, filters, onChange, onApply }: Props) {
  // The active row index — for keyboard ⌘B / ⌘⇧I.
  const activeRef = useRef<number>(filters.length ? filters.length - 1 : 0);

  // Maintain at least one empty draft row.
  const rows = filters.length === 0
    ? [{ column: columns[0]?.name || '', op: 'contains-i' as FilterOp, value: '', enabled: true }]
    : filters;

  function patch(i: number, p: Partial<ColumnFilter>) {
    const next = rows.map((r, j) => (j === i ? { ...r, ...p } : r));
    onChange(next.filter((f) => isMeaningful(f)));
  }
  function addRow() {
    const last = rows[rows.length - 1];
    const next = [...rows, {
      column: last?.column || columns[0]?.name || '',
      op: 'contains-i' as FilterOp,
      value: '',
      enabled: true,
    }];
    activeRef.current = next.length - 1;
    onChange(next.filter((f) => isMeaningful(f)));
  }
  function removeRow(i: number) {
    const next = rows.filter((_, j) => j !== i);
    activeRef.current = Math.min(activeRef.current, next.length - 1);
    onChange(next.filter((f) => isMeaningful(f)));
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      // Avoid stealing inside other modals / inputs unrelated to our filters.
      if (e.key === 'Enter') { e.preventDefault(); onApply?.(); return; }
      if (e.key === 'i' || e.key === 'I') {
        if (e.shiftKey) {
          e.preventDefault();
          if (rows.length > 1) removeRow(activeRef.current);
        } else {
          e.preventDefault();
          addRow();
        }
      }
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        const r = rows[activeRef.current];
        if (r) patch(activeRef.current, { enabled: r.enabled === false ? true : false });
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  return (
    <div style={{ borderBottom: '1px solid var(--hairline)', background: 'var(--surface-base)' }}>
      <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map((f, i) => (
          <FilterRow
            key={i}
            row={f}
            columns={columns}
            onFocus={() => { activeRef.current = i; }}
            onPatch={(p) => patch(i, p)}
            onAdd={addRow}
            onRemove={() => removeRow(i)}
            canRemove={rows.length > 1}
          />
        ))}
      </div>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '4px 14px',
          fontFamily: 'var(--font-mono)', fontSize: 10.5,
          color: 'var(--ink-4)', borderTop: '1px solid var(--hairline)',
        }}
      >
        <span>Apply: <kbd>⌘↩</kbd></span>
        <span>New row: <kbd>⌘I</kbd></span>
        <span>Remove: <kbd>⌘⇧I</kbd></span>
        <span>Toggle: <kbd>⌘B</kbd></span>
        <div style={{ flex: 1 }} />
        <button
          className="btn"
          onClick={() => onChange([])}
          disabled={!filters.length}
          style={{ padding: '3px 10px', fontSize: 11 }}
        >Clear all</button>
        <button
          className="btn btn-primary"
          onClick={() => onApply?.()}
          style={{ padding: '3px 10px', fontSize: 11 }}
        >Apply</button>
      </div>
    </div>
  );
}

function FilterRow({ row, columns, onPatch, onAdd, onRemove, canRemove, onFocus }: {
  row: ColumnFilter;
  columns: { name: string; dataType: string }[];
  onPatch: (p: Partial<ColumnFilter>) => void;
  onAdd: () => void;
  onRemove: () => void;
  canRemove: boolean;
  onFocus?: () => void;
}) {
  const op = row.op;
  const nullary = isNullary(op);
  const binary = isBinary(op);
  const raw = op === 'raw';

  return (
    <div
      onFocus={onFocus}
      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
    >
      <input
        type="checkbox"
        checked={row.enabled !== false}
        onChange={(e) => onPatch({ enabled: e.target.checked })}
        title="Toggle this filter (⌘B)"
      />
      <select
        value={row.column || ''}
        onChange={(e) => onPatch({ column: e.target.value })}
        className="input-sm"
        style={{ width: 180, fontFamily: 'var(--font-mono)', fontSize: 12 }}
        disabled={raw}
      >
        {!raw && (
          <>
            <option value="*">— Any column —</option>
            {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </>
        )}
        {raw && <option value="">(raw SQL)</option>}
      </select>
      <select
        value={op}
        onChange={(e) => onPatch({ op: e.target.value as FilterOp })}
        className="input-sm"
        style={{ width: 220, fontSize: 12 }}
      >
        {FILTER_OP_GROUPS.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.ops.map((o) => <option key={o} value={o}>{opLabel(o)}</option>)}
          </optgroup>
        ))}
      </select>
      {!nullary && (
        <input
          className="input-sm"
          placeholder={
            binary ? 'lo, hi' :
            raw ? "raw SQL — e.g. created_at > now() - interval '7 days'" :
            op === 'in' || op === 'not-in' ? 'comma, separated, values' :
            'value'
          }
          value={row.value || ''}
          onChange={(e) => onPatch({ value: e.target.value })}
          style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12 }}
        />
      )}
      {nullary && <span style={{ flex: 1, padding: '4px 8px', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>—</span>}

      <button className="btn-icon" title="Add filter row (⌘I)" onClick={onAdd}><Plus size={12} /></button>
      <button
        className="btn-icon"
        title="Remove filter row (⌘⇧I)"
        onClick={onRemove}
        disabled={!canRemove}
        style={{ opacity: canRemove ? 1 : 0.4 }}
      >
        <Minus size={12} />
      </button>
    </div>
  );
}

function isMeaningful(f: ColumnFilter): boolean {
  if (isNullary(f.op)) return true;
  if (f.op === 'raw') return !!(f.value && f.value.trim());
  return !!(f.value && f.value.trim());
}
