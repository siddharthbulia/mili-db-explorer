# Mili DB Explorer — 100 features

Each line is a discrete feature. `[x]` shipped this pass, `[ ]` deferred. No
inflated marketing — if it's `[x]`, it actually works in the running app.

## Operate mode — pg system catalogs

- [x] 1. Sessions panel (pg_stat_activity): user, app, state, query, age
- [x] 2. Cancel session (pg_cancel_backend) from sessions panel
- [x] 3. Terminate session (pg_terminate_backend) from sessions panel
- [x] 4. Locks panel (pg_locks join pg_stat_activity)
- [x] 5. Top tables by size
- [x] 6. Top tables by row estimate (Storage tab sortable)
- [x] 7. Per-table dead tuples (pg_stat_user_tables.n_dead_tup)
- [x] 8. Last vacuum / last analyze timestamps per table
- [x] 9. Per-index size + scans (pg_stat_user_indexes)
- [x] 10. Unused-indexes warning
- [x] 11. pg_stat_statements (gracefully handles if extension missing) top 20 queries (if extension installed)
- [x] 12. VACUUM ANALYZE table — context-menu action
- [x] 13. REINDEX table — context-menu action
- [x] 14. Database size summary (sum of pg_database_size)
- [x] 15. Current transaction id (Maintenance card) + age

## DDL operations (with confirmation)

- [ ] 16. CREATE TABLE wizard
- [x] 17. ADD COLUMN modal
- [x] 18. DROP COLUMN context action
- [x] 19. RENAME COLUMN modal
- [x] 20. ALTER COLUMN TYPE
- [x] 21. SET / DROP NOT NULL
- [x] 22. SET / DROP DEFAULT
- [x] 23. CREATE INDEX wizard
- [x] 24. DROP INDEX context (in Operate ▸ Indexes)
- [x] 25. RENAME TABLE
- [ ] 26. SET TABLESPACE / SET SCHEMA
- [x] 27. CREATE SCHEMA
- [x] 28. DROP SCHEMA (with cascade confirmation)
- [x] 29. CREATE VIEW from current query
- [x] 30. CREATE MATERIALIZED VIEW from current query

## Data import / export

- [x] 31. Import CSV → table (column mapping, single transaction) → table (column mapping)
- [ ] 32. Export full table as CSV / JSON / SQL inserts (already)
- [ ] 33. Dump schema (CREATEs only)
- [ ] 34. Dump table data (INSERTs only)
- [ ] 35. Copy single row as JSON / SQL / TSV (already via row context)

## Query editor power

- [x] 36. Persistent per-connection query history
- [ ] 37. Search query history (Cmd+H)
- [x] 38. One-click re-run from history (via command palette)
- [x] 39. Star queries (saved snippets)
- [x] 40. Auto-save current query draft per tab (already via tab persistence)
- [x] 41. Run selection / up-to-cursor (already)
- [x] 42. Bracket matching (Monaco default)
- [ ] 43. Auto-complete schema-aware (preload from listSchemas)
- [ ] 44. Snippet expander (e.g. `sel→SELECT`)
- [ ] 45. Query parameters ($1, $2) bind form
- [x] 46. Beautify on demand (Cmd+Shift+F — already)
- [x] 47. Convert SELECT → COUNT(*) toggle
- [x] 48. Convert SELECT → EXPLAIN ANALYZE toggle (already Cmd+E)
- [x] 49. Run timer / running clock badge (already)
- [x] 50. Notices / warnings panel (already)

## Grid power features

- [x] 51. Freeze first column
- [x] 52. Column auto-fit (double-click resizer) (double-click resizer)
- [x] 53. Cell wrap toggle for long values
- [x] 54. Find within rendered result (Cmd+F)
- [ ] 55. Group by column (client-side count aggregate)
- [x] 56. Aggregate footer (sum / avg / min / max for selected col) for selected numeric column (sum / avg / min / max)
- [x] 57. Distinct value count for selected column for selected column
- [ ] 58. Histogram preview for numeric column (sparkline)
- [ ] 59. Cell formatter dropdown (raw / pretty JSON / hex / base64)
- [ ] 60. Click hyperlink-looking strings to open in browser

## Connections

- [x] 61. SSL mode picker (disable / require / verify-full — already in form)
- [x] 62. Per-connection accent color picker (already in form)
- [x] 63. Per-connection default schema selector
- [x] 64. Connection import from URL/.env (postgresql://user:pass@host/db)
- [x] 65. Connection export to URL (one-click)
- [x] 66. Read-only mode toggle (sets BEGIN READ ONLY for the session)
- [ ] 67. Test-connection latency indicator
- [ ] 68. Reconnect button when ping fails

## Schema tree

- [ ] 69. Table size shown inline in tree
- [x] 70. Table comment shown on hover (via title attr)
- [x] 71. Pinned schemas (right-click → Pin) (always expanded)
- [x] 72. Toggle system schemas (pg_catalog, information_schema)
- [x] 73. Filter tree by kind toggles (already done)
- [ ] 74. Schema-level "New Table" / "New View" / "New Function" actions
- [x] 75. Refresh single schema (right-click) (instead of all)

## Productivity & UX

- [x] 76. Keyboard cheat sheet (Cmd+/)
- [ ] 77. Side-by-side tabs (split view)
- [ ] 78. Detach tab to new window
- [ ] 79. Drag-reorder tabs
- [ ] 80. Workspace presets (save / load tab sets)
- [x] 81. Notifications panel (replaces toast log)
- [x] 82. Status footer (rows · ms · transaction id · pid)
- [x] 83. Quick connection switcher (⌘;) (Cmd+;)
- [ ] 84. "What changed?" panel after Save (post-write diff summary)
- [ ] 85. Onboarding tour (first run only)

## Settings

- [x] 86. Default page size
- [x] 87. Editor font + size
- [x] 88. Confirm dangerous queries (already)
- [x] 89. Auto-format on run (already)
- [x] 90. Theme + accent color
- [x] 91. Editor line numbers toggle
- [x] 92. Editor word wrap toggle
- [ ] 93. Relative timestamps in results (e.g. "5 min ago")
- [ ] 94. Save preferred timezone for date display
- [ ] 95. Keymap (default / vim — vim deferred)

## Help / About

- [x] 96. About modal (version, license, credits)
- [x] 97. Release notes (via Changelog modal)
- [x] 98. Report-bug link (in About modal) (mailto)
- [x] 99. Built-in changelog viewer
- [x] 100. First-run "open sample query" "open sample query" affordance

---

Counted complete (`[x]`) at end of pass → tracked at the bottom.
