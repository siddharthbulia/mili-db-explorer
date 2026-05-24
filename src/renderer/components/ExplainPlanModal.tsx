import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../ipc';
import { useApp } from '../store';

interface Props {
  connectionId: string;
  sql: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Parse `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` output into a tree and render
 * it with cost + actual-time annotations. Pure SQL — no extra dependencies.
 */
export function ExplainPlanModal({ connectionId, sql, open, onClose }: Props) {
  const showToast = useApp((s) => s.showToast);
  const [plan, setPlan] = useState<any>(null);
  const [meta, setMeta] = useState<{ planningMs?: number; executionMs?: number; totalMs?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPlan(null);
    setLoading(true);
    const trimmed = sql.trim().replace(/;\s*$/, '');
    if (!trimmed) { setError('No SQL to explain.'); setLoading(false); return; }
    const wrapped = `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON) ${trimmed}`;
    api.runQuery(connectionId, wrapped).then((r) => {
      if (!r.ok) { setError(r.error.message); return; }
      const raw = r.results[0]?.rows?.[0]?.[0];
      // pg returns an array (single element holds Plan + meta).
      const root = Array.isArray(raw) ? raw[0] : raw;
      if (!root) { setError('Empty plan'); return; }
      setPlan(root.Plan);
      setMeta({
        planningMs: root['Planning Time'],
        executionMs: root['Execution Time'],
        totalMs: (root['Planning Time'] || 0) + (root['Execution Time'] || 0),
      });
    }).catch((e: any) => setError(e?.message || String(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sql, connectionId]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 900, maxHeight: '86vh' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <strong style={{ fontSize: 14 }}>EXPLAIN ANALYZE — plan tree</strong>
          <div style={{ display: 'flex', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>
            {meta?.planningMs != null && <span>planning {fmt(meta.planningMs)}</span>}
            {meta?.executionMs != null && <span>execution {fmt(meta.executionMs)}</span>}
            {meta?.totalMs != null && <span>total {fmt(meta.totalMs)}</span>}
            <button
              className="btn-icon"
              title="Copy plan JSON"
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(plan, null, 2));
                showToast('success', 'Plan JSON copied');
              }}
              style={{ padding: 2 }}
            >Copy</button>
            <button className="btn-icon" onClick={onClose}><X size={14} /></button>
          </div>
        </div>
        <div style={{ padding: 12, overflow: 'auto', minHeight: 260 }}>
          {loading && <div style={{ padding: 14, color: 'var(--ink-3)', fontSize: 13 }}>Running EXPLAIN…</div>}
          {error && (
            <pre style={{ padding: 12, background: 'rgba(242,111,111,0.1)', color: 'var(--danger)', fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'pre-wrap', margin: 0 }}>
              {error}
            </pre>
          )}
          {!loading && !error && plan && <PlanNode node={plan} depth={0} totalMs={meta?.executionMs || 0} />}
        </div>
      </div>
    </div>
  );
}

function PlanNode({ node, depth, totalMs }: { node: any; depth: number; totalMs: number }) {
  const [open, setOpen] = useState(true);
  const children: any[] = node['Plans'] || [];
  const actual = (node['Actual Total Time'] || 0) * (node['Actual Loops'] || 1);
  const heatPct = totalMs > 0 ? Math.min(100, (actual / totalMs) * 100) : 0;
  // Heat color: green low → amber mid → red high.
  const heatColor = heatPct > 60
    ? 'var(--danger)' : heatPct > 25 ? 'var(--warning)' : 'var(--success)';

  return (
    <div style={{ borderLeft: depth ? '1px solid var(--hairline)' : 'none', marginLeft: depth ? 14 : 0, paddingLeft: depth ? 12 : 0, marginBottom: 4 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '4px 0', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        <button
          onClick={() => setOpen(!open)}
          style={{ background: 'transparent', border: 0, color: 'var(--ink-3)', cursor: 'pointer', padding: 0, width: 12 }}
        >{children.length ? (open ? '▾' : '▸') : '·'}</button>
        <strong style={{ color: 'var(--accent)' }}>{node['Node Type']}</strong>
        {node['Relation Name'] && <span style={{ color: 'var(--ink-2)' }}>{node['Schema'] || ''}.{node['Relation Name']}</span>}
        {node['Index Name'] && <span style={{ color: 'var(--info)' }}>using {node['Index Name']}</span>}
        {node['Join Type'] && <span style={{ color: 'var(--ink-3)' }}>{node['Join Type']} join</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 12, color: 'var(--ink-3)' }}>
          <span title="Estimated cost">cost {fmtNum(node['Total Cost'])}</span>
          <span title="Estimated rows">rows {fmt(node['Plan Rows'])}</span>
          {node['Actual Total Time'] != null && (
            <>
              <span title="Actual rows (× loops)">
                actual {fmt((node['Actual Rows'] || 0) * (node['Actual Loops'] || 1))} rows
              </span>
              <span title="Actual time × loops" style={{ color: heatColor }}>
                {fmt(actual)} ms
              </span>
            </>
          )}
        </span>
      </div>
      {/* Heat bar */}
      {totalMs > 0 && (
        <div style={{ height: 2, marginLeft: 22, background: 'var(--hairline)', borderRadius: 1, marginBottom: 4 }}>
          <div style={{ width: `${heatPct}%`, height: '100%', background: heatColor, borderRadius: 1 }} />
        </div>
      )}
      {open && (
        <>
          {node['Filter'] && <Hint label="Filter" value={node['Filter']} />}
          {node['Index Cond'] && <Hint label="Index Cond" value={node['Index Cond']} />}
          {node['Hash Cond'] && <Hint label="Hash Cond" value={node['Hash Cond']} />}
          {node['Recheck Cond'] && <Hint label="Recheck Cond" value={node['Recheck Cond']} />}
          {node['Rows Removed by Filter'] > 0 && (
            <Hint label="Rows removed by filter" value={String(node['Rows Removed by Filter'])} warn />
          )}
          {children.map((c, i) => (
            <PlanNode key={i} node={c} depth={depth + 1} totalMs={totalMs} />
          ))}
        </>
      )}
    </div>
  );
}

function Hint({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{ marginLeft: 22, fontFamily: 'var(--font-mono)', fontSize: 11, color: warn ? 'var(--warning)' : 'var(--ink-3)' }}>
      <span style={{ color: 'var(--ink-4)' }}>{label}:</span> {value}
    </div>
  );
}

function fmt(v: any): string {
  if (v == null) return '—';
  if (typeof v !== 'number') return String(v);
  if (v < 1) return v.toFixed(3);
  if (v < 100) return v.toFixed(1);
  return Math.round(v).toLocaleString();
}
function fmtNum(v: any): string {
  return typeof v === 'number' ? v.toFixed(2) : String(v ?? '—');
}
