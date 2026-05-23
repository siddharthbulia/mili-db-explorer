"use strict";
// Pure CSV/JSON serializers shared by the renderer.
Object.defineProperty(exports, "__esModule", { value: true });
exports.csvEscape = csvEscape;
exports.toCsv = toCsv;
exports.rowsToObjects = rowsToObjects;
exports.toJson = toJson;
function csvEscape(v) {
    if (v === null || v === undefined)
        return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/[",\n\r]/.test(s))
        return '"' + s.replace(/"/g, '""') + '"';
    return s;
}
function toCsv(r) {
    const lines = [r.columns.map((c) => csvEscape(c.name)).join(',')];
    for (const row of r.rows)
        lines.push(row.map(csvEscape).join(','));
    return lines.join('\n');
}
function rowsToObjects(r) {
    return r.rows.map((row) => {
        const o = {};
        r.columns.forEach((c, i) => { o[c.name] = row[i]; });
        return o;
    });
}
function toJson(r) {
    return JSON.stringify(rowsToObjects(r), null, 2);
}
