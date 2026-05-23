import React from 'react';
import { X, FileCode2, Table2, Plus, Wrench } from 'lucide-react';
import { useApp } from '../store';

export function TabBar() {
  const tabs = useApp((s) => s.tabs);
  const activeTabId = useApp((s) => s.activeTabId);
  const setActiveTab = useApp((s) => s.setActiveTab);
  const closeTab = useApp((s) => s.closeTab);
  const newSqlTab = useApp((s) => s.newSqlTab);
  const activeConn = useApp((s) => s.activeConnectionId);

  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, overflow: 'hidden', marginLeft: 16 }}>
      <div style={{ display: 'flex', overflow: 'auto', flex: 1, minWidth: 0 }}>
        {tabs.map((t, i) => {
          const dirty = t.kind === 'sql' && !!(t as any).sql && !(t as any).running;
          // A "running" badge wins over the dirty indicator.
          const running = t.kind === 'sql' && (t as any).running;
          return (
            <div
              key={t.id}
              className={`tab ${activeTabId === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
              title={`${t.title}${i < 9 ? ` (⌘${i + 1})` : ''}`}
            >
              {t.kind === 'sql' ? <FileCode2 size={12} /> : t.kind === 'operate' ? <Wrench size={12} /> : <Table2 size={12} />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.title}
              </span>
              {running ? (
                <span
                  style={{
                    width: 6, height: 6, borderRadius: 999,
                    background: 'var(--accent)', boxShadow: '0 0 6px var(--accent-glow)',
                    animation: 'amber-pulse 1.4s ease-in-out infinite',
                  }}
                />
              ) : dirty ? (
                <span
                  title="Unsaved query"
                  style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--ink-3)' }}
                />
              ) : null}
              <span
                className="tab-close"
                onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}
              >
                <X size={12} />
              </span>
            </div>
          );
        })}
      </div>
      <button
        className="btn-icon"
        title="New SQL tab"
        onClick={() => newSqlTab(activeConn)}
        style={{ marginLeft: 4 }}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
