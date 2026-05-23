import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type {
  AppSettings,
  ConnectionConfig,
  LicenseInfo,
  QueryResult,
  SchemaEntry,
} from '../shared/types';
import { api } from './ipc';
import { parseHashRoute, type WindowRoute } from '../shared/window-route';

/** Read the workspace route from window.location. Updates on hashchange. */
function readRoute(): WindowRoute {
  if (typeof window === 'undefined') return { kind: 'home' };
  return parseHashRoute(window.location.hash);
}

export type WorkTab =
  | {
      id: string;
      kind: 'sql';
      title: string;
      connectionId: string | null;
      sql: string;
      results: QueryResult[];
      error?: { message: string; code?: string; position?: string; hint?: string; detail?: string };
      running: boolean;
      runningQueryId?: string;
      /** Epoch ms when the current run started, or undefined when idle. */
      runStartedAt?: number;
      /** Last completed run duration (ms), shown after the query finishes. */
      lastDurationMs?: number;
      historyId?: string;
    }
  | {
      id: string;
      kind: 'table';
      title: string;
      connectionId: string;
      schema: string;
      table: string;
      view: 'data' | 'structure';
    }
  | {
      id: string;
      kind: 'operate';
      title: string;
      connectionId: string;
      view: 'sessions' | 'locks' | 'storage' | 'indexes' | 'maintenance';
    };

interface TableRef { connectionId: string; schema: string; table: string }

interface AppState {
  // workspace route — which window are we?
  route: WindowRoute;

  // settings/theme
  settings: AppSettings;
  setSettings: (patch: Partial<AppSettings>) => Promise<void>;

  // license
  license: LicenseInfo;
  refreshLicense: () => Promise<void>;
  activateLicense: (key: string, email: string) => Promise<{ ok: boolean; error?: string }>;

  // connections
  connections: ConnectionConfig[];
  openConnections: Set<string>;
  activeConnectionId: string | null;
  serverVersions: Record<string, string>;
  latencies: Record<string, number>;
  backendPids: Record<string, number>;
  refreshConnections: () => Promise<void>;
  setActiveConnection: (id: string | null) => void;
  openConnection: (id: string) => Promise<{ ok: boolean; error?: string }>;
  closeConnection: (id: string) => Promise<void>;

  // schema
  schemasByConnection: Record<string, SchemaEntry[]>;
  schemaLoading: Record<string, boolean>;
  loadSchemas: (id: string, force?: boolean) => Promise<void>;

  // favorites / recents
  favorites: TableRef[];
  recents: TableRef[];
  pinnedSchemas: { connectionId: string; schema: string }[];
  toggleFavorite: (ref: TableRef) => void;
  isFavorite: (ref: TableRef) => boolean;
  recordRecent: (ref: TableRef) => void;
  togglePinnedSchema: (connectionId: string, schema: string) => void;
  isPinnedSchema: (connectionId: string, schema: string) => boolean;

  // tabs
  tabs: WorkTab[];
  activeTabId: string | null;
  lastClosedTabs: WorkTab[];
  newSqlTab: (connectionId: string | null) => string;
  openTableTab: (connectionId: string, schema: string, table: string, view?: 'data' | 'structure') => string;
  openOperateTab: (connectionId: string, view?: 'sessions' | 'locks' | 'storage' | 'indexes' | 'maintenance') => string;
  closeTab: (id: string) => void;
  reopenLastClosedTab: () => void;
  duplicateActiveTab: () => void;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, patch: Partial<WorkTab>) => void;

  // toast (transient) + notifications (history)
  toast: { kind: 'info' | 'error' | 'success'; message: string; ts: number } | null;
  showToast: (kind: 'info' | 'error' | 'success', message: string) => void;
  notifications: { kind: 'info' | 'error' | 'success'; message: string; ts: number }[];
  clearNotifications: () => void;

  // modals
  showConnectionForm: ConnectionConfig | 'new' | null;
  setConnectionForm: (v: ConnectionConfig | 'new' | null) => void;
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
  showCommandPalette: boolean;
  setShowCommandPalette: (v: boolean) => void;
  showLicenseModal: boolean;
  setShowLicenseModal: (v: boolean) => void;

  init: () => Promise<void>;
}

export const useApp = create<AppState>((set, get) => ({
  route: readRoute(),
  settings: {
    theme: 'system',
    fontSize: 13,
    pageSize: 500,
    sqlFont: 'ui-monospace, Menlo, monospace',
    confirmDangerous: true,
    formatOnRun: false,
  },
  setSettings: async (patch) => {
    const s = await api.setSettings(patch);
    set({ settings: s });
    applyTheme(s.theme);
  },

  license: { status: 'free' },
  refreshLicense: async () => {
    const l = await api.getLicense();
    set({ license: l });
  },
  activateLicense: async (key, email) => {
    const r = await api.activateLicense(key, email);
    if (r.ok && r.license) set({ license: r.license });
    return r;
  },

  connections: [],
  openConnections: new Set(),
  activeConnectionId: null,
  serverVersions: {},
  latencies: {},
  backendPids: {},
  refreshConnections: async () => {
    const list = await api.listConnections();
    set({ connections: list });
  },
  setActiveConnection: (id) => set({ activeConnectionId: id }),
  openConnection: async (id) => {
    const r = await api.openConnection(id);
    if (r.ok) {
      const open = new Set(get().openConnections);
      open.add(id);
      const versions = { ...get().serverVersions };
      if ((r as any).serverVersion) versions[id] = (r as any).serverVersion;
      set({ openConnections: open, activeConnectionId: id, serverVersions: versions });
      get().loadSchemas(id, true);
    }
    return r;
  },
  closeConnection: async (id) => {
    await api.closeConnection(id);
    const open = new Set(get().openConnections);
    open.delete(id);
    const map = { ...get().schemasByConnection };
    delete map[id];
    set({
      openConnections: open,
      schemasByConnection: map,
      activeConnectionId: get().activeConnectionId === id ? null : get().activeConnectionId,
      tabs: get().tabs.filter((t) => t.kind !== 'table' || t.connectionId !== id),
    });
  },

  schemasByConnection: {},
  schemaLoading: {},
  loadSchemas: async (id, _force) => {
    set({ schemaLoading: { ...get().schemaLoading, [id]: true } });
    try {
      const s = await api.listSchemas(id);
      set({
        schemasByConnection: { ...get().schemasByConnection, [id]: s },
        schemaLoading: { ...get().schemaLoading, [id]: false },
      });
    } catch (e: any) {
      set({ schemaLoading: { ...get().schemaLoading, [id]: false } });
      get().showToast('error', e?.message || 'Failed to load schema');
    }
  },

  favorites: loadJson('mili.favorites', []),
  recents: loadJson('mili.recents', []),
  pinnedSchemas: loadJson('mili.pinnedSchemas', []),
  togglePinnedSchema: (connectionId, schema) => {
    const cur = get().pinnedSchemas;
    const i = cur.findIndex((p) => p.connectionId === connectionId && p.schema === schema);
    const next = i >= 0 ? cur.filter((_, j) => j !== i) : [...cur, { connectionId, schema }];
    saveJson('mili.pinnedSchemas', next);
    set({ pinnedSchemas: next });
  },
  isPinnedSchema: (connectionId, schema) =>
    get().pinnedSchemas.some((p) => p.connectionId === connectionId && p.schema === schema),
  toggleFavorite: (ref) => {
    const cur = get().favorites;
    const i = cur.findIndex((f) => sameRef(f, ref));
    const next = i >= 0 ? cur.filter((_, j) => j !== i) : [ref, ...cur].slice(0, 32);
    saveJson('mili.favorites', next);
    set({ favorites: next });
  },
  isFavorite: (ref) => get().favorites.some((f) => sameRef(f, ref)),
  recordRecent: (ref) => {
    const cur = get().recents.filter((r) => !sameRef(r, ref));
    const next = [ref, ...cur].slice(0, 12);
    saveJson('mili.recents', next);
    set({ recents: next });
  },

  tabs: [],
  activeTabId: null,
  lastClosedTabs: [],
  newSqlTab: (connectionId) => {
    const id = uuid();
    const tab: WorkTab = {
      id,
      kind: 'sql',
      title: 'Query',
      connectionId,
      sql: '',
      results: [],
      running: false,
    };
    set({ tabs: [...get().tabs, tab], activeTabId: id });
    return id;
  },
  openOperateTab: (connectionId, view = 'sessions') => {
    const existing = get().tabs.find((t) => t.kind === 'operate' && t.connectionId === connectionId);
    if (existing) {
      set({ activeTabId: existing.id });
      if (existing.kind === 'operate') get().updateTab(existing.id, { view });
      return existing.id;
    }
    const id = uuid();
    set({
      tabs: [...get().tabs, { id, kind: 'operate', connectionId, view, title: 'Operate' }],
      activeTabId: id,
    });
    return id;
  },
  openTableTab: (connectionId, schema, table, view = 'data') => {
    const existing = get().tabs.find(
      (t) => t.kind === 'table' && t.connectionId === connectionId && t.schema === schema && t.table === table
    );
    if (existing) {
      set({ activeTabId: existing.id });
      if (existing.kind === 'table') get().updateTab(existing.id, { view });
      return existing.id;
    }
    const id = uuid();
    set({
      tabs: [
        ...get().tabs,
        { id, kind: 'table', connectionId, schema, table, title: `${schema}.${table}`, view },
      ],
      activeTabId: id,
    });
    return id;
  },
  closeTab: (id) => {
    const closing = get().tabs.find((t) => t.id === id);
    const tabs = get().tabs.filter((t) => t.id !== id);
    let active = get().activeTabId;
    if (active === id) active = tabs.length ? tabs[tabs.length - 1].id : null;
    const stash = closing ? [closing, ...get().lastClosedTabs].slice(0, 10) : get().lastClosedTabs;
    set({ tabs, activeTabId: active, lastClosedTabs: stash });
  },
  reopenLastClosedTab: () => {
    const stash = get().lastClosedTabs;
    if (!stash.length) return;
    const [restore, ...rest] = stash;
    const id = uuid();
    const newTab = { ...restore, id } as WorkTab;
    set({ tabs: [...get().tabs, newTab], activeTabId: id, lastClosedTabs: rest });
  },
  duplicateActiveTab: () => {
    const t = get().tabs.find((x) => x.id === get().activeTabId);
    if (!t) return;
    const id = uuid();
    const clone = { ...t, id } as WorkTab;
    if (clone.kind === 'sql') (clone as any).results = [];
    set({ tabs: [...get().tabs, clone], activeTabId: id });
  },
  setActiveTab: (id) => set({ activeTabId: id }),
  updateTab: (id, patch) => {
    set({
      tabs: get().tabs.map((t) => (t.id === id ? ({ ...t, ...patch } as WorkTab) : t)),
    });
  },

  toast: null,
  notifications: [],
  clearNotifications: () => set({ notifications: [] }),
  showToast: (kind, message) => {
    const ts = Date.now();
    const entry = { kind, message, ts };
    set({
      toast: entry,
      notifications: [entry, ...get().notifications].slice(0, 50),
    });
    setTimeout(() => {
      if (get().toast?.ts === ts) set({ toast: null });
    }, 3600);
  },

  showConnectionForm: null,
  setConnectionForm: (v) => set({ showConnectionForm: v }),
  showSettings: false,
  setShowSettings: (v) => set({ showSettings: v }),
  showCommandPalette: false,
  setShowCommandPalette: (v) => set({ showCommandPalette: v }),
  showLicenseModal: false,
  setShowLicenseModal: (v) => set({ showLicenseModal: v }),

  init: async () => {
    const [settings, license, connections] = await Promise.all([
      api.getSettings(),
      api.getLicense(),
      api.listConnections(),
    ]);
    set({ settings, license, connections });
    applyTheme(settings.theme);

    // Workspace window: auto-open the connection it's locked to.
    const route = get().route;
    if (route.kind === 'connection') {
      const exists = connections.find((c) => c.id === route.connectionId);
      if (exists) {
        await get().openConnection(route.connectionId);
        set({ activeConnectionId: route.connectionId });
        // Seed an initial SQL tab so the user has somewhere to type.
        if (get().tabs.length === 0) get().newSqlTab(route.connectionId);
      } else {
        get().showToast('error', 'This workspace points to a missing connection');
      }
    }
  },
}));

// Track hash changes (rare in practice; mostly for dev hot reload).
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    useApp.setState({ route: readRoute() });
  });
}

function sameRef(a: TableRef, b: TableRef): boolean {
  return a.connectionId === b.connectionId && a.schema === b.schema && a.table === b.table;
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveJson(key: string, value: any) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value));
  } catch {/* quota, private mode, etc. */}
}

function applyTheme(theme: 'light' | 'dark' | 'system') {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const s = useApp.getState().settings;
  if (s.theme === 'system') applyTheme('system');
});
