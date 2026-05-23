// Lazy-loaded client for the formatter worker. Drops back to synchronous
// formatting if the worker can't be created (test env, older Electron, etc).

import type { FormatRequest, FormatSuccess, FormatFailure } from './formatter.worker';
import FormatterWorker from './formatter.worker?worker';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (out: FormatSuccess | FormatFailure) => void>();

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new FormatterWorker();
    worker.addEventListener('message', (e: MessageEvent) => {
      const msg = e.data as FormatSuccess | FormatFailure;
      const cb = pending.get(msg.id);
      if (cb) {
        pending.delete(msg.id);
        cb(msg);
      }
    });
  } catch {
    worker = null;
  }
  return worker;
}

export async function formatSqlInWorker(
  sql: string,
  opts: Partial<Omit<FormatRequest, 'id' | 'sql'>> = {}
): Promise<string> {
  const w = getWorker();
  if (!w) {
    // Fallback: format inline if worker unavailable.
    const { format } = await import('sql-formatter');
    return format(sql, { language: opts.language || 'postgresql', keywordCase: opts.keywordCase || 'lower' });
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, (msg) => {
      if (msg.ok) resolve(msg.sql);
      else reject(new Error(msg.error));
    });
    const req: FormatRequest = { id, sql, ...opts };
    w.postMessage(req);
  });
}

export function disposeFormatterWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  pending.clear();
}
