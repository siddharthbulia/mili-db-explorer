export interface ConnectionConfig {
  id: string;
  name: string;
  color?: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  ssl: 'disable' | 'require' | 'verify-full';
  sshTunnel?: {
    host: string;
    port: number;
    user: string;
    privateKey?: string;
    password?: string;
  };
  createdAt: number;
  lastUsedAt?: number;
  // Performance tuning (§2.2). Defaults are documented in src/main/db.ts.
  poolSize?: number;          // max pool connections; default 5
  autoLimit?: number | null;  // inject LIMIT for SELECTs missing one; null/0 disables
  streamThreshold?: number;   // cursor-stream when LIMIT > N or no LIMIT
  defaultSchema?: string;     // initial search_path schema; default 'public'
  readOnly?: boolean;         // open new sessions in transaction-read-only
}

export interface StoredConnection extends Omit<ConnectionConfig, 'password'> {
  passwordEnc?: string;
}

export interface QueryResultColumn {
  name: string;
  dataType: string;
  tableID?: number;
}

export interface QueryResult {
  columns: QueryResultColumn[];
  rows: any[][];
  rowCount: number;
  command?: string;
  durationMs: number;
  notices?: string[];
}

export interface QueryError {
  message: string;
  code?: string;
  position?: string;
  hint?: string;
  detail?: string;
}

export type QueryResponse =
  | { ok: true; results: QueryResult[] }
  | { ok: false; error: QueryError };

export interface SchemaEntry {
  schema: string;
  tables: TableEntry[];
  views: TableEntry[];
  matViews: TableEntry[];
  functions: FunctionEntry[];
  sequences: { name: string }[];
}

export interface TableEntry {
  name: string;
  kind: 'r' | 'v' | 'm' | 'p' | 'f';
  estimatedRows?: number;
  size?: string;
  comment?: string | null;
}

export interface FunctionEntry {
  name: string;
  args: string;
  returns: string;
  language: string;
}

export interface ColumnDef {
  name: string;
  dataType: string;
  fullType: string;
  nullable: boolean;
  default: string | null;
  isPrimaryKey: boolean;
  isIdentity: boolean;
  position: number;
  comment: string | null;
  maxLength: number | null;
}

export interface IndexDef {
  name: string;
  definition: string;
  isUnique: boolean;
  isPrimary: boolean;
  size: string;
}

export interface ForeignKeyDef {
  name: string;
  columns: string[];
  refSchema: string;
  refTable: string;
  refColumns: string[];
  onDelete: string;
  onUpdate: string;
}

export interface ConstraintDef {
  name: string;
  type: string;
  definition: string;
}

export interface TriggerDef {
  name: string;
  event: string;
  timing: string;
  definition: string;
}

export interface TableDetails {
  schema: string;
  name: string;
  kind: string;
  comment: string | null;
  estimatedRows: number;
  size: string;
  columns: ColumnDef[];
  indexes: IndexDef[];
  foreignKeys: ForeignKeyDef[];
  constraints: ConstraintDef[];
  triggers: TriggerDef[];
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  fontSize: number;
  pageSize: number;
  sqlFont: string;
  confirmDangerous: boolean;
  formatOnRun: boolean;
  // Editor preferences
  editorLineNumbers?: boolean;
  editorWordWrap?: boolean;
  editorTabSize?: number;
  // Display
  relativeTimestamps?: boolean;
  accentColor?: string;
}

export interface LicenseInfo {
  status: 'free' | 'pro';
  key?: string;
  email?: string;
  validatedAt?: number;
}

export interface QueryHistoryEntry {
  id: string;
  connectionId: string;
  sql: string;
  durationMs: number;
  rowCount: number;
  error?: string;
  ranAt: number;
}

export interface SavedSnippet {
  id: string;
  name: string;
  sql: string;
  createdAt: number;
  updatedAt: number;
}

export interface IpcApi {
  // connections
  listConnections(): Promise<ConnectionConfig[]>;
  saveConnection(conn: ConnectionConfig): Promise<ConnectionConfig>;
  deleteConnection(id: string): Promise<void>;
  testConnection(conn: ConnectionConfig): Promise<{ ok: boolean; error?: string; serverVersion?: string }>;
  openConnection(id: string): Promise<{ ok: boolean; error?: string; serverVersion?: string }>;
  closeConnection(id: string): Promise<void>;
  // schema
  listDatabases(connectionId: string): Promise<string[]>;
  listSchemas(connectionId: string): Promise<SchemaEntry[]>;
  getTableDetails(connectionId: string, schema: string, table: string): Promise<TableDetails>;
  getViewDefinition(connectionId: string, schema: string, view: string): Promise<string>;
  getFunctionDefinition(connectionId: string, schema: string, funcName: string): Promise<string>;
  // queries
  runQuery(connectionId: string, sql: string, params?: any[]): Promise<QueryResponse>;
  runQueryScript(connectionId: string, sql: string): Promise<QueryResponse>;
  cancelQuery(connectionId: string): Promise<void>;
  // table data
  fetchTableRows(connectionId: string, schema: string, table: string, opts: {
    limit: number; offset: number; orderBy?: { col: string; dir: 'asc' | 'desc' }[]; where?: string;
  }): Promise<QueryResponse>;
  applyRowChanges(connectionId: string, schema: string, table: string, changes: RowChange[]): Promise<{ ok: boolean; error?: string }>;
  // history
  getHistory(): Promise<QueryHistoryEntry[]>;
  addHistory(entry: QueryHistoryEntry): Promise<void>;
  clearHistory(): Promise<void>;
  // snippets
  listSnippets(): Promise<SavedSnippet[]>;
  saveSnippet(s: SavedSnippet): Promise<SavedSnippet>;
  deleteSnippet(id: string): Promise<void>;
  // settings
  getSettings(): Promise<AppSettings>;
  setSettings(s: Partial<AppSettings>): Promise<AppSettings>;
  // license
  getLicense(): Promise<LicenseInfo>;
  activateLicense(key: string, email: string): Promise<{ ok: boolean; error?: string; license?: LicenseInfo }>;
  deactivateLicense(): Promise<void>;
  // workspaces
  openConnectionWindow(connectionId: string): Promise<{ ok: boolean }>;
  openHomeWindow(): Promise<{ ok: boolean }>;
  // perf-related extras (PERFORMANCE.md)
  refreshSchema(connectionId: string): Promise<{ schemas: SchemaEntry[]; diff: any | null }>;
  getAutocomplete(connectionId: string): Promise<{ schema: string; table: string; column: string }[]>;
  listRunningQueries(): Promise<{ id: string; connectionId: string; pid: number; ageMs: number }[]>;
  explainAnalyze(connectionId: string, sql: string): Promise<{ planJson: any; planningMs: number; executionMs: number; totalMs: number }>;
  // misc
  exportFile(opts: { content: string; defaultName: string; filters?: { name: string; extensions: string[] }[] }): Promise<{ ok: boolean; path?: string }>;
  openExternal(url: string): Promise<void>;
}

export interface PlatformInfo {
  os: string;
  node: string;
  chrome: string;
  electron: string;
}

export interface RowChange {
  kind: 'insert' | 'update' | 'delete';
  pk?: Record<string, any>;
  values?: Record<string, any>;
  original?: Record<string, any>;
}
