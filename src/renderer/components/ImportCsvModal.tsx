import React, { useMemo, useState } from 'react';
import { X, Play, Upload } from 'lucide-react';
import { api } from '../ipc';
import { useApp } from '../store';
import { parsePastedRows } from '../../shared/grid-clipboard';
import type { TableDetails } from '../../shared/types';

interface Props {
  open: boolean;
  onClose: () => void;
  connectionId: string;
  schema: string;
  table: string;
}

/**
 * Paste CSV / TSV directly into a textarea, map columns to table columns,
 * and the modal generates plain INSERTs that run in a single transaction.
 *
 * Intentionally minimal — no file picker, no streaming — but real, and good
 * enough for the common case of "I have a few hundred rows from a spreadsheet".
 */
export function ImportCsvModal({ open, onClose, connectionId, schema, table }: Props) {
  const showToast = useApp((s) => s.showToast);
  const [paste, setPaste] = useState('');
  const [hasHeader, setHasHeader] = useState(true);
  const [details, setDetails] = useState<TableDetails | null>(null);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    api.getTableDetails(connectionId, schema, table).then(setDetails).catch((e: any) => setError(String(e?.message || e)));
    setPaste(''); setMapping({}); setError(null);
  }, [open, connectionId, schema, table]);

  const parsed = useMemo(() => parsePastedRows(paste), [paste]);
  const headers = hasHeader && parsed.length ? parsed[0] : parsed[0]?.map((_, i) => `col_${i + 1}`) || [];
  const dataRows = hasHeader ? parsed.slice(1) : parsed;

  // Auto-map by name on first parse.
  React.useEffect(() => {
    if (!details || !headers.length) return;
    const cols = new Set(details.columns.map((c) => c.name));
    const next: Record<number, string> = {};
    headers.forEach((h, i) => {
      const m = h && cols.has(h) ? h : '';
      if (m) next[i] = m;
    });
    setMapping(next);
  }, [headers.join('\t'), details]);

  function buildSql(): string {
    if (!details || !dataRows.length) return '';
    const used = headers.map((_, i) => mapping[i]).filter(Boolean);
    if (!used.length) return '';
    const colList = used.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ');
    const target = `"${schema}"."${table}"`;
    const lines: string[] = ['BEGIN;'];
    for (const row of dataRows) {
      const vals = headers.map((_, i) => mapping[i] ? sqlLit(row[i]) : null).filter((v) => v !== null);
      if (vals.length !== used.length) continue;
      lines.push(`INSERT INTO ${target} (${colList}) VALUES (${vals.join(', ')});`);
    }
    lines.push('COMMIT;');
    return lines.join('\n');
  }

  async function run() {
    const sql = buildSql();
    if (!sql) { setError('Map at least one column and include data rows.'); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await api.runQueryScript(connectionId, sql);
      if (r.ok) {
        showToast('success', `Imported ${dataRows.length} row(s)`);
        onClose();
      } else {
        setError(r.error.message);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 720, maxHeight: '85vh' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 14 }}>Import CSV / TSV → {schema}.{table}</strong>
          <button className="btn-icon" onClick={onClose}><X size={14} /></button>
        </div>
        <div style={{ padding: 16, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={"Paste TSV/CSV rows here. Tabs or commas as separators.\nFirst row treated as header by default."}
            style={{ width: '100%', minHeight: 120, fontFamily: 'var(--font-mono)', fontSize: 12, padding: 10, background: 'var(--surface-raised)', border: '1px solid var(--hairline)', borderRadius: 6, color: 'var(--ink)', resize: 'vertical' }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-2)' }}>
            <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
            First row is a header
          </label>

          {parsed.length > 0 && details && (
            <div>
              <div className="section-title" style={{ padding: 0, marginBottom: 6 }}>Column mapping</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                <thead><tr>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--ink-3)' }}>Source</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--ink-3)' }}>→ Target column</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--ink-3)' }}>Sample value</th>
                </tr></thead>
                <tbody>
                  {headers.map((h, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--hairline)' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--ink-2)' }}>{h || `col_${i + 1}`}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <select
                          className="input-sm"
                          value={mapping[i] || ''}
                          onChange={(e) => setMapping({ ...mapping, [i]: e.target.value })}
                          style={{ width: '100%' }}
                        >
                          <option value="">— skip —</option>
                          {details.columns.map((c) => (
                            <option key={c.name} value={c.name}>{c.name} ({c.fullType})</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '6px 8px', color: 'var(--ink-3)' }}>{dataRows[0]?.[i] ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--ink-3)' }}>
                {dataRows.length} data row(s) ready · runs in a single transaction
              </div>
            </div>
          )}

          {error && (
            <div style={{ padding: 8, borderRadius: 6, background: 'rgba(242,111,111,0.10)', color: 'var(--danger)', fontFamily: 'var(--font-mono)', fontSize: 11.5, whiteSpace: 'pre-wrap' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
            <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={run}
              disabled={busy || !dataRows.length || !Object.values(mapping).filter(Boolean).length}
            >
              <Upload size={12} /> Import {dataRows.length || ''} rows
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function sqlLit(v: any): string {
  if (v == null || v === '') return 'NULL';
  if (/^-?\d+(\.\d+)?$/.test(v)) return v;
  if (/^(true|false|t|f)$/i.test(v)) return /^(true|t)$/i.test(v) ? 'TRUE' : 'FALSE';
  return "'" + String(v).replace(/'/g, "''") + "'";
}
