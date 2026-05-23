"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitStatements = splitStatements;
// Splits a SQL script on top-level semicolons, respecting:
//   single-quoted strings (with '' escape), double-quoted identifiers,
//   line and block comments, and dollar-quoted strings ($$…$$, $tag$…$tag$).
//
// Returns each statement *with* its trailing characters before the ';' but
// without the ';' itself. Empty statements are dropped by the caller.
function splitStatements(sql) {
    const out = [];
    let buf = '';
    let i = 0;
    const len = sql.length;
    let inSingle = false;
    let inDouble = false;
    let inLineComment = false;
    let inBlockComment = false;
    let dollarTag = null;
    while (i < len) {
        const ch = sql[i];
        const next = sql[i + 1];
        if (inLineComment) {
            buf += ch;
            if (ch === '\n')
                inLineComment = false;
            i++;
            continue;
        }
        if (inBlockComment) {
            buf += ch;
            if (ch === '*' && next === '/') {
                buf += next;
                i += 2;
                inBlockComment = false;
                continue;
            }
            i++;
            continue;
        }
        if (dollarTag) {
            // We're inside dollar quotes. Look for the closing tag.
            if (ch === '$' && sql.slice(i, i + dollarTag.length) === dollarTag) {
                buf += dollarTag;
                i += dollarTag.length;
                dollarTag = null;
                continue;
            }
            buf += ch;
            i++;
            continue;
        }
        if (inSingle) {
            buf += ch;
            if (ch === "'" && next === "'") {
                buf += next;
                i += 2;
                continue;
            }
            if (ch === "'")
                inSingle = false;
            i++;
            continue;
        }
        if (inDouble) {
            buf += ch;
            if (ch === '"' && next === '"') {
                buf += next;
                i += 2;
                continue;
            }
            if (ch === '"')
                inDouble = false;
            i++;
            continue;
        }
        if (ch === '-' && next === '-') {
            inLineComment = true;
            buf += ch;
            i++;
            continue;
        }
        if (ch === '/' && next === '*') {
            inBlockComment = true;
            buf += ch;
            i++;
            continue;
        }
        if (ch === "'") {
            inSingle = true;
            buf += ch;
            i++;
            continue;
        }
        if (ch === '"') {
            inDouble = true;
            buf += ch;
            i++;
            continue;
        }
        if (ch === '$') {
            // Detect dollar-quote tag like $$ or $foo$
            const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
            if (m) {
                dollarTag = m[0];
                buf += dollarTag;
                i += dollarTag.length;
                continue;
            }
        }
        if (ch === ';') {
            out.push(buf);
            buf = '';
            i++;
            continue;
        }
        buf += ch;
        i++;
    }
    if (buf.length > 0)
        out.push(buf);
    return out;
}
