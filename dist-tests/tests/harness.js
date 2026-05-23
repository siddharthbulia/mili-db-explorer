"use strict";
// Test harness: tiny custom runner so we can parameterize 1000+ scenarios
// without external dependencies and get a deterministic summary.
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssertionError = void 0;
exports.group = group;
exports.test = test;
exports.assert = assert;
exports.eq = eq;
exports.deepEq = deepEq;
exports.approxEq = approxEq;
exports.includes = includes;
exports.rejects = rejects;
exports.runAll = runAll;
const groups = [];
let currentGroup = null;
function group(name, body) {
    currentGroup = { name, tests: [] };
    groups.push(currentGroup);
    body();
    currentGroup = null;
}
function test(name, fn) {
    if (!currentGroup)
        throw new Error('test() must be inside group()');
    currentGroup.tests.push({ name, fn });
}
class AssertionError extends Error {
}
exports.AssertionError = AssertionError;
function assert(cond, msg) {
    if (!cond)
        throw new AssertionError(msg || 'Assertion failed');
}
function eq(actual, expected, msg) {
    if (actual !== expected) {
        throw new AssertionError(`${msg || 'Not equal'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}
function deepEq(actual, expected, msg) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) {
        throw new AssertionError(`${msg || 'Not deep-equal'}: expected ${b}, got ${a}`);
    }
}
function approxEq(actual, expected, eps = 1e-6, msg) {
    if (Math.abs(actual - expected) > eps) {
        throw new AssertionError(`${msg || 'Not approximately equal'}: expected ${expected}±${eps}, got ${actual}`);
    }
}
function includes(haystack, needle, msg) {
    if (Array.isArray(haystack)) {
        if (!haystack.includes(needle)) {
            throw new AssertionError(`${msg || 'Missing'}: ${JSON.stringify(needle)} not in array`);
        }
    }
    else if (typeof haystack === 'string') {
        if (!haystack.includes(String(needle))) {
            throw new AssertionError(`${msg || 'Missing'}: substring ${JSON.stringify(needle)} not in string`);
        }
    }
    else {
        throw new AssertionError('includes(): unsupported haystack');
    }
}
async function rejects(fn, msg) {
    try {
        await fn();
    }
    catch {
        return;
    }
    throw new AssertionError(msg || 'Expected promise to reject');
}
async function runAll() {
    const results = [];
    const t0 = Date.now();
    let passed = 0;
    let failed = 0;
    for (const g of groups) {
        process.stdout.write(`\n  ${g.name}  (${g.tests.length})\n`);
        for (const t of g.tests) {
            const s = Date.now();
            try {
                await t.fn();
                const d = Date.now() - s;
                passed++;
                results.push({ group: g.name, name: t.name, ok: true, durationMs: d });
                if (process.env.VERBOSE)
                    process.stdout.write(`    ✓ ${t.name} (${d}ms)\n`);
            }
            catch (e) {
                const d = Date.now() - s;
                failed++;
                results.push({
                    group: g.name, name: t.name, ok: false, durationMs: d,
                    error: (e?.stack || e?.message || String(e)),
                });
                process.stdout.write(`    ✗ ${t.name}\n      ${(e?.message || e).toString().split('\n')[0]}\n`);
            }
        }
    }
    const total = passed + failed;
    const ms = Date.now() - t0;
    return { total, passed, failed, results, ms };
}
