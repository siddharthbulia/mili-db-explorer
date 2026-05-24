import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../store';
import { api } from '../ipc';
import { Search, Clock, FileCode2 } from 'lucide-react';
import type { SavedSnippet } from '../../shared/types';

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  /** A short category label rendered as a tag on the row. */
  category?: 'command' | 'connection' | 'table' | 'snippet' | 'theme';
  action: () => void;
}

const USAGE_KEY = 'mili.cmdUsage';

/** Read/write a small Map<id, count> from localStorage to rank items. */
function loadUsage(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
  } catch { return {}; }
}
function bumpUsage(id: string): Record<string, number> {
  const cur = loadUsage();
  cur[id] = (cur[id] || 0) + 1;
  try { localStorage.setItem(USAGE_KEY, JSON.stringify(cur)); } catch {}
  return cur;
}

/** Lightweight fuzzy match — score is positive when q is a subsequence of s. */
function fuzzyScore(s: string, q: string): number {
  if (!q) return 0;
  let si = 0, qi = 0, score = 0, gap = 0;
  while (si < s.length && qi < q.length) {
    if (s[si] === q[qi]) {
      score += 3;
      if (gap === 0) score += 2; // bonus for adjacent matches
      qi++;
      gap = 0;
    } else {
      gap++;
      score -= 0.1;
    }
    si++;
  }
  if (qi < q.length) return -1; // didn't fully match
  // Shorter strings score higher (so "users" beats "user_sessions" for "user").
  return score - s.length * 0.02;
}

export function CommandPalette() {
  const setShowCommandPalette = useApp((s) => s.setShowCommandPalette);
  const setShowSettings = useApp((s) => s.setShowSettings);
  const setShowLicenseModal = useApp((s) => s.setShowLicenseModal);
  const setConnectionForm = useApp((s) => s.setConnectionForm);
  const connections = useApp((s) => s.connections);
  const openConnections = useApp((s) => s.openConnections);
  const activeConnectionId = useApp((s) => s.activeConnectionId);
  const openConnection = useApp((s) => s.openConnection);
  const newSqlTab = useApp((s) => s.newSqlTab);
  const updateTab = useApp((s) => s.updateTab);
  const schemas = useApp((s) => s.schemasByConnection);
  const openTableTab = useApp((s) => s.openTableTab);
  const setSettings = useApp((s) => s.setSettings);
  const settings = useApp((s) => s.settings);
  const showToast = useApp((s) => s.showToast);

  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const [snippets, setSnippets] = useState<SavedSnippet[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>(() => loadUsage());

  // Lazy-load snippets when the palette opens.
  useEffect(() => {
    let alive = true;
    api.listSnippets?.().then((s) => { if (alive) setSnippets(s || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const close = () => setShowCommandPalette(false);

  /** Wrap an action so it bumps usage before firing. */
  function rank<T extends () => any>(id: string, action: T): () => any {
    return () => { setUsage(bumpUsage(id)); action(); };
  }

  const cmds = useMemo<Cmd[]>(() => {
    const list: Cmd[] = [
      { id: 'new-conn', category: 'command', label: 'New connection…', hint: '⌘N',
        action: rank('new-conn', () => { setConnectionForm('new'); close(); }) },
      { id: 'new-sql', category: 'command', label: 'New SQL tab', hint: '⌘T',
        action: rank('new-sql', () => { newSqlTab(activeConnectionId); close(); }) },
      { id: 'operate', category: 'command', label: 'Open Operate panel', hint: 'sessions · locks · storage',
        action: rank('operate', () => {
          if (activeConnectionId) useApp.getState().openOperateTab(activeConnectionId);
          close();
        }) },
      { id: 'keymap', category: 'command', label: 'Show keyboard shortcuts', hint: '⌘/',
        action: rank('keymap', () => { window.dispatchEvent(new CustomEvent('mili:show-keymap')); close(); }) },
      { id: 'about', category: 'command', label: 'About Mili DB Explorer',
        action: rank('about', () => { window.dispatchEvent(new CustomEvent('mili:show-about')); close(); }) },
      { id: 'changelog', category: 'command', label: 'Show changelog',
        action: rank('changelog', () => { window.dispatchEvent(new CustomEvent('mili:show-changelog')); close(); }) },
      { id: 'settings', category: 'command', label: 'Open settings',
        action: rank('settings', () => { setShowSettings(true); close(); }) },
      { id: 'license', category: 'command', label: 'License & Pro upgrade',
        action: rank('license', () => { setShowLicenseModal(true); close(); }) },
      { id: 'reload-schemas', category: 'command', label: 'Reload schema tree',
        action: rank('reload-schemas', () => {
          if (activeConnectionId) useApp.getState().loadSchemas(activeConnectionId, true);
          close();
        }) },
      { id: 'theme-light', category: 'theme', label: 'Theme: Light',
        action: rank('theme-light', () => { setSettings({ theme: 'light' }); close(); }) },
      { id: 'theme-dark', category: 'theme', label: 'Theme: Dark',
        action: rank('theme-dark', () => { setSettings({ theme: 'dark' }); close(); }) },
      { id: 'theme-system', category: 'theme', label: 'Theme: System',
        action: rank('theme-system', () => { setSettings({ theme: 'system' }); close(); }) },
    ];
    for (const c of connections) {
      const id = `conn-${c.id}`;
      list.push({
        id, category: 'connection',
        label: `Connect: ${c.name}`,
        hint: `${c.host}/${c.database}`,
        action: rank(id, async () => {
          close();
          if (!openConnections.has(c.id)) {
            const r = await openConnection(c.id);
            if (!r.ok) showToast('error', r.error || 'Failed');
          } else {
            useApp.getState().setActiveConnection(c.id);
          }
        }),
      });
    }
    if (activeConnectionId && schemas[activeConnectionId]) {
      for (const s of schemas[activeConnectionId]) {
        for (const t of [...s.tables, ...s.views, ...s.matViews]) {
          const id = `tbl-${s.schema}-${t.name}`;
          list.push({
            id, category: 'table',
            label: `${s.schema}.${t.name}`,
            hint: t.kind === 'v' ? 'view' : t.kind === 'm' ? 'matview' : 'table',
            action: rank(id, () => { openTableTab(activeConnectionId, s.schema, t.name, 'data'); close(); }),
          });
        }
      }
    }
    // v3 — snippet runner: every saved snippet shows up as a runnable item.
    for (const sn of snippets) {
      const id = `snippet-${sn.id}`;
      list.push({
        id, category: 'snippet',
        label: `Snippet: ${sn.name}`,
        hint: shortSnippet(sn.sql),
        action: rank(id, () => {
          const t = newSqlTab(activeConnectionId);
          if (t) updateTab(t, { sql: sn.sql, title: sn.name } as any);
          close();
        }),
      });
    }
    return list;
  }, [connections, openConnections, activeConnectionId, schemas, settings, snippets]);

  /** Compose filtering + ranking:
   *  - If query is empty: sort by usage count desc.
   *  - If query is non-empty: keep items whose label/hint contains the query
   *    OR is a fuzzy subsequence match. Sort by (matchScore + usageBoost).
   */
  const filtered = useMemo(() => {
    if (!q) {
      return [...cmds].sort((a, b) => (usage[b.id] || 0) - (usage[a.id] || 0)).slice(0, 80);
    }
    const ql = q.toLowerCase();
    const scored = cmds
      .map((c) => {
        const label = c.label.toLowerCase();
        const hint = (c.hint || '').toLowerCase();
        // Substring is always strongest.
        const substringHit = label.includes(ql) ? 100 : hint.includes(ql) ? 60 : 0;
        const fuzzy = substringHit > 0 ? 0 : fuzzyScore(label, ql);
        if (substringHit === 0 && fuzzy < 0) return null;
        const usageBoost = Math.min(20, (usage[c.id] || 0) * 1.5);
        return { c, score: substringHit + fuzzy + usageBoost };
      })
      .filter((x): x is { c: Cmd; score: number } => !!x);
    scored.sort((a, b) => b.score - a.score);
    return scored.map((x) => x.c).slice(0, 80);
  }, [cmds, q, usage]);

  useEffect(() => { setIdx(0); }, [q]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { setIdx((i) => Math.min(i + 1, filtered.length - 1)); e.preventDefault(); }
    if (e.key === 'ArrowUp') { setIdx((i) => Math.max(i - 1, 0)); e.preventDefault(); }
    if (e.key === 'Enter') { filtered[idx]?.action(); e.preventDefault(); }
  }

  return (
    <div className="modal-backdrop" onClick={close} style={{ alignItems: 'flex-start', paddingTop: '12vh' }}>
      <div className="modal" style={{ width: 600 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: 12, borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Search size={14} color="var(--ink-3)" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Type a command, table, snippet, or connection… ⌘P"
            style={{ flex: 1, border: 'none', background: 'transparent', boxShadow: 'none', padding: 4, fontSize: 14 }}
          />
        </div>
        <div style={{ maxHeight: 480, overflow: 'auto', padding: 4 }}>
          {!q && Object.keys(usage).length > 0 && (
            <div style={{ padding: '4px 12px', fontSize: 10.5, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={10} /> Most used
            </div>
          )}
          {filtered.length === 0 && <div style={{ padding: 12, color: 'var(--ink-3)' }}>No matches.</div>}
          {filtered.map((c, i) => (
            <div
              key={c.id}
              onMouseEnter={() => setIdx(i)}
              onClick={c.action}
              style={{
                padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                background: i === idx ? 'var(--surface-hover)' : 'transparent',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              {c.category === 'snippet' && <FileCode2 size={12} color="var(--accent)" />}
              <span style={{ flex: 1 }}>{c.label}</span>
              {c.category && (
                <span style={{ fontSize: 10, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.category}</span>
              )}
              {c.hint && <span style={{ fontSize: 11, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{c.hint}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function shortSnippet(sql: string): string {
  const oneLine = sql.replace(/\s+/g, ' ').trim();
  return oneLine.length > 70 ? oneLine.slice(0, 67) + '…' : oneLine;
}
