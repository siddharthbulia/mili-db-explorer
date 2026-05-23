import React, { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  label?: string;
  onClick?: () => void;
  divider?: boolean;
  danger?: boolean;
  disabled?: boolean;
}

export function ContextMenu({
  x, y, items, onClose,
}: {
  x: number; y: number; items: ContextMenuItem[]; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    setTimeout(() => window.addEventListener('mousedown', close), 0);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="context-menu" style={{ top: y, left: x }}>
      {items.map((item, i) =>
        item.divider ? (
          <div key={i} className="context-menu-divider" />
        ) : (
          <div
            key={i}
            className={`context-menu-item ${item.danger ? 'danger' : ''}`}
            style={{ opacity: item.disabled ? 0.5 : 1, pointerEvents: item.disabled ? 'none' : 'auto' }}
            onClick={() => { item.onClick?.(); onClose(); }}
          >
            {item.label}
          </div>
        )
      )}
    </div>
  );
}
