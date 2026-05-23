"use strict";
// Auto-LIMIT injection for read queries that forgot one (docs/PERFORMANCE.md §3.5).
//
// We only inject for single statements that:
//   - are pure SELECT or WITH ... SELECT (top-level keyword check on stripped sql)
//   - do not already contain a top-level LIMIT
//   - have no INTO clause (those are special — leave them alone)
//
// We are intentionally conservative: false negatives (no injection) are fine,
// false positives (injecting into a wrong statement) would break user queries.
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyAutoLimit = applyAutoLimit;
const SELECT_RE = /^(?:select|with)\b/i;
const LIMIT_RE = /\blimit\b/i;
const INTO_RE = /\binto\b/i;
const TRAILING_SEMI_RE = /;\s*$/;
function stripCommentsAndStrings(sql) {
    // Mask strings, identifiers, and comments so keyword scans see only code.
    let out = '';
    let i = 0;
    const len = sql.length;
    let dollarTag = null;
    while (i < len) {
        const ch = sql[i];
        const nx = sql[i + 1];
        if (dollarTag) {
            if (sql.slice(i, i + dollarTag.length) === dollarTag) {
                out += ' '.repeat(dollarTag.length);
                i += dollarTag.length;
                dollarTag = null;
                continue;
            }
            out += ' ';
            i++;
            continue;
        }
        if (ch === '-' && nx === '-') {
            const nl = sql.indexOf('\n', i);
            const end = nl < 0 ? len : nl;
            out += ' '.repeat(end - i);
            i = end;
            continue;
        }
        if (ch === '/' && nx === '*') {
            const end = sql.indexOf('*/', i + 2);
            const stop = end < 0 ? len : end + 2;
            out += ' '.repeat(stop - i);
            i = stop;
            continue;
        }
        if (ch === "'") {
            let j = i + 1;
            while (j < len) {
                if (sql[j] === "'" && sql[j + 1] === "'") {
                    j += 2;
                    continue;
                }
                if (sql[j] === "'") {
                    j++;
                    break;
                }
                j++;
            }
            out += ' '.repeat(j - i);
            i = j;
            continue;
        }
        if (ch === '"') {
            let j = i + 1;
            while (j < len) {
                if (sql[j] === '"' && sql[j + 1] === '"') {
                    j += 2;
                    continue;
                }
                if (sql[j] === '"') {
                    j++;
                    break;
                }
                j++;
            }
            out += ' '.repeat(j - i);
            i = j;
            continue;
        }
        if (ch === '$') {
            const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
            if (m) {
                dollarTag = m[0];
                out += ' '.repeat(m[0].length);
                i += m[0].length;
                continue;
            }
        }
        out += ch;
        i++;
    }
    return out;
}
/**
 * If the statement looks like a SELECT/CTE without LIMIT, append `LIMIT <n>`.
 * Returns the original string when nothing should change.
 */
function applyAutoLimit(sql, limit) {
    if (!limit || limit <= 0)
        return { sql, injected: false };
    const trimmed = sql.trim();
    if (!trimmed)
        return { sql, injected: false };
    const masked = stripCommentsAndStrings(trimmed);
    // Multiple statements? Skip — auto-limit only applies to single SELECTs.
    // Detect via top-level semicolons in masked text (ignore trailing).
    const noTrail = masked.replace(TRAILING_SEMI_RE, '');
    if (noTrail.includes(';'))
        return { sql, injected: false };
    if (!SELECT_RE.test(masked.trimStart()))
        return { sql, injected: false };
    if (LIMIT_RE.test(masked))
        return { sql, injected: false };
    // SELECT INTO is a different beast (CREATE TABLE AS shorthand).
    if (INTO_RE.test(masked))
        return { sql, injected: false };
    // Insert before any trailing semicolon.
    const hasTrail = TRAILING_SEMI_RE.test(trimmed);
    const body = hasTrail ? trimmed.replace(TRAILING_SEMI_RE, '') : trimmed;
    const out = `${body} limit ${Math.floor(limit)}${hasTrail ? ';' : ''}`;
    return { sql: out, injected: true };
}
