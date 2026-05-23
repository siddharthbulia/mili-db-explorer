// Test harness: tiny custom runner so we can parameterize 1000+ scenarios
// without external dependencies and get a deterministic summary.

export interface TestResult {
  name: string;
  group: string;
  ok: boolean;
  error?: string;
  durationMs: number;
}

type AsyncFn = () => void | Promise<void>;

const groups: { name: string; tests: { name: string; fn: AsyncFn }[] }[] = [];
let currentGroup: typeof groups[number] | null = null;

export function group(name: string, body: () => void) {
  currentGroup = { name, tests: [] };
  groups.push(currentGroup);
  body();
  currentGroup = null;
}

export function test(name: string, fn: AsyncFn) {
  if (!currentGroup) throw new Error('test() must be inside group()');
  currentGroup.tests.push({ name, fn });
}

export class AssertionError extends Error {}

export function assert(cond: any, msg?: string): asserts cond {
  if (!cond) throw new AssertionError(msg || 'Assertion failed');
}

export function eq(actual: any, expected: any, msg?: string) {
  if (actual !== expected) {
    throw new AssertionError(
      `${msg || 'Not equal'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

export function deepEq(actual: any, expected: any, msg?: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new AssertionError(
      `${msg || 'Not deep-equal'}: expected ${b}, got ${a}`
    );
  }
}

export function approxEq(actual: number, expected: number, eps = 1e-6, msg?: string) {
  if (Math.abs(actual - expected) > eps) {
    throw new AssertionError(
      `${msg || 'Not approximately equal'}: expected ${expected}±${eps}, got ${actual}`
    );
  }
}

export function includes(haystack: string | any[], needle: any, msg?: string) {
  if (Array.isArray(haystack)) {
    if (!haystack.includes(needle)) {
      throw new AssertionError(`${msg || 'Missing'}: ${JSON.stringify(needle)} not in array`);
    }
  } else if (typeof haystack === 'string') {
    if (!haystack.includes(String(needle))) {
      throw new AssertionError(`${msg || 'Missing'}: substring ${JSON.stringify(needle)} not in string`);
    }
  } else {
    throw new AssertionError('includes(): unsupported haystack');
  }
}

export async function rejects(fn: () => Promise<any>, msg?: string) {
  try {
    await fn();
  } catch {
    return;
  }
  throw new AssertionError(msg || 'Expected promise to reject');
}

export async function runAll(): Promise<{
  total: number; passed: number; failed: number;
  results: TestResult[]; ms: number;
}> {
  const results: TestResult[] = [];
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
        if (process.env.VERBOSE) process.stdout.write(`    ✓ ${t.name} (${d}ms)\n`);
      } catch (e: any) {
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
