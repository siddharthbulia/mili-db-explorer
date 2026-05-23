"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const harness_1 = require("../harness");
const db_1 = require("../../src/main/db");
const connect_1 = require("../connect");
const cid = connect_1.TEST_CONNECTION.id;
(0, harness_1.group)('data — fetchTableRows pagination', () => {
    (0, harness_1.test)('first page size 10 from big_numbers', async () => {
        const r = await (0, db_1.fetchTableRows)(cid, 'app', 'big_numbers', { limit: 10, offset: 0 });
        if (!r.ok)
            throw new Error(r.error.message);
        (0, harness_1.eq)(r.results[0].rowCount, 10);
    });
    (0, harness_1.test)('second page distinct from first', async () => {
        const r1 = await (0, db_1.fetchTableRows)(cid, 'app', 'big_numbers', {
            limit: 10, offset: 0, orderBy: [{ col: 'n', dir: 'asc' }],
        });
        const r2 = await (0, db_1.fetchTableRows)(cid, 'app', 'big_numbers', {
            limit: 10, offset: 10, orderBy: [{ col: 'n', dir: 'asc' }],
        });
        if (!r1.ok || !r2.ok)
            throw new Error('failed');
        (0, harness_1.eq)(r1.results[0].rows[0][0], 1);
        (0, harness_1.eq)(r2.results[0].rows[0][0], 11);
    });
    (0, harness_1.test)('beyond end returns empty', async () => {
        const r = await (0, db_1.fetchTableRows)(cid, 'app', 'big_numbers', { limit: 100, offset: 999999 });
        if (!r.ok)
            throw new Error(r.error.message);
        (0, harness_1.eq)(r.results[0].rowCount, 0);
    });
    (0, harness_1.test)('limit cap 50000 enforced', async () => {
        const r = await (0, db_1.fetchTableRows)(cid, 'app', 'big_numbers', { limit: 999999, offset: 0 });
        if (!r.ok)
            throw new Error(r.error.message);
        (0, harness_1.assert)(r.results[0].rowCount <= 50000);
    });
    (0, harness_1.test)('negative limit clamped to 1', async () => {
        const r = await (0, db_1.fetchTableRows)(cid, 'app', 'big_numbers', { limit: -5, offset: 0 });
        if (!r.ok)
            throw new Error(r.error.message);
        (0, harness_1.eq)(r.results[0].rowCount, 1);
    });
    (0, harness_1.test)('negative offset clamped to 0', async () => {
        const r = await (0, db_1.fetchTableRows)(cid, 'app', 'big_numbers', {
            limit: 5, offset: -10, orderBy: [{ col: 'n', dir: 'asc' }],
        });
        if (!r.ok)
            throw new Error(r.error.message);
        (0, harness_1.eq)(r.results[0].rows[0][0], 1);
    });
    // Many parameterized pages
    for (let page = 0; page < 25; page++) {
        (0, harness_1.test)(`page ${page} of size 100 returns correct first row`, async () => {
            const r = await (0, db_1.fetchTableRows)(cid, 'app', 'big_numbers', {
                limit: 100, offset: page * 100, orderBy: [{ col: 'n', dir: 'asc' }],
            });
            if (!r.ok)
                throw new Error(r.error.message);
            if (r.results[0].rowCount > 0) {
                (0, harness_1.eq)(r.results[0].rows[0][0], page * 100 + 1);
            }
        });
    }
});
(0, harness_1.group)('data — fetchTableRows ordering', () => {
    (0, harness_1.test)('asc by n', async () => {
        const r = await (0, db_1.fetchTableRows)(cid, 'app', 'big_numbers', {
            limit: 5, offset: 0, orderBy: [{ col: 'n', dir: 'asc' }],
        });
        if (!r.ok)
            throw new Error(r.error.message);
        (0, harness_1.eq)(r.results[0].rows[0][0], 1);
    });
    (0, harness_1.test)('desc by n', async () => {
        const r = await (0, db_1.fetchTableRows)(cid, 'app', 'big_numbers', {
            limit: 5, offset: 0, orderBy: [{ col: 'n', dir: 'desc' }],
        });
        if (!r.ok)
            throw new Error(r.error.message);
        (0, harness_1.eq)(r.results[0].rows[0][0], 5000);
    });
    (0, harness_1.test)('multi-column order', async () => {
        const r = await (0, db_1.fetchTableRows)(cid, 'app', 'orders', {
            limit: 10, offset: 0,
            orderBy: [{ col: 'region', dir: 'asc' }, { col: 'order_no', dir: 'desc' }],
        });
        if (!r.ok)
            throw new Error(r.error.message);
        (0, harness_1.assert)(r.results[0].rowCount >= 2);
    });
});
(0, harness_1.group)('data — fetchTableRows WHERE filter', () => {
    (0, harness_1.test)('simple WHERE', async () => {
        const r = await (0, db_1.fetchTableRows)(cid, 'app', 'users', {
            limit: 100, offset: 0, where: `is_active = true`,
        });
        if (!r.ok)
            throw new Error(r.error.message);
        (0, harness_1.eq)(r.results[0].rowCount, 4);
    });
    (0, harness_1.test)('WHERE with text comparison', async () => {
        const r = await (0, db_1.fetchTableRows)(cid, 'app', 'users', {
            limit: 100, offset: 0, where: `email like '%example.com'`,
        });
        if (!r.ok)
            throw new Error(r.error.message);
        (0, harness_1.assert)(r.results[0].rowCount >= 1);
    });
    (0, harness_1.test)('invalid WHERE returns error', async () => {
        const r = await (0, db_1.fetchTableRows)(cid, 'app', 'users', {
            limit: 100, offset: 0, where: `not_a_column = 1`,
        });
        (0, harness_1.assert)(!r.ok);
    });
});
(0, harness_1.group)('data — fetchTableRows for special-named tables', () => {
    (0, harness_1.test)('Mixed Case."Order Items"', async () => {
        const r = await (0, db_1.fetchTableRows)(cid, 'Mixed Case', 'Order Items', { limit: 10, offset: 0 });
        if (!r.ok)
            throw new Error(r.error.message);
        (0, harness_1.eq)(r.results[0].rowCount, 1);
    });
    (0, harness_1.test)('app."weird-name with space"', async () => {
        const r = await (0, db_1.fetchTableRows)(cid, 'app', 'weird-name with space', { limit: 10, offset: 0 });
        if (!r.ok)
            throw new Error(r.error.message);
        (0, harness_1.eq)(r.results[0].rowCount, 1);
    });
    (0, harness_1.test)('unicode table', async () => {
        const r = await (0, db_1.fetchTableRows)(cid, 'app', 'unicode_тест', { limit: 10, offset: 0 });
        if (!r.ok)
            throw new Error(r.error.message);
        (0, harness_1.eq)(r.results[0].rowCount, 1);
    });
});
(0, harness_1.group)('data — fetchTableRows on empty table', () => {
    (0, harness_1.test)('returns zero rows but columns set', async () => {
        const r = await (0, db_1.fetchTableRows)(cid, 'app', 'empty_table', { limit: 10, offset: 0 });
        if (!r.ok)
            throw new Error(r.error.message);
        (0, harness_1.eq)(r.results[0].rowCount, 0);
        (0, harness_1.assert)(r.results[0].columns.length >= 2);
    });
});
// applyRowChanges suite
(0, harness_1.group)('data — applyRowChanges insert', () => {
    (0, harness_1.test)('clean target table', async () => {
        const r = await (0, db_1.runQuery)(cid, `
      drop table if exists app.crud_test cascade;
      create table app.crud_test (
        id serial primary key,
        name text not null,
        score int default 0,
        meta jsonb default '{}'::jsonb
      );
    `);
        // runQuery in this codebase doesn't split; use script for DDL. But for simplicity just exec each.
        // Actually runQuery sends whole text; PG accepts multi if using simple protocol — but pg uses extended.
        // Just call multiple times.
    });
    (0, harness_1.test)('create crud_test via separate queries', async () => {
        await (0, db_1.runQuery)(cid, 'drop table if exists app.crud_test cascade');
        const r = await (0, db_1.runQuery)(cid, `
      create table app.crud_test (
        id serial primary key,
        name text not null,
        score int default 0,
        meta jsonb default '{}'::jsonb
      )
    `);
        if (!r.ok)
            throw new Error(r.error.message);
    });
    (0, harness_1.test)('insert one row', async () => {
        const res = await (0, db_1.applyRowChanges)(cid, 'app', 'crud_test', [
            { kind: 'insert', values: { name: 'alpha' } },
        ]);
        (0, harness_1.assert)(res.ok, res.error);
        const r = await (0, db_1.runQuery)(cid, 'select count(*) from app.crud_test');
        if (!r.ok)
            throw new Error(r.error.message);
        (0, harness_1.eq)(Number(r.results[0].rows[0][0]), 1);
    });
    for (let i = 0; i < 30; i++) {
        (0, harness_1.test)(`insert iteration ${i}`, async () => {
            const res = await (0, db_1.applyRowChanges)(cid, 'app', 'crud_test', [
                { kind: 'insert', values: { name: `row${i}`, score: i } },
            ]);
            (0, harness_1.assert)(res.ok, res.error);
        });
    }
    (0, harness_1.test)('count after batch inserts', async () => {
        const r = await (0, db_1.runQuery)(cid, 'select count(*) from app.crud_test');
        if (!r.ok)
            throw new Error(r.error.message);
        (0, harness_1.eq)(Number(r.results[0].rows[0][0]), 31);
    });
});
(0, harness_1.group)('data — applyRowChanges update', () => {
    (0, harness_1.test)('update by PK', async () => {
        const a = await (0, db_1.runQuery)(cid, `select id from app.crud_test order by id limit 1`);
        if (!a.ok)
            throw new Error(a.error.message);
        const id = a.results[0].rows[0][0];
        const res = await (0, db_1.applyRowChanges)(cid, 'app', 'crud_test', [
            { kind: 'update', pk: { id }, values: { name: 'updated_alpha' } },
        ]);
        (0, harness_1.assert)(res.ok, res.error);
        const b = await (0, db_1.runQuery)(cid, `select name from app.crud_test where id = ${id}`);
        if (!b.ok)
            throw new Error(b.error.message);
        (0, harness_1.eq)(b.results[0].rows[0][0], 'updated_alpha');
    });
    (0, harness_1.test)('update multiple columns', async () => {
        const a = await (0, db_1.runQuery)(cid, `select id from app.crud_test order by id limit 1`);
        if (!a.ok)
            throw new Error(a.error.message);
        const id = a.results[0].rows[0][0];
        const res = await (0, db_1.applyRowChanges)(cid, 'app', 'crud_test', [
            { kind: 'update', pk: { id }, values: { name: 'multi', score: 99 } },
        ]);
        (0, harness_1.assert)(res.ok, res.error);
    });
    (0, harness_1.test)('update non-existent row succeeds (0 rows affected)', async () => {
        const res = await (0, db_1.applyRowChanges)(cid, 'app', 'crud_test', [
            { kind: 'update', pk: { id: 99999999 }, values: { name: 'nope' } },
        ]);
        (0, harness_1.assert)(res.ok);
    });
    (0, harness_1.test)('update with NULL', async () => {
        const a = await (0, db_1.runQuery)(cid, `select id from app.crud_test order by id limit 1`);
        if (!a.ok)
            throw new Error(a.error.message);
        const id = a.results[0].rows[0][0];
        const res = await (0, db_1.applyRowChanges)(cid, 'app', 'crud_test', [
            { kind: 'update', pk: { id }, values: { meta: null } },
        ]);
        (0, harness_1.assert)(res.ok, res.error);
    });
    (0, harness_1.test)('update with JSON', async () => {
        const a = await (0, db_1.runQuery)(cid, `select id from app.crud_test order by id limit 1`);
        if (!a.ok)
            throw new Error(a.error.message);
        const id = a.results[0].rows[0][0];
        const res = await (0, db_1.applyRowChanges)(cid, 'app', 'crud_test', [
            { kind: 'update', pk: { id }, values: { meta: JSON.stringify({ k: 'v' }) } },
        ]);
        (0, harness_1.assert)(res.ok, res.error);
    });
});
(0, harness_1.group)('data — applyRowChanges delete', () => {
    (0, harness_1.test)('delete single row by PK', async () => {
        const a = await (0, db_1.runQuery)(cid, `select id from app.crud_test order by id desc limit 1`);
        if (!a.ok)
            throw new Error(a.error.message);
        const id = a.results[0].rows[0][0];
        const before = (await (0, db_1.runQuery)(cid, 'select count(*) from app.crud_test'));
        const beforeN = Number(before.results[0].rows[0][0]);
        const res = await (0, db_1.applyRowChanges)(cid, 'app', 'crud_test', [
            { kind: 'delete', pk: { id } },
        ]);
        (0, harness_1.assert)(res.ok, res.error);
        const after = (await (0, db_1.runQuery)(cid, 'select count(*) from app.crud_test'));
        (0, harness_1.eq)(Number(after.results[0].rows[0][0]), beforeN - 1);
    });
});
(0, harness_1.group)('data — applyRowChanges transactional rollback', () => {
    (0, harness_1.test)('insert two rows where second violates constraint — neither persists', async () => {
        const before = (await (0, db_1.runQuery)(cid, 'select count(*) from app.crud_test'));
        const beforeN = Number(before.results[0].rows[0][0]);
        const res = await (0, db_1.applyRowChanges)(cid, 'app', 'crud_test', [
            { kind: 'insert', values: { name: 'ok_row' } },
            { kind: 'insert', values: { name: null } }, // NOT NULL violation
        ]);
        (0, harness_1.assert)(!res.ok);
        const after = (await (0, db_1.runQuery)(cid, 'select count(*) from app.crud_test'));
        (0, harness_1.eq)(Number(after.results[0].rows[0][0]), beforeN);
    });
});
(0, harness_1.group)('data — applyRowChanges composite PK', () => {
    (0, harness_1.test)('update orders by composite PK', async () => {
        const res = await (0, db_1.applyRowChanges)(cid, 'app', 'orders', [
            {
                kind: 'update',
                pk: { region: 'us-east', order_no: 1001 },
                values: { currency: 'usd' },
            },
        ]);
        (0, harness_1.assert)(res.ok, res.error);
        const r = await (0, db_1.runQuery)(cid, `select currency from app.orders where region='us-east' and order_no=1001`);
        if (!r.ok)
            throw new Error(r.error.message);
        (0, harness_1.eq)(r.results[0].rows[0][0], 'usd');
    });
    (0, harness_1.test)('delete order_item via composite PK', async () => {
        const res = await (0, db_1.applyRowChanges)(cid, 'app', 'order_items', [
            { kind: 'delete', pk: { region: 'us-east', order_no: 1002, line_no: 1 } },
        ]);
        (0, harness_1.assert)(res.ok, res.error);
    });
});
(0, harness_1.group)('data — applyRowChanges with no-op edge cases', () => {
    (0, harness_1.test)('empty changes array', async () => {
        const res = await (0, db_1.applyRowChanges)(cid, 'app', 'crud_test', []);
        (0, harness_1.assert)(res.ok);
    });
    (0, harness_1.test)('insert with empty values is no-op', async () => {
        const res = await (0, db_1.applyRowChanges)(cid, 'app', 'crud_test', [{ kind: 'insert', values: {} }]);
        (0, harness_1.assert)(res.ok);
    });
});
(0, harness_1.group)('data — applyRowChanges identity column', () => {
    (0, harness_1.test)('insert into identity-default column without specifying id', async () => {
        const res = await (0, db_1.applyRowChanges)(cid, 'app', 't_identity_by_default', [
            { kind: 'insert', values: { v: 'auto-id' } },
        ]);
        (0, harness_1.assert)(res.ok, res.error);
    });
});
