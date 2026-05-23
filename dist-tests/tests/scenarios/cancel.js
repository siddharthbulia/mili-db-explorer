"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const harness_1 = require("../harness");
const db_1 = require("../../src/main/db");
const connect_1 = require("../connect");
const cid = connect_1.TEST_CONNECTION.id;
(0, harness_1.group)('cancel — pg_cancel_backend', () => {
    (0, harness_1.test)('long pg_sleep query can be cancelled', async () => {
        const qid = 'cancel-test-1';
        const pending = (0, db_1.runQueryScript)(cid, 'select pg_sleep(10)', { queryId: qid });
        // Wait briefly for the backend pid to register.
        for (let i = 0; i < 50; i++) {
            const live = (0, db_1.listRunningQueries)();
            if (live.find((q) => q.id === qid))
                break;
            await new Promise((r) => setTimeout(r, 20));
        }
        const before = (0, db_1.listRunningQueries)();
        (0, harness_1.assert)(!!before.find((q) => q.id === qid), 'query should be registered before cancel');
        const c = await (0, db_1.cancelQuery)(qid);
        (0, harness_1.eq)(c.ok, true);
        const r = await pending;
        (0, harness_1.assert)(!r.ok, 'cancelled query should not succeed');
        if (!r.ok) {
            // Postgres reports SQLSTATE 57014 (query_canceled) when cancelled.
            (0, harness_1.assert)(r.error.code === '57014' || /cancel|terminat/i.test(r.error.message), `unexpected error: ${r.error.code} ${r.error.message}`);
        }
        // After completion, registry should be empty for that id.
        (0, harness_1.assert)(!(0, db_1.listRunningQueries)().find((q) => q.id === qid), 'registry should clear after cancel');
    });
    (0, harness_1.test)('cancelQuery on unknown id returns error', async () => {
        const r = await (0, db_1.cancelQuery)('not-a-real-id');
        (0, harness_1.eq)(r.ok, false);
    });
});
