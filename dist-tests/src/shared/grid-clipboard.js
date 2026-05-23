"use strict";
// Helpers for copy / export. Pure functions so they're easy to unit-test.
Object.defineProperty(exports, "__esModule", { value: true });
exports.rowsToTsv = rowsToTsv;
exports.rowsToCsv = rowsToCsv;
exports.rowsToJson = rowsToJson;
exports.rowsToInserts = rowsToInserts;
exports.rowsToMarkdown = rowsToMarkdown;
exports.parsePastedRows = parsePastedRows;
exports.pickFormatter = pickFormatter;
function fmtCell(v) {
    if (v === null || v === undefined)
        return '';
    if (typeof v === 'object')
        return JSON.stringify(v);
    return String(v);
}
function csvEsc(s) {
    if (/[",\n\r]/.test(s))
        return '"' + s.replace(/"/g, '""') + '"';
    return s;
}
function sqlLiteral(v) {
    if (v === null || v === undefined)
        return 'NULL';
    if (typeof v === 'number')
        return Number.isFinite(v) ? String(v) : 'NULL';
    if (typeof v === 'boolean')
        return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'object')
        return "'" + JSON.stringify(v).replace(/'/g, "''") + "'::jsonb";
    return "'" + String(v).replace(/'/g, "''") + "'";
}
function quoteIdent(s) {
    return '"' + s.replace(/"/g, '""') + '"';
}
function rowsToTsv(result, rowIdxs) {
    const cols = result.columns.map((c) => c.name);
    const lines = [cols.join('\t')];
    for (const ri of rowIdxs) {
        const row = result.rows[ri];
        if (!row)
            continue;
        lines.push(row.map((v) => fmtCell(v).replace(/\t/g, ' ').replace(/\n/g, ' ')).join('\t'));
    }
    return lines.join('\n');
}
function rowsToCsv(result, rowIdxs) {
    const cols = result.columns.map((c) => c.name);
    const lines = [cols.map((c) => csvEsc(c)).join(',')];
    for (const ri of rowIdxs) {
        const row = result.rows[ri];
        if (!row)
            continue;
        lines.push(row.map((v) => csvEsc(fmtCell(v))).join(','));
    }
    return lines.join('\n');
}
function rowsToJson(result, rowIdxs) {
    const cols = result.columns.map((c) => c.name);
    const out = rowIdxs
        .map((ri) => result.rows[ri])
        .filter(Boolean)
        .map((row) => {
        const o = {};
        for (let i = 0; i < cols.length; i++)
            o[cols[i]] = row[i];
        return o;
    });
    return JSON.stringify(out, null, 2);
}
function rowsToInserts(result, rowIdxs, opts) {
    const cols = result.columns.map((c) => c.name);
    const colList = cols.map(quoteIdent).join(', ');
    const target = (opts.schema ? quoteIdent(opts.schema) + '.' : '') + quoteIdent(opts.table);
    const lines = [];
    for (const ri of rowIdxs) {
        const row = result.rows[ri];
        if (!row)
            continue;
        const vals = row.map(sqlLiteral).join(', ');
        lines.push(`INSERT INTO ${target} (${colList}) VALUES (${vals});`);
    }
    return lines.join('\n');
}
function rowsToMarkdown(result, rowIdxs) {
    const cols = result.columns.map((c) => c.name);
    const header = '| ' + cols.join(' | ') + ' |';
    const sep = '| ' + cols.map(() => '---').join(' | ') + ' |';
    const lines = [header, sep];
    for (const ri of rowIdxs) {
        const row = result.rows[ri];
        if (!row)
            continue;
        lines.push('| ' + row.map((v) => fmtCell(v).replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ') + ' |');
    }
    return lines.join('\n');
}
/**
 * Best-effort parse of clipboard text into rows. Picks TSV or CSV based on
 * whichever produces more columns on the first line.
 */
function parsePastedRows(text) {
    // Normalize line endings; drop a trailing empty line if any.
    const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
    if (!lines.length)
        return [];
    const tsvFirst = lines[0].split('\t');
    const csvFirst = parseCsvLine(lines[0]);
    const useTsv = tsvFirst.length >= csvFirst.length;
    if (useTsv)
        return lines.map((l) => l.split('\t'));
    return lines.map(parseCsvLine);
}
function parseCsvLine(line) {
    const out = [];
    let cur = '';
    let i = 0;
    let inQ = false;
    while (i < line.length) {
        const c = line[i];
        if (inQ) {
            if (c === '"' && line[i + 1] === '"') {
                cur += '"';
                i += 2;
                continue;
            }
            if (c === '"') {
                inQ = false;
                i++;
                continue;
            }
            cur += c;
            i++;
            continue;
        }
        if (c === '"') {
            inQ = true;
            i++;
            continue;
        }
        if (c === ',') {
            out.push(cur);
            cur = '';
            i++;
            continue;
        }
        cur += c;
        i++;
    }
    out.push(cur);
    return out;
}
function pickFormatter(fmt) {
    switch (fmt) {
        case 'tsv': return rowsToTsv;
        case 'csv': return rowsToCsv;
        case 'json': return rowsToJson;
        case 'markdown': return rowsToMarkdown;
        case 'insert': return (r, i, o) => rowsToInserts(r, i, o || { table: 'rows' });
    }
}
