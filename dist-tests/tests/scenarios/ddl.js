"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const harness_1 = require("../harness");
const db_1 = require("../../src/main/db");
const connect_1 = require("../connect");
const cid = connect_1.TEST_CONNECTION.id;
(0, harness_1.group)('ddl — listDatabases', () => {
    (0, harness_1.test)('returns at least the test db', async () => {
        const dbs = await (0, db_1.listDatabases)(cid);
        (0, harness_1.assert)(dbs.includes('mili_db_explorer_test'));
    });
    (0, harness_1.test)('does not include templates', async () => {
        const dbs = await (0, db_1.listDatabases)(cid);
        (0, harness_1.assert)(!dbs.includes('template0'));
        (0, harness_1.assert)(!dbs.includes('template1'));
    });
    (0, harness_1.test)('returns sorted list', async () => {
        const dbs = await (0, db_1.listDatabases)(cid);
        const sorted = [...dbs].sort();
        for (let i = 0; i < dbs.length; i++)
            (0, harness_1.eq)(dbs[i], sorted[i]);
    });
});
(0, harness_1.group)('ddl — listSchemas', () => {
    (0, harness_1.test)('returns schemas', async () => {
        const sch = await (0, db_1.listSchemas)(cid);
        const names = sch.map((s) => s.schema);
        (0, harness_1.assert)(names.includes('public'));
        (0, harness_1.assert)(names.includes('app'));
        (0, harness_1.assert)(names.includes('reporting'));
        (0, harness_1.assert)(names.includes('Mixed Case'));
    });
    (0, harness_1.test)('excludes system schemas', async () => {
        const sch = await (0, db_1.listSchemas)(cid);
        const names = sch.map((s) => s.schema);
        (0, harness_1.assert)(!names.includes('pg_catalog'));
        (0, harness_1.assert)(!names.includes('information_schema'));
        (0, harness_1.assert)(!names.includes('pg_toast'));
    });
    (0, harness_1.test)('app schema has many tables', async () => {
        const sch = await (0, db_1.listSchemas)(cid);
        const app = sch.find((s) => s.schema === 'app');
        (0, harness_1.assert)(app.tables.length >= 10, `expected >=10 tables, got ${app.tables.length}`);
    });
    (0, harness_1.test)('app schema has functions', async () => {
        const sch = await (0, db_1.listSchemas)(cid);
        const app = sch.find((s) => s.schema === 'app');
        const fnames = app.functions.map((f) => f.name);
        (0, harness_1.assert)(fnames.includes('add'));
        (0, harness_1.assert)(fnames.includes('greet'));
        (0, harness_1.assert)(fnames.includes('tally'));
    });
    (0, harness_1.test)('app schema has sequences', async () => {
        const sch = await (0, db_1.listSchemas)(cid);
        const app = sch.find((s) => s.schema === 'app');
        const snames = app.sequences.map((s) => s.name);
        (0, harness_1.assert)(snames.includes('invoice_no_seq'));
    });
    (0, harness_1.test)('app schema has views', async () => {
        const sch = await (0, db_1.listSchemas)(cid);
        const app = sch.find((s) => s.schema === 'app');
        const vnames = app.views.map((v) => v.name);
        (0, harness_1.assert)(vnames.includes('v_active_users'));
        (0, harness_1.assert)(vnames.includes('v_user_post_counts'));
    });
    (0, harness_1.test)('reporting schema has matview', async () => {
        const sch = await (0, db_1.listSchemas)(cid);
        const rep = sch.find((s) => s.schema === 'reporting');
        const m = rep.matViews.map((v) => v.name);
        (0, harness_1.assert)(m.includes('user_stats'));
    });
    (0, harness_1.test)('"Mixed Case" schema visible', async () => {
        const sch = await (0, db_1.listSchemas)(cid);
        const ms = sch.find((s) => s.schema === 'Mixed Case');
        (0, harness_1.assert)(ms);
        (0, harness_1.assert)(ms.tables.some((t) => t.name === 'Order Items'));
    });
    (0, harness_1.test)('table comments returned', async () => {
        const sch = await (0, db_1.listSchemas)(cid);
        const app = sch.find((s) => s.schema === 'app');
        const users = app.tables.find((t) => t.name === 'users');
        (0, harness_1.eq)(users.comment, 'Application users');
    });
    (0, harness_1.test)('estimated rows are numbers', async () => {
        const sch = await (0, db_1.listSchemas)(cid);
        const app = sch.find((s) => s.schema === 'app');
        for (const t of app.tables) {
            (0, harness_1.assert)(typeof t.estimatedRows === 'number');
        }
    });
    (0, harness_1.test)('table sizes are strings', async () => {
        const sch = await (0, db_1.listSchemas)(cid);
        const app = sch.find((s) => s.schema === 'app');
        for (const t of app.tables) {
            (0, harness_1.assert)(typeof t.size === 'string' && t.size.length > 0);
        }
    });
});
(0, harness_1.group)('ddl — getTableDetails users', () => {
    (0, harness_1.test)('basic shape', async () => {
        const d = await (0, db_1.getTableDetails)(cid, 'app', 'users');
        (0, harness_1.eq)(d.schema, 'app');
        (0, harness_1.eq)(d.name, 'users');
        (0, harness_1.eq)(d.kind, 'r');
    });
    (0, harness_1.test)('columns count and order', async () => {
        const d = await (0, db_1.getTableDetails)(cid, 'app', 'users');
        (0, harness_1.assert)(d.columns.length >= 11, `${d.columns.length}`);
        const positions = d.columns.map((c) => c.position);
        for (let i = 1; i < positions.length; i++) {
            (0, harness_1.assert)(positions[i] > positions[i - 1]);
        }
    });
    (0, harness_1.test)('id is PK and identity-style', async () => {
        const d = await (0, db_1.getTableDetails)(cid, 'app', 'users');
        const id = d.columns.find((c) => c.name === 'id');
        (0, harness_1.assert)(id.isPrimaryKey);
    });
    (0, harness_1.test)('email has unique constraint', async () => {
        const d = await (0, db_1.getTableDetails)(cid, 'app', 'users');
        const hasEmailUnique = d.constraints.some((c) => c.type === 'u' && c.definition.toLowerCase().includes('email'));
        (0, harness_1.assert)(hasEmailUnique);
    });
    (0, harness_1.test)('age has check constraint', async () => {
        const d = await (0, db_1.getTableDetails)(cid, 'app', 'users');
        const checks = d.constraints.filter((c) => c.type === 'c');
        (0, harness_1.assert)(checks.length >= 1);
    });
    (0, harness_1.test)('role has domain default', async () => {
        const d = await (0, db_1.getTableDetails)(cid, 'app', 'users');
        const role = d.columns.find((c) => c.name === 'role');
        (0, harness_1.assert)(role.default && role.default.includes('viewer'));
    });
    (0, harness_1.test)('email is not nullable', async () => {
        const d = await (0, db_1.getTableDetails)(cid, 'app', 'users');
        const e = d.columns.find((c) => c.name === 'email');
        (0, harness_1.eq)(e.nullable, false);
    });
    (0, harness_1.test)('bio is nullable', async () => {
        const d = await (0, db_1.getTableDetails)(cid, 'app', 'users');
        const e = d.columns.find((c) => c.name === 'bio');
        (0, harness_1.eq)(e.nullable, true);
    });
    (0, harness_1.test)('email full type is domain', async () => {
        const d = await (0, db_1.getTableDetails)(cid, 'app', 'users');
        const e = d.columns.find((c) => c.name === 'email');
        (0, harness_1.assert)(e.fullType.toLowerCase().includes('email'));
    });
    (0, harness_1.test)('jsonb default present', async () => {
        const d = await (0, db_1.getTableDetails)(cid, 'app', 'users');
        const m = d.columns.find((c) => c.name === 'metadata');
        (0, harness_1.assert)(m.default && m.default.includes('jsonb'));
    });
    (0, harness_1.test)('indexes include partial', async () => {
        const d = await (0, db_1.getTableDetails)(cid, 'app', 'users');
        (0, harness_1.assert)(d.indexes.some((i) => i.name === 'users_active_idx'));
    });
    (0, harness_1.test)('indexes include gin', async () => {
        const d = await (0, db_1.getTableDetails)(cid, 'app', 'users');
        (0, harness_1.assert)(d.indexes.some((i) => i.definition.toLowerCase().includes('gin')));
    });
    (0, harness_1.test)('column comment exposed', async () => {
        const d = await (0, db_1.getTableDetails)(cid, 'app', 'users');
        const e = d.columns.find((c) => c.name === 'email');
        (0, harness_1.eq)(e.comment, 'RFC-5321 email address');
    });
});
(0, harness_1.group)('ddl — getTableDetails posts', () => {
    (0, harness_1.test)('FK on author_id', async () => {
        const d = await (0, db_1.getTableDetails)(cid, 'app', 'posts');
        const fks = d.foreignKeys;
        (0, harness_1.assert)(fks.length >= 1);
        const fk = fks.find((f) => f.columns.includes('author_id'));
        (0, harness_1.eq)(fk.refSchema, 'app');
        (0, harness_1.eq)(fk.refTable, 'users');
        (0, harness_1.eq)(fk.refColumns[0], 'id');
        (0, harness_1.eq)(fk.onDelete, 'CASCADE');
        (0, harness_1.eq)(fk.onUpdate, 'RESTRICT');
    });
    (0, harness_1.test)('composite unique (author_id, slug)', async () => {
        const d = await (0, db_1.getTableDetails)(cid, 'app', 'posts');
        const u = d.constraints.find((c) => c.type === 'u' && c.definition.includes('author_id'));
        (0, harness_1.assert)(u);
    });
    (0, harness_1.test)('check constraint on status', async () => {
        const d = await (0, db_1.getTableDetails)(cid, 'app', 'posts');
        const c = d.constraints.find((c) => c.type === 'c' && c.definition.includes('status'));
        (0, harness_1.assert)(c);
    });
    (0, harness_1.test)('generated column tsv', async () => {
        const d = await (0, db_1.getTableDetails)(cid, 'app', 'posts');
        const tsv = d.columns.find((c) => c.name === 'tsv');
        (0, harness_1.assert)(tsv);
    });
});
(0, harness_1.group)('ddl — composite PK orders', () => {
    (0, harness_1.test)('orders has composite PK', async () => {
        const d = await (0, db_1.getTableDetails)(cid, 'app', 'orders');
        const pkCols = d.columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
        (0, harness_1.assert)(pkCols.includes('region'));
        (0, harness_1.assert)(pkCols.includes('order_no'));
    });
    (0, harness_1.test)('order_items composite FK', async () => {
        const d = await (0, db_1.getTableDetails)(cid, 'app', 'order_items');
        const fk = d.foreignKeys.find((f) => f.columns.includes('region') && f.columns.includes('order_no'));
        (0, harness_1.assert)(fk, 'expected composite FK to orders');
        (0, harness_1.eq)(fk.refTable, 'orders');
    });
});
(0, harness_1.group)('ddl — kitchen_sink columns reflect every type', () => {
    const expected = [
        'c_bool', 'c_smallint', 'c_int', 'c_bigint', 'c_real', 'c_double', 'c_numeric',
        'c_text', 'c_varchar', 'c_char', 'c_bytea',
        'c_json', 'c_jsonb', 'c_uuid',
        'c_date', 'c_time', 'c_timetz', 'c_timestamp', 'c_timestamptz', 'c_interval',
        'c_inet', 'c_cidr', 'c_macaddr', 'c_money', 'c_xml',
        'c_int_arr', 'c_text_arr', 'c_jsonb_arr',
        'c_int4range', 'c_tstzrange', 'c_point',
    ];
    for (const colName of expected) {
        (0, harness_1.test)(`column ${colName} present`, async () => {
            const d = await (0, db_1.getTableDetails)(cid, 'app', 'kitchen_sink');
            const c = d.columns.find((x) => x.name === colName);
            (0, harness_1.assert)(c, `missing column ${colName}`);
            (0, harness_1.assert)(c.fullType.length > 0);
        });
    }
});
(0, harness_1.group)('ddl — partitioned tables', () => {
    (0, harness_1.test)('measurements kind is partitioned', async () => {
        const d = await (0, db_1.getTableDetails)(cid, 'app', 'measurements');
        (0, harness_1.eq)(d.kind, 'p');
    });
    (0, harness_1.test)('events_by_kind kind is partitioned', async () => {
        const d = await (0, db_1.getTableDetails)(cid, 'app', 'events_by_kind');
        (0, harness_1.eq)(d.kind, 'p');
    });
});
(0, harness_1.group)('ddl — quoted/unicode names', () => {
    (0, harness_1.test)('"Order Items" details', async () => {
        const d = await (0, db_1.getTableDetails)(cid, 'Mixed Case', 'Order Items');
        (0, harness_1.eq)(d.name, 'Order Items');
        (0, harness_1.assert)(d.columns.some((c) => c.name === 'select'));
        (0, harness_1.assert)(d.columns.some((c) => c.name === 'Mixed Col'));
    });
    (0, harness_1.test)('"weird-name with space" details', async () => {
        const d = await (0, db_1.getTableDetails)(cid, 'app', 'weird-name with space');
        (0, harness_1.eq)(d.name, 'weird-name with space');
        (0, harness_1.assert)(d.columns.some((c) => c.name === 'weird col'));
    });
    (0, harness_1.test)('unicode table details', async () => {
        const d = await (0, db_1.getTableDetails)(cid, 'app', 'unicode_тест');
        (0, harness_1.assert)(d.columns.some((c) => c.name === 'имя'));
    });
});
(0, harness_1.group)('ddl — view definitions', () => {
    (0, harness_1.test)('v_active_users definition', async () => {
        const def = await (0, db_1.getViewDefinition)(cid, 'app', 'v_active_users');
        (0, harness_1.assert)(def.toLowerCase().includes('users'));
        (0, harness_1.assert)(def.toLowerCase().includes('is_active'));
    });
    (0, harness_1.test)('v_user_post_counts definition', async () => {
        const def = await (0, db_1.getViewDefinition)(cid, 'app', 'v_user_post_counts');
        (0, harness_1.assert)(def.toLowerCase().includes('count'));
    });
});
(0, harness_1.group)('ddl — function definitions', () => {
    (0, harness_1.test)('add function', async () => {
        const def = await (0, db_1.getFunctionDefinition)(cid, 'app', 'add');
        (0, harness_1.assert)(def.toLowerCase().includes('add'));
        (0, harness_1.assert)(def.toLowerCase().includes('integer') || def.toLowerCase().includes('int'));
    });
    (0, harness_1.test)('greet function', async () => {
        const def = await (0, db_1.getFunctionDefinition)(cid, 'app', 'greet');
        (0, harness_1.assert)(def.toLowerCase().includes('hello'));
    });
    (0, harness_1.test)('tally function', async () => {
        const def = await (0, db_1.getFunctionDefinition)(cid, 'app', 'tally');
        (0, harness_1.assert)(def.toLowerCase().includes('unnest'));
    });
});
(0, harness_1.group)('ddl — triggers', () => {
    (0, harness_1.test)('users has updated_at trigger', async () => {
        const d = await (0, db_1.getTableDetails)(cid, 'app', 'users');
        (0, harness_1.assert)(d.triggers.length >= 1);
        (0, harness_1.assert)(d.triggers.some((t) => t.name === 'users_bump_updated_at'));
    });
});
(0, harness_1.group)('ddl — error for missing table', () => {
    (0, harness_1.test)('throws on unknown table', async () => {
        let thrown = false;
        try {
            await (0, db_1.getTableDetails)(cid, 'app', '__no_such_table__');
        }
        catch {
            thrown = true;
        }
        (0, harness_1.assert)(thrown);
    });
});
