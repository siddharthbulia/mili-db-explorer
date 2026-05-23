import React from 'react';
import { useApp } from '../store';

export function Toast() {
  const toast = useApp((s) => s.toast);
  if (!toast) return null;
  return <div className={`toast ${toast.kind}`}>{toast.message}</div>;
}
