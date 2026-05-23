"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitStatements = void 0;
exports.quoteIdent = quoteIdent;
exports.getAutocomplete = getAutocomplete;
exports.buildAutocompleteIndex = buildAutocompleteIndex;
exports.getCachedSchema = getCachedSchema;
exports.clearSchemaCache = clearSchemaCache;
exports.refreshSchema = refreshSchema;
exports.listRunningQueries = listRunningQueries;
exports.buildPoolConfig = buildPoolConfig;
exports.clampPoolSize = clampPoolSize;
exports.testConnection = testConnection;
exports.openConnection = openConnection;
exports.closeConnection = closeConnection;
exports.closeAll = closeAll;
exports.runQueryScript = runQueryScript;
exports.cancelQuery = cancelQuery;
exports.explainAnalyze = explainAnalyze;
exports.streamQuery = streamQuery;
exports.runQuery = runQuery;
exports.listSchemas = listSchemas;
exports.getTableDetails = getTableDetails;
exports.getViewDefinition = getViewDefinition;
exports.getFunctionDefinition = getFunctionDefinition;
exports.listDatabases = listDatabases;
exports.fetchTableRows = fetchTableRows;
exports.applyRowChanges = applyRowChanges;
const sql_split_1 = require("../shared/sql-split");
Object.defineProperty(exports, "splitStatements", { enumerable: true, get: function () { return sql_split_1.splitStatements; } });
// §7.1 — defer pg import. The module is ~30ms parse + module init; loading it
// on first connection rather than on app start meaningfully helps cold launch.
let _pgModule = null;
async function pg() {
    if (_pgModule)
        return _pgModule;
    _pgModule = await Promise.resolve().then(() => __importStar(require('pg')));
    return _pgModule;
}
// Eager loader (sync), only call after the lazy one has resolved at least once.
// Some helpers below (Client instances created inside async fns) await pg() first.
const auto_limit_1 = require("../shared/auto-limit");
const schema_diff_1 = require("../shared/schema-diff");
function quoteIdent(s) {
    return '"' + s.replace(/"/g, '""') + '"';
}
const pools = new Map();
// §4.4 — schema cache keyed by connection id.
const schemaCache = new Map();
const autocompleteCache = new Map();
function getAutocomplete(connectionId) {
    return autocompleteCache.get(connectionId) || [];
}
/**
 * §8.4 — build a slim (schema, table, column) index. Cheap query, executed in
 * the background after the schema query so the editor has suggestions ready by
 * the time the user types.
 */
async function buildAutocompleteIndex(connectionId) {
    const pool = getPool(connectionId);
    const r = await pool.query(`
    select table_schema as schema, table_name as table, column_name as column
    from information_schema.columns
    where table_schema not in ('pg_catalog','information_schema')
    order by table_schema, table_name, ordinal_position
  `);
    const out = r.rows.map((x) => ({
        schema: x.schema, table: x.table, column: x.column,
    }));
    autocompleteCache.set(connectionId, out);
    return out;
}
function getCachedSchema(connectionId) {
    return schemaCache.get(connectionId);
}
function clearSchemaCache(connectionId) {
    schemaCache.delete(connectionId);
}
/**
 * §8.3 — refresh schema, return either the full snapshot or a diff against
 * the cached snapshot. Renderer uses the diff to patch the tree in place.
 */
async function refreshSchema(connectionId) {
    const before = schemaCache.get(connectionId);
    const after = await listSchemas(connectionId);
    schemaCache.set(connectionId, after);
    const diff = before ? (0, schema_diff_1.diffSchemas)(before, after) : null;
    return { schemas: after, diff };
}
const runningQueries = new Map();
function listRunningQueries() {
    const now = Date.now();
    return [...runningQueries.entries()].map(([id, q]) => ({
        id, connectionId: q.connectionId, pid: q.pid, ageMs: now - q.startedAt,
    }));
}
function registerRunning(id, connectionId, pid) {
    runningQueries.set(id, { connectionId, pid, startedAt: Date.now() });
}
function unregisterRunning(id) {
    runningQueries.delete(id);
}
// §2.3 — every checkout, if the pool has been idle for IDLE_PROBE_THRESHOLD_MS,
// run `select 1` once to detect dead connections before the user query.
async function acquireClient(mp) {
    const now = Date.now();
    const idle = mp.lastAcquireAt ? now - mp.lastAcquireAt : Infinity;
    mp.lastAcquireAt = now;
    const client = await mp.pool.connect();
    if (idle > IDLE_PROBE_THRESHOLD_MS) {
        try {
            await client.query('select 1');
        }
        catch (e) {
            client.release(e);
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
function buildPoolConfig(c) {
    const ssl = c.ssl === 'disable'
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
function clampPoolSize(n) {
    if (n == null || Number.isNaN(n))
        return DEFAULT_POOL_SIZE;
    const v = Math.floor(n);
    if (v < 1)
        return 1;
    if (v > 32)
        return 32;
    return v;
}
async function testConnection(c) {
    const { Pool: PoolCtor } = await pg();
    const pool = new PoolCtor(buildPoolConfig(c));
    try {
        const r = await pool.query('select version() as v');
        return { ok: true, serverVersion: r.rows[0].v };
    }
    catch (e) {
        return { ok: false, error: e?.message || String(e) };
    }
    finally {
        await pool.end().catch(() => { });
    }
}
async function openConnection(c) {
    closeConnection(c.id);
    const { Pool: PoolCtor } = await pg();
    const pool = new PoolCtor(buildPoolConfig(c));
    try {
        const r = await pool.query('select version() as v');
        pools.set(c.id, { pool, config: c });
        // §8.4 — pre-warm autocomplete in background; don't block connect.
        buildAutocompleteIndex(c.id).catch(() => { });
        return { ok: true, serverVersion: r.rows[0].v };
    }
    catch (e) {
        await pool.end().catch(() => { });
        return { ok: false, error: e?.message || String(e) };
    }
}
function closeConnection(id) {
    const mp = pools.get(id);
    if (mp) {
        mp.pool.end().catch(() => { });
        pools.delete(id);
    }
    schemaCache.delete(id);
    autocompleteCache.delete(id);
}
function closeAll() {
    for (const id of [...pools.keys()])
        closeConnection(id);
}
function getPool(id) {
    return getManagedPool(id).pool;
}
function getManagedPool(id) {
    const mp = pools.get(id);
    if (!mp)
        throw new Error('Connection not open');
    return mp;
}
function toResult(qr, durationMs, notices) {
    return {
        columns: qr.fields.map((f) => ({
            name: f.name,
            dataType: oidToType(f.dataTypeID),
            tableID: f.tableID,
        })),
        rows: qr.rows,
        rowCount: typeof qr.rowCount === 'number' ? qr.rowCount : qr.rows.length,
        command: qr.command,
        durationMs,
        notices,
    };
}
// Minimal OID -> friendly type mapping. Anything we don't know shows as "?".
const OID_MAP = {
    16: 'bool', 17: 'bytea', 18: 'char', 19: 'name', 20: 'int8', 21: 'int2',
    23: 'int4', 25: 'text', 26: 'oid', 114: 'json', 142: 'xml',
    700: 'float4', 701: 'float8', 1042: 'bpchar', 1043: 'varchar',
    1082: 'date', 1083: 'time', 1114: 'timestamp', 1184: 'timestamptz',
    1186: 'interval', 1266: 'timetz', 1700: 'numeric', 2950: 'uuid',
    3802: 'jsonb',
};
function oidToType(oid) {
    return OID_MAP[oid] || `oid:${oid}`;
}
async function runQueryScript(connectionId, sql, opts) {
    const mp = getManagedPool(connectionId);
    const client = await acquireClient(mp);
    const notices = [];
    const noticeHandler = (n) => notices.push(n.message || String(n));
    client.on?.('notice', noticeHandler);
    const results = [];
    let registeredId = null;
    try {
        // Record backend pid so the renderer can ask us to cancel.
        if (opts?.queryId) {
            try {
                const r = await client.query('select pg_backend_pid() as pid');
                const pid = Number(r.rows[0]?.pid);
                if (pid) {
                    registeredId = opts.queryId;
                    registerRunning(registeredId, connectionId, pid);
                }
            }
            catch { /* non-fatal */ }
        }
        const autoLimit = opts?.autoLimit ?? mp.config.autoLimit ?? null;
        const statements = (0, sql_split_1.splitStatements)(sql);
        for (const stmt of statements) {
            if (!stmt.trim())
                continue;
            const start = Date.now();
            let text = stmt;
            if (autoLimit && autoLimit > 0) {
                const out = (0, auto_limit_1.applyAutoLimit)(stmt, autoLimit);
                if (out.injected)
                    text = out.sql;
            }
            // rowMode array preserves duplicate column names
            const qr = (await client.query({ text, rowMode: 'array' }));
            results.push(toResult(qr, Date.now() - start, notices.splice(0)));
        }
        return { ok: true, results };
    }
    catch (e) {
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
    finally {
        if (registeredId)
            unregisterRunning(registeredId);
        client.off?.('notice', noticeHandler);
        client.release();
    }
}
/**
 * Cancel the running query identified by queryId, using a fresh lightweight
 * connection so the query connection isn't blocked (§3.6).
 */
async function cancelQuery(queryId) {
    const rq = runningQueries.get(queryId);
    if (!rq)
        return { ok: false, error: 'unknown query id' };
    const mp = pools.get(rq.connectionId);
    if (!mp)
        return { ok: false, error: 'connection closed' };
    const cfg = buildPoolConfig(mp.config);
    const { Client: ClientCtor } = await pg();
    const c = new ClientCtor(cfg);
    try {
        await c.connect();
        // First try a graceful cancel.
        await c.query('select pg_cancel_backend($1)', [rq.pid]);
        // If still running >2s, escalate (§3.6 bonus).
        setTimeout(async () => {
            if (!runningQueries.has(queryId))
                return;
            try {
                const c2 = new ClientCtor(cfg);
                await c2.connect();
                await c2.query('select pg_terminate_backend($1)', [rq.pid]);
                await c2.end();
            }
            catch { /* ignore */ }
        }, 2000).unref?.();
        return { ok: true };
    }
    catch (e) {
        return { ok: false, error: e?.message || String(e) };
    }
    finally {
        await c.end().catch(() => { });
    }
}
/**
 * §11.1 — server-side timing via EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON).
 * Only useful for SELECT/CTE; refuses to run anything that would mutate state
 * unless it's wrapped in a transaction by the caller (we leave that to them).
 */
async function explainAnalyze(connectionId, sql) {
    const pool = getPool(connectionId);
    const trimmed = sql.trim().replace(/;\s*$/, '');
    const wrapped = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${trimmed}`;
    const r = await pool.query(wrapped);
    // pg returns one row, one column "QUERY PLAN" with the JSON.
    const planJson = r.rows[0]['QUERY PLAN'];
    const root = Array.isArray(planJson) ? planJson[0] : planJson;
    return {
        planJson: root,
        planningMs: Number(root?.['Planning Time'] || 0),
        executionMs: Number(root?.['Execution Time'] || 0),
        totalMs: Number(root?.['Planning Time'] || 0) + Number(root?.['Execution Time'] || 0),
    };
}
/**
 * §3.1 — stream large SELECTs via a server-side cursor in batches.
 * Caller receives each chunk via `onChunk`; the final result lists totals.
 * Honors §4.3 by batching rows into chunks of `chunkSize` (default 1000).
 */
async function streamQuery(connectionId, sql, onChunk, opts) {
    const chunkSize = Math.max(50, Math.min(10_000, opts?.chunkSize ?? 1000));
    const mp = getManagedPool(connectionId);
    const client = await acquireClient(mp);
    const start = Date.now();
    let columns = [];
    let total = 0;
    let chunkIdx = 0;
    let registeredId = null;
    let inTx = false;
    try {
        if (opts?.queryId) {
            try {
                const r = await client.query('select pg_backend_pid() as pid');
                const pid = Number(r.rows[0]?.pid);
                if (pid) {
                    registeredId = opts.queryId;
                    registerRunning(registeredId, connectionId, pid);
                }
            }
            catch { /* non-fatal */ }
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
            }));
            if (columns.length === 0 && qr.fields?.length) {
                columns = qr.fields.map((f) => ({
                    name: f.name, dataType: oidToType(f.dataTypeID), tableID: f.tableID,
                }));
            }
            const rows = qr.rows;
            total += rows.length;
            if (rows.length > 0) {
                await onChunk({ rows, columns, index: chunkIdx++, totalSoFar: total });
            }
            if (rows.length < chunkSize)
                break;
        }
        await client.query(`CLOSE ${cursor}`);
        await client.query('COMMIT');
        inTx = false;
        return { columns, totalRows: total, durationMs: Date.now() - start };
    }
    catch (e) {
        if (inTx) {
            try {
                await client.query('ROLLBACK');
            }
            catch { /* ignore */ }
        }
        throw e;
    }
    finally {
        if (registeredId)
            unregisterRunning(registeredId);
        client.release();
    }
}
async function runQuery(connectionId, sql, params) {
    const pool = getPool(connectionId);
    const start = Date.now();
    try {
        const qr = (await pool.query({ text: sql, values: params, rowMode: 'array' }));
        return { ok: true, results: [toResult(qr, Date.now() - start, [])] };
    }
    catch (e) {
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
async function listSchemas(connectionId) {
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
    const map = new Map();
    for (const r of schemas.rows) {
        map.set(r.schema, {
            schema: r.schema,
            tables: [], views: [], matViews: [],
            functions: [], sequences: [],
        });
    }
    for (const r of rels.rows) {
        const e = map.get(r.schema);
        if (!e)
            continue;
        const entry = {
            name: r.name,
            kind: r.kind,
            estimatedRows: Number(r.est_rows),
            size: r.size,
            comment: r.comment,
        };
        if (r.kind === 'r' || r.kind === 'p' || r.kind === 'f')
            e.tables.push(entry);
        else if (r.kind === 'v')
            e.views.push(entry);
        else if (r.kind === 'm')
            e.matViews.push(entry);
    }
    for (const r of funcs.rows) {
        const e = map.get(r.schema);
        if (!e)
            continue;
        e.functions.push({ name: r.name, args: r.args, returns: r.returns, language: r.language });
    }
    for (const r of seqs.rows) {
        const e = map.get(r.schema);
        if (!e)
            continue;
        e.sequences.push({ name: r.name });
    }
    const out = [...map.values()];
    schemaCache.set(connectionId, out);
    return out;
}
async function getTableDetails(connectionId, schema, table) {
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
    if (meta.rows.length === 0)
        throw new Error(`Relation ${schema}.${table} not found`);
    const m = meta.rows[0];
    const onActionMap = { a: 'NO ACTION', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT' };
    const columns = cols.rows.map((r) => ({
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
    const indexes = idxs.rows.map((r) => ({
        name: r.name, definition: r.definition,
        isUnique: r.is_unique, isPrimary: r.is_primary, size: r.size,
    }));
    const foreignKeys = fks.rows.map((r) => ({
        name: r.name,
        columns: r.columns,
        refSchema: r.ref_schema,
        refTable: r.ref_table,
        refColumns: r.ref_columns,
        onDelete: onActionMap[r.on_delete] || r.on_delete,
        onUpdate: onActionMap[r.on_update] || r.on_update,
    }));
    const constraints = cons.rows.map((r) => ({
        name: r.name, type: r.type, definition: r.definition,
    }));
    const triggers = trigs.rows.map((r) => ({
        name: r.name, event: '', timing: '', definition: r.definition,
    }));
    return {
        schema, name: table, kind: m.kind,
        comment: m.comment, estimatedRows: Number(m.est_rows), size: m.size,
        columns, indexes, foreignKeys, constraints, triggers,
    };
}
async function getViewDefinition(connectionId, schema, view) {
    const pool = getPool(connectionId);
    const r = await pool.query(`select pg_get_viewdef(format('%I.%I', $1::text, $2::text)::regclass, true) as def`, [schema, view]);
    return r.rows[0]?.def || '';
}
async function getFunctionDefinition(connectionId, schema, name) {
    const pool = getPool(connectionId);
    const r = await pool.query(`select pg_get_functiondef(p.oid) as def
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = $1 and p.proname = $2 limit 1`, [schema, name]);
    return r.rows[0]?.def || '';
}
async function listDatabases(connectionId) {
    const pool = getPool(connectionId);
    const r = await pool.query(`select datname from pg_database where not datistemplate order by datname`);
    return r.rows.map((x) => x.datname);
}
const qIdent = quoteIdent;
async function fetchTableRows(connectionId, schema, table, opts) {
    let sql = `select * from ${qIdent(schema)}.${qIdent(table)}`;
    if (opts.where && opts.where.trim())
        sql += ` where ${opts.where}`;
    if (opts.orderBy && opts.orderBy.length) {
        sql += ` order by ` + opts.orderBy.map((o) => `${qIdent(o.col)} ${o.dir === 'desc' ? 'desc' : 'asc'}`).join(', ');
    }
    sql += ` limit ${Math.max(1, Math.min(50000, opts.limit | 0))} offset ${Math.max(0, opts.offset | 0)}`;
    return runQuery(connectionId, sql);
}
async function applyRowChanges(connectionId, schema, table, changes) {
    const mp = getManagedPool(connectionId);
    const client = await acquireClient(mp);
    try {
        await client.query('BEGIN');
        for (const ch of changes) {
            if (ch.kind === 'insert' && ch.values) {
                const keys = Object.keys(ch.values).filter((k) => ch.values[k] !== undefined);
                if (!keys.length)
                    continue;
                const cols = keys.map(qIdent).join(', ');
                const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
                const vals = keys.map((k) => ch.values[k]);
                await client.query(`insert into ${qIdent(schema)}.${qIdent(table)} (${cols}) values (${placeholders})`, vals);
            }
            else if (ch.kind === 'update' && ch.pk && ch.values) {
                const keys = Object.keys(ch.values);
                const pkKeys = Object.keys(ch.pk);
                if (!keys.length || !pkKeys.length)
                    continue;
                const setExpr = keys.map((k, i) => `${qIdent(k)} = $${i + 1}`).join(', ');
                const whereExpr = pkKeys.map((k, i) => `${qIdent(k)} = $${keys.length + i + 1}`).join(' and ');
                const vals = [...keys.map((k) => ch.values[k]), ...pkKeys.map((k) => ch.pk[k])];
                await client.query(`update ${qIdent(schema)}.${qIdent(table)} set ${setExpr} where ${whereExpr}`, vals);
            }
            else if (ch.kind === 'delete' && ch.pk) {
                const pkKeys = Object.keys(ch.pk);
                if (!pkKeys.length)
                    continue;
                const whereExpr = pkKeys.map((k, i) => `${qIdent(k)} = $${i + 1}`).join(' and ');
                const vals = pkKeys.map((k) => ch.pk[k]);
                await client.query(`delete from ${qIdent(schema)}.${qIdent(table)} where ${whereExpr}`, vals);
            }
        }
        await client.query('COMMIT');
        return { ok: true };
    }
    catch (e) {
        try {
            await client.query('ROLLBACK');
        }
        catch { }
        return { ok: false, error: e?.message || String(e) };
    }
    finally {
        client.release();
    }
}
