"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const harness_1 = require("./harness");
const db_1 = require("../src/main/db");
// Load scenarios in deterministic order.
// Pure (no DB) scenarios first so they fail fast if broken.
require("./scenarios/splitter");
require("./scenarios/license");
require("./scenarios/csv");
require("./scenarios/qident");
require("./scenarios/pool");
require("./scenarios/auto_limit");
require("./scenarios/schema_diff");
require("./scenarios/grid_virt");
require("./scenarios/window_route");
require("./scenarios/grid_clipboard");
require("./scenarios/grid_filters");
require("./scenarios/sql_generators");
// Connection-bootstrap then DB-backed.
require("./scenarios/connections");
require("./scenarios/exec");
require("./scenarios/types");
require("./scenarios/ddl");
require("./scenarios/data");
require("./scenarios/stress");
require("./scenarios/cancel");
require("./scenarios/streaming");
require("./scenarios/explain");
require("./scenarios/auto_limit_run");
(async () => {
    const t0 = Date.now();
    const summary = await (0, harness_1.runAll)();
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
    (0, db_1.closeAll)();
    setTimeout(() => process.exit(summary.failed === 0 ? 0 : 1), 250);
})();
