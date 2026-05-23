import React from 'react';
import { useApp } from '../store';
import { SqlEditorTab } from './SqlEditorTab';
import { TableTab } from './TableTab';
import { OperatePanel } from './OperatePanel';
import { WelcomeScreen } from './WelcomeScreen';

export function WorkArea() {
  const tabs = useApp((s) => s.tabs);
  const activeTabId = useApp((s) => s.activeTabId);
  const active = tabs.find((t) => t.id === activeTabId);

  if (!active) return <WelcomeScreen />;

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)', overflow: 'hidden' }}>
      {active.kind === 'sql' && <SqlEditorTab key={active.id} tabId={active.id} />}
      {active.kind === 'table' && <TableTab key={active.id} tabId={active.id} />}
      {active.kind === 'operate' && <OperatePanel key={active.id} tabId={active.id} />}
    </div>
  );
}
