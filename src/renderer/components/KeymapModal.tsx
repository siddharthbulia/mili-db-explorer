import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface Shortcut { keys: string; label: string; }
interface Group { name: string; items: Shortcut[] }

const GROUPS: Group[] = [
  {
    name: 'Tabs & windows',
    items: [
      { keys: '⌘T', label: 'New SQL tab' },
      { keys: '⌘W', label: 'Close active tab' },
      { keys: '⌘⇧T', label: 'Reopen last closed tab' },
      { keys: '⌘D', label: 'Duplicate active tab' },
      { keys: '⌘1 .. ⌘9', label: 'Switch to tab N' },
      { keys: '⌘N', label: 'New connection' },
      { keys: '⌘,', label: 'Settings' },
    ],
  },
  {
    name: 'Navigation',
    items: [
      { keys: '⌘P / ⌘K', label: 'Open command palette / quick switcher' },
      { keys: '⌘L', label: 'Focus sidebar search' },
      { keys: '⌘R', label: 'Refresh current table' },
      { keys: '⌘/', label: 'Show this keymap' },
      { keys: 'Esc', label: 'Close modal / clear selection' },
    ],
  },
  {
    name: 'SQL editor',
    items: [
      { keys: '⌘↵', label: 'Run query' },
      { keys: '⌘⇧↵', label: 'Run selection only' },
      { keys: '⌘E', label: 'EXPLAIN ANALYZE current query' },
      { keys: '⌘⇧F', label: 'Format SQL' },
    ],
  },
  {
    name: 'Data grid',
    items: [
      { keys: 'Enter / dblclick', label: 'Edit cell' },
      { keys: '⌘⌫ (in editor)', label: 'Set NULL' },
      { keys: '⌘C', label: 'Copy selected rows as TSV' },
      { keys: '⌘A', label: 'Select all rows' },
      { keys: 'Space', label: 'Toggle row selection' },
      { keys: '⌘⌫', label: 'Delete selected rows' },
      { keys: 'Home / End', label: 'First / last row' },
      { keys: 'Right-click row', label: 'Row context menu' },
      { keys: 'Shift+click header', label: 'Multi-column sort' },
    ],
  },
];

export function KeymapModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose} style={{ alignItems: 'flex-start', paddingTop: '8vh' }}>
      <div className="modal" style={{ width: 720, maxHeight: '80vh' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: 14, borderBottom: '1px solid var(--hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 14 }}>Keyboard shortcuts</strong>
          <button className="btn-icon" onClick={onClose}><X size={14} /></button>
        </div>
        <div style={{ padding: 18, overflow: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
          {GROUPS.map((g) => (
            <div key={g.name}>
              <div className="section-title" style={{ padding: 0, marginBottom: 8 }}>{g.name}</div>
              {g.items.map((s) => (
                <div key={s.keys + s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 13, color: 'var(--ink-2)' }}>
                  <span>{s.label}</span>
                  <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 8px', background: 'var(--surface-raised)', border: '1px solid var(--hairline)', borderBottomWidth: 2, borderRadius: 4 }}>{s.keys}</kbd>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function useKeymapModal() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onShow = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('mili:show-keymap', onShow);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mili:show-keymap', onShow);
    };
  }, []);
  return { open, setOpen };
}
