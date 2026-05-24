import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

/**
 * Renderer code calls `window.api.*` (the preload IPC bridge) and
 * `window.platform.*` (the version table). Provide minimal mocks so React
 * components can render without the real Electron context.
 *
 * Individual tests override these via `vi.spyOn(window.api, 'foo')` when they
 * need a different return value.
 */
const defaultApi: Record<string, (...args: any[]) => any> = {
  listConnections: async () => [],
  saveConnection: async (c: any) => c,
  deleteConnection: async () => {},
  testConnection: async () => ({ ok: true, serverVersion: 'PostgreSQL 16.0' }),
  openConnection: async () => ({ ok: true, serverVersion: 'PostgreSQL 16.0' }),
  closeConnection: async () => {},
  listDatabases: async () => ['postgres'],
  listSchemas: async () => [],
  refreshSchema: async () => ({ schemas: [], diff: null }),
  getAutocomplete: async () => [],
  getTableDetails: async () => ({
    schema: 'public', name: 'sample', kind: 'r', comment: null,
    estimatedRows: 0, size: '0 bytes',
    columns: [], indexes: [], foreignKeys: [], constraints: [], triggers: [],
  }),
  getViewDefinition: async () => '',
  getFunctionDefinition: async () => '',
  runQuery: async () => ({ ok: true, results: [{ columns: [], rows: [], rowCount: 0, durationMs: 0 }] }),
  runQueryScript: async () => ({ ok: true, results: [] }),
  cancelQuery: async () => {},
  listRunningQueries: async () => [],
  explainAnalyze: async () => ({ planJson: {}, planningMs: 0, executionMs: 0, totalMs: 0 }),
  fetchTableRows: async () => ({ ok: true, results: [{ columns: [], rows: [], rowCount: 0, durationMs: 0 }] }),
  applyRowChanges: async () => ({ ok: true }),
  getHistory: async () => [],
  addHistory: async () => {},
  clearHistory: async () => {},
  listSnippets: async () => [],
  saveSnippet: async (s: any) => s,
  deleteSnippet: async () => {},
  getSettings: async () => ({
    theme: 'dark', fontSize: 13, pageSize: 100,
    sqlFont: 'JetBrains Mono', confirmDangerous: true, formatOnRun: false,
  }),
  setSettings: async (s: any) => s,
  getLicense: async () => ({ status: 'free' }),
  activateLicense: async () => ({ ok: true, license: { status: 'pro' } }),
  deactivateLicense: async () => {},
  openConnectionWindow: async () => ({ ok: true }),
  openHomeWindow: async () => ({ ok: true }),
  exportFile: async () => ({ ok: true, path: '/tmp/mock.csv' }),
  openExternal: async () => {},
};

// Wire onto window so the renderer's `import { api } from './ipc'` resolves.
Object.defineProperty(window, 'api', { value: defaultApi, writable: true, configurable: true });
Object.defineProperty(window, 'platform', {
  value: { os: 'darwin', node: '20.0.0', chrome: '120.0.0', electron: '33.0.0' },
  writable: true, configurable: true,
});

// Stub ResizeObserver (used by Monaco / the result grid measurements).
class FakeResizeObserver {
  observe() {} unobserve() {} disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || FakeResizeObserver;

// matchMedia (system-theme detection in store.ts).
window.matchMedia = window.matchMedia || ((q: string) => ({
  matches: false, media: q, onchange: null,
  addListener: () => {}, removeListener: () => {},
  addEventListener: () => {}, removeEventListener: () => {},
  dispatchEvent: () => false,
} as MediaQueryList));

// Clipboard API stub (the grid copies a lot).
if (!navigator.clipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined), readText: vi.fn().mockResolvedValue('') },
    configurable: true,
  });
}
