"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStore = getStore;
const electron_1 = require("electron");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const DEFAULT_SETTINGS = {
    theme: 'system',
    fontSize: 13,
    pageSize: 500,
    sqlFont: 'ui-monospace, Menlo, monospace',
    confirmDangerous: true,
    formatOnRun: false,
};
const DEFAULT_LICENSE = { status: 'free' };
class Store {
    file;
    data;
    constructor() {
        const dir = electron_1.app.getPath('userData');
        if (!node_fs_1.default.existsSync(dir))
            node_fs_1.default.mkdirSync(dir, { recursive: true });
        this.file = node_path_1.default.join(dir, 'mili-db-explorer.json');
        this.data = this.load();
    }
    load() {
        try {
            if (node_fs_1.default.existsSync(this.file)) {
                const raw = JSON.parse(node_fs_1.default.readFileSync(this.file, 'utf-8'));
                return {
                    connections: raw.connections ?? [],
                    settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
                    license: raw.license ?? DEFAULT_LICENSE,
                    history: raw.history ?? [],
                    snippets: raw.snippets ?? [],
                };
            }
        }
        catch (e) {
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
    save() {
        try {
            node_fs_1.default.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
        }
        catch (e) {
            console.error('Store save error', e);
        }
    }
    encryptPassword(plain) {
        if (!plain)
            return '';
        if (electron_1.safeStorage.isEncryptionAvailable()) {
            return 'enc:' + electron_1.safeStorage.encryptString(plain).toString('base64');
        }
        return 'raw:' + Buffer.from(plain).toString('base64');
    }
    decryptPassword(stored) {
        if (!stored)
            return '';
        if (stored.startsWith('enc:')) {
            try {
                return electron_1.safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'));
            }
            catch {
                return '';
            }
        }
        if (stored.startsWith('raw:')) {
            return Buffer.from(stored.slice(4), 'base64').toString('utf-8');
        }
        return '';
    }
    listConnections() {
        return this.data.connections.map((c) => ({
            ...c,
            password: this.decryptPassword(c.passwordEnc),
        }));
    }
    saveConnection(conn) {
        const stored = {
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
        if (idx >= 0)
            this.data.connections[idx] = stored;
        else
            this.data.connections.push(stored);
        this.save();
        return { ...conn };
    }
    deleteConnection(id) {
        this.data.connections = this.data.connections.filter((c) => c.id !== id);
        this.save();
    }
    touchConnection(id) {
        const c = this.data.connections.find((c) => c.id === id);
        if (c) {
            c.lastUsedAt = Date.now();
            this.save();
        }
    }
    getSettings() {
        return { ...this.data.settings };
    }
    setSettings(patch) {
        this.data.settings = { ...this.data.settings, ...patch };
        this.save();
        return this.getSettings();
    }
    getLicense() {
        return { ...this.data.license };
    }
    setLicense(info) {
        this.data.license = info;
        this.save();
    }
    listHistory() {
        return [...this.data.history].sort((a, b) => b.ranAt - a.ranAt).slice(0, 500);
    }
    addHistory(entry) {
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
    listSnippets() {
        return [...this.data.snippets].sort((a, b) => b.updatedAt - a.updatedAt);
    }
    saveSnippet(s) {
        const idx = this.data.snippets.findIndex((x) => x.id === s.id);
        if (idx >= 0)
            this.data.snippets[idx] = s;
        else
            this.data.snippets.push(s);
        this.save();
        return s;
    }
    deleteSnippet(id) {
        this.data.snippets = this.data.snippets.filter((s) => s.id !== id);
        this.save();
    }
}
let _store = null;
function getStore() {
    if (!_store)
        _store = new Store();
    return _store;
}
