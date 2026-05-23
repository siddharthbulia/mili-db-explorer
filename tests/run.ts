import { runAll } from './harness';
import { closeAll } from '../src/main/db';

// Load scenarios in deterministic order.
// Pure (no DB) scenarios first so they fail fast if broken.
import './scenarios/splitter';
import './scenarios/license';
import './scenarios/csv';
import './scenarios/qident';
import './scenarios/pool';
import './scenarios/auto_limit';
import './scenarios/schema_diff';
import './scenarios/grid_virt';
import './scenarios/window_route';
import './scenarios/grid_clipboard';
import './scenarios/grid_filters';
import './scenarios/sql_generators';

// Connection-bootstrap then DB-backed.
import './scenarios/connections';
import './scenarios/exec';
import './scenarios/types';
import './scenarios/ddl';
import './scenarios/data';
import './scenarios/stress';
import './scenarios/cancel';
import './scenarios/streaming';
import './scenarios/explain';
import './scenarios/auto_limit_run';

(async () => {
  const t0 = Date.now();
  const summary = await runAll();
  const ms = Date.now() - t0;
  process.stdout.write(`\n=================================================\n`);
  process.stdout.write(`  TOTAL: ${summary.total}   PASS: ${summary.passed}   FAIL: ${summary.failed}\n`);
  process.stdout.write(`  Time : ${ms}ms\n`);
  process.stdout.write(`=================================================\n`);
  if (summary.failed > 0) {
    process.stdout.write(`\nFailures:\n`);
    for (const r of summary.results) {
      if (!r.ok) {
        process.stdout.write(`\n  [${r.group}] ${r.name}\n    ${(r.error || '').split('\n').slice(0, 5).join('\n    ')}\n`);
      }
    }
  }
  closeAll();
  setTimeout(() => process.exit(summary.failed === 0 ? 0 : 1), 250);
})();
