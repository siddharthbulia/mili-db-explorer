# Mili DB Explorer — Strategy

## Business strategy

**Position:** A Postgres-first GUI for developers who live in the database — fast,
opinionated, calm. Internal-first (the Mili team), open for the wider community.

**Customer:** senior + mid-senior developers who already use TablePlus, Postico,
DBeaver, or pgAdmin and are quietly unhappy. They want the speed of a native
app, the SQL editor of VS Code, and the safety of "review before write."

**Distribution:** signed DMG via our Vercel landing page. No app store. No
account required. Future Pro tier for teams (multi-user roles, audit log, shared
saved queries) — but the local app stays free and fully functional.

**Why we'll win:**
- *Speed* — sub-second cold start, virtualized grid, no web wrapper bloat.
- *Calm* — one signature accent, three fonts, zero modals, zero telemetry.
- *Honest UX* — never hides destructive operations, never invents fields.

**Revenue model (future):** team subscription with shared saved views, RBAC,
audit log, and one-click backup. The single-user desktop app stays free.

**Non-goals:** mobile apps, web SaaS, multi-DB engines (MySQL/Mongo/Redis).
We win by being *the best* Postgres client, not by being a directory of clients.

---

## Product strategy

**Three audiences:**
1. **Application developers** — open it daily, click around a few tables, run
   a couple of ad-hoc SELECTs, occasionally edit a row.
2. **Data engineers / analysts** — paste long queries, EXPLAIN ANALYZE, export
   results to CSV / Markdown / Notion.
3. **Operators / SREs** — diagnose locks, kill runaway queries, check size /
   bloat / vacuum stats.

**Three modes (top-level mental model):**
- **Explore** — schema tree, table data grid, cell inspector
- **Build** — Monaco SQL editor with history, snippets, formatting
- **Operate** — sessions, locks, table stats, vacuum, slow queries

**Three pillars:**
- *Speed.* Cold-start under 1 s. All UI under 16 ms paint. Grid scrolls 100k+ rows.
- *Safety.* Inline edits stage to a diff; nothing hits the DB until Save. WHERE-less
  DELETE/TRUNCATE/DROP requires confirm.
- *Density.* A lot of useful surface per pixel — but no decoration for decoration's
  sake. Studio Quiet design system.

**What we never do:**
- Tell the user how they should feel about the product (no marketing modals).
- Phone home (no telemetry, no auto-update pings — yet).
- Pretend to be a SaaS that happens to be on the desktop.

---

## Tech strategy

**Stack:**
- **Renderer:** React 18 + Zustand store, Monaco editor, Lucide icons.
- **Main:** Electron 33, `pg` node-postgres driver, hardened runtime.
- **Shared:** TypeScript modules in `src/shared/` (`grid-clipboard`, `grid-filters`,
  `sql-generators`, `auto-limit`, `csv`, `sql-split`, `schema-diff`,
  `license-core`, etc.).
- **Build:** Vite + tsc, electron-builder, Apple notarytool via afterSign hook.
- **Distribution:** Vercel static site serves `index.html` + `downloads/*.dmg`.

**IPC contract:** `IpcApi` interface in `src/shared/types.ts`. Renderer calls
`api.foo(...)` which calls `ipcRenderer.invoke('api:foo', ...)`. Main handles
`api:foo` and returns a typed `Promise<...>`.

**Postgres surface used:**
- `pg_class / pg_namespace / pg_attribute / pg_constraint / pg_index` for schema.
- `pg_stat_activity / pg_locks / pg_stat_user_tables / pg_stat_user_indexes /
   pg_stat_statements` for operate-mode panels.
- `pg_total_relation_size / pg_size_pretty` for storage breakdowns.
- `pg_cancel_backend / pg_terminate_backend` for killing queries.

**Performance budget:**
- IPC round-trip: < 50 ms for small queries (`SELECT 1`, single-row metadata).
- Grid render: 60 fps while scrolling 100k rows (virtualization is mandatory).
- Cold start: < 1 s from click to first paint (Electron preload + lazy `pg` load).

**Testing:** `tests/scenarios/*` — pure-function harness in `tests/harness.ts`.
Every shared module gets a scenario file. 1000+ scenarios run in ~9 s.

**Distribution:**
- Both archs (arm64 + x64), Apple-notarized.
- Build script auto-shims `python3.12` for `dmg-builder`.
- Deploy script idempotent: re-aliases canonical URL, re-disables SSO, re-asserts
  project name.
