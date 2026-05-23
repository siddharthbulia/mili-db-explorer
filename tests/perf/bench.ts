// Performance bench harness (docs/PERFORMANCE.md §11.5).
//
// Runs a canonical workload against the local Postgres test database and
// reports wall-clock numbers. Compare against the "Expected" column in §14.
//
// Usage:
//   npm run bench                      # runs all cases, prints a table
//   PERF_VERBOSE=1 npm run bench       # extra logging per iteration
//
// The bench connects to the same test DB as tests/connect.ts; make sure your
// fixtures are loaded (see tests/fixtures.sql).

import {
  openConnection,
  runQuery,
  runQueryScript,
  listSchemas,
  refreshSchema,
  streamQuery,
  closeAll,
} from '../../src/main/db';
import { TEST_CONNECTION } from '../connect';

interface CaseResult {
  name: string;
  iters: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  budgetP50: number; // ms — pass threshold
  budgetP99: number;
  pass: boolean;
}

function pctl(arr: number[], p: number): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function bench(
  name: string,
  iters: number,
  fn: () => Promise<void>,
  budgetP50: number,
  budgetP99: number
): Promise<CaseResult> {
  const times: number[] = [];
  // Warm up so the first iteration's cold path doesn't dominate.
  await fn();
  for (let i = 0; i < iters; i++) {
    const t0 = Date.now();
    await fn();
    const dt = Date.now() - t0;
    times.push(dt);
    if (process.env.PERF_VERBOSE) {
      process.stdout.write(`    [${name}] iter ${i + 1}/${iters}: ${dt}ms\n`);
    }
  }
  const p50 = pctl(times, 50);
  const p95 = pctl(times, 95);
  const p99 = pctl(times, 99);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const pass = p50 <= budgetP50 && p99 <= budgetP99;
  return { name, iters, p50, p95, p99, min, max, budgetP50, budgetP99, pass };
}

function pad(s: string, w: number) {
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}

async function main() {
  const cid = TEST_CONNECTION.id;
  const conn = await openConnection(TEST_CONNECTION);
  if (!conn.ok) throw new Error(conn.error);

  const results: CaseResult[] = [];

  // §14 reference numbers — adjusted for "local Postgres on a laptop".
  results.push(await bench(
    'select 1 round-trip', 50,
    async () => { await runQuery(cid, 'select 1'); },
    50, 150
  ));

  results.push(await bench(
    'select 100 rows from 10-col table', 30,
    async () => { await runQuery(cid, 'select * from app.big_numbers limit 100'); },
    100, 300
  ));

  results.push(await bench(
    'select 5000 rows (buffered)', 10,
    async () => { await runQuery(cid, 'select n, squared from app.big_numbers'); },
    500, 1500
  ));

  results.push(await bench(
    'select 5000 rows (streamed, 1000/chunk)', 10,
    async () => {
      await streamQuery(cid, 'select n, squared from app.big_numbers', () => {}, { chunkSize: 1000 });
    },
    600, 1500
  ));

  results.push(await bench(
    'listSchemas (introspection)', 10,
    async () => { await listSchemas(cid); },
    600, 2000
  ));

  results.push(await bench(
    'refreshSchema with cached diff', 10,
    async () => { await refreshSchema(cid); },
    600, 2000
  ));

  results.push(await bench(
    'runQueryScript (3 statements)', 20,
    async () => { await runQueryScript(cid, 'select 1; select 2; select 3'); },
    100, 300
  ));

  // Print table.
  process.stdout.write('\n');
  process.stdout.write(
    pad('case', 44) + pad('iters', 6) + pad('p50', 8) + pad('p95', 8) +
    pad('p99', 8) + pad('budget', 14) + 'status\n'
  );
  process.stdout.write('-'.repeat(96) + '\n');
  let failed = 0;
  for (const r of results) {
    if (!r.pass) failed++;
    process.stdout.write(
      pad(r.name, 44) +
      pad(String(r.iters), 6) +
      pad(`${r.p50}ms`, 8) +
      pad(`${r.p95}ms`, 8) +
      pad(`${r.p99}ms`, 8) +
      pad(`${r.budgetP50}/${r.budgetP99}`, 14) +
      (r.pass ? 'PASS' : 'FAIL') + '\n'
    );
  }
  process.stdout.write(`\n${results.length - failed}/${results.length} cases within budget\n`);

  closeAll();
  setTimeout(() => process.exit(failed === 0 ? 0 : 1), 200);
}

main().catch((e) => {
  process.stderr.write('bench failed: ' + (e?.stack || e) + '\n');
  closeAll();
  setTimeout(() => process.exit(1), 200);
});
