import { app, BrowserWindow, ipcMain, shell, dialog, nativeTheme, Menu } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { v4 as uuid } from 'uuid';
import { getStore } from './store';
import * as db from './db';
import { activateLicense, deactivateLicense, getLicense } from './license';
import { buildHashRoute } from '../shared/window-route';
import type {
  AppSettings,
  ConnectionConfig,
  QueryHistoryEntry,
  RowChange,
  SavedSnippet,
} from '../shared/types';

// Connection workspace windows are keyed by connectionId. The home window has
// no connection — opening the same connection twice focuses the existing window
// instead of creating a duplicate (which would be exactly the kind of confusion
// per-connection windows are meant to prevent).
const connectionWindows = new Map<string, BrowserWindow>();
let homeWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged && process.env.VITE_DEV_SERVER_URL !== undefined;
const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

function createWindow(opts?: { connectionId?: string }) {
  const connectionId = opts?.connectionId;
  const conn = connectionId
    ? getStore().listConnections().find((c) => c.id === connectionId)
    : undefined;
  // Tint the window chrome to match the connection color so it's instantly
  // clear which DB you're acting on. Home window uses the neutral background.
  const bg = conn?.color
    ? tintForConnection(conn.color)
    : (nativeTheme.shouldUseDarkColors ? '#0f1115' : '#ffffff');

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: bg,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    title: conn ? `${conn.name} — ${conn.database}` : 'Mili DB Explorer',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  const hash = connectionId
    ? buildHashRoute({ kind: 'connection', connectionId })
    : '';

  if (isDev) {
    win.loadURL(DEV_URL + hash);
  } else {
    win.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'), {
      hash: hash.replace(/^#/, ''),
    });
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (connectionId) {
    connectionWindows.set(connectionId, win);
    win.on('closed', () => {
      // §workspace — closing the window closes the connection on the main
      // side too, so background traffic stops and pools get freed.
      connectionWindows.delete(connectionId);
      db.closeConnection(connectionId);
    });
  } else {
    homeWindow = win;
    win.on('closed', () => {
      if (homeWindow === win) homeWindow = null;
    });
  }

  return win;
}

/**
 * Open (or focus) the workspace window for a connection.
 * Used by the renderer when the user clicks "Open" on a connection in the
 * home window. Idempotent: re-opening focuses the existing window.
 */
function openConnectionWindow(connectionId: string): BrowserWindow {
  const existing = connectionWindows.get(connectionId);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    return existing;
  }
  return createWindow({ connectionId });
}

/** Tint the window background slightly toward the connection color. */
function tintForConnection(color: string): string {
  // Accept hex; if anything else, just return dark/light default.
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    return nativeTheme.shouldUseDarkColors ? '#0f1115' : '#ffffff';
  }
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  // Blend ~8% toward the connection color over the base bg.
  const base = nativeTheme.shouldUseDarkColors ? [15, 17, 21] : [255, 255, 255];
  const t = 0.08;
  const out = [r, g, b].map((v, i) => Math.round(base[i] * (1 - t) + v * t));
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('');
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([{
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        }] as Electron.MenuItemConstructorOptions[])
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Query Tab', accelerator: 'CmdOrCtrl+T', click: (_m, w) => (w as BrowserWindow)?.webContents.send('menu:newTab') },
        { label: 'New Connection', accelerator: 'CmdOrCtrl+N', click: (_m, w) => (w as BrowserWindow)?.webContents.send('menu:newConnection') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Command Palette', accelerator: 'CmdOrCtrl+K', click: (_m, w) => (w as BrowserWindow)?.webContents.send('menu:commandPalette') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Query',
      submenu: [
        { label: 'Run', accelerator: 'CmdOrCtrl+Return', click: (_m, w) => (w as BrowserWindow)?.webContents.send('menu:runQuery') },
        { label: 'Run Selection', accelerator: 'CmdOrCtrl+Shift+Return', click: (_m, w) => (w as BrowserWindow)?.webContents.send('menu:runSelection') },
        { label: 'Format SQL', accelerator: 'CmdOrCtrl+Shift+F', click: (_m, w) => (w as BrowserWindow)?.webContents.send('menu:formatSql') },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Documentation', click: () => shell.openExternal('https://getmili.ai/db-explorer') },
        { label: 'Buy Pro', click: () => shell.openExternal('https://getmili.ai/db-explorer/buy') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpc() {
  const store = getStore();

  // Connections
  ipcMain.handle('api:listConnections', () => store.listConnections());
  ipcMain.handle('api:saveConnection', (_e, conn: ConnectionConfig) => {
    const license = getLicense();
    const existing = store.listConnections();
    if (license.status !== 'pro' && !existing.find((c) => c.id === conn.id) && existing.length >= 2) {
      throw new Error('Free tier is limited to 2 connections. Upgrade to Pro to add more.');
    }
    if (!conn.id) conn.id = uuid();
    if (!conn.createdAt) conn.createdAt = Date.now();
    return store.saveConnection(conn);
  });
  ipcMain.handle('api:deleteConnection', (_e, id: string) => {
    db.closeConnection(id);
    store.deleteConnection(id);
  });
  ipcMain.handle('api:testConnection', (_e, conn: ConnectionConfig) => db.testConnection(conn));
  ipcMain.handle('api:openConnection', async (_e, id: string) => {
    const conn = store.listConnections().find((c) => c.id === id);
    if (!conn) return { ok: false, error: 'Connection not found' };
    const r = await db.openConnection(conn);
    if (r.ok) store.touchConnection(id);
    return r;
  });
  ipcMain.handle('api:closeConnection', (_e, id: string) => db.closeConnection(id));

  // Schema
  ipcMain.handle('api:listDatabases', (_e, id: string) => db.listDatabases(id));
  ipcMain.handle('api:listSchemas', (_e, id: string) => db.listSchemas(id));
  ipcMain.handle('api:refreshSchema', (_e, id: string) => db.refreshSchema(id));
  ipcMain.handle('api:getAutocomplete', (_e, id: string) => db.getAutocomplete(id));
  ipcMain.handle('api:getTableDetails', (_e, id: string, s: string, t: string) => db.getTableDetails(id, s, t));
  ipcMain.handle('api:getViewDefinition', (_e, id: string, s: string, v: string) => db.getViewDefinition(id, s, v));
  ipcMain.handle('api:getFunctionDefinition', (_e, id: string, s: string, f: string) => db.getFunctionDefinition(id, s, f));

  // Queries
  ipcMain.handle('api:runQuery', (_e, id: string, sql: string, params?: any[]) => db.runQuery(id, sql, params));
  ipcMain.handle('api:runQueryScript', (_e, id: string, sql: string, opts?: any) =>
    db.runQueryScript(id, sql, opts)
  );
  ipcMain.handle('api:cancelQuery', (_e, queryId: string) => db.cancelQuery(queryId));
  ipcMain.handle('api:listRunningQueries', () => db.listRunningQueries());
  ipcMain.handle('api:explainAnalyze', (_e, id: string, sql: string) => db.explainAnalyze(id, sql));

  // Table data
  ipcMain.handle('api:fetchTableRows', (_e, id: string, s: string, t: string, opts: any) =>
    db.fetchTableRows(id, s, t, opts)
  );
  ipcMain.handle('api:applyRowChanges', async (_e, id: string, s: string, t: string, changes: RowChange[]) => {
    return db.applyRowChanges(id, s, t, changes);
  });

  // History
  ipcMain.handle('api:getHistory', () => store.listHistory());
  ipcMain.handle('api:addHistory', (_e, entry: QueryHistoryEntry) => store.addHistory(entry));
  ipcMain.handle('api:clearHistory', () => store.clearHistory());

  // Snippets
  ipcMain.handle('api:listSnippets', () => store.listSnippets());
  ipcMain.handle('api:saveSnippet', (_e, s: SavedSnippet) => {
    if (!s.id) s.id = uuid();
    s.updatedAt = Date.now();
    if (!s.createdAt) s.createdAt = Date.now();
    return store.saveSnippet(s);
  });
  ipcMain.handle('api:deleteSnippet', (_e, id: string) => store.deleteSnippet(id));

  // Settings
  ipcMain.handle('api:getSettings', () => store.getSettings());
  ipcMain.handle('api:setSettings', (_e, patch: Partial<AppSettings>) => store.setSettings(patch));

  // License
  ipcMain.handle('api:getLicense', () => getLicense());
  ipcMain.handle('api:activateLicense', (_e, key: string, email: string) => activateLicense(key, email));
  ipcMain.handle('api:deactivateLicense', () => {
    deactivateLicense();
    return getLicense();
  });

  // Workspaces
  ipcMain.handle('api:openConnectionWindow', (_e, id: string) => {
    openConnectionWindow(id);
    return { ok: true };
  });
  ipcMain.handle('api:openHomeWindow', () => {
    if (homeWindow && !homeWindow.isDestroyed()) {
      if (homeWindow.isMinimized()) homeWindow.restore();
      homeWindow.focus();
    } else {
      createWindow();
    }
    return { ok: true };
  });

  // Misc
  ipcMain.handle('api:openExternal', (_e, url: string) => shell.openExternal(url));
  ipcMain.handle('api:exportFile', async (e, opts: { content: string; defaultName: string; filters?: any[] }) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return { ok: false };
    const res = await dialog.showSaveDialog(win, {
      defaultPath: opts.defaultName,
      filters: opts.filters || [{ name: 'All Files', extensions: ['*'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false };
    fs.writeFileSync(res.filePath, opts.content, 'utf-8');
    return { ok: true, path: res.filePath };
  });
}

app.whenReady().then(() => {
  registerIpc();
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  db.closeAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  db.closeAll();
});
