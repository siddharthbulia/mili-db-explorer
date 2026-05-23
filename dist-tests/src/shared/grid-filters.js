"use strict";
// Per-column quick filters. Composed into a SQL WHERE clause server-side, and
// optionally evaluated client-side for the rendered slice.
Object.defineProperty(exports, "__esModule", { value: true });
exports.FILTER_OPS = exports.FILTER_OP_GROUPS = void 0;
exports.isNullary = isNullary;
exports.isBinary = isBinary;
exports.filtersToSql = filtersToSql;
exports.combineWhere = combineWhere;
exports.opLabel = opLabel;
const NULLARY = ['is-null', 'is-not-null'];
function isNullary(op) {
    return NULLARY.includes(op);
}
function isBinary(op) {
    return op === 'between' || op === 'not-between';
}
function quoteIdent(s) {
    return '"' + s.replace(/"/g, '""') + '"';
}
function quoteLiteral(s) {
    return "'" + s.replace(/'/g, "''") + "'";
}
function escapeLike(s) {
    // Escape underscore and percent so an exact-substring "contains" actually
    // means substring, not "any char" / "any string".
    return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
/**
 * Build a SQL fragment for a single filter (no leading WHERE).
 * Returns null if the filter shouldn't be emitted (empty value, disabled, etc).
 */
function emitOne(f, columns) {
    if (f.enabled === false)
        return null;
    // Raw SQL doesn't need a column.
    if (f.op === 'raw') {
        const raw = (f.value ?? '').trim();
        return raw ? `(${raw})` : null;
    }
    // "Any column" — OR across every visible column.
    const isAny = !f.column || f.column === '*';
    const cols = isAny ? (columns || []) : [f.column];
    if (!cols.length)
        return null;
    if (isNullary(f.op)) {
        return cols.map((c) => `${quoteIdent(c)} ${f.op === 'is-null' ? 'IS NULL' : 'IS NOT NULL'}`)
            .join(isAny ? ' OR ' : ' AND ');
    }
    const raw = (f.value ?? '').trim();
    if (!raw)
        return null;
    if (isBinary(f.op)) {
        // value format: "lo, hi"
        const m = raw.split(',', 2).map((s) => s.trim()).filter(Boolean);
        if (m.length < 2)
            return null;
        const [lo, hi] = m;
        const not = f.op === 'not-between' ? 'NOT ' : '';
        return cols.map((c) => `${quoteIdent(c)} ${not}BETWEEN ${quoteLiteral(lo)} AND ${quoteLiteral(hi)}`)
            .join(isAny ? ' OR ' : ' AND ');
    }
    const lit = (s) => quoteLiteral(s);
    const fragments = cols.map((c) => {
        const col = quoteIdent(c);
        const textCol = `${col}::text`;
        switch (f.op) {
            case 'eq': return `${col} = ${lit(raw)}`;
            case 'neq': return `${col} <> ${lit(raw)}`;
            case 'gt': return `${col} > ${lit(raw)}`;
            case 'gte': return `${col} >= ${lit(raw)}`;
            case 'lt': return `${col} < ${lit(raw)}`;
            case 'lte': return `${col} <= ${lit(raw)}`;
            case 'like': return `${textCol} LIKE ${lit(raw)}`;
            case 'ilike': return `${textCol} ILIKE ${lit(raw)}`;
            case 'not-like': return `${textCol} NOT LIKE ${lit(raw)}`;
            case 'contains': return `${textCol} LIKE ${lit('%' + escapeLike(raw) + '%')} ESCAPE '\\'`;
            case 'not-contains': return `${textCol} NOT LIKE ${lit('%' + escapeLike(raw) + '%')} ESCAPE '\\'`;
            case 'contains-i': return `${textCol} ILIKE ${lit('%' + escapeLike(raw) + '%')} ESCAPE '\\'`;
            case 'not-contains-i': return `${textCol} NOT ILIKE ${lit('%' + escapeLike(raw) + '%')} ESCAPE '\\'`;
            case 'prefix': return `${textCol} LIKE ${lit(escapeLike(raw) + '%')} ESCAPE '\\'`;
            case 'suffix': return `${textCol} LIKE ${lit('%' + escapeLike(raw))} ESCAPE '\\'`;
            case 'prefix-i': return `${textCol} ILIKE ${lit(escapeLike(raw) + '%')} ESCAPE '\\'`;
            case 'suffix-i': return `${textCol} ILIKE ${lit('%' + escapeLike(raw))} ESCAPE '\\'`;
            case 'in': {
                const items = raw.split(',').map((s) => s.trim()).filter(Boolean);
                return items.length ? `${col} IN (${items.map(lit).join(', ')})` : null;
            }
            case 'not-in': {
                const items = raw.split(',').map((s) => s.trim()).filter(Boolean);
                return items.length ? `${col} NOT IN (${items.map(lit).join(', ')})` : null;
            }
            default: return null;
        }
    }).filter((x) => !!x);
    if (!fragments.length)
        return null;
    return fragments.length > 1 ? `(${fragments.join(isAny ? ' OR ' : ' AND ')})` : fragments[0];
}
function filtersToSql(filters, columns) {
    return filters
        .map((f) => emitOne(f, columns))
        .filter((s) => !!s)
        .join(' AND ');
}
function combineWhere(filterSql, rawWhere) {
    const a = filterSql.trim();
    const b = (rawWhere || '').trim();
    if (!a)
        return b;
    if (!b)
        return a;
    return `(${a}) AND (${b})`;
}
function opLabel(op) {
    return {
        eq: '=',
        neq: '<>',
        gt: '>',
        gte: '>=',
        lt: '<',
        lte: '<=',
        in: 'IN',
        'not-in': 'NOT IN',
        'is-null': 'IS NULL',
        'is-not-null': 'IS NOT NULL',
        between: 'BETWEEN',
        'not-between': 'NOT BETWEEN',
        like: 'LIKE',
        ilike: 'ILIKE',
        'not-like': 'NOT LIKE',
        contains: 'Contains',
        'not-contains': 'Not contains',
        'contains-i': 'Contains — Case insensitive',
        'not-contains-i': 'Not contains — Case insensitive',
        prefix: 'Has prefix',
        suffix: 'Has suffix',
        'prefix-i': 'Has prefix — Case insensitive',
        'suffix-i': 'Has suffix — Case insensitive',
        raw: 'Raw SQL',
    }[op];
}
/**
 * The user-facing ordered groups for the operator dropdown. Empty strings act
 * as group separators in the UI.
 */
exports.FILTER_OP_GROUPS = [
    { label: 'Comparison', ops: ['eq', 'neq', 'lt', 'gt', 'lte', 'gte'] },
    { label: 'Set', ops: ['in', 'not-in'] },
    { label: 'Null', ops: ['is-null', 'is-not-null'] },
    { label: 'Range', ops: ['between', 'not-between'] },
    { label: 'Pattern', ops: ['like', 'ilike'] },
    { label: 'Contains', ops: ['contains', 'not-contains', 'contains-i', 'not-contains-i'] },
    { label: 'Prefix/Suffix', ops: ['prefix', 'suffix', 'prefix-i', 'suffix-i'] },
    { label: 'Escape hatch', ops: ['raw'] },
];
/** Flat list, used by the original column-row UI. */
exports.FILTER_OPS = exports.FILTER_OP_GROUPS.flatMap((g) => g.ops);
