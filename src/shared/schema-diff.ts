// Schema-tree diffing for incremental refresh (docs/PERFORMANCE.md §4.4 / §8.3).
//
// Given two SchemaEntry[] snapshots (before, after), produce a SchemaDiff
// describing schemas/tables/views/matViews/functions/sequences that were
// added, removed, or changed. Used by the sidebar to patch the tree in-place
// instead of remounting it.

import type { SchemaEntry, TableEntry, FunctionEntry } from './types';

export interface SchemaDelta {
  added: string[];                   // qualified names (schema or schema.kind.name)
  removed: string[];
  changed: string[];
}

export interface SchemaDiff {
  schemas: SchemaDelta;
  tables: SchemaDelta;
  views: SchemaDelta;
  matViews: SchemaDelta;
  functions: SchemaDelta;
  sequences: SchemaDelta;
  unchanged: boolean;
}

function tableKey(s: string, t: TableEntry) { return `${s}.${t.name}`; }
function funcKey(s: string, f: FunctionEntry) { return `${s}.${f.name}(${f.args || ''})`; }
function seqKey(s: string, n: { name: string }) { return `${s}.${n.name}`; }

function indexBy<T>(arr: T[], key: (x: T) => string): Map<string, T> {
  const m = new Map<string, T>();
  for (const x of arr) m.set(key(x), x);
  return m;
}

function diffMaps<T>(
  before: Map<string, T>,
  after: Map<string, T>,
  same: (a: T, b: T) => boolean
): SchemaDelta {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const [k, v] of after) {
    const old = before.get(k);
    if (!old) added.push(k);
    else if (!same(old, v)) changed.push(k);
  }
  for (const k of before.keys()) if (!after.has(k)) removed.push(k);
  added.sort();
  removed.sort();
  changed.sort();
  return { added, removed, changed };
}

function tableSame(a: TableEntry, b: TableEntry) {
  return a.kind === b.kind && a.size === b.size && a.comment === b.comment;
}
function funcSame(a: FunctionEntry, b: FunctionEntry) {
  return a.returns === b.returns && a.language === b.language;
}
function seqSame(a: { name: string }, b: { name: string }) {
  return a.name === b.name;
}

export function diffSchemas(before: SchemaEntry[], after: SchemaEntry[]): SchemaDiff {
  const sBefore = indexBy(before, (s) => s.schema);
  const sAfter = indexBy(after, (s) => s.schema);

  const schemas = diffMaps(sBefore, sAfter, () => true);

  const allTablesBefore = new Map<string, TableEntry>();
  const allTablesAfter = new Map<string, TableEntry>();
  const allViewsBefore = new Map<string, TableEntry>();
  const allViewsAfter = new Map<string, TableEntry>();
  const allMatBefore = new Map<string, TableEntry>();
  const allMatAfter = new Map<string, TableEntry>();
  const allFnBefore = new Map<string, FunctionEntry>();
  const allFnAfter = new Map<string, FunctionEntry>();
  const allSeqBefore = new Map<string, { name: string }>();
  const allSeqAfter = new Map<string, { name: string }>();

  for (const s of before) {
    for (const t of s.tables) allTablesBefore.set(tableKey(s.schema, t), t);
    for (const v of s.views) allViewsBefore.set(tableKey(s.schema, v), v);
    for (const m of s.matViews) allMatBefore.set(tableKey(s.schema, m), m);
    for (const f of s.functions) allFnBefore.set(funcKey(s.schema, f), f);
    for (const sq of s.sequences) allSeqBefore.set(seqKey(s.schema, sq), sq);
  }
  for (const s of after) {
    for (const t of s.tables) allTablesAfter.set(tableKey(s.schema, t), t);
    for (const v of s.views) allViewsAfter.set(tableKey(s.schema, v), v);
    for (const m of s.matViews) allMatAfter.set(tableKey(s.schema, m), m);
    for (const f of s.functions) allFnAfter.set(funcKey(s.schema, f), f);
    for (const sq of s.sequences) allSeqAfter.set(seqKey(s.schema, sq), sq);
  }

  const tables = diffMaps(allTablesBefore, allTablesAfter, tableSame);
  const views = diffMaps(allViewsBefore, allViewsAfter, tableSame);
  const matViews = diffMaps(allMatBefore, allMatAfter, tableSame);
  const functions = diffMaps(allFnBefore, allFnAfter, funcSame);
  const sequences = diffMaps(allSeqBefore, allSeqAfter, seqSame);

  const unchanged =
    isEmpty(schemas) && isEmpty(tables) && isEmpty(views) &&
    isEmpty(matViews) && isEmpty(functions) && isEmpty(sequences);

  return { schemas, tables, views, matViews, functions, sequences, unchanged };
}

function isEmpty(d: SchemaDelta) {
  return d.added.length === 0 && d.removed.length === 0 && d.changed.length === 0;
}
