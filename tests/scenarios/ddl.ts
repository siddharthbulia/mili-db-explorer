import { group, test, eq, assert, includes } from '../harness';
import { listSchemas, listDatabases, getTableDetails, getViewDefinition, getFunctionDefinition } from '../../src/main/db';
import { TEST_CONNECTION } from '../connect';

const cid = TEST_CONNECTION.id;

group('ddl — listDatabases', () => {
  test('returns at least the test db', async () => {
    const dbs = await listDatabases(cid);
    assert(dbs.includes('mili_db_explorer_test'));
  });
  test('does not include templates', async () => {
    const dbs = await listDatabases(cid);
    assert(!dbs.includes('template0'));
    assert(!dbs.includes('template1'));
  });
  test('returns sorted list', async () => {
    const dbs = await listDatabases(cid);
    const sorted = [...dbs].sort();
    for (let i = 0; i < dbs.length; i++) eq(dbs[i], sorted[i]);
  });
});

group('ddl — listSchemas', () => {
  test('returns schemas', async () => {
    const sch = await listSchemas(cid);
    const names = sch.map((s) => s.schema);
    assert(names.includes('public'));
    assert(names.includes('app'));
    assert(names.includes('reporting'));
    assert(names.includes('Mixed Case'));
  });
  test('excludes system schemas', async () => {
    const sch = await listSchemas(cid);
    const names = sch.map((s) => s.schema);
    assert(!names.includes('pg_catalog'));
    assert(!names.includes('information_schema'));
    assert(!names.includes('pg_toast'));
  });
  test('app schema has many tables', async () => {
    const sch = await listSchemas(cid);
    const app = sch.find((s) => s.schema === 'app')!;
    assert(app.tables.length >= 10, `expected >=10 tables, got ${app.tables.length}`);
  });
  test('app schema has functions', async () => {
    const sch = await listSchemas(cid);
    const app = sch.find((s) => s.schema === 'app')!;
    const fnames = app.functions.map((f) => f.name);
    assert(fnames.includes('add'));
    assert(fnames.includes('greet'));
    assert(fnames.includes('tally'));
  });
  test('app schema has sequences', async () => {
    const sch = await listSchemas(cid);
    const app = sch.find((s) => s.schema === 'app')!;
    const snames = app.sequences.map((s) => s.name);
    assert(snames.includes('invoice_no_seq'));
  });
  test('app schema has views', async () => {
    const sch = await listSchemas(cid);
    const app = sch.find((s) => s.schema === 'app')!;
    const vnames = app.views.map((v) => v.name);
    assert(vnames.includes('v_active_users'));
    assert(vnames.includes('v_user_post_counts'));
  });
  test('reporting schema has matview', async () => {
    const sch = await listSchemas(cid);
    const rep = sch.find((s) => s.schema === 'reporting')!;
    const m = rep.matViews.map((v) => v.name);
    assert(m.includes('user_stats'));
  });
  test('"Mixed Case" schema visible', async () => {
    const sch = await listSchemas(cid);
    const ms = sch.find((s) => s.schema === 'Mixed Case')!;
    assert(ms);
    assert(ms.tables.some((t) => t.name === 'Order Items'));
  });
  test('table comments returned', async () => {
    const sch = await listSchemas(cid);
    const app = sch.find((s) => s.schema === 'app')!;
    const users = app.tables.find((t) => t.name === 'users')!;
    eq(users.comment, 'Application users');
  });
  test('estimated rows are numbers', async () => {
    const sch = await listSchemas(cid);
    const app = sch.find((s) => s.schema === 'app')!;
    for (const t of app.tables) {
      assert(typeof t.estimatedRows === 'number');
    }
  });
  test('table sizes are strings', async () => {
    const sch = await listSchemas(cid);
    const app = sch.find((s) => s.schema === 'app')!;
    for (const t of app.tables) {
      assert(typeof t.size === 'string' && t.size.length > 0);
    }
  });
});

group('ddl — getTableDetails users', () => {
  test('basic shape', async () => {
    const d = await getTableDetails(cid, 'app', 'users');
    eq(d.schema, 'app');
    eq(d.name, 'users');
    eq(d.kind, 'r');
  });
  test('columns count and order', async () => {
    const d = await getTableDetails(cid, 'app', 'users');
    assert(d.columns.length >= 11, `${d.columns.length}`);
    const positions = d.columns.map((c) => c.position);
    for (let i = 1; i < positions.length; i++) {
      assert(positions[i] > positions[i - 1]);
    }
  });
  test('id is PK and identity-style', async () => {
    const d = await getTableDetails(cid, 'app', 'users');
    const id = d.columns.find((c) => c.name === 'id')!;
    assert(id.isPrimaryKey);
  });
  test('email has unique constraint', async () => {
    const d = await getTableDetails(cid, 'app', 'users');
    const hasEmailUnique = d.constraints.some(
      (c) => c.type === 'u' && c.definition.toLowerCase().includes('email')
    );
    assert(hasEmailUnique);
  });
  test('age has check constraint', async () => {
    const d = await getTableDetails(cid, 'app', 'users');
    const checks = d.constraints.filter((c) => c.type === 'c');
    assert(checks.length >= 1);
  });
  test('role has domain default', async () => {
    const d = await getTableDetails(cid, 'app', 'users');
    const role = d.columns.find((c) => c.name === 'role')!;
    assert(role.default && role.default.includes('viewer'));
  });
  test('email is not nullable', async () => {
    const d = await getTableDetails(cid, 'app', 'users');
    const e = d.columns.find((c) => c.name === 'email')!;
    eq(e.nullable, false);
  });
  test('bio is nullable', async () => {
    const d = await getTableDetails(cid, 'app', 'users');
    const e = d.columns.find((c) => c.name === 'bio')!;
    eq(e.nullable, true);
  });
  test('email full type is domain', async () => {
    const d = await getTableDetails(cid, 'app', 'users');
    const e = d.columns.find((c) => c.name === 'email')!;
    assert(e.fullType.toLowerCase().includes('email'));
  });
  test('jsonb default present', async () => {
    const d = await getTableDetails(cid, 'app', 'users');
    const m = d.columns.find((c) => c.name === 'metadata')!;
    assert(m.default && m.default.includes('jsonb'));
  });
  test('indexes include partial', async () => {
    const d = await getTableDetails(cid, 'app', 'users');
    assert(d.indexes.some((i) => i.name === 'users_active_idx'));
  });
  test('indexes include gin', async () => {
    const d = await getTableDetails(cid, 'app', 'users');
    assert(d.indexes.some((i) => i.definition.toLowerCase().includes('gin')));
  });
  test('column comment exposed', async () => {
    const d = await getTableDetails(cid, 'app', 'users');
    const e = d.columns.find((c) => c.name === 'email')!;
    eq(e.comment, 'RFC-5321 email address');
  });
});

group('ddl — getTableDetails posts', () => {
  test('FK on author_id', async () => {
    const d = await getTableDetails(cid, 'app', 'posts');
    const fks = d.foreignKeys;
    assert(fks.length >= 1);
    const fk = fks.find((f) => f.columns.includes('author_id'))!;
    eq(fk.refSchema, 'app');
    eq(fk.refTable, 'users');
    eq(fk.refColumns[0], 'id');
    eq(fk.onDelete, 'CASCADE');
    eq(fk.onUpdate, 'RESTRICT');
  });
  test('composite unique (author_id, slug)', async () => {
    const d = await getTableDetails(cid, 'app', 'posts');
    const u = d.constraints.find((c) => c.type === 'u' && c.definition.includes('author_id'));
    assert(u);
  });
  test('check constraint on status', async () => {
    const d = await getTableDetails(cid, 'app', 'posts');
    const c = d.constraints.find((c) => c.type === 'c' && c.definition.includes('status'));
    assert(c);
  });
  test('generated column tsv', async () => {
    const d = await getTableDetails(cid, 'app', 'posts');
    const tsv = d.columns.find((c) => c.name === 'tsv')!;
    assert(tsv);
  });
});

group('ddl — composite PK orders', () => {
  test('orders has composite PK', async () => {
    const d = await getTableDetails(cid, 'app', 'orders');
    const pkCols = d.columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
    assert(pkCols.includes('region'));
    assert(pkCols.includes('order_no'));
  });
  test('order_items composite FK', async () => {
    const d = await getTableDetails(cid, 'app', 'order_items');
    const fk = d.foreignKeys.find((f) => f.columns.includes('region') && f.columns.includes('order_no'));
    assert(fk, 'expected composite FK to orders');
    eq(fk!.refTable, 'orders');
  });
});

group('ddl — kitchen_sink columns reflect every type', () => {
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
    test(`column ${colName} present`, async () => {
      const d = await getTableDetails(cid, 'app', 'kitchen_sink');
      const c = d.columns.find((x) => x.name === colName);
      assert(c, `missing column ${colName}`);
      assert(c!.fullType.length > 0);
    });
  }
});

group('ddl — partitioned tables', () => {
  test('measurements kind is partitioned', async () => {
    const d = await getTableDetails(cid, 'app', 'measurements');
    eq(d.kind, 'p');
  });
  test('events_by_kind kind is partitioned', async () => {
    const d = await getTableDetails(cid, 'app', 'events_by_kind');
    eq(d.kind, 'p');
  });
});

group('ddl — quoted/unicode names', () => {
  test('"Order Items" details', async () => {
    const d = await getTableDetails(cid, 'Mixed Case', 'Order Items');
    eq(d.name, 'Order Items');
    assert(d.columns.some((c) => c.name === 'select'));
    assert(d.columns.some((c) => c.name === 'Mixed Col'));
  });
  test('"weird-name with space" details', async () => {
    const d = await getTableDetails(cid, 'app', 'weird-name with space');
    eq(d.name, 'weird-name with space');
    assert(d.columns.some((c) => c.name === 'weird col'));
  });
  test('unicode table details', async () => {
    const d = await getTableDetails(cid, 'app', 'unicode_тест');
    assert(d.columns.some((c) => c.name === 'имя'));
  });
});

group('ddl — view definitions', () => {
  test('v_active_users definition', async () => {
    const def = await getViewDefinition(cid, 'app', 'v_active_users');
    assert(def.toLowerCase().includes('users'));
    assert(def.toLowerCase().includes('is_active'));
  });
  test('v_user_post_counts definition', async () => {
    const def = await getViewDefinition(cid, 'app', 'v_user_post_counts');
    assert(def.toLowerCase().includes('count'));
  });
});

group('ddl — function definitions', () => {
  test('add function', async () => {
    const def = await getFunctionDefinition(cid, 'app', 'add');
    assert(def.toLowerCase().includes('add'));
    assert(def.toLowerCase().includes('integer') || def.toLowerCase().includes('int'));
  });
  test('greet function', async () => {
    const def = await getFunctionDefinition(cid, 'app', 'greet');
    assert(def.toLowerCase().includes('hello'));
  });
  test('tally function', async () => {
    const def = await getFunctionDefinition(cid, 'app', 'tally');
    assert(def.toLowerCase().includes('unnest'));
  });
});

group('ddl — triggers', () => {
  test('users has updated_at trigger', async () => {
    const d = await getTableDetails(cid, 'app', 'users');
    assert(d.triggers.length >= 1);
    assert(d.triggers.some((t) => t.name === 'users_bump_updated_at'));
  });
});

group('ddl — error for missing table', () => {
  test('throws on unknown table', async () => {
    let thrown = false;
    try { await getTableDetails(cid, 'app', '__no_such_table__'); }
    catch { thrown = true; }
    assert(thrown);
  });
});
