# v2 + v3 of the top 20 features

Each row: the shipped feature, what v2 means, what v3 means.
`[x]` ships in this pass · `[~]` partial · `[ ]` planned.

## 1 · Schema browser
- v1: tree, kind filters, favorites, recents.
- v2: **table size + row count shown inline**, search now matches column names, lazy-fetch column lists on expand.  `[x]`
- v3: drag tables into the SQL editor to insert `SELECT * FROM …`.  `[ ]`

## 2 · SQL editor (Monaco)
- v1: format, history, cancel, EXPLAIN.
- v2: **schema-aware autocomplete** — Monaco completions populated from `listSchemas` (tables, views, columns).  `[x]`
- v3: snippet expander (`sel→SELECT * FROM`), parameter-bind form for `$1/$2`.  `[ ]`

## 3 · Inline row edit
- v1: stage edits, save in one tx, undo last delete.
- v2: **per-cell undo/redo stack** (`⌘Z` / `⌘⇧Z` inside the table tab).  `[x]`
- v3: optimistic concurrency check (UPDATE … WHERE pk AND original-tuple).  `[ ]`

## 4 · Cell inspector
- v1: distinct-values picker, type-aware value editor.
- v2: **JSON tree view for JSONB/JSON values**, copy-path on click.  `[x]`
- v3: numeric histogram + string top-N inside the inspector.  `[ ]`

## 5 · Filter builder
- v1: 24 operators, top builder bar, any-column.
- v2: **save filters as named presets** per table, **OR groups** (one group = AND, groups joined by OR).  `[x]`
- v3: type-aware op picker (numeric col → only numeric ops, etc).  `[ ]`

## 6 · Foreign-key click-through
- v1: per-row jump, badge on FK headers.
- v2: **hover preview** of the referenced row (popover with the FK row's columns).  `[x]`
- v3: reverse-FK ("find rows that reference this one") with table picker.  `[ ]`

## 7 · Copy / export
- v1: TSV/CSV/JSON/INSERT/Markdown.
- v2: **XLSX export** with column types preserved via SheetJS — no extra deps via dynamic import.  `[~]` (server CSV is stable; xlsx adds binary dep — punted)
- v3: server-side `COPY TO STDOUT` for huge result sets.  `[ ]`

## 8 · Pagination
- v1: page-size, jump-to, first/last, auto-refresh.
- v2: **keyset pagination toggle** for tables with a single-column numeric or timestamp PK — uses `WHERE pk > $last ORDER BY pk LIMIT n`.  `[~]` (groundwork in `keyset-pagination.ts`; UI button hidden behind a setting for v3)
- v3: cursor-based "Load more" infinite scroll.  `[ ]`

## 9 · Multi-connection
- v1: side-by-side workspace windows, accent colors, URL parser.
- v2: **connection groups** (folders) with collapsible sections.  `[x]`
- v3: encrypted import/export of all connections to a single file.  `[ ]`

## 10 · Operate panel
- v1: sessions / locks / storage / indexes / maintenance.
- v2: **EXPLAIN plan tree visualizer** — parse `EXPLAIN (FORMAT JSON)` and render the operator tree with cost/rows annotations.  `[x]`
- v3: bloat detection query + replication slot view.  `[ ]`

## 11 · DDL flows
- v1: add/drop/rename column, change type, create/drop index/schema.
- v2: **batch DDL preview** — every DDL action shows the SQL and a confirm step; SQL is editable before run.  `[x]` (RenameModal / AddColumnModal / etc already show preview; making it editable is the v2 addition)
- v3: schema diff (compare two connections).  `[ ]`

## 12 · CSV import
- v1: paste, map columns, single transaction.
- v2: **type-aware inference** — sniff first 50 rows and suggest matching target columns by name, propose casts for numbers and dates.  `[~]` (auto-map by name shipped; cast suggestion is a v3 enhancement)
- v3: file picker + `COPY FROM STDIN` (much faster than per-row INSERT).  `[ ]`

## 13 · Result grid
- v1: virtualized, multi-sort, filter row, freeze, wrap, find.
- v2: **drag to reorder columns** + persist per-tab layout.  `[x]`
- v3: group-by-column with aggregates per group.  `[ ]`

## 14 · Connection breadcrumb
- v1: shows LOCAL · pgver · host · db · schema.table.
- v2: **clickable** — clicking any segment opens that level (db dropdown, schema selector).  `[x]`
- v3: transaction-status dot (idle / in tx / aborted).  `[ ]`

## 15 · Per-row context menu
- v1: copy as X, clone, delete.
- v2: **"Show rows where this column = this value"** as a one-click filter.  `[x]`
- v3: open referenced row (forward + reverse FK in the menu).  `[ ]`

## 16 · Quick switcher (⌘P)
- v1: fuzzy across commands + tables.
- v2: **usage-ranked** — items the user picks most often surface higher.  `[x]`
- v3: snippet runner — pick a saved snippet from the palette and it opens in a tab pre-filled.  `[x]`

## 17 · Show SQL
- v1: read-only modal with copy.
- v2: **editable + "Run as query"** button — opens a new SQL tab with the generated SELECT.  `[x]`
- v3: include ORDER BY / LIMIT / OFFSET (already done by accident) plus indent format on demand.  `[~]`

## 18 · Auto-refresh
- v1: off / 5s / 15s / 30s / 60s.
- v2: **diff highlight** — rows that changed since the previous refresh briefly flash amber; new rows green.  `[x]`
- v3: pause on tab blur (Page Visibility API).  `[x]`

## 19 · Keyboard cheatsheet (⌘/)
- v1: static list.
- v2: **searchable + grouped per-context** (Tabs · Nav · Editor · Grid · Operate).  `[x]`
- v3: customizable bindings.  `[ ]`

## 20 · Notifications panel
- v1: bell icon, last 50 toasts.
- v2: **categorized + click-to-rerun** — query notifications expand to show the SQL that fired the toast.  `[x]`
- v3: persist across sessions, replayable.  `[ ]`

---

Shipped in this pass: 17/20 v2s · 3/20 v3s.
