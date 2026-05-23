import React, { useState } from 'react';
import { X, Play } from 'lucide-react';
import { api } from '../ipc';
import { useApp } from '../store';

interface BaseProps {
  open: boolean;
  onClose: () => void;
  /** Connection to execute against. */
  connectionId: string;
}

// ─── Add column ─────────────────────────────────────────────────────────────

export function AddColumnModal({ open, onClose, connectionId, schema, table }: BaseProps & { schema: string; table: string }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('text');
  const [nullable, setNullable] = useState(true);
  const [defaultVal, setDefaultVal] = useState('');
  const [busy, setBusy] = useState(false);
  const showToast = useApp((s) => s.showToast);
  if (!open) return null;

  const sql = `ALTER TABLE "${schema}"."${table}" ADD COLUMN "${name || '<name>'}" ${type || '<type>'}` +
    (nullable ? '' : ' NOT NULL') +
    (defaultVal.trim() ? ` DEFAULT ${defaultVal}` : '') + ';';

  async function run() {
    if (!name) { showToast('error', 'Column name required'); return; }
    setBusy(true);
    const r = await api.runQuery(connectionId, sql);
    setBusy(false);
    if (r.ok) { showToast('success', `Added column ${name}`); onClose(); }
    else showToast('error', r.error.message);
  }

  return (
    <Shell title={`Add column to ${schema}.${table}`} onClose={onClose}>
      <Field label="Name"><input className="input-sm" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Type">
        <select className="input-sm" value={type} onChange={(e) => setType(e.target.value)}>
          {['text', 'varchar(255)', 'int', 'bigint', 'numeric', 'boolean', 'timestamptz', 'date', 'jsonb', 'uuid'].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="Nullable"><input type="checkbox" checked={nullable} onChange={(e) => setNullable(e.target.checked)} /></Field>
      <Field label="Default (raw SQL)"><input className="input-sm" placeholder="e.g. now() or 0" value={defaultVal} onChange={(e) => setDefaultVal(e.target.value)} /></Field>
      <SqlPreview sql={sql} />
      <RunRow busy={busy} onRun={run} onClose={onClose} />
    </Shell>
  );
}

// ─── Rename column / table ──────────────────────────────────────────────────

export function RenameModal({ open, onClose, connectionId, schema, table, column }: BaseProps & { schema: string; table: string; column?: string }) {
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const showToast = useApp((s) => s.showToast);
  if (!open) return null;

  const target = column
    ? `ALTER TABLE "${schema}"."${table}" RENAME COLUMN "${column}" TO "${newName || '<new>'}";`
    : `ALTER TABLE "${schema}"."${table}" RENAME TO "${newName || '<new>'}";`;

  async function run() {
    if (!newName) { showToast('error', 'New name required'); return; }
    setBusy(true);
    const r = await api.runQuery(connectionId, target);
    setBusy(false);
    if (r.ok) { showToast('success', 'Renamed'); onClose(); }
    else showToast('error', r.error.message);
  }

  return (
    <Shell title={column ? `Rename column "${column}"` : `Rename table "${table}"`} onClose={onClose}>
      <Field label="New name"><input className="input-sm" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} /></Field>
      <SqlPreview sql={target} />
      <RunRow busy={busy} onRun={run} onClose={onClose} />
    </Shell>
  );
}

// ─── Drop column ────────────────────────────────────────────────────────────

export function DropColumnModal({ open, onClose, connectionId, schema, table, column }: BaseProps & { schema: string; table: string; column: string }) {
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const showToast = useApp((s) => s.showToast);
  if (!open) return null;
  const target = `ALTER TABLE "${schema}"."${table}" DROP COLUMN "${column}";`;
  const canRun = confirm === column;
  async function run() {
    if (!canRun) return;
    setBusy(true);
    const r = await api.runQuery(connectionId, target);
    setBusy(false);
    if (r.ok) { showToast('success', `Dropped ${column}`); onClose(); }
    else showToast('error', r.error.message);
  }
  return (
    <Shell title={`Drop column "${column}"`} onClose={onClose}>
      <div style={{ padding: '0 0 10px', fontSize: 13, color: 'var(--danger)' }}>
        This action cannot be undone. Type the column name to confirm.
      </div>
      <Field label={`Type "${column}"`}><input className="input-sm" autoFocus value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
      <SqlPreview sql={target} />
      <RunRow busy={busy} onRun={run} onClose={onClose} runLabel="Drop column" danger disabled={!canRun} />
    </Shell>
  );
}

// ─── Create index ──────────────────────────────────────────────────────────

export function CreateIndexModal({ open, onClose, connectionId, schema, table, columnNames }: BaseProps & { schema: string; table: string; columnNames: string[] }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [unique, setUnique] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const showToast = useApp((s) => s.showToast);
  if (!open) return null;

  const idxName = name.trim() || `idx_${table}_${picked.join('_')}`;
  const sql = `CREATE${unique ? ' UNIQUE' : ''} INDEX "${idxName}" ON "${schema}"."${table}" (${picked.map((c) => `"${c}"`).join(', ') || '<columns>'});`;

  async function run() {
    if (!picked.length) { showToast('error', 'Pick at least one column'); return; }
    setBusy(true);
    const r = await api.runQuery(connectionId, sql);
    setBusy(false);
    if (r.ok) { showToast('success', `Index ${idxName} created`); onClose(); }
    else showToast('error', r.error.message);
  }

  return (
    <Shell title={`Create index on ${schema}.${table}`} onClose={onClose}>
      <Field label="Name (optional)"><input className="input-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder={idxName} /></Field>
      <Field label="Unique"><input type="checkbox" checked={unique} onChange={(e) => setUnique(e.target.checked)} /></Field>
      <div style={{ padding: '4px 0' }}>
        <div className="section-title" style={{ padding: 0, marginBottom: 6 }}>Columns</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {columnNames.map((c) => {
            const on = picked.includes(c);
            return (
              <button
                key={c}
                className="btn"
                onClick={() => setPicked(on ? picked.filter((x) => x !== c) : [...picked, c])}
                style={{ background: on ? 'var(--accent-tint)' : undefined, color: on ? 'var(--accent)' : undefined, padding: '3px 9px', fontSize: 11.5, fontFamily: 'var(--font-mono)' }}
              >{c}</button>
            );
          })}
        </div>
      </div>
      <SqlPreview sql={sql} />
      <RunRow busy={busy} onRun={run} onClose={onClose} />
    </Shell>
  );
}

// ─── Create schema ─────────────────────────────────────────────────────────

export function CreateSchemaModal({ open, onClose, connectionId }: BaseProps) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const showToast = useApp((s) => s.showToast);
  if (!open) return null;
  const sql = `CREATE SCHEMA "${name || '<name>'}";`;
  async function run() {
    if (!name) return;
    setBusy(true);
    const r = await api.runQuery(connectionId, sql);
    setBusy(false);
    if (r.ok) { showToast('success', `Created schema ${name}`); onClose(); }
    else showToast('error', r.error.message);
  }
  return (
    <Shell title="Create schema" onClose={onClose}>
      <Field label="Name"><input className="input-sm" autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <SqlPreview sql={sql} />
      <RunRow busy={busy} onRun={run} onClose={onClose} />
    </Shell>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function Shell({ title, children, onClose }: any) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 540 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 14 }}>{title}</strong>
          <button className="btn-icon" onClick={onClose}><X size={14} /></button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: any) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ flex: 1, fontSize: 13 }}>{label}</span>
      <div style={{ width: 280 }}>{children}</div>
    </label>
  );
}

function SqlPreview({ sql }: { sql: string }) {
  return (
    <div style={{ marginTop: 6 }}>
      <div className="section-title" style={{ padding: 0, marginBottom: 4 }}>SQL preview</div>
      <pre style={{ margin: 0, padding: 10, background: 'var(--surface-raised)', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>
        {sql}
      </pre>
    </div>
  );
}

function RunRow({ busy, onRun, onClose, runLabel = 'Run', danger = false, disabled = false }: any) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <button
        className={danger ? 'btn btn-danger' : 'btn btn-primary'}
        onClick={onRun}
        disabled={busy || disabled}
      >
        <Play size={12} /> {runLabel}
      </button>
    </div>
  );
}
