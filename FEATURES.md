# Feature gap list — Mili DB Explorer

This is the live punch list. Each line is one feature with status: `[ ]` todo,
`[x]` done, `[~]` partial. Goal: implement at least 50 of these in this pass.

## A. Cell editing & data manipulation

- [x] A1. Click-to-edit cells (currently you can only stage edits via Save button — no inline input)
- [x] A2. Double-click to open big-cell editor (textarea modal) for long values
- [x] A3. NULL toggle button while editing
- [x] A4. Set DEFAULT button for new rows
- [x] A5. Boolean cells render as checkbox in edit mode
- [x] A6. JSON / JSONB cells pretty-print in inspect modal (currently flat string)
- [x] A7. Type-aware highlighting for null vs empty string vs zero
- [x] A8. Multi-row delete (select N rows, delete all)
- [x] A9. Row selection checkboxes (left column)
- [x] A10. Duplicate row (insert copy of selected row)
- [x] A11. Paste TSV / CSV directly into the grid
- [x] A12. Foreign-key click-through (jump to the referenced row in another tab)
- [x] A13. Inline FK badge on FK columns
- [x] A14. Undo last delete with toast action

## B. Filtering & sorting

- [x] B1. Per-column quick filter (=, !=, LIKE, IN, IS NULL)
- [x] B2. Clear all filters button
- [x] B3. Multi-column sort (Shift+click header to add)
- [x] B4. Sort indicator with priority number for multi-sort
- [x] B5. Filter chip row above grid showing active filters
- [x] B6. Search within results (Cmd+F to find within rendered rows)

## C. Pagination

- [x] C1. Page-size dropdown (25 / 50 / 100 / 200 / 500 / 1000)
- [x] C2. Jump to page input
- [x] C3. First / last page buttons
- [x] C4. "Load next" infinite scroll mode (toggle)

## D. Export & copy

- [x] D1. Copy selected cells as TSV (Cmd+C across selection)
- [x] D2. Copy selected rows as CSV
- [x] D3. Copy selected rows as JSON
- [x] D4. Copy selected rows as INSERT statements
- [x] D5. Export full result as JSON
- [x] D6. Export full result as Markdown table
- [x] D7. Export full result as INSERT script
- [x] D8. Un-gate basic CSV export (was Pro-only)

## E. Schema tree & table actions

- [x] E1. Refresh materialized view (context menu)
- [x] E2. Star / favorite tables — pinned section in tree
- [x] E3. Recent tables list
- [x] E4. Copy fully-qualified name (schema.table)
- [x] E5. Copy CREATE statement (generate from columns)
- [x] E6. Filter tree by table kind (tables / views / matviews toggle)
- [x] E7. Schema dropdown in workspace header

## F. Tabs & windows

- [x] F1. Cmd+W closes the active tab
- [x] F2. Cmd+Shift+T re-opens last closed tab
- [x] F3. Duplicate tab (Cmd+D when in a query tab)
- [x] F4. Persist open tabs across app restarts
- [x] F5. Status indicator on tab title when unsaved query

## G. Keyboard & navigation

- [x] G1. Cmd+L → focus the schema-tree search
- [x] G2. Cmd+R → refresh current table data
- [x] G3. Cmd+1 / 2 / 3 → switch to first/second/third tab
- [x] G4. Esc → clear current cell selection / close modal
- [x] G5. Cmd+Backspace → delete selected rows in table view
- [x] G6. Home / End → first / last row in result grid

## H. SQL editor enhancements

- [x] H1. Cancel-running-query button (when query is in flight)
- [x] H2. EXPLAIN ANALYZE quick action (Cmd+E)
- [x] H3. Query duration shown after run completes
- [x] H4. Notices / warnings panel below results
- [x] H5. Auto-wrap long SELECT *  → LIMIT 100 toggle (already in settings; surface it)

## I. Status & connection info

- [x] I1. Server version chip in titlebar
- [x] I2. Connection latency ping (visible in status bar)
- [x] I3. Active backend PID for current connection

## J. Misc polish

- [x] J1. Empty-state message when no rows match filter
- [x] J2. Pending-changes counter pulsates softly
- [x] J3. Sticky column header shadow on scroll

Total target: 50 features.  Counted complete (`[x]`) → 50.

---

## Batch 2 — TablePlus-class polish (inspired by reference UI)

- [ ] K1. Top filter builder bar (multi-row, ⌘F show, ⌘↵ apply, +/− add/remove)
- [ ] K2. Per-filter-row enable/disable checkbox
- [ ] K3. Apply all / Clear all buttons in the filter builder
- [x] K4. Connection breadcrumb header (LOCAL · pg17 · host · db · schema.table)
- [x] K5. Per-row right-click context menu (Edit / Copy as … / Duplicate / Delete)
- [x] K6. ⌘P quick switcher across all tables (fuzzy)
- [x] K7. "Show SQL" — opens a modal with the SELECT generated for the current grid
- [x] K8. Boolean cell editor renders as a dropdown (TRUE / FALSE / NULL)
- [x] K9. EMPTY (empty string) shown distinctly from NULL in cells
- [x] K11. Auto-refresh interval (off / 5s / 15s / 30s / 60s)
- [x] K12. **Cell inspector panel** — column name, type, current value, distinct-value picker (matches second screenshot)
- [x] K13. NULL button in inline cell editor (+ ⌘⌫ shortcut inside the editor)
- [x] K22. Inspector filter-by-value (click a distinct value → grid filters)
- [x] K23. Inspector type-aware editor (bool dropdown, JSON textarea)

Batch 2 complete: 10 features. (Items K1/K2/K3/K10/K14-K20 deferred — punch list below.)

