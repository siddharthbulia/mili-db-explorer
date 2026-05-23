// SQL formatter worker (docs/PERFORMANCE.md §5.2).
// Runs sql-formatter off the main thread so long scripts don't drop frames.

import { format } from 'sql-formatter';

export interface FormatRequest {
  id: number;
  sql: string;
  language?: 'postgresql' | 'sql' | 'mysql' | 'sqlite';
  keywordCase?: 'preserve' | 'upper' | 'lower';
}
export interface FormatSuccess {
  id: number;
  ok: true;
  sql: string;
}
export interface FormatFailure {
  id: number;
  ok: false;
  error: string;
}

self.addEventListener('message', (e: MessageEvent<FormatRequest>) => {
  const req = e.data;
  try {
    const out = format(req.sql, {
      language: req.language || 'postgresql',
      keywordCase: req.keywordCase || 'lower',
    });
    const ok: FormatSuccess = { id: req.id, ok: true, sql: out };
    (self as any).postMessage(ok);
  } catch (err: any) {
    const fail: FormatFailure = { id: req.id, ok: false, error: err?.message || String(err) };
    (self as any).postMessage(fail);
  }
});
