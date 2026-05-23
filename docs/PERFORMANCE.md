# Making a SQL client extremely fast

A SQL client is judged in milliseconds. The user types `select * from orders`, hits ⌘↩, and either:
- The result shows up in <200 ms and they stay in flow.
- It takes >800 ms and they start checking Slack.

This document is the engineering bible for keeping Mili DB Explorer in the first bucket forever, even on a 5M-row table over a 200 ms RTT link, on a battery-saving M1 Air with 12 other tabs open.

It is opinionated. Where two approaches compete, we pick one and explain why.

---

## 0. The performance budget

Every interaction has a budget. Write them down. Hold yourself to them.

| Interaction | p50 budget | p99 budget | What kills it |
|---|---|---|---|
| Cold launch → first paint | 400 ms | 900 ms | Eager imports, monolithic bundle, missing splash |
| Connect to a known DB | 80 ms | 300 ms | DNS, SSL handshake, missing keepalive |
| Schema tree first paint | 150 ms | 500 ms | Sync `pg_class` scans, missing parallelism |
| Run `select 1` end-to-end | 30 ms | 80 ms | New pool connection per query, JSON-serialized rows |
| Switch tabs | 1 frame (16 ms) | 32 ms | Re-renders of off-screen grids |
| Paint first 100 rows of a 1M-row result | 200 ms | 500 ms | Buffering whole result before render |
| Scroll a 1M-row result | 60 fps | sustained | Virtualization missing, layout thrash |
| Format SQL (10 KB script) | 80 ms | 200 ms | Running on main thread |
| Inline cell edit → commit | 80 ms | 250 ms | Round-trip to fetch row again |
| Cancel a running query | 50 ms | 200 ms | No `pg_cancel_backend` plumbed |

These are 2026 baselines on M-class Apple Silicon against a regional Postgres (RTT ~30 ms). If a code change moves a p50 by 20 ms in either direction, that change is significant — write it down in the PR.

> **Iron law:** if you can't measure it, you can't ship it. Every perf claim in this doc must be reproducible from a script in `tests/perf/`.

---

## 1. Architecture for speed

The whole point of building this on Electron is that we own the entire stack:

```
┌────────────────────────────────────────────────────────────────────────┐
│ Renderer (Chromium): React + Monaco + virtualized result grid          │
│                          │                                             │
│                          │  IPC                                        │
│                          ▼                                             │
│ Main (Node): pg pool, query execution, schema cache, settings store    │
│                          │                                             │
│                          │  TCP                                        │
│                          ▼                                             │
│                       Postgres                                         │
└────────────────────────────────────────────────────────────────────────┘
```

Three boundaries, three places to lose milliseconds. The architectural rules:

1. **Main process owns the network.** Renderer never touches sockets. This keeps connection state, pool lifecycle, and credential handling out of the V8 process that's also painting at 60 fps.
2. **Renderer never blocks on Node.** Every IPC call is async. The renderer assumes nothing will return in <10 ms unless it's a pure cache hit.
3. **The grid never re-renders rows it didn't ask to.** Result rows live in immutable typed buffers. React renders viewport slices, never the whole array.
4. **The hot path is the query path.** Optimize ruthlessly for "user runs a query → sees the first row." Everything else is secondary.

---

## 2. Connection layer

### 2.1 Pool, don't reconnect

`pg.Pool` is non-negotiable. Per-query connections cost ~70–200 ms (TCP + SSL + Postgres auth). With a pool, a warm connection costs <1 ms.

Current setup (`src/main/db.ts`):

```ts
return {
  host: c.host,
  port: c.port,
  database: c.database,
  user: c.user,
  password: c.password || '',
  ssl,
  max: 5,                 // see §2.2
  idleTimeoutMillis: 30_000,
  statement_timeout: 0,
  application_name: 'Mili DB Explorer',
};
```

### 2.2 Pool sizing

5 is conservative. Tune it:

- **1 connection** is wrong — long-running queries lock out everything else, including schema refreshes and autocomplete metadata.
- **20+ connections** is wrong — every Postgres connection costs ~10 MB on the server. A team of 30 engineers with 20 open clients each is 6000 connections, which most managed Postgres servers cap at 100–500.
- **5–8** hits the sweet spot. One connection for the query, one for schema/autocomplete, a few headroom for parallel "explain", "describe table", "list indexes" calls.

Make it configurable per connection. Heavy users on read replicas want 10. People on PgBouncer want 2.

### 2.3 Keepalives and timeouts

Postgres clients silently drop dead. Add TCP keepalives so you find out fast:

```ts
return {
  ...,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  connectionTimeoutMillis: 8_000,
  // statement_timeout: 0 in code; set per-query when you actually want one
};
```

Detect dead connections before the user runs a query. On every pool acquire, run `select 1` if the connection has been idle >5 min. Two lines of code, saves the "I clicked Run and nothing happened for 30 seconds" experience.

### 2.4 Prepared statements

`pg` will use the **extended query protocol** when you pass `values`. That gets you:
- Parameterized queries (no SQL-injection foot guns)
- Server-side parse-once, execute-many (if you use a named prepared statement)
- Binary results when you ask for them (see §3.3)

For repeated queries (autocomplete lookups, schema reloads, paginated table scans), name the prepared statement:

```ts
await client.query({
  name: 'fetch-rows-by-pk',
  text: 'select * from users where id = any($1::uuid[]) order by id',
  values: [ids],
});
```

The first call parses + plans; subsequent calls skip both. On a hot path that's a 30–50% win.

### 2.5 SSL: don't be slow about it

`ssl: require` with `rejectUnauthorized: false` skips cert validation. Tempting and fast, but every connection still does a full TLS handshake.

If you're hitting the same DB 100 times a session (and you are), reuse the TLS session. `pg` honors `node:tls.Session` if you wire it through. For internal infra with a stable cert, the handshake is ~1 RTT instead of 2.

Don't ship a SQL client without TLS. Even on localhost — your future self will copy the connection to staging.

---

## 3. Query execution

This is the hot path. The rules:

1. **Stream when you can; buffer when you must.**
2. **Don't ask Postgres for more rows than you can render.**
3. **Don't serialize twice.**

### 3.1 Buffered vs. streamed result sets

`pg.Client.query()` buffers the whole result before resolving. That's fine for `select 1` and disastrous for `select * from events`.

For anything that could exceed ~10k rows, use `pg-query-stream` or a server-side cursor:

```ts
const client = await pool.connect();
try {
  await client.query('begin');
  await client.query('declare c cursor for ' + sql);

  // Loop: fetch a chunk, send it to renderer, fetch next chunk on demand
  while (true) {
    const chunk = await client.query('fetch 500 from c');
    if (chunk.rowCount === 0) break;
    sendChunkToRenderer(chunk);
    await renderer.awaitBackpressure();
  }
} finally {
  await client.query('commit').catch(() => {});
  client.release();
}
```

What this buys you:
- **Time to first row**: 200 ms instead of 12 seconds for a 1M-row scan.
- **Memory**: stays flat regardless of result size. Otherwise pg holds the whole result, Node holds it again as JS objects, and Electron's IPC clones it a third time. That's 3× memory cost on a 500 MB result.
- **Cancelability**: kill the cursor mid-stream; nothing wasted.

Default policy: **stream above LIMIT 1000**. Detect by parsing the LIMIT clause client-side; if absent or >1000, declare a cursor.

### 3.2 Row mode

Always use `rowMode: 'array'`. We already do:

```ts
const qr = await client.query({ text: stmt, rowMode: 'array' });
```

Why this matters:
- Object mode allocates a JS object per row with one property per column. 5M rows × 20 columns = 100M property allocations. The V8 GC will eat your CPU.
- Array mode allocates one Array per row. Postgres column metadata lives once, on the result, not on every row.
- For duplicate column names (joins, `select a.id, b.id from a join b`), object mode silently drops one. Array mode preserves both.

Anywhere in the codebase that calls `pool.query` without `rowMode: 'array'` is a perf bug.

### 3.3 Binary results

`pg` defaults to text encoding. Numbers come in as strings, floats lose precision, integers cost 8–14 bytes instead of 4 or 8.

For columns you know are numeric/timestamp/uuid, request binary:

```ts
const qr = await client.query({
  text: sql,
  rowMode: 'array',
  types: customTypeParsers,    // see node-pg-types
});
```

A 1M-row × 5-numeric-column result is **~40% smaller and 2× faster to parse** in binary mode. The cost: parsing logic per type. For an MVP, stick to text; once you're chasing the long tail of perf, opt-in column types to binary.

### 3.4 COPY for huge exports

If the user clicks "Export to CSV" on 5M rows, do NOT iterate row-by-row. Use `COPY (query) TO STDOUT WITH (FORMAT csv)`:

```ts
import { from as copyFrom, to as copyTo } from 'pg-copy-streams';

const stream = client.query(copyTo(`COPY (${sql}) TO STDOUT WITH (FORMAT csv, HEADER true)`));
stream.pipe(fs.createWriteStream(path));
```

Two-orders-of-magnitude faster than building CSV in JS. 1M rows: 90 seconds → 4 seconds.

### 3.5 Server-side limits

Before sending a user query, inject a LIMIT if they didn't specify one and the connection is marked "production":

```sql
-- user typed:
select * from orders;

-- we run:
select * from orders limit 1000;
```

Show a banner: *"Auto-limited to 1000 rows. Remove the limit to see all."* This single feature has saved more outages than any other tool feature. TablePlus and Postico both default to 100/300; we do 1000 because monitor sizes grew. Toggle this per-connection.

### 3.6 Cancellation

A SQL client without `cancel` is broken. Plumb `pg_cancel_backend(pid)`:

```ts
const client = await pool.connect();
const pidRes = await client.query('select pg_backend_pid() as pid');
const pid = pidRes.rows[0].pid;

queryHandle.cancel = async () => {
  // Use a separate, lightweight connection — the one running the query is busy.
  const cancelClient = new pg.Client(connectionConfig);
  await cancelClient.connect();
  await cancelClient.query('select pg_cancel_backend($1)', [pid]);
  await cancelClient.end();
};
```

The cancel **must use a different connection**, because the main one is blocked on the query. Keep a one-off `pg.Client` factory just for cancels.

Bonus: if the user mashes Cancel and the cancel itself takes >2 seconds, escalate to `pg_terminate_backend`. The killed connection will reconnect from the pool's perspective.

---

## 4. IPC: the unsung bottleneck

This is the layer everyone forgets. A 100k-row result is ~30 MB of JSON. Electron's `ipcRenderer.invoke` serializes that JSON twice: once in main, once in renderer. That's 60–80 ms of pure overhead before React even sees the data.

### 4.1 Use the structured clone path, not JSON

Electron's IPC uses the **structured clone algorithm** when you send plain objects. That's 2–5× faster than JSON.parse(JSON.stringify(...)). The catch: it preserves type info, including `Date`, `Map`, `Set`, `ArrayBuffer`.

Practical implication: pass `Date` objects through, don't pre-stringify them. Pass `Uint8Array` for `bytea` columns, not base64 strings. The renderer formats them at paint time, which is lazy and cheap.

### 4.2 Transferable objects

For very large result payloads (>5 MB), build an `ArrayBuffer` in main and **transfer** it to the renderer:

```ts
// main
const buffer = encodeRowsToBuffer(rows);   // column-oriented, packed
ipcMain.handle('api:runQueryScript', (e, sql) => {
  const { metadata, buffer } = run(sql);
  // Returning the ArrayBuffer transfers ownership; no copy across the boundary.
  return { metadata, buffer };
});
```

Renderer decodes the buffer lazily as the grid asks for rows. We don't bother with this for <5 MB; structured clone is fine. Above 5 MB, transfers cut IPC time by 70–90%.

### 4.3 Don't IPC per row

The pattern people accidentally implement:

```ts
// MAIN — terrible
for await (const row of stream) {
  webContents.send('row', row);
}
```

Each `send` is an IPC. 1M sends is 5+ seconds of overhead even if each one is 5 µs.

The right pattern: **batch chunks of 500–2000 rows**, send each batch as a single message. The renderer's grid coalesces appends. The user sees the same UX (streaming progress) at 1/500th the overhead.

### 4.4 The schema cache lives in main

The schema is the second-most-accessed data after rows. Cache it in main, keyed by `(connectionId, schemaName)`. Renderer requests slices ("give me columns for table X"); main returns from cache.

When invalidating, **diff and emit deltas**, don't replay the whole tree. The sidebar should never flicker.

---

## 5. The renderer

This is the part the user sees stutter.

### 5.1 Virtualize EVERYTHING

The result grid renders 60+ columns × 1M rows. Mounting all of those DOM nodes will OOM the renderer.

Two virtualization libraries are worth your time: `@tanstack/react-virtual` and `react-window`. We use `@tanstack/react-table` for column logic and our own virtualizer on top because we need column-virtualization too (wide tables).

The math:
- Viewport: ~50 rows × ~10 visible columns = 500 cells.
- DOM nodes per cell: 1–2.
- Total mounted: ~1000 nodes regardless of result size.
- Scrolling re-uses node IDs; React reconciles content, not structure.

Rules:
- **Fixed row heights.** Variable heights kill virtualization performance because the virtualizer has to measure each row. If you need expanding cells, do them as overlays (hover-to-preview JSON), not as growing rows.
- **No CSS shadows or filters on row cells.** They're expensive to paint. Use border-bottom for separation.
- **`contain: strict` on the row container.** Tells Chromium to skip layout cascades.
- **Don't memoize cells with deep equality.** Compare by row id + column id. We already keep rows in column-oriented buffers, so cell identity is `(rowOffset, colIdx)`.

### 5.2 Move work off the main thread

The renderer's main thread is doing input, layout, paint, AND query result processing. Don't pile up.

What runs on workers:
- **SQL formatting** (`sql-formatter`) — 200ms for a long script blocks 12 frames.
- **CSV/JSON export building** — when the user clicks "copy as JSON" on a 50k-row selection.
- **Result post-processing** (type coercion, JSON parsing of jsonb columns).
- **Search-inside-results** — find/regex within a buffered result.

Use Vite's `?worker` import syntax for type-safe workers:

```ts
import FormatterWorker from './workers/formatter?worker';
const w = new FormatterWorker();
w.postMessage({ sql, language: 'postgresql' });
w.onmessage = (e) => setFormatted(e.data);
```

Monaco itself ships with workers (TS, JSON, CSS, HTML). **Configure `self.MonacoEnvironment.getWorker`** to load them from local bundles, not the CDN. We learned this the hard way — see commit history. The Monaco workers run async; if they're missing, syntax features feel laggy but the editor stays alive.

### 5.3 The Monaco trap

`@monaco-editor/react` loads Monaco from jsDelivr CDN by default. Three problems:

1. First-load latency: 300–800 ms over the network.
2. Offline: Electron has no offline strategy; the editor never appears.
3. CSP: in production, some networks block jsDelivr.

The fix (already applied):

```ts
import { loader } from '@monaco-editor/react';
import * as monacoEditor from 'monaco-editor';

loader.config({ monaco: monacoEditor });
```

This swaps the CDN loader for a local bundle. Bundle size increases by ~3 MB minified gz — acceptable; we'd rather ship the bytes than make every cold start slower.

### 5.4 Don't re-render the tree on every state change

Zustand is fast, but you can still kill perf by subscribing entire components to the whole store:

```ts
// BAD: re-renders SqlEditorTab whenever any tab updates
const { tabs, updateTab, activeTabId } = useApp();

// GOOD: each selector subscribes to one slice
const tab = useApp((s) => s.tabs.find((t) => t.id === tabId));
const updateTab = useApp((s) => s.updateTab);
```

For lists (tabs, connections, schema rows), use shallow selectors or memoized lookups. Every unnecessary re-render is 1–4 ms of reconciliation time. Five accidentally-broad subscriptions = a janky drag.

### 5.5 Layout discipline

The result grid is the most-painted component. Rules:
- **Single canvas-style layout: position absolute children inside `position: relative` rows.** No flex inside cells. Flex makes the browser re-resolve sizing on scroll.
- **Sticky headers via `position: sticky` + `top: 0`,** never via JS scroll listeners that mutate `top`.
- **`will-change: transform`** on the scrollable container during active scroll, then remove it. Don't leave it on; Chromium reserves a compositor layer permanently.
- **`overflow-anchor: none`** to prevent the browser from auto-scrolling when content above the viewport changes (it can in inline edits).

### 5.6 GPU acceleration sanity check

Open DevTools → Rendering → Layer borders. Each compositor layer should correspond to something that meaningfully needs its own paint surface (the result grid, the editor, the modal overlay). If you see 80 layers, you've over-applied `transform: translateZ(0)` and you're killing battery life. Strip them.

### 5.7 Cursors and selections

A 100k-row result selection (`Shift-click last row`) is a common interaction. Don't materialize a list of selected row IDs — store the selection as a range or a `Set<number>` of row offsets in the current sorted view. Materializing 100k IDs each shift-click is 20+ ms.

For multi-cell selection (spreadsheet-style), use a 2D range (`{r0, c0, r1, c1}`). Hit tests are O(1).

---

## 6. Memory: stay flat

A long session (8 hours, hundreds of queries) should not consume more memory at the end than at the beginning. Memory leaks in a SQL client typically come from:

1. **Result sets cached forever per tab.** Cap each tab to N most-recent results (we keep 1). LRU the rest.
2. **Closed connections holding pool references.** When the user closes a connection, drain the pool, remove every listener, null the reference.
3. **Monaco editors not disposed.** Closing a tab must call `model.dispose()` and `editor.dispose()`.
4. **Schema tree expansion state.** Don't store per-node expansion as objects keyed by full path; use a `Set<string>` of expanded paths.

### 6.1 Column-oriented buffers

For large results, store columns separately:

```
rows: Array<Array<any>>             // row-oriented — what pg gives us
↓ transform on main process before IPC
columns: { [colName]: TypedArray | Array }   // column-oriented
```

Why:
- Postgres returns column-oriented under the hood. Reading 1 column out of 30 doesn't cost 30×.
- Typed arrays (`Int32Array`, `Float64Array`) for numeric columns are 2–4× smaller and faster to filter/sort.
- The grid only needs the columns currently in viewport.

We don't ship this yet. When you do, gate it behind a "huge result mode" auto-applied above 50k rows.

### 6.2 Off-heap for cold buffers

Electron's renderer is a single V8 isolate with a heap limit. If a user keeps three 200k-row tabs open, V8 hits its ceiling.

For results not in view (background tabs), serialize the buffer to a temp file and remove the in-memory copy. When the user returns to the tab, async-load from disk. This is the same pattern as Sublime Text's swap files.

The threshold matters: don't off-heap small results (the round-trip costs more than the memory saves). Above ~10 MB in renderer heap, write to `~/Library/Caches/ai.getmili.postgres_db_explorer/results/<tab-id>.bin`.

---

## 7. Cold start

The user double-clicks the icon. From that moment until the first usable UI, every millisecond is felt.

Electron cold start on M2: ~250 ms to renderer-ready-to-show. We can't go lower than the OS will let us, but we can avoid making it worse.

### 7.1 Defer non-critical imports

Top of `main.ts` should NOT import everything. Especially:

- `pg` (~30 ms parse + module init): import on first connection.
- `sql-formatter` (~40 ms): import in the renderer when the user clicks Format.
- `monaco-editor` (large): code-split in the renderer; load when an SQL tab opens.
- `electron-builder` plugins, dotenv, etc.: never in main.ts.

Lazy import pattern:

```ts
let _pg: typeof import('pg') | null = null;
async function pg() { return _pg ??= (await import('pg')); }
```

Saves 80–200 ms on cold start. Verify with `node --cpu-prof main.js`.

### 7.2 Show the window before content loads

```ts
const win = new BrowserWindow({
  show: false,
  backgroundColor: '#0a0a0b',   // matches our design system; no white flash
});
win.once('ready-to-show', () => win.show());
```

We already do this. The backgroundColor avoids the white-flash that ruins perceived performance.

### 7.3 Preload the renderer assets

Vite emits a small `index.html`. Inline critical CSS so the first paint isn't blocked on a stylesheet round-trip. We're not there yet; do it.

### 7.4 Don't open a connection on launch

Some clients "remember last connection" and reconnect on launch. That puts a 300+ ms network call in the cold path. Show the welcome screen instantly; reconnect on user intent.

---

## 8. Schema browsing

The sidebar shows tables, views, functions, sequences. For a database with 10k+ tables (rare but real), this is a perf cliff.

### 8.1 One round-trip per schema, in parallel

We already do this:

```ts
const [schemas, rels, funcs, seqs] = await Promise.all([...]);
```

Good. Don't regress.

### 8.2 Lazy expand

Don't fetch column details for every table on first load. Only when the user expands a table. Cache forever (until manual refresh).

For autocomplete to work, we need column names — but not types, not foreign keys, not comments. Fetch the slim metadata up-front (one query: `select schema, table, column, ordinal from information_schema.columns`), defer the fat metadata.

### 8.3 Incremental refresh

When the user hits Refresh, don't drop the tree and re-render. Diff and patch. The user keeps their expansion state, scroll position, and focus. UX win + perf win.

### 8.4 Pre-warm autocomplete

When a connection is opened, the schema query runs. While it's in flight, also kick off the autocomplete index build. By the time the user types the first character in the editor, the trie is ready.

---

## 9. The editor

Monaco is fast by default. We can still slow it down.

### 9.1 One model per tab, dispose on close

Monaco's `IModel` is heavy (~2–8 MB for a non-trivial file with parsing state). Closing a tab without `model.dispose()` is a per-tab memory leak.

### 9.2 Don't run formatters on every keystroke

`formatOnType` for SQL is tempting and wrong. SQL formatters are full re-parses (100+ ms). Run them on Cmd+Shift+F, never on type.

### 9.3 Autocomplete suggestion latency

Suggestion providers run on the main thread by default. For a 50k-symbol autocomplete index, scoring suggestions on each keystroke is 20–80 ms.

Two fixes:
- **Cap candidates pre-scoring.** Lex the prefix; bail if it matches nothing in the first 8 characters of any indexed symbol.
- **Score in a worker.** Pre-build the index in a worker on connection open; query it via `postMessage` with a generation counter to drop stale requests.

### 9.4 Syntax highlighting

Monaco's built-in SQL grammar is fine. Don't load Tree-sitter for prettier highlighting — the WASM init alone is 200+ ms and Monaco's grammar covers 95% of real-world SQL.

If you want PostgreSQL-specific keywords (`returning`, `lateral`, `window`, json operators), register a Monarch language that extends the default. ~50 lines; no perf cost.

---

## 10. Network

Postgres over TCP is fast. Mistakes that slow it down:

### 10.1 SSL handshake reuse

Covered in §2.5. Reuse TLS sessions.

### 10.2 Don't compress small payloads

`pg` doesn't compress queries; Postgres doesn't compress results unless you ask. For results <100 KB, compression costs more CPU than it saves bandwidth. For results >1 MB on a slow link, enabling `tcp_compress = on` server-side (or wrapping with a `ssh -C` tunnel) cuts wall time meaningfully.

Default: don't compress. Surface a per-connection flag for compression.

### 10.3 Geographic latency

The fundamental limit. If your Postgres is in `us-east-1` and you're in Singapore, every query has a 230 ms RTT floor.

What you can do:
- **Pipeline.** Send the next query before the previous result completes. `pg` doesn't pipeline by default; use `pg-pool` with `pipelineConnect`. Saves 1 RTT per query in a script.
- **Bundle.** Run multiple statements in a single network round-trip. `client.query('select 1; select 2;')` is one RTT, not two.
- **Cache.** Schema metadata, server version, settings — cache aggressively per-connection.

What you can't do:
- Make light go faster.

---

## 11. Measurement

You can't optimize what you can't measure. Build the instrumentation first.

### 11.1 Per-query timing

Already done:

```ts
const start = Date.now();
const qr = await client.query({ text: stmt, rowMode: 'array' });
results.push(toResult(qr, Date.now() - start, notices.splice(0)));
```

Add server-side timing too:

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) <query>
```

Stash that in the result panel. Surface "execution: 12 ms, network: 28 ms, parse+plan: 4 ms" so users (and you) can tell where the time goes.

### 11.2 Frame budget telemetry

When the result grid scrolls, sample `performance.now()` deltas between rAF callbacks. If any frame >32 ms, log it (in dev only). Build a histogram. Anything that pushes the p95 past 16 ms is a regression.

### 11.3 Bundle size budget

Add a CI check:

```sh
ls -l dist/assets/index-*.js | awk '{ if ($5 > 4000000) exit 1 }'
```

Currently `dist/assets/index-*.js` is ~3.8 MB. That's at the edge. Every dep you add, audit. Run `npx vite-bundle-visualizer` before merging.

### 11.4 Memory ceiling

In dev, expose:

```ts
setInterval(() => {
  console.log('heap MB:', (performance as any).memory?.usedJSHeapSize / 1e6);
}, 5000);
```

Watch it during a long session. If it climbs monotonically with each closed tab, you have a leak. Run Chrome's heap snapshot diff to find which closure holds the ref.

### 11.5 Reproducible benchmarks

`tests/perf/` should contain scripts that:

- Spin up a local Postgres (Docker) with a seeded dataset.
- Run a canonical workload: connect → list schemas → run 10 queries of varying size → scroll a 100k-row result.
- Capture wall time and report in CI.

If you change anything in the hot path, run the bench. PR comments should include before/after numbers.

---

## 12. Anti-patterns to never ship

A short, opinionated blacklist:

| Anti-pattern | Why | Do this instead |
|---|---|---|
| New `pg.Client` per query | 70–200 ms per query | Always use the pool |
| `pool.query` without `rowMode: 'array'` | 2–5× GC pressure on large results | Always set `rowMode: 'array'` |
| Buffering 1M+ row results in memory | OOMs on commodity laptops | Cursor + stream above LIMIT 1000 |
| Sync IPC (`ipcRenderer.sendSync`) | Blocks the renderer | Use `ipcRenderer.invoke` |
| JSON.stringify in IPC | Loses date types, slower than structured clone | Pass objects directly |
| `setState` inside scroll handlers | 60 fps → 15 fps instantly | Use refs + rAF |
| `formatOnType` for SQL | 100+ ms hitch per keystroke | Format only on explicit command |
| Loading Monaco from CDN | Cold starts can hang | Bundle locally, use `loader.config` |
| Schema fetch on every tab switch | Wasted RTT | Cache in main, invalidate on user action |
| Tree-sitter for syntax | 200 ms init, no real win | Monarch with PG extensions |
| Auto-reconnect last DB on launch | Adds RTT to cold start | Reconnect on user click |
| `useEffect` to subscribe to store | Re-renders cascade | Zustand selectors with shallow eq |

---

## 13. The release checklist for performance

Before tagging a release, run:

```sh
npm run bench           # tests/perf/
npm run typecheck
npm run build
ls -lh dist/assets/index-*.js   # under 4 MB gz
```

Then manually:

- Launch on a fresh user profile. Cold start <500 ms p50.
- Connect to staging. Schema tree paints in <500 ms.
- Run `select * from <largest_table> limit 100000`. First row visible in <500 ms.
- Scroll the result top-to-bottom. Frame budget never blown.
- Open 5 tabs, switch rapidly. No flash, no stall.
- Inspect heap. Idle <100 MB renderer.
- Quit and reopen. Settings persist; no re-fetch of unchanged schema.

If any of these fail, the release is blocked.

---

## 14. Reference numbers

For sanity-checking your own measurements on M-class Apple Silicon, regional Postgres:

| Operation | Expected | Bad |
|---|---|---|
| `select 1` round-trip | 5–15 ms | >50 ms |
| Pool acquire, warm | <1 ms | >5 ms |
| Pool acquire, cold | 80–200 ms | >500 ms |
| `select 100 rows from a 10-column table` | 15–30 ms | >100 ms |
| `select 100k rows`, time-to-first-row, streamed | 100–300 ms | >800 ms |
| Format 5 KB SQL (worker) | 30–80 ms | >300 ms |
| Tab switch | 1 frame | >2 frames |
| IPC of a 100k × 10 numeric result | 80–150 ms | >500 ms |
| Schema fetch (200 tables) | 100–200 ms | >800 ms |

If you're slower than the "bad" column, something is wrong upstream of the code change you just made. Profile before you optimize.

---

## 15. Long-term bets

Things to think about for v2:

- **Native client.** The pg JS driver is fast but a Rust/Zig driver via N-API beats it by 30–50% on parsing. Worth it once we're shipping enough that 50 ms matters across the user base.
- **WASM SQL formatter.** `pg_query.rs` (the Rust port of Postgres's parser) compiled to WASM gives us *Postgres-grade* parsing and formatting at near-native speed.
- **GPU result rendering.** For >1M-row scrolls, paint via WebGL/WebGPU into a single canvas, not DOM nodes. Sublime Text does this; Figma does this; we could.
- **Local replica.** For read-heavy exploratory queries, sync a subset of the production DB to a local SQLite/DuckDB and run there. The user gets a 30 ms feedback loop instead of 200 ms.
- **Differential schema sync.** Subscribe to Postgres `LISTEN/NOTIFY` for DDL changes, patch the schema tree in real-time. No more "I added that column, why don't I see it" reloads.

None of these are needed today. All of them are within reach.

---

## TL;DR

If a future contributor reads only this section:

1. **Pool everything. Stream large results. Use `rowMode: 'array'`.**
2. **Never IPC per row. Batch in 500–2000 row chunks.**
3. **Virtualize the grid. Fixed row heights. Move work to workers.**
4. **Cache schemas in main; diff and patch on refresh.**
5. **Bundle Monaco; never load it from a CDN.**
6. **Measure everything. Block PRs that regress p95 budgets.**

That's the whole playbook. Everything else in this document is detail.
