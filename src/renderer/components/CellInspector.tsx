import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X as XIcon, Filter as FilterIcon, ChevronDown } from 'lucide-react';
import { api } from '../ipc';

interface Props {
  connectionId: string;
  schema: string;
  table: string;
  columnName: string;
  columnType: string;
  currentValue: any;
  /** True if this column is editable (table has PK and we're not viewing a view). */
  editable: boolean;
  onApplyValue?: (newValue: any) => void;
  onFilterByValue?: (value: any) => void;
  onClose?: () => void;
}

/**
 * Right-side inspector — column metadata, current value editor, and a quick
 * picker of distinct values from the same column. Click any distinct value
 * to filter the grid by it.
 */
export function CellInspector(props: Props) {
  const {
    connectionId, schema, table, columnName, columnType,
    currentValue, editable, onApplyValue, onFilterByValue, onClose,
  } = props;

  const [editValue, setEditValue] = useState<string>(() => fmt(currentValue));
  const [query, setQuery] = useState('');
  const [distinct, setDistinct] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Reset editor value when the selected cell changes.
  useEffect(() => {
    setEditValue(fmt(currentValue));
    setQuery('');
  }, [columnName, currentValue]);

  // Fetch distinct values, debounced.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const t = setTimeout(async () => {
      try {
        const like = query.trim();
        const where = like ? `where "${columnName}"::text ilike $1` : '';
        const params = like ? [`%${like}%`] : undefined;
        const sql = `select distinct "${columnName}" as v
                       from "${schema}"."${table}"
                       ${where}
                       order by v
                       limit 200`;
        const r = await api.runQuery(connectionId, sql, params);
        if (cancelled) return;
        if (r.ok) setDistinct(r.results[0]?.rows.map((row) => row[0]) ?? []);
        else setError(r.error.message);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);
    return () => { cancelled = true; clearTimeout(t); };
  }, [connectionId, schema, table, columnName, query]);

  const isBool = columnType === 'bool';
  const isJson = columnType === 'json' || columnType === 'jsonb';

  const apply = () => {
    if (!onApplyValue) return;
    if (editValue === '') return onApplyValue(null);
    if (isBool) return onApplyValue(/^(t|true|1)$/i.test(editValue));
    if (isJson) {
      try { onApplyValue(JSON.parse(editValue)); return; } catch {}
    }
    onApplyValue(editValue);
  };

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', height: '100%',
        borderLeft: '1px solid var(--hairline)',
        background: 'var(--surface-base)',
        minWidth: 0,
      }}
    >
      {/* Search header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 10px 8px', borderBottom: '1px solid var(--hairline)' }}>
        <Search size={12} style={{ color: 'var(--ink-3)' }} />
        <input
          ref={searchRef}
          className="input-sm"
          placeholder="Search values…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, fontSize: 12 }}
        />
        {query && (
          <button className="btn-icon" onClick={() => setQuery('')} title="Clear"><XIcon size={12} /></button>
        )}
        {onClose && (
          <button className="btn-icon" onClick={onClose} title="Close inspector"><XIcon size={13} /></button>
        )}
      </div>

      {/* Column metadata + current value editor */}
      <div style={{ padding: '12px 12px 10px', borderBottom: '1px solid var(--hairline)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{columnName}</span>
          <span style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{columnType}</span>
        </div>
        {isBool ? (
          <select
            className="input-sm"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            disabled={!editable}
            style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12 }}
          >
            <option value="">NULL</option>
            <option value="true">TRUE</option>
            <option value="false">FALSE</option>
          </select>
        ) : isJson ? (
          <JsonEditor
            value={editValue}
            onChange={setEditValue}
            disabled={!editable}
          />
        ) : (
          <input
            className="input-sm"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            disabled={!editable}
            placeholder={currentValue === null ? 'NULL' : currentValue === '' ? 'EMPTY' : ''}
            style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12 }}
            onKeyDown={(e) => { if (e.key === 'Enter') apply(); }}
          />
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {editable && (
            <button className="btn" onClick={apply} title="Apply (⌘↵)" style={{ flex: 1 }}>
              Apply
            </button>
          )}
          {editable && (
            <button
              className="btn"
              onClick={() => { setEditValue(''); onApplyValue?.(null); }}
              title="Set NULL"
            >
              NULL
            </button>
          )}
          {onFilterByValue && (
            <button
              className="btn"
              onClick={() => onFilterByValue(coerce(editValue, columnType))}
              title="Filter grid to this value"
            >
              <FilterIcon size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Distinct values list */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 6 }}>
        <div style={{
          fontSize: 10.5, color: 'var(--ink-4)', textTransform: 'uppercase',
          letterSpacing: '0.08em', fontWeight: 600,
          padding: '4px 8px',
        }}>
          {distinct.length === 200 ? '200 of distinct values' : `${distinct.length} distinct`}
          {loading && ' · loading…'}
        </div>
        {error && (
          <div style={{ padding: '8px 10px', color: 'var(--danger)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
            {error}
          </div>
        )}
        {!loading && !error && distinct.length === 0 && (
          <div style={{ padding: '8px 10px', color: 'var(--ink-3)', fontSize: 12 }}>No values.</div>
        )}
        {distinct.map((v, i) => {
          const isNull = v === null || v === undefined;
          const isEmpty = !isNull && typeof v === 'string' && v === '';
          const label = isNull ? 'NULL' : isEmpty ? 'EMPTY' : typeof v === 'object' ? JSON.stringify(v) : String(v);
          return (
            <div
              key={i}
              onClick={() => {
                setEditValue(isNull ? '' : isEmpty ? '' : label);
                onFilterByValue?.(v);
              }}
              title={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '4px 10px',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: isNull || isEmpty ? 'var(--ink-4)' : 'var(--ink-2)',
                fontStyle: isNull || isEmpty ? 'italic' : 'normal',
                cursor: 'pointer',
                borderRadius: 4,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Two-tab JSON editor: tree view (interactive, copy paths) + raw textarea.
 * The raw value is always the source of truth — the tree re-parses on each
 * render.
 */
function JsonEditor({ value, onChange, disabled }: { value: string; onChange: (s: string) => void; disabled: boolean }) {
  const [mode, setMode] = useState<'tree' | 'raw'>('tree');
  let parsed: any = undefined;
  let parseError: string | null = null;
  try { parsed = value === '' ? null : JSON.parse(value); }
  catch (e: any) { parseError = e?.message || 'Invalid JSON'; }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          onClick={() => setMode('tree')}
          className="btn"
          style={{ padding: '3px 9px', fontSize: 11, background: mode === 'tree' ? 'var(--accent-tint)' : undefined, color: mode === 'tree' ? 'var(--accent)' : undefined }}
        >Tree</button>
        <button
          onClick={() => setMode('raw')}
          className="btn"
          style={{ padding: '3px 9px', fontSize: 11, background: mode === 'raw' ? 'var(--accent-tint)' : undefined, color: mode === 'raw' ? 'var(--accent)' : undefined }}
        >Raw</button>
        <div style={{ flex: 1 }} />
        {parseError && <span style={{ fontSize: 10.5, color: 'var(--danger)', alignSelf: 'center' }}>{parseError}</span>}
      </div>
      {mode === 'raw' ? (
        <textarea
          className="input-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={6}
          spellCheck={false}
          style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'vertical' }}
        />
      ) : (
        <div
          style={{
            maxHeight: 260, overflow: 'auto',
            border: '1px solid var(--hairline)',
            borderRadius: 6, padding: 8,
            background: 'var(--surface-deep)',
            fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.55,
          }}
        >
          {parsed === undefined && <span style={{ color: 'var(--ink-3)' }}>(empty)</span>}
          {parsed === null && value === '' && <span style={{ color: 'var(--ink-4)' }}>NULL</span>}
          {parsed !== undefined && <JsonNode value={parsed} path="$" />}
        </div>
      )}
    </div>
  );
}

/**
 * Recursive renderer. Click any leaf or sub-tree to copy its JSON-pointer-ish
 * path to the clipboard. Objects/arrays are collapsible.
 */
function JsonNode({ value, path }: { value: any; path: string }) {
  const [open, setOpen] = useState(true);
  if (value === null) return <span style={{ color: 'var(--ink-4)' }}>null</span>;
  if (typeof value === 'boolean') return <span style={{ color: 'var(--success)' }}>{String(value)}</span>;
  if (typeof value === 'number') return <span style={{ color: 'var(--accent)' }}>{value}</span>;
  if (typeof value === 'string') return <span style={{ color: 'var(--success)' }}>"{value}"</span>;
  if (Array.isArray(value)) {
    return (
      <span>
        <CollapseToggle open={open} onToggle={() => setOpen(!open)} label={`[ ${value.length} ]`} path={path} />
        {open && value.map((v, i) => (
          <div key={i} style={{ marginLeft: 14 }}>
            <span style={{ color: 'var(--ink-3)' }}>{i}: </span>
            <JsonNode value={v} path={`${path}[${i}]`} />
          </div>
        ))}
      </span>
    );
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    return (
      <span>
        <CollapseToggle open={open} onToggle={() => setOpen(!open)} label={`{ ${keys.length} }`} path={path} />
        {open && keys.map((k) => (
          <div key={k} style={{ marginLeft: 14 }}>
            <span
              style={{ color: 'var(--ink-2)', cursor: 'pointer' }}
              title={`Copy ${path}.${k}`}
              onClick={() => { navigator.clipboard.writeText(`${path}.${k}`); }}
            >"{k}"</span>
            <span style={{ color: 'var(--ink-3)' }}>: </span>
            <JsonNode value={value[k]} path={`${path}.${k}`} />
          </div>
        ))}
      </span>
    );
  }
  return <span>{String(value)}</span>;
}

function CollapseToggle({ open, onToggle, label, path }: { open: boolean; onToggle: () => void; label: string; path: string }) {
  return (
    <span>
      <button
        onClick={onToggle}
        title={`Copy ${path}`}
        style={{ background: 'transparent', border: 0, color: 'var(--ink-3)', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11.5 }}
        onContextMenu={(e) => { e.preventDefault(); navigator.clipboard.writeText(path); }}
      >
        {open ? '▾ ' : '▸ '}
      </button>
      <span style={{ color: 'var(--ink-4)' }}>{label}</span>
    </span>
  );
}

function fmt(v: any): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v, null, 2);
  return String(v);
}

function coerce(v: string, type: string): any {
  if (v === '') return null;
  if (type === 'bool') return /^(t|true|1)$/i.test(v);
  if (/(int|numeric|float|real|double)/.test(type)) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return v;
}
