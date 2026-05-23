import type { Pool, PoolClient, QueryArrayResult, Client } from 'pg';
import { splitStatements } from '../shared/sql-split';

// §7.1 — defer pg import. The module is ~30ms parse + module init; loading it
// on first connection rather than on app start meaningfully helps cold launch.
let _pgModule: typeof import('pg') | null = null;
async function pg(): Promise<typeof import('pg')> {
  if (_pgModule) return _pgModule;
  _pgModule = await import('pg');
  return _pgModule;
}
// Eager loader (sync), only call after the lazy one has resolved at least once.
// Some helpers below (Client instances created inside async fns) await pg() first.
import { applyAutoLimit } from '../shared/auto-limit';
import { diffSchemas, type SchemaDiff } from '../shared/schema-diff';
import type {
  ColumnDef,
  ConnectionConfig,
  ConstraintDef,
  ForeignKeyDef,
  IndexDef,
  QueryResponse,
  QueryResult,
  RowChange,
  SchemaEntry,
  TableDetails,
  TriggerDef,
} from '../shared/types';

export { splitStatements };
export function quoteIdent(s: string): string {
  return '"' + s.replace(/"/g, '""') + '"';
}

interface ManagedPool {
  pool: Pool;
  activeClient?: PoolClient;
  config: ConnectionConfig;
  lastAcquireAt?: number;
}

const pools = new Map<string, ManagedPool>();

// §4.4 — schema cache keyed by connection id.
const schemaCache = new Map<string, SchemaEntry[]>();

// §8.4 — slim autocomplete index per connection.
export interface AutocompleteEntry {
  schema: string;
  table: string;
  column: string;
}
const autocompleteCache = new Map<string, AutocompleteEntry[]>();

export function getAutocomplete(connectionId: string): AutocompleteEntry[] {
  return autocompleteCache.get(connectionId) || [];
}

/**
 * §8.4 — build a slim (schema, table, column) index. Cheap query, executed in
 * the background after the schema query so the editor has suggestions ready by
 * the time the user types.
 */
export async function buildAutocompleteIndex(connectionId: string): Promise<AutocompleteEntry[]> {
  const pool = getPool(connectionId);
  const r = await pool.query(`
    select table_schema as schema, table_name as table, column_name as column
    from information_schema.columns
    where table_schema not in ('pg_catalog','information_schema')
    order by table_schema, table_name, ordinal_position
  `);
  const out: AutocompleteEntry[] = r.rows.map((x: any) => ({
    schema: x.schema, table: x.table, column: x.column,
  }));
  autocompleteCache.set(connectionId, out);
  return out;
}

export function getCachedSchema(connectionId: string): SchemaEntry[] | undefined {
  return schemaCache.get(connectionId);
}

export function clearSchemaCache(connectionId: string) {
  schemaCache.delete(connectionId);
}

/**
 * §8.3 — refresh schema, return either the full snapshot or a diff against
 * the cached snapshot. Renderer uses the diff to patch the tree in place.
 */
export async function refreshSchema(
  connectionId: string
): Promise<{ schemas: SchemaEntry[]; diff: SchemaDiff | null }> {
  const before = schemaCache.get(connectionId);
  const after = await listSchemas(connectionId);
  schemaCache.set(connectionId, after);
  const diff = before ? diffSchemas(before, after) : null;
  return { schemas: after, diff };
}

// queryId -> backend pid for cancellation (§3.6).
interface RunningQuery {
  connectionId: string;
  pid: number;
  startedAt: number;
}
const runningQueries = new Map<string, RunningQuery>();

export function listRunningQueries(): { id: string; connectionId: string; pid: number; ageMs: number }[] {
  const now = Date.now();
  return [...runningQueries.entries()].map(([id, q]) => ({
    id, connectionId: q.connectionId, pid: q.pid, ageMs: now - q.startedAt,
  }));
}

function registerRunning(id: string, connectionId: string, pid: number) {
  runningQueries.set(id, { connectionId, pid, startedAt: Date.now() });
}
function unregisterRunning(id: string) {
  runningQueries.delete(id);
}

// §2.3 — every checkout, if the pool has been idle for IDLE_PROBE_THRESHOLD_MS,
// run `select 1` once to detect dead connections before the user query.
async function acquireClient(mp: ManagedPool): Promise<PoolClient> {
  const now = Date.now();
  const idle = mp.lastAcquireAt ? now - mp.lastAcquireAt : Infinity;
  mp.lastAcquireAt = now;
  const client = await mp.pool.connect();
  if (idle > IDLE_PROBE_THRESHOLD_MS) {
    try {
      await client.query('select 1');
    } catch (e) {
      client.release(e as Error);
      // Re-acquire — pg.Pool will drop the broken connection.
      return mp.pool.connect();
    }
  }
  return client;
}

// Defaults documented in docs/PERFORMANCE.md §2.2 / §2.3.
const DEFAULT_POOL_SIZE = 5;
const DEFAULT_CONNECT_TIMEOUT_MS = 8_000;
const DEFAULT_KEEPALIVE_DELAY_MS = 10_000;
const IDLE_PROBE_THRESHOLD_MS = 5 * 60_000;

export function buildPoolConfig(c: ConnectionConfig) {
  const ssl =
    c.ssl === 'disable'
      ? false
      : c.ssl === 'require'
      ? { rejectUnauthorized: false }
      : { rejectUnauthorized: true };
  const max = clampPoolSize(c.poolSize);
  return {
    host: c.host,
    port: c.port,
    database: c.database,
    user: c.user,
    password: c.password || '',
    ssl,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: DEFAULT_CONNECT_TIMEOUT_MS,
    keepAlive: true,
    keepAliveInitialDelayMillis: DEFAULT_KEEPALIVE_DELAY_MS,
    statement_timeout: 0,
    application_name: 'Mili DB Explorer',
  };
}

export function clampPoolSize(n: number | undefined | null): number {
  if (n == null || Number.isNaN(n)) return DEFAULT_POOL_SIZE;
  const v = Math.floor(n);
  if (v < 1) return 1;
  if (v > 32) return 32;
  return v;
}

export async function testConnection(c: ConnectionConfig) {
  const { Pool: PoolCtor } = await pg();
  const pool = new PoolCtor(buildPoolConfig(c) as any);
  try {
    const r = await pool.query('select version() as v');
    return { ok: true, serverVersion: r.rows[0].v as string };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  } finally {
    await pool.end().catch(() => {});
  }
}

export async function openConnection(c: ConnectionConfig) {
  closeConnection(c.id);
  const { Pool: PoolCtor } = await pg();
  const pool = new PoolCtor(buildPoolConfig(c) as any);
  try {
    const r = await pool.query('select version() as v');
    pools.set(c.id, { pool, config: c });
    // §8.4 — pre-warm autocomplete in background; don't block connect.
    buildAutocompleteIndex(c.id).catch(() => { /* swallow; tree still works */ });
    return { ok: true, serverVersion: r.rows[0].v as string };
  } catch (e: any) {
    await pool.end().catch(() => {});
    return { ok: false, error: e?.message || String(e) };
  }
}

export function closeConnection(id: string) {
  const mp = pools.get(id);
  if (mp) {
    mp.pool.end().catch(() => {});
    pools.delete(id);
  }
  schemaCache.delete(id);
  autocompleteCache.delete(id);
}

export function closeAll() {
  for (const id of [...pools.keys()]) closeConnection(id);
}

function getPool(id: string): Pool {
  return getManagedPool(id).pool;
}

function getManagedPool(id: string): ManagedPool {
  const mp = pools.get(id);
  if (!mp) throw new Error('Connection not open');
  return mp;
}

function toResult(qr: QueryArrayResult, durationMs: number, notices: string[]): QueryResult {
  return {
    columns: qr.fields.map((f) => ({
      name: f.name,
      dataType: oidToType(f.dataTypeID),
      tableID: f.tableID,
    })),
    rows: qr.rows as any[][],
    rowCount: typeof qr.rowCount === 'number' ? qr.rowCount : qr.rows.length,
    command: qr.command,
    durationMs,
    notices,
  };
}

// Minimal OID -> friendly type mapping. Anything we don't know shows as "?".
const OID_MAP: Record<number, string> = {
  16: 'bool', 17: 'bytea', 18: 'char', 19: 'name', 20: 'int8', 21: 'int2',
  23: 'int4', 25: 'text', 26: 'oid', 114: 'json', 142: 'xml',
  700: 'float4', 701: 'float8', 1042: 'bpchar', 1043: 'varchar',
  1082: 'date', 1083: 'time', 1114: 'timestamp', 1184: 'timestamptz',
  1186: 'interval', 1266: 'timetz', 1700: 'numeric', 2950: 'uuid',
  3802: 'jsonb',
};
function oidToType(oid: number): string {
  return OID_MAP[oid] || `oid:${oid}`;
}

export async function runQueryScript(
  connectionId: string,
  sql: string,
  opts?: { queryId?: string; autoLimit?: number | null }
): Promise<QueryResponse> {
  const mp = getManagedPool(connectionId);
  const client = await acquireClient(mp);
  const notices: string[] = [];
  const noticeHandler = (n: any) => notices.push(n.message || String(n));
  (client as any).on?.('notice', noticeHandler);
  const results: QueryResult[] = [];
  let registeredId: string | null = null;
  try {
    // Record backend pid so the renderer can ask us to cancel.
    if (opts?.queryId) {
      try {
        const r = await client.query('select pg_backend_pid() as pid');
        const pid = Number((r.rows[0] as any)?.pid);
        if (pid) {
          registeredId = opts.queryId;
          registerRunning(registeredId, connectionId, pid);
        }
      } catch { /* non-fatal */ }
    }
    const autoLimit = opts?.autoLimit ?? mp.config.autoLimit ?? null;
    const statements = splitStatements(sql);
    for (const stmt of statements) {
      if (!stmt.trim()) continue;
      const start = Date.now();
      let text = stmt;
      if (autoLimit && autoLimit > 0) {
        const out = applyAutoLimit(stmt, autoLimit);
        if (out.injected) text = out.sql;
      }
      // rowMode array preserves duplicate column names
      const qr = (await client.query({ text, rowMode: 'array' })) as unknown as QueryArrayResult;
      results.push(toResult(qr, Date.now() - start, notices.splice(0)));
    }
    return { ok: true, results };
  } catch (e: any) {
    return {
      ok: false,
      error: {
        message: e?.message || String(e),
        code: e?.code,
        position: e?.position,
        hint: e?.hint,
        detail: e?.detail,
      },
    };
  } finally {
    if (registeredId) unregisterRunning(registeredId);
    (client as any).off?.('notice', noticeHandler);
    client.release();
  }
}

/**
 * Cancel the running query identified by queryId, using a fresh lightweight
 * connection so the query connection isn't blocked (§3.6).
 */
export async function cancelQuery(queryId: string): Promise<{ ok: boolean; error?: string }> {
  const rq = runningQueries.get(queryId);
  if (!rq) return { ok: false, error: 'unknown query id' };
  const mp = pools.get(rq.connectionId);
  if (!mp) return { ok: false, error: 'connection closed' };
  const cfg = buildPoolConfig(mp.config);
  const { Client: ClientCtor } = await pg();
  const c = new ClientCtor(cfg as any);
  try {
    await c.connect();
    // First try a graceful cancel.
    await c.query('select pg_cancel_backend($1)', [rq.pid]);
    // If still running >2s, escalate (§3.6 bonus).
    setTimeout(async () => {
      if (!runningQueries.has(queryId)) return;
      try {
        const c2 = new ClientCtor(cfg as any);
        await c2.connect();
        await c2.query('select pg_terminate_backend($1)', [rq.pid]);
        await c2.end();
      } catch { /* ignore */ }
    }, 2000).unref?.();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  } finally {
    await c.end().catch(() => {});
  }
}

export interface ExplainResult {
  planJson: any;
  planningMs: number;
  executionMs: number;
  totalMs: number;
}

/**
 * §11.1 — server-side timing via EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON).
 * Only useful for SELECT/CTE; refuses to run anything that would mutate state
 * unless it's wrapped in a transaction by the caller (we leave that to them).
 */
export async function explainAnalyze(connectionId: string, sql: string): Promise<ExplainResult> {
  const pool = getPool(connectionId);
  const trimmed = sql.trim().replace(/;\s*$/, '');
  const wrapped = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${trimmed}`;
  const r = await pool.query(wrapped);
  // pg returns one row, one column "QUERY PLAN" with the JSON.
  const planJson = (r.rows[0] as any)['QUERY PLAN'];
  const root = Array.isArray(planJson) ? planJson[0] : planJson;
  return {
    planJson: root,
    planningMs: Number(root?.['Planning Time'] || 0),
    executionMs: Number(root?.['Execution Time'] || 0),
    totalMs: Number(root?.['Planning Time'] || 0) + Number(root?.['Execution Time'] || 0),
  };
}

export interface StreamChunk {
  rows: any[][];
  columns: QueryResult['columns'];
  index: number;       // 0-based chunk index
  totalSoFar: number;  // running row count
}
export interface StreamResult {
  columns: QueryResult['columns'];
  totalRows: number;
  durationMs: number;
}

/**
 * §3.1 — stream large SELECTs via a server-side cursor in batches.
 * Caller receives each chunk via `onChunk`; the final result lists totals.
 * Honors §4.3 by batching rows into chunks of `chunkSize` (default 1000).
 */
export async function streamQuery(
  connectionId: string,
  sql: string,
  onChunk: (chunk: StreamChunk) => void | Promise<void>,
  opts?: { chunkSize?: number; queryId?: string }
): Promise<StreamResult> {
  const chunkSize = Math.max(50, Math.min(10_000, opts?.chunkSize ?? 1000));
  const mp = getManagedPool(connectionId);
  const client = await acquireClient(mp);
  const start = Date.now();
  let columns: QueryResult['columns'] = [];
  let total = 0;
  let chunkIdx = 0;
  let registeredId: string | null = null;
  let inTx = false;
  try {
    if (opts?.queryId) {
      try {
        const r = await client.query('select pg_backend_pid() as pid');
        const pid = Number((r.rows[0] as any)?.pid);
        if (pid) {
          registeredId = opts.queryId;
          registerRunning(registeredId, connectionId, pid);
        }
      } catch { /* non-fatal */ }
    }
    await client.query('BEGIN');
    inTx = true;
    // Use a unique cursor name so concurrent streams don't collide.
    const cursor = `mili_cur_${Math.random().toString(36).slice(2, 10)}`;
    const trimmed = sql.trim().replace(/;\s*$/, '');
    await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR ${trimmed}`);
    while (true) {
      const qr = (await client.query({
        text: `FETCH ${chunkSize} FROM ${cursor}`,
        rowMode: 'array',
      })) as unknown as QueryArrayResult;
      if (columns.length === 0 && qr.fields?.length) {
        columns = qr.fields.map((f) => ({
          name: f.name, dataType: oidToType(f.dataTypeID), tableID: f.tableID,
        }));
      }
      const rows = qr.rows as any[][];
      total += rows.length;
      if (rows.length > 0) {
        await onChunk({ rows, columns, index: chunkIdx++, totalSoFar: total });
      }
      if (rows.length < chunkSize) break;
    }
    await client.query(`CLOSE ${cursor}`);
    await client.query('COMMIT');
    inTx = false;
    return { columns, totalRows: total, durationMs: Date.now() - start };
  } catch (e) {
    if (inTx) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    }
    throw e;
  } finally {
    if (registeredId) unregisterRunning(registeredId);
    client.release();
  }
}

export async function runQuery(connectionId: string, sql: string, params?: any[]): Promise<QueryResponse> {
  const pool = getPool(connectionId);
  const start = Date.now();
  try {
    const qr = (await pool.query({ text: sql, values: params, rowMode: 'array' })) as unknown as QueryArrayResult;
    return { ok: true, results: [toResult(qr, Date.now() - start, [])] };
  } catch (e: any) {
    return {
      ok: false,
      error: {
        message: e?.message || String(e),
        code: e?.code,
        position: e?.position,
        hint: e?.hint,
        detail: e?.detail,
      },
    };
  }
}

export async function listSchemas(connectionId: string): Promise<SchemaEntry[]> {
  const pool = getPool(connectionId);

  const schemasQ = `
    select n.nspname as schema
    from pg_namespace n
    where n.nspname not in ('pg_catalog','information_schema','pg_toast')
      and n.nspname not like 'pg_temp_%'
      and n.nspname not like 'pg_toast_temp_%'
    order by case when n.nspname = 'public' then 0 else 1 end, n.nspname
  `;
  const relsQ = `
    select n.nspname as schema, c.relname as name, c.relkind as kind,
           c.reltuples::bigint as est_rows,
           pg_size_pretty(pg_total_relation_size(c.oid)) as size,
           obj_description(c.oid) as comment
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r','v','m','p','f')
      and n.nspname not in ('pg_catalog','information_schema','pg_toast')
      and n.nspname not like 'pg_temp_%'
    order by n.nspname, c.relname
  `;
  const funcsQ = `
    select n.nspname as schema, p.proname as name,
           pg_get_function_arguments(p.oid) as args,
           pg_get_function_result(p.oid) as returns,
           l.lanname as language
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname not in ('pg_catalog','information_schema','pg_toast')
      and p.prokind = 'f'
    order by n.nspname, p.proname
  `;
  const seqsQ = `
    select n.nspname as schema, c.relname as name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'S'
      and n.nspname not in ('pg_catalog','information_schema','pg_toast')
    order by n.nspname, c.relname
  `;

  const [schemas, rels, funcs, seqs] = await Promise.all([
    pool.query(schemasQ),
    pool.query(relsQ),
    pool.query(funcsQ),
    pool.query(seqsQ),
  ]);

  const map = new Map<string, SchemaEntry>();
  for (const r of schemas.rows) {
    map.set(r.schema, {
      schema: r.schema,
      tables: [], views: [], matViews: [],
      functions: [], sequences: [],
    });
  }
  for (const r of rels.rows) {
    const e = map.get(r.schema);
    if (!e) continue;
    const entry = {
      name: r.name,
      kind: r.kind as any,
      estimatedRows: Number(r.est_rows),
      size: r.size,
      comment: r.comment,
    };
    if (r.kind === 'r' || r.kind === 'p' || r.kind === 'f') e.tables.push(entry);
    else if (r.kind === 'v') e.views.push(entry);
    else if (r.kind === 'm') e.matViews.push(entry);
  }
  for (const r of funcs.rows) {
    const e = map.get(r.schema);
    if (!e) continue;
    e.functions.push({ name: r.name, args: r.args, returns: r.returns, language: r.language });
  }
  for (const r of seqs.rows) {
    const e = map.get(r.schema);
    if (!e) continue;
    e.sequences.push({ name: r.name });
  }
  const out = [...map.values()];
  schemaCache.set(connectionId, out);
  return out;
}

export async function getTableDetails(connectionId: string, schema: string, table: string): Promise<TableDetails> {
  const pool = getPool(connectionId);
  const metaQ = `
    select c.relkind as kind,
           obj_description(c.oid) as comment,
           c.reltuples::bigint as est_rows,
           pg_size_pretty(pg_total_relation_size(c.oid)) as size
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = $1 and c.relname = $2
  `;
  const colsQ = `
    select a.attname as name,
           format_type(a.atttypid, a.atttypmod) as full_type,
           t.typname as data_type,
           not a.attnotnull as nullable,
           pg_get_expr(d.adbin, d.adrelid) as default_expr,
           a.attnum as position,
           col_description(a.attrelid, a.attnum) as comment,
           (case when a.attlen > 0 then a.attlen else null end) as max_length,
           a.attidentity != '' as is_identity,
           (select count(*) > 0 from pg_constraint pc
             where pc.conrelid = a.attrelid and pc.contype = 'p' and a.attnum = any(pc.conkey)) as is_pk
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_type t on t.oid = a.atttypid
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where n.nspname = $1 and c.relname = $2 and a.attnum > 0 and not a.attisdropped
    order by a.attnum
  `;
  const idxQ = `
    select i.relname as name,
           pg_get_indexdef(ix.indexrelid) as definition,
           ix.indisunique as is_unique,
           ix.indisprimary as is_primary,
           pg_size_pretty(pg_relation_size(ix.indexrelid)) as size
    from pg_index ix
    join pg_class i on i.oid = ix.indexrelid
    join pg_class c on c.oid = ix.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = $1 and c.relname = $2
    order by ix.indisprimary desc, i.relname
  `;
  const fkQ = `
    select con.conname as name,
           con.conkey as conkey,
           ref.relname as ref_table,
           refn.nspname as ref_schema,
           con.confkey as confkey,
           con.confdeltype as on_delete,
           con.confupdtype as on_update,
           (select array_agg(attname)::text[] from pg_attribute where attrelid = con.conrelid and attnum = any(con.conkey)) as columns,
           (select array_agg(attname)::text[] from pg_attribute where attrelid = con.confrelid and attnum = any(con.confkey)) as ref_columns
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_class ref on ref.oid = con.confrelid
    join pg_namespace refn on refn.oid = ref.relnamespace
    where n.nspname = $1 and c.relname = $2 and con.contype = 'f'
  `;
  const conQ = `
    select con.conname as name,
           con.contype as type,
           pg_get_constraintdef(con.oid) as definition
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = $1 and c.relname = $2 and con.contype in ('p','u','c','x')
  `;
  const trigQ = `
    select tg.tgname as name,
           pg_get_triggerdef(tg.oid) as definition
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = $1 and c.relname = $2 and not tg.tgisinternal
  `;
  const [meta, cols, idxs, fks, cons, trigs] = await Promise.all([
    pool.query(metaQ, [schema, table]),
    pool.query(colsQ, [schema, table]),
    pool.query(idxQ, [schema, table]),
    pool.query(fkQ, [schema, table]),
    pool.query(conQ, [schema, table]),
    pool.query(trigQ, [schema, table]),
  ]);
  if (meta.rows.length === 0) throw new Error(`Relation ${schema}.${table} not found`);
  const m = meta.rows[0];
  const onActionMap: Record<string, string> = { a: 'NO ACTION', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT' };
  const columns: ColumnDef[] = cols.rows.map((r: any) => ({
    name: r.name,
    dataType: r.data_type,
    fullType: r.full_type,
    nullable: r.nullable,
    default: r.default_expr,
    isPrimaryKey: r.is_pk,
    isIdentity: r.is_identity,
    position: r.position,
    comment: r.comment,
    maxLength: r.max_length,
  }));
  const indexes: IndexDef[] = idxs.rows.map((r: any) => ({
    name: r.name, definition: r.definition,
    isUnique: r.is_unique, isPrimary: r.is_primary, size: r.size,
  }));
  const foreignKeys: ForeignKeyDef[] = fks.rows.map((r: any) => ({
    name: r.name,
    columns: r.columns,
    refSchema: r.ref_schema,
    refTable: r.ref_table,
    refColumns: r.ref_columns,
    onDelete: onActionMap[r.on_delete] || r.on_delete,
    onUpdate: onActionMap[r.on_update] || r.on_update,
  }));
  const constraints: ConstraintDef[] = cons.rows.map((r: any) => ({
    name: r.name, type: r.type, definition: r.definition,
  }));
  const triggers: TriggerDef[] = trigs.rows.map((r: any) => ({
    name: r.name, event: '', timing: '', definition: r.definition,
  }));
  return {
    schema, name: table, kind: m.kind,
    comment: m.comment, estimatedRows: Number(m.est_rows), size: m.size,
    columns, indexes, foreignKeys, constraints, triggers,
  };
}

export async function getViewDefinition(connectionId: string, schema: string, view: string): Promise<string> {
  const pool = getPool(connectionId);
  const r = await pool.query(`select pg_get_viewdef(format('%I.%I', $1::text, $2::text)::regclass, true) as def`, [schema, view]);
  return r.rows[0]?.def || '';
}

export async function getFunctionDefinition(connectionId: string, schema: string, name: string): Promise<string> {
  const pool = getPool(connectionId);
  const r = await pool.query(
    `select pg_get_functiondef(p.oid) as def
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = $1 and p.proname = $2 limit 1`,
    [schema, name]
  );
  return r.rows[0]?.def || '';
}

export async function listDatabases(connectionId: string): Promise<string[]> {
  const pool = getPool(connectionId);
  const r = await pool.query(`select datname from pg_database where not datistemplate order by datname`);
  return r.rows.map((x: any) => x.datname);
}

const qIdent = quoteIdent;

export async function fetchTableRows(
  connectionId: string, schema: string, table: string,
  opts: { limit: number; offset: number; orderBy?: { col: string; dir: 'asc' | 'desc' }[]; where?: string }
): Promise<QueryResponse> {
  let sql = `select * from ${qIdent(schema)}.${qIdent(table)}`;
  if (opts.where && opts.where.trim()) sql += ` where ${opts.where}`;
  if (opts.orderBy && opts.orderBy.length) {
    sql += ` order by ` + opts.orderBy.map((o) => `${qIdent(o.col)} ${o.dir === 'desc' ? 'desc' : 'asc'}`).join(', ');
  }
  sql += ` limit ${Math.max(1, Math.min(50000, opts.limit | 0))} offset ${Math.max(0, opts.offset | 0)}`;
  return runQuery(connectionId, sql);
}

export async function applyRowChanges(
  connectionId: string, schema: string, table: string, changes: RowChange[]
): Promise<{ ok: boolean; error?: string }> {
  const mp = getManagedPool(connectionId);
  const client = await acquireClient(mp);
  try {
    await client.query('BEGIN');
    for (const ch of changes) {
      if (ch.kind === 'insert' && ch.values) {
        const keys = Object.keys(ch.values).filter((k) => ch.values![k] !== undefined);
        if (!keys.length) continue;
        const cols = keys.map(qIdent).join(', ');
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const vals = keys.map((k) => ch.values![k]);
        await client.query(
          `insert into ${qIdent(schema)}.${qIdent(table)} (${cols}) values (${placeholders})`,
          vals
        );
      } else if (ch.kind === 'update' && ch.pk && ch.values) {
        const keys = Object.keys(ch.values);
        const pkKeys = Object.keys(ch.pk);
        if (!keys.length || !pkKeys.length) continue;
        const setExpr = keys.map((k, i) => `${qIdent(k)} = $${i + 1}`).join(', ');
        const whereExpr = pkKeys.map((k, i) => `${qIdent(k)} = $${keys.length + i + 1}`).join(' and ');
        const vals = [...keys.map((k) => ch.values![k]), ...pkKeys.map((k) => ch.pk![k])];
        await client.query(
          `update ${qIdent(schema)}.${qIdent(table)} set ${setExpr} where ${whereExpr}`,
          vals
        );
      } else if (ch.kind === 'delete' && ch.pk) {
        const pkKeys = Object.keys(ch.pk);
        if (!pkKeys.length) continue;
        const whereExpr = pkKeys.map((k, i) => `${qIdent(k)} = $${i + 1}`).join(' and ');
        const vals = pkKeys.map((k) => ch.pk![k]);
        await client.query(
          `delete from ${qIdent(schema)}.${qIdent(table)} where ${whereExpr}`,
          vals
        );
      }
    }
    await client.query('COMMIT');
    return { ok: true };
  } catch (e: any) {
    try { await client.query('ROLLBACK'); } catch {}
    return { ok: false, error: e?.message || String(e) };
  } finally {
    client.release();
  }
}
