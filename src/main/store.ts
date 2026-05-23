import { app, safeStorage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import type {
  AppSettings,
  ConnectionConfig,
  LicenseInfo,
  QueryHistoryEntry,
  SavedSnippet,
  StoredConnection,
} from '../shared/types';

interface StoreData {
  connections: StoredConnection[];
  settings: AppSettings;
  license: LicenseInfo;
  history: QueryHistoryEntry[];
  snippets: SavedSnippet[];
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  fontSize: 13,
  pageSize: 500,
  sqlFont: 'ui-monospace, Menlo, monospace',
  confirmDangerous: true,
  formatOnRun: false,
};

const DEFAULT_LICENSE: LicenseInfo = { status: 'free' };

class Store {
  private file: string;
  private data: StoreData;

  constructor() {
    const dir = app.getPath('userData');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'mili-db-explorer.json');
    this.data = this.load();
  }

  private load(): StoreData {
    try {
      if (fs.existsSync(this.file)) {
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf-8'));
        return {
          connections: raw.connections ?? [],
          settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
          license: raw.license ?? DEFAULT_LICENSE,
          history: raw.history ?? [],
          snippets: raw.snippets ?? [],
        };
      }
    } catch (e) {
      console.error('Store load error', e);
    }
    return {
      connections: [],
      settings: DEFAULT_SETTINGS,
      license: DEFAULT_LICENSE,
      history: [],
      snippets: [],
    };
  }

  private save() {
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    } catch (e) {
      console.error('Store save error', e);
    }
  }

  encryptPassword(plain: string): string {
    if (!plain) return '';
    if (safeStorage.isEncryptionAvailable()) {
      return 'enc:' + safeStorage.encryptString(plain).toString('base64');
    }
    return 'raw:' + Buffer.from(plain).toString('base64');
  }

  decryptPassword(stored?: string): string {
    if (!stored) return '';
    if (stored.startsWith('enc:')) {
      try {
        return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'));
      } catch {
        return '';
      }
    }
    if (stored.startsWith('raw:')) {
      return Buffer.from(stored.slice(4), 'base64').toString('utf-8');
    }
    return '';
  }

  listConnections(): ConnectionConfig[] {
    return this.data.connections.map((c) => ({
      ...c,
      password: this.decryptPassword(c.passwordEnc),
    }));
  }

  saveConnection(conn: ConnectionConfig): ConnectionConfig {
    const stored: StoredConnection = {
      id: conn.id,
      name: conn.name,
      color: conn.color,
      host: conn.host,
      port: conn.port,
      database: conn.database,
      user: conn.user,
      ssl: conn.ssl,
      sshTunnel: conn.sshTunnel,
      createdAt: conn.createdAt,
      lastUsedAt: conn.lastUsedAt,
      passwordEnc: conn.password ? this.encryptPassword(conn.password) : undefined,
    };
    const idx = this.data.connections.findIndex((c) => c.id === conn.id);
    if (idx >= 0) this.data.connections[idx] = stored;
    else this.data.connections.push(stored);
    this.save();
    return { ...conn };
  }

  deleteConnection(id: string) {
    this.data.connections = this.data.connections.filter((c) => c.id !== id);
    this.save();
  }

  touchConnection(id: string) {
    const c = this.data.connections.find((c) => c.id === id);
    if (c) {
      c.lastUsedAt = Date.now();
      this.save();
    }
  }

  getSettings(): AppSettings {
    return { ...this.data.settings };
  }

  setSettings(patch: Partial<AppSettings>): AppSettings {
    this.data.settings = { ...this.data.settings, ...patch };
    this.save();
    return this.getSettings();
  }

  getLicense(): LicenseInfo {
    return { ...this.data.license };
  }

  setLicense(info: LicenseInfo) {
    this.data.license = info;
    this.save();
  }

  listHistory(): QueryHistoryEntry[] {
    return [...this.data.history].sort((a, b) => b.ranAt - a.ranAt).slice(0, 500);
  }

  addHistory(entry: QueryHistoryEntry) {
    this.data.history.push(entry);
    if (this.data.history.length > 500) {
      this.data.history = this.data.history.slice(-500);
    }
    this.save();
  }

  clearHistory() {
    this.data.history = [];
    this.save();
  }

  listSnippets(): SavedSnippet[] {
    return [...this.data.snippets].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  saveSnippet(s: SavedSnippet): SavedSnippet {
    const idx = this.data.snippets.findIndex((x) => x.id === s.id);
    if (idx >= 0) this.data.snippets[idx] = s;
    else this.data.snippets.push(s);
    this.save();
    return s;
  }

  deleteSnippet(id: string) {
    this.data.snippets = this.data.snippets.filter((s) => s.id !== id);
    this.save();
  }
}

let _store: Store | null = null;
export function getStore(): Store {
  if (!_store) _store = new Store();
  return _store;
}
