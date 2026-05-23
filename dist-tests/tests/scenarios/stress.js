"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const harness_1 = require("../harness");
const db_1 = require("../../src/main/db");
const connect_1 = require("../connect");
const cid = connect_1.TEST_CONNECTION.id;
(0, harness_1.group)('stress — concurrent queries', () => {
    (0, harness_1.test)('20 parallel SELECTs', async () => {
        const ps = Array.from({ length: 20 }, (_, i) => (0, db_1.runQuery)(cid, `select ${i} as i, count(*) from app.big_numbers`));
        const out = await Promise.all(ps);
        for (let i = 0; i < out.length; i++) {
            const r = out[i];
            if (!r.ok)
                throw new Error(`p${i}: ${r.error.message}`);
            (0, harness_1.eq)(r.results[0].rows[0][0], i);
        }
    });
});
(0, harness_1.group)('stress — big_numbers scan', () => {
    (0, harness_1.test)('full scan returns 5000', async () => {
        const r = await (0, db_1.runQuery)(cid, `select count(*) from app.big_numbers`);
        if (!r.ok)
            throw new Error(r.error.message);
        (0, harness_1.eq)(Number(r.results[0].rows[0][0]), 5000);
    });
    (0, harness_1.test)('order by squared desc top 5', async () => {
        const r = await (0, db_1.runQuery)(cid, `select n from app.big_numbers order by squared desc limit 5`);
        if (!r.ok)
            throw new Error(r.error.message);
        (0, harness_1.eq)(r.results[0].rowCount, 5);
        (0, harness_1.eq)(r.results[0].rows[0][0], 5000);
    });
});
(0, harness_1.group)('stress — long string', () => {
    for (const len of [100, 1000, 10000, 50000]) {
        (0, harness_1.test)(`length ${len} text round-trip`, async () => {
            const s = 'A'.repeat(len);
            const r = await (0, db_1.runQuery)(cid, 'select length($1::text), $1::text', [s]);
            if (!r.ok)
                throw new Error(r.error.message);
            (0, harness_1.eq)(Number(r.results[0].rows[0][0]), len);
            (0, harness_1.eq)(r.results[0].rows[0][1].length, len);
        });
    }
});
(0, harness_1.group)('stress — many columns', () => {
    (0, harness_1.test)('SELECT 100 expression columns', async () => {
        const cols = Array.from({ length: 100 }, (_, i) => `${i} as c${i}`).join(', ');
        const r = await (0, db_1.runQuery)(cid, `select ${cols}`);
        if (!r.ok)
            throw new Error(r.error.message);
        (0, harness_1.eq)(r.results[0].columns.length, 100);
        (0, harness_1.eq)(r.results[0].rows[0].length, 100);
        for (let i = 0; i < 100; i++)
            (0, harness_1.eq)(r.results[0].rows[0][i], i);
    });
});
(0, harness_1.group)('stress — wide row', () => {
    (0, harness_1.test)('200-element jsonb array', async () => {
        const arr = JSON.stringify(Array.from({ length: 200 }, (_, i) => i));
        const r = await (0, db_1.runQuery)(cid, 'select $1::jsonb', [arr]);
        if (!r.ok)
            throw new Error(r.error.message);
        (0, harness_1.assert)(Array.isArray(r.results[0].rows[0][0]));
        (0, harness_1.eq)(r.results[0].rows[0][0].length, 200);
    });
});
(0, harness_1.group)('stress — repeated open/close-like operations', () => {
    for (let i = 0; i < 50; i++) {
        (0, harness_1.test)(`select iteration ${i}`, async () => {
            const r = await (0, db_1.runQuery)(cid, `select ${i}::int`);
            if (!r.ok)
                throw new Error(r.error.message);
            (0, harness_1.eq)(r.results[0].rows[0][0], i);
        });
    }
});
