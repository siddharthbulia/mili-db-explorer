"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const harness_1 = require("../harness");
const db_1 = require("../../src/main/db");
const connect_1 = require("../connect");
const cid = connect_1.TEST_CONNECTION.id;
(0, harness_1.group)('streaming — cursor-based batched delivery', () => {
    (0, harness_1.test)('streams 5000-row table in chunks', async () => {
        const chunks = [];
        let cols = 0;
        const r = await (0, db_1.streamQuery)(cid, 'select n, squared from app.big_numbers order by n', (c) => { chunks.push(c.rows.length); cols = c.columns.length; }, { chunkSize: 500 });
        (0, harness_1.eq)(r.totalRows, 5000);
        (0, harness_1.eq)(cols, 2);
        (0, harness_1.eq)(chunks.length, 10);
        for (let i = 0; i < 10; i++)
            (0, harness_1.eq)(chunks[i], 500);
    });
    (0, harness_1.test)('preserves order of rows', async () => {
        const collected = [];
        await (0, db_1.streamQuery)(cid, 'select n from app.big_numbers order by n', (c) => { for (const row of c.rows)
            collected.push(Number(row[0])); }, { chunkSize: 1000 });
        (0, harness_1.eq)(collected.length, 5000);
        (0, harness_1.eq)(collected[0], 1);
        (0, harness_1.eq)(collected[4999], 5000);
    });
    (0, harness_1.test)('chunk index is monotonic', async () => {
        let last = -1;
        await (0, db_1.streamQuery)(cid, 'select n from app.big_numbers order by n limit 2500', (c) => { (0, harness_1.eq)(c.index, last + 1); last = c.index; }, { chunkSize: 500 });
        (0, harness_1.eq)(last, 4);
    });
    (0, harness_1.test)('totalSoFar grows correctly', async () => {
        let lastTotal = 0;
        await (0, db_1.streamQuery)(cid, 'select n from app.big_numbers order by n limit 1500', (c) => {
            (0, harness_1.assert)(c.totalSoFar > lastTotal, 'totalSoFar must be increasing');
            lastTotal = c.totalSoFar;
        }, { chunkSize: 500 });
        (0, harness_1.eq)(lastTotal, 1500);
    });
    (0, harness_1.test)('empty result triggers no chunks', async () => {
        let count = 0;
        const r = await (0, db_1.streamQuery)(cid, 'select n from app.big_numbers where n = -1', () => { count++; }, { chunkSize: 500 });
        (0, harness_1.eq)(count, 0);
        (0, harness_1.eq)(r.totalRows, 0);
    });
    (0, harness_1.test)('clamps chunkSize bounds', async () => {
        // Below 50 clamps to 50.
        let chunks = [];
        const r = await (0, db_1.streamQuery)(cid, 'select n from app.big_numbers order by n limit 100', (c) => { chunks.push(c.rows.length); }, { chunkSize: 10 });
        // 100 rows with min-clamped 50/batch -> two batches of 50.
        (0, harness_1.eq)(r.totalRows, 100);
        (0, harness_1.eq)(chunks.length, 2);
    });
    (0, harness_1.test)('strips trailing semicolon', async () => {
        const r = await (0, db_1.streamQuery)(cid, 'select 1;', () => { }, { chunkSize: 1000 });
        (0, harness_1.eq)(r.totalRows, 1);
    });
    (0, harness_1.test)('throws on invalid SQL but releases client', async () => {
        let threw = false;
        try {
            await (0, db_1.streamQuery)(cid, 'select * from not_a_table_xyz', () => { });
        }
        catch {
            threw = true;
        }
        (0, harness_1.eq)(threw, true);
        // Subsequent normal query should succeed (client was released).
        const r = await (0, db_1.streamQuery)(cid, 'select 1', () => { });
        (0, harness_1.eq)(r.totalRows, 1);
    });
});
