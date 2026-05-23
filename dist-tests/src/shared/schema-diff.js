"use strict";
// Schema-tree diffing for incremental refresh (docs/PERFORMANCE.md §4.4 / §8.3).
//
// Given two SchemaEntry[] snapshots (before, after), produce a SchemaDiff
// describing schemas/tables/views/matViews/functions/sequences that were
// added, removed, or changed. Used by the sidebar to patch the tree in-place
// instead of remounting it.
Object.defineProperty(exports, "__esModule", { value: true });
exports.diffSchemas = diffSchemas;
function tableKey(s, t) { return `${s}.${t.name}`; }
function funcKey(s, f) { return `${s}.${f.name}(${f.args || ''})`; }
function seqKey(s, n) { return `${s}.${n.name}`; }
function indexBy(arr, key) {
    const m = new Map();
    for (const x of arr)
        m.set(key(x), x);
    return m;
}
function diffMaps(before, after, same) {
    const added = [];
    const removed = [];
    const changed = [];
    for (const [k, v] of after) {
        const old = before.get(k);
        if (!old)
            added.push(k);
        else if (!same(old, v))
            changed.push(k);
    }
    for (const k of before.keys())
        if (!after.has(k))
            removed.push(k);
    added.sort();
    removed.sort();
    changed.sort();
    return { added, removed, changed };
}
function tableSame(a, b) {
    return a.kind === b.kind && a.size === b.size && a.comment === b.comment;
}
function funcSame(a, b) {
    return a.returns === b.returns && a.language === b.language;
}
function seqSame(a, b) {
    return a.name === b.name;
}
function diffSchemas(before, after) {
    const sBefore = indexBy(before, (s) => s.schema);
    const sAfter = indexBy(after, (s) => s.schema);
    const schemas = diffMaps(sBefore, sAfter, () => true);
    const allTablesBefore = new Map();
    const allTablesAfter = new Map();
    const allViewsBefore = new Map();
    const allViewsAfter = new Map();
    const allMatBefore = new Map();
    const allMatAfter = new Map();
    const allFnBefore = new Map();
    const allFnAfter = new Map();
    const allSeqBefore = new Map();
    const allSeqAfter = new Map();
    for (const s of before) {
        for (const t of s.tables)
            allTablesBefore.set(tableKey(s.schema, t), t);
        for (const v of s.views)
            allViewsBefore.set(tableKey(s.schema, v), v);
        for (const m of s.matViews)
            allMatBefore.set(tableKey(s.schema, m), m);
        for (const f of s.functions)
            allFnBefore.set(funcKey(s.schema, f), f);
        for (const sq of s.sequences)
            allSeqBefore.set(seqKey(s.schema, sq), sq);
    }
    for (const s of after) {
        for (const t of s.tables)
            allTablesAfter.set(tableKey(s.schema, t), t);
        for (const v of s.views)
            allViewsAfter.set(tableKey(s.schema, v), v);
        for (const m of s.matViews)
            allMatAfter.set(tableKey(s.schema, m), m);
        for (const f of s.functions)
            allFnAfter.set(funcKey(s.schema, f), f);
        for (const sq of s.sequences)
            allSeqAfter.set(seqKey(s.schema, sq), sq);
    }
    const tables = diffMaps(allTablesBefore, allTablesAfter, tableSame);
    const views = diffMaps(allViewsBefore, allViewsAfter, tableSame);
    const matViews = diffMaps(allMatBefore, allMatAfter, tableSame);
    const functions = diffMaps(allFnBefore, allFnAfter, funcSame);
    const sequences = diffMaps(allSeqBefore, allSeqAfter, seqSame);
    const unchanged = isEmpty(schemas) && isEmpty(tables) && isEmpty(views) &&
        isEmpty(matViews) && isEmpty(functions) && isEmpty(sequences);
    return { schemas, tables, views, matViews, functions, sequences, unchanged };
}
function isEmpty(d) {
    return d.added.length === 0 && d.removed.length === 0 && d.changed.length === 0;
}
