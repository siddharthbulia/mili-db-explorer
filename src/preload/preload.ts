import { contextBridge, ipcRenderer } from 'electron';

const methods = [
  'listConnections', 'saveConnection', 'deleteConnection',
  'testConnection', 'openConnection', 'closeConnection',
  'listDatabases', 'listSchemas',
  'getTableDetails', 'getViewDefinition', 'getFunctionDefinition',
  'runQuery', 'runQueryScript', 'cancelQuery', 'listRunningQueries', 'explainAnalyze',
  'refreshSchema', 'getAutocomplete',
  'openConnectionWindow', 'openHomeWindow',
  'fetchTableRows', 'applyRowChanges',
  'getHistory', 'addHistory', 'clearHistory',
  'listSnippets', 'saveSnippet', 'deleteSnippet',
  'getSettings', 'setSettings',
  'getLicense', 'activateLicense', 'deactivateLicense',
  'exportFile', 'openExternal',
] as const;

const api: Record<string, (...args: any[]) => Promise<any>> = {};
for (const m of methods) {
  api[m] = (...args: any[]) => ipcRenderer.invoke(`api:${m}`, ...args);
}

contextBridge.exposeInMainWorld('api', api);
contextBridge.exposeInMainWorld('platform', {
  os: process.platform,
  node: process.versions.node,
  chrome: process.versions.chrome,
  electron: process.versions.electron,
});
