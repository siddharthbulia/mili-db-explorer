import React, { useState, useRef, useEffect } from 'react';
import Editor, { OnMount, loader } from '@monaco-editor/react';
import * as monacoEditor from 'monaco-editor';

// Use the locally bundled Monaco instead of the default CDN loader.
// Electron + CDN often hangs on "Loading..." (no network, blocked by CSP, etc).
loader.config({ monaco: monacoEditor });

// Monaco normally spins up Web Workers per language. In our bundle they aren't
// emitted as separate files, so the worker fetches 404 and Monaco hangs. Force
// the editor to run everything on the main thread instead.
if (typeof self !== 'undefined' && !(self as any).MonacoEnvironment) {
  (self as any).MonacoEnvironment = {
    getWorker() {
      // A no-op worker stub. Monaco gracefully falls back to inline execution.
      const blob = new Blob([''], { type: 'application/javascript' });
      return new Worker(URL.createObjectURL(blob));
    },
  };
}
import { Play, ListFilter, FileDown, History, Save, Crown, XCircle, Activity } from 'lucide-react';
import { ProgressBar, ElapsedBadge } from './ProgressBar';
import { formatElapsed } from '../useElapsed';
import { format } from 'sql-formatter';
import { formatSqlInWorker } from '../workers/formatter-client';
import { v4 as uuid } from 'uuid';
import { useApp } from '../store';
import { api } from '../ipc';
import { ResultGrid } from './ResultGrid';
import type { QueryResult } from '../../shared/types';

export function SqlEditorTab({ tabId }: { tabId: string }) {
  const tab = useApp((s) => s.tabs.find((t) => t.id === tabId));
  if (!tab || tab.kind !== 'sql') return null;
  return <SqlEditorTabInner tabId={tabId} />;
}

function SqlEditorTabInner({ tabId }: { tabId: string }) {
  const tabUntyped = useApp((s) => s.tabs.find((t) => t.id === tabId));
  const updateTab = useApp((s) => s.updateTab);
  const connections = useApp((s) => s.connections);
  const openConnections = useApp((s) => s.openConnections);
  const showToast = useApp((s) => s.showToast);
  const settings = useApp((s) => s.settings);
  const license = useApp((s) => s.license);

  const [splitH, setSplitH] = useState(0.45);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const [selection, setSelection] = useState<string>('');

  const tab = tabUntyped && tabUntyped.kind === 'sql' ? tabUntyped : null;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && e.key === 'Enter') {
        e.preventDefault();
        run(e.shiftKey);
      }
      if (cmd && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        formatSql();
      }
      if (cmd && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        explainAnalyze();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // §9.1 — dispose the Monaco model and editor when this tab unmounts to
  // avoid the per-tab memory leak.
  useEffect(() => {
    return () => {
      const ed = editorRef.current;
      if (ed) {
        try { ed.getModel()?.dispose(); } catch { /* ignore */ }
        try { ed.dispose(); } catch { /* ignore */ }
      }
      editorRef.current = null;
      monacoRef.current = null;
    };
  }, []);

  if (!tab) return null;

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    editor.onDidChangeCursorSelection(() => {
      const sel = editor.getModel()?.getValueInRange(editor.getSelection()!) || '';
      setSelection(sel);
    });
  };

  async function formatSql() {
    if (!tab) return;
    try {
      const next = await formatSqlInWorker(tab.sql, { language: 'postgresql', keywordCase: 'lower' });
      updateTab(tabId, { sql: next });
    } catch (e: any) {
      showToast('error', 'Format failed: ' + (e?.message || 'unknown'));
    }
  }

  async function run(runSelection = false) {
    if (!tab) return;
    if (!tab.connectionId) {
      showToast('error', 'No connection selected for this tab');
      return;
    }
    if (!openConnections.has(tab.connectionId)) {
      showToast('error', 'Connection not open');
      return;
    }
    let sql = (runSelection && selection.trim()) ? selection : tab.sql;
    if (!sql.trim()) return;
    if (settings.formatOnRun) {
      try { sql = format(sql, { language: 'postgresql', keywordCase: 'lower' }); } catch {}
    }
    if (settings.confirmDangerous && /\b(drop|truncate|delete\s+from)\b/i.test(sql) && !/where/i.test(sql)) {
      if (!confirm('Statement appears destructive without WHERE. Continue?')) return;
    }

    const t0 = Date.now();
    const queryId = uuid();
    updateTab(tabId, { running: true, runningQueryId: queryId, runStartedAt: t0, error: undefined } as any);
    try {
      const r = await (api as any).runQueryScript(tab.connectionId, sql, { queryId });
      const ms = Date.now() - t0;
      if (r.ok) {
        updateTab(tabId, { running: false, runningQueryId: undefined, runStartedAt: undefined, lastDurationMs: ms, results: r.results, error: undefined } as any);
        await api.addHistory({
          id: uuid(),
          connectionId: tab.connectionId,
          sql,
          durationMs: ms,
          rowCount: r.results.reduce((a: number, b: QueryResult) => a + (b.rowCount || 0), 0),
          ranAt: Date.now(),
        });
      } else {
        updateTab(tabId, { running: false, runningQueryId: undefined, runStartedAt: undefined, lastDurationMs: ms, error: r.error, results: [] } as any);
        await api.addHistory({
          id: uuid(),
          connectionId: tab.connectionId,
          sql,
          durationMs: ms,
          rowCount: 0,
          error: r.error.message,
          ranAt: Date.now(),
        });
      }
    } catch (e: any) {
      updateTab(tabId, { running: false, runningQueryId: undefined, runStartedAt: undefined, error: { message: e?.message || String(e) }, results: [] } as any);
    }
  }

  async function cancelRun() {
    const qid = (tab as any).runningQueryId;
    if (!qid) return;
    try {
      await (api as any).cancelQuery(qid);
      showToast('info', 'Cancel requested');
    } catch (e: any) {
      showToast('error', e?.message || 'Cancel failed');
    }
  }

  function convertToCount() {
    if (!tab) return;
    const sql = (selection.trim() || tab.sql).trim();
    if (!sql) return;
    // Strip a trailing semicolon, then wrap in SELECT COUNT(*) FROM (...).
    const inner = sql.replace(/;\s*$/, '');
    const wrapped = `SELECT count(*) FROM (\n${inner}\n) _mili_count;`;
    if (selection.trim() && editorRef.current) {
      // Replace just the selection.
      editorRef.current.executeEdits('mili', [{
        range: editorRef.current.getSelection(),
        text: wrapped,
      }]);
    } else {
      updateTab(tabId, { sql: wrapped });
    }
  }

  async function createViewFromCurrent(materialized: boolean) {
    if (!tab) return;
    const sql = (selection.trim() || tab.sql).trim().replace(/;\s*$/, '');
    if (!sql || !tab.connectionId) return;
    const name = prompt(`Name for new ${materialized ? 'materialized ' : ''}view (schema.name or just name):`);
    if (!name) return;
    const target = name.includes('.')
      ? name.split('.').map((s) => `"${s}"`).join('.')
      : `"${name}"`;
    const kw = materialized ? 'MATERIALIZED VIEW' : 'VIEW';
    const fullSql = `CREATE ${kw} ${target} AS\n${sql};`;
    if (!confirm(`Create ${materialized ? 'materialized view' : 'view'} ${name}?\n\n${fullSql.slice(0, 200)}${fullSql.length > 200 ? '…' : ''}`)) return;
    const r = await api.runQuery(tab.connectionId, fullSql);
    if (r.ok) {
      showToast('success', `Created ${name}`);
      // Refresh schema tree so the new view shows up.
      useApp.getState().loadSchemas(tab.connectionId, true);
    } else {
      showToast('error', r.error.message);
    }
  }

  async function explainAnalyze() {
    if (!tab || !tab.connectionId) return;
    const sql = (selection.trim() || tab.sql).trim();
    if (!sql) return;
    if (/^explain\b/i.test(sql)) {
      run(false);
      return;
    }
    const explainSql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql.replace(/;\s*$/, '')}`;
    const t0 = Date.now();
    updateTab(tabId, { running: true, runStartedAt: t0, error: undefined } as any);
    try {
      const r = await api.runQueryScript(tab.connectionId, explainSql);
      const ms = Date.now() - t0;
      if (r.ok) updateTab(tabId, { running: false, runStartedAt: undefined, lastDurationMs: ms, results: r.results, error: undefined } as any);
      else updateTab(tabId, { running: false, runStartedAt: undefined, lastDurationMs: ms, error: r.error, results: [] } as any);
    } catch (e: any) {
      updateTab(tabId, { running: false, runStartedAt: undefined, error: { message: e?.message || String(e) }, results: [] } as any);
    }
  }

  async function saveSnippet() {
    if (!tab) return;
    const name = prompt('Snippet name:');
    if (!name) return;
    await api.saveSnippet({
      id: uuid(),
      name,
      sql: tab.sql,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    showToast('success', 'Snippet saved');
  }

  function startResize(e: React.MouseEvent) {
    const startY = e.clientY;
    const startH = splitH;
    const containerH = (e.currentTarget.parentElement as HTMLElement).clientHeight;
    const onMove = (ev: MouseEvent) => {
      const delta = (ev.clientY - startY) / containerH;
      setSplitH(Math.max(0.2, Math.min(0.85, startH + delta)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  const isDark = document.documentElement.classList.contains('dark');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        display: 'flex', gap: 6, padding: 8, borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)', alignItems: 'center',
      }}>
        <select
          value={tab.connectionId || ''}
          onChange={(e) => updateTab(tabId, { connectionId: e.target.value || null })}
          className="input-sm"
          style={{ minWidth: 180 }}
        >
          <option value="">(no connection)</option>
          {connections.map((c) => (
            <option key={c.id} value={c.id}>
              {openConnections.has(c.id) ? '● ' : '○ '} {c.name}
            </option>
          ))}
        </select>
        {tab.running ? (
          <button
            className="btn btn-danger"
            onClick={cancelRun}
            title="Cancel running query"
          >
            <XCircle size={12} /> Cancel
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={() => run(false)}
            disabled={!tab.connectionId}
            title="Run (⌘↵)"
          >
            <Play size={12} /> Run
          </button>
        )}
        <button
          className="btn"
          onClick={() => run(true)}
          disabled={tab.running || !tab.connectionId || !selection.trim()}
          title="Run selection (⌘⇧↵)"
        >
          Run selection
        </button>
        <button
          className="btn"
          onClick={explainAnalyze}
          disabled={tab.running || !tab.connectionId}
          title="EXPLAIN ANALYZE current query (⌘E)"
        >
          <Activity size={12} /> Explain
        </button>
        <button className="btn" onClick={formatSql} title="Format SQL (⌘⇧F)">
          Format
        </button>
        <MoreSqlActions
          onCount={convertToCount}
          onCreateView={() => createViewFromCurrent(false)}
          onCreateMatView={() => createViewFromCurrent(true)}
        />
        <button className="btn" onClick={saveSnippet} title="Save as snippet">
          <Save size={12} /> Save
        </button>
        <div style={{ flex: 1 }} />
        {tab.running ? (
          <ElapsedBadge startedAt={(tab as any).runStartedAt ?? null} label="Running" />
        ) : (tab as any).lastDurationMs != null ? (
          <span
            title="Total wall-clock time for the last run"
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink-3)',
              padding: '3px 10px', background: 'var(--surface-raised)',
              border: '1px solid var(--hairline)', borderRadius: 999,
            }}
          >
            last run · {formatElapsed((tab as any).lastDurationMs)}
          </span>
        ) : null}
        {tab.results.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            {tab.results.length} result{tab.results.length > 1 ? 's' : ''} · {totalRows(tab.results)} rows · {tab.results.reduce((a, b) => a + b.durationMs, 0)} ms
          </div>
        )}
      </div>
      <ProgressBar running={tab.running} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ flex: splitH, minHeight: 80 }}>
          <Editor
            language="sql"
            theme={isDark ? 'vs-dark' : 'vs-light'}
            value={tab.sql}
            onChange={(v) => updateTab(tabId, { sql: v || '' })}
            onMount={onMount}
            options={{
              fontSize: settings.fontSize,
              fontFamily: 'ui-monospace, Menlo, monospace',
              minimap: { enabled: false },
              automaticLayout: true,
              tabSize: settings.editorTabSize ?? 2,
              wordWrap: settings.editorWordWrap !== false ? 'on' : 'off',
              scrollBeyondLastLine: false,
              lineNumbers: settings.editorLineNumbers !== false ? 'on' : 'off',
              lineNumbersMinChars: 3,
              padding: { top: 8 },
              renderWhitespace: 'none',
              cursorBlinking: 'smooth',
            }}
          />
        </div>
        <div className="split-handle h" onMouseDown={startResize} />
        <div style={{ flex: 1 - splitH, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ResultsPane tab={tab} />
        </div>
      </div>
    </div>
  );
}

function MoreSqlActions({ onCount, onCreateView, onCreateMatView }: { onCount: () => void; onCreateView: () => void; onCreateMatView: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button className="btn" onClick={() => setOpen((v) => !v)} title="More query actions">…</button>
      {open && (
        <div className="context-menu" style={{ top: 32, left: 0, position: 'absolute', minWidth: 240 }} onMouseLeave={() => setOpen(false)}>
          <div className="context-menu-item" onClick={() => { onCount(); setOpen(false); }}>Wrap in SELECT count(*)</div>
          <div className="context-menu-item" onClick={() => { onCreateView(); setOpen(false); }}>Create VIEW from this query…</div>
          <div className="context-menu-item" onClick={() => { onCreateMatView(); setOpen(false); }}>Create MATERIALIZED VIEW…</div>
        </div>
      )}
    </div>
  );
}

function totalRows(results: QueryResult[]) {
  return results.reduce((a, b) => a + (b.rowCount || 0), 0);
}

function ResultsPane({ tab }: { tab: any }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const license = useApp((s) => s.license);
  const showToast = useApp((s) => s.showToast);

  useEffect(() => { setActiveIdx(0); }, [tab.results]);

  if (tab.error) {
    return (
      <div style={{
        padding: 16, color: 'var(--danger)', whiteSpace: 'pre-wrap',
        fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12,
        overflow: 'auto',
      }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Error{tab.error.code ? ` (${tab.error.code})` : ''}</div>
        <div>{tab.error.message}</div>
        {tab.error.hint && <div style={{ marginTop: 8 }}><b>Hint:</b> {tab.error.hint}</div>}
        {tab.error.detail && <div style={{ marginTop: 4 }}><b>Detail:</b> {tab.error.detail}</div>}
        {tab.error.position && <div style={{ marginTop: 4 }}><b>Position:</b> {tab.error.position}</div>}
      </div>
    );
  }
  if (!tab.results.length) {
    return <div style={{ padding: 16, color: 'var(--fg-muted)', fontSize: 12 }}>No results. Press <span className="kbd">⌘↵</span> to run.</div>;
  }

  async function exportAs(r: QueryResult, fmt: 'csv' | 'json' | 'markdown') {
    const { rowsToCsv, rowsToJson, rowsToMarkdown } = await import('../../shared/grid-clipboard');
    const idxs = r.rows.map((_, i) => i);
    const content = fmt === 'csv' ? rowsToCsv(r, idxs)
      : fmt === 'json' ? rowsToJson(r, idxs)
      : rowsToMarkdown(r, idxs);
    const ext = fmt === 'markdown' ? 'md' : fmt;
    try {
      await api.exportFile({
        content,
        defaultName: 'result.' + ext,
        filters: [{ name: fmt.toUpperCase(), extensions: [ext] }],
      });
    } catch (e: any) {
      showToast('error', e?.message || 'Export failed');
    }
  }
  async function copyAs(r: QueryResult, fmt: 'tsv' | 'csv' | 'json') {
    const m = await import('../../shared/grid-clipboard');
    const idxs = r.rows.map((_, i) => i);
    const text =
      fmt === 'tsv' ? m.rowsToTsv(r, idxs)
      : fmt === 'csv' ? m.rowsToCsv(r, idxs)
      : m.rowsToJson(r, idxs);
    navigator.clipboard.writeText(text);
    showToast('success', `Copied ${r.rows.length} rows as ${fmt.toUpperCase()}`);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      {tab.results.length > 1 && (
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
          {tab.results.map((r: QueryResult, i: number) => (
            <div
              key={i}
              className={`tab ${i === activeIdx ? 'active' : ''}`}
              onClick={() => setActiveIdx(i)}
            >
              Result {i + 1} · {r.rowCount} rows
            </div>
          ))}
        </div>
      )}
      {tab.results[activeIdx] && (
        <>
          <div style={{
            padding: '6px 10px', display: 'flex', gap: 8, alignItems: 'center',
            borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--fg-muted)',
            background: 'var(--bg-secondary)',
          }}>
            <span>{tab.results[activeIdx].command || 'SELECT'} · {tab.results[activeIdx].rowCount} rows · {tab.results[activeIdx].durationMs}ms</span>
            <div style={{ flex: 1 }} />
            <button className="btn" style={{ padding: '3px 8px' }} onClick={() => copyAs(tab.results[activeIdx], 'tsv')} title="Copy as TSV">
              Copy
            </button>
            <button className="btn" style={{ padding: '3px 8px' }} onClick={() => exportAs(tab.results[activeIdx], 'csv')}>
              <FileDown size={11} /> CSV
            </button>
            <button className="btn" style={{ padding: '3px 8px' }} onClick={() => exportAs(tab.results[activeIdx], 'json')}>
              <FileDown size={11} /> JSON
            </button>
            <button className="btn" style={{ padding: '3px 8px' }} onClick={() => exportAs(tab.results[activeIdx], 'markdown')}>
              <FileDown size={11} /> MD
            </button>
          </div>
          {!!tab.results[activeIdx].notices?.length && (
            <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--hairline)', background: 'var(--surface-base)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--warning)' }}>
              {tab.results[activeIdx].notices!.map((n: string, i: number) => (
                <div key={i}>⚠ {n}</div>
              ))}
            </div>
          )}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <ResultGrid result={tab.results[activeIdx]} />
          </div>
        </>
      )}
    </div>
  );
}

function rowsToObjects(r: QueryResult): any[] {
  return r.rows.map((row) => {
    const o: any = {};
    r.columns.forEach((c, i) => { o[c.name] = row[i]; });
    return o;
  });
}

function toCsv(r: QueryResult): string {
  const esc = (v: any) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [r.columns.map((c) => esc(c.name)).join(',')];
  for (const row of r.rows) lines.push(row.map(esc).join(','));
  return lines.join('\n');
}
