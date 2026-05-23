"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const harness_1 = require("../harness");
const db_1 = require("../../src/main/db");
const connect_1 = require("../connect");
const cid = connect_1.TEST_CONNECTION.id;
(0, harness_1.group)('explain — EXPLAIN ANALYZE', () => {
    (0, harness_1.test)('simple SELECT returns planning + execution time', async () => {
        const r = await (0, db_1.explainAnalyze)(cid, 'select 1');
        (0, harness_1.assert)(r.executionMs >= 0, 'execution time should be present');
        (0, harness_1.assert)(r.planningMs >= 0, 'planning time should be present');
        (0, harness_1.eq)(typeof r.planJson, 'object');
        (0, harness_1.eq)(r.totalMs, r.planningMs + r.executionMs);
    });
    (0, harness_1.test)('table scan returns plan with node type', async () => {
        const r = await (0, db_1.explainAnalyze)(cid, 'select count(*) from app.big_numbers');
        (0, harness_1.assert)(r.planJson?.Plan?.['Node Type'], 'plan should include Node Type');
    });
    (0, harness_1.test)('strips trailing semicolon', async () => {
        const r = await (0, db_1.explainAnalyze)(cid, 'select 1;');
        (0, harness_1.assert)(r.executionMs >= 0);
    });
});
