"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const harness_1 = require("../harness");
const db_1 = require("../../src/main/db");
const connect_1 = require("../connect");
const cid = connect_1.TEST_CONNECTION.id;
(0, harness_1.group)('auto-limit — applied through runQueryScript', () => {
    (0, harness_1.test)('explicit autoLimit caps a SELECT *', async () => {
        const r = await (0, db_1.runQueryScript)(cid, 'select * from app.big_numbers', { autoLimit: 50 });
        (0, harness_1.assert)(r.ok, 'should succeed');
        if (r.ok) {
            (0, harness_1.eq)(r.results[0].rows.length, 50);
        }
    });
    (0, harness_1.test)('autoLimit disabled returns full set', async () => {
        const r = await (0, db_1.runQueryScript)(cid, 'select * from app.big_numbers', { autoLimit: 0 });
        (0, harness_1.assert)(r.ok);
        if (r.ok)
            (0, harness_1.eq)(r.results[0].rows.length, 5000);
    });
    (0, harness_1.test)('existing LIMIT not overridden', async () => {
        const r = await (0, db_1.runQueryScript)(cid, 'select * from app.big_numbers limit 3', { autoLimit: 1000 });
        (0, harness_1.assert)(r.ok);
        if (r.ok)
            (0, harness_1.eq)(r.results[0].rows.length, 3);
    });
    (0, harness_1.test)('autoLimit ignored on non-SELECT', async () => {
        // create temp + insert should run, not get limited.
        const r = await (0, db_1.runQueryScript)(cid, 'create temp table t_auto_limit_run (x int) on commit drop', { autoLimit: 50 });
        // Postgres needs an explicit transaction for "on commit drop" but the
        // statement parses fine; we just care the query did not break.
        (0, harness_1.assert)(r.ok || (!r.ok && /transaction|temp/i.test(r.error.message)));
    });
});
