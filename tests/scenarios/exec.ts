import { group, test, eq, assert } from '../harness';
import { openConnection, runQuery, runQueryScript } from '../../src/main/db';
import { TEST_CONNECTION } from '../connect';

group('exec — bootstrap connection', () => {
  test('open test connection', async () => {
    const r = await openConnection(TEST_CONNECTION);
    if (!r.ok) throw new Error(r.error);
    assert(r.ok);
  });
});

group('exec — basic SELECT', () => {
  const cases: Array<[string, any]> = [
    ['select 1 as x', 1],
    ['select 1 + 1', 2],
    ['select 2 * 3', 6],
    ['select 10 / 4', 2],
    ['select 10.0 / 4', '2.5000000000000000'],
    ['select null', null],
    ['select true', true],
    ['select false', false],
    [`select 'hello'`, 'hello'],
    [`select 'a' || 'b'`, 'ab'],
    [`select upper('mili')`, 'MILI'],
    [`select length('mili')`, 4],
    [`select array_length(array[1,2,3,4], 1)`, 4],
    [`select coalesce(null, 'x')`, 'x'],
    [`select nullif(1, 1)`, null],
    [`select nullif(1, 2)`, 1],
    [`select abs(-5)`, 5],
    [`select greatest(1, 2, 3)`, 3],
    [`select least(1, 2, 3)`, 1],
    [`select date '2024-01-01'`, new Date('2024-01-01T00:00:00')],
  ];
  for (const [sql, expected] of cases) {
    test(`SELECT: ${sql}`, async () => {
      const r = await runQuery(TEST_CONNECTION.id, sql);
      if (!r.ok) throw new Error(r.error.message);
      eq(r.results[0].rows.length, 1);
      const v = r.results[0].rows[0][0];
      if (expected instanceof Date) {
        assert(v instanceof Date, 'expected Date');
        eq((v as Date).getTime(), (expected as Date).getTime());
      } else {
        eq(v, expected);
      }
    });
  }
});

group('exec — query metadata', () => {
  test('rowCount on SELECT', async () => {
    const r = await runQuery(TEST_CONNECTION.id, 'select * from app.users');
    if (!r.ok) throw new Error(r.error.message);
    eq(r.results[0].rowCount, 5);
  });
  test('column names preserved', async () => {
    const r = await runQuery(TEST_CONNECTION.id, 'select id, email as e from app.users limit 1');
    if (!r.ok) throw new Error(r.error.message);
    eq(r.results[0].columns.length, 2);
    eq(r.results[0].columns[0].name, 'id');
    eq(r.results[0].columns[1].name, 'e');
  });
  test('command field on SELECT', async () => {
    const r = await runQuery(TEST_CONNECTION.id, 'select 1');
    if (!r.ok) throw new Error(r.error.message);
    eq(r.results[0].command, 'SELECT');
  });
  test('duration tracked', async () => {
    const r = await runQuery(TEST_CONNECTION.id, 'select 1');
    if (!r.ok) throw new Error(r.error.message);
    assert(r.results[0].durationMs >= 0);
  });
  test('duplicate column names preserved with rowMode array', async () => {
    const r = await runQuery(TEST_CONNECTION.id, 'select 1 as a, 2 as a, 3 as a');
    if (!r.ok) throw new Error(r.error.message);
    eq(r.results[0].columns.length, 3);
    eq(r.results[0].rows[0].length, 3);
    eq(r.results[0].rows[0][0], 1);
    eq(r.results[0].rows[0][1], 2);
    eq(r.results[0].rows[0][2], 3);
  });
});

group('exec — joins, CTEs, aggregates', () => {
  test('INNER JOIN', async () => {
    const r = await runQuery(TEST_CONNECTION.id, `
      select u.email, p.title
      from app.users u join app.posts p on p.author_id = u.id
      order by p.id`);
    if (!r.ok) throw new Error(r.error.message);
    assert(r.results[0].rowCount >= 5);
  });
  test('LEFT JOIN', async () => {
    const r = await runQuery(TEST_CONNECTION.id, `
      select u.email, p.title
      from app.users u left join app.posts p on p.author_id = u.id
      order by u.id`);
    if (!r.ok) throw new Error(r.error.message);
    assert(r.results[0].rowCount >= 5);
  });
  test('CTE', async () => {
    const r = await runQuery(TEST_CONNECTION.id, `
      with active as (select * from app.users where is_active)
      select count(*) from active`);
    if (!r.ok) throw new Error(r.error.message);
    eq(Number(r.results[0].rows[0][0]), 4);
  });
  test('recursive CTE', async () => {
    const r = await runQuery(TEST_CONNECTION.id, `
      with recursive r(n) as (select 1 union all select n+1 from r where n < 10)
      select count(*) from r`);
    if (!r.ok) throw new Error(r.error.message);
    eq(Number(r.results[0].rows[0][0]), 10);
  });
  test('window function row_number', async () => {
    const r = await runQuery(TEST_CONNECTION.id, `
      select email, row_number() over (order by id) as rn from app.users`);
    if (!r.ok) throw new Error(r.error.message);
    eq(r.results[0].rowCount, 5);
  });
  test('group by + aggregate', async () => {
    const r = await runQuery(TEST_CONNECTION.id, `
      select status, count(*) from app.posts group by status order by status`);
    if (!r.ok) throw new Error(r.error.message);
    assert(r.results[0].rowCount >= 2);
  });
  test('having clause', async () => {
    const r = await runQuery(TEST_CONNECTION.id, `
      select author_id, count(*) c
      from app.posts group by author_id having count(*) > 1`);
    if (!r.ok) throw new Error(r.error.message);
    assert(r.results[0].rowCount >= 1);
  });
});

group('exec — errors are captured cleanly', () => {
  const cases: Array<{ sql: string; codeOrMessage?: string }> = [
    { sql: 'select * from nonexistent_table', codeOrMessage: 'nonexistent_table' },
    { sql: 'select bad syntax here', codeOrMessage: 'syntax' },
    { sql: `select '2024-13-01'::date`, codeOrMessage: 'date' },
    { sql: 'select 1/0' },
    { sql: 'select cast(\'abc\' as int)' },
    { sql: 'insert into app.users (email, display_name) values (null, null)' },
    { sql: 'insert into app.users (email, display_name) values (\'dup@example.com\', \'A\'), (\'dup@example.com\', \'A\')' },
    { sql: 'insert into app.posts (author_id, slug, title) values (9999, \'x\', \'y\')' }, // FK violation
  ];
  for (const c of cases) {
    test(`error: ${c.sql.slice(0, 60)}`, async () => {
      const r = await runQuery(TEST_CONNECTION.id, c.sql);
      assert(!r.ok, 'expected error');
      if (r.ok) return;
      assert(typeof r.error.message === 'string' && r.error.message.length > 0);
      if (c.codeOrMessage) {
        assert(
          r.error.message.toLowerCase().includes(c.codeOrMessage.toLowerCase()) ||
            r.error.code === c.codeOrMessage,
          `expected error to mention "${c.codeOrMessage}", got: ${r.error.message}`
        );
      }
    });
  }
});

group('exec — script (multi-statement)', () => {
  test('two SELECTs produce two results', async () => {
    const r = await runQueryScript(TEST_CONNECTION.id, 'select 1; select 2;');
    if (!r.ok) throw new Error(r.error.message);
    eq(r.results.length, 2);
    eq(r.results[0].rows[0][0], 1);
    eq(r.results[1].rows[0][0], 2);
  });
  test('script with DDL + DML in transaction-like sequence', async () => {
    const r = await runQueryScript(TEST_CONNECTION.id, `
      create table if not exists app._test_tmp(a int);
      insert into app._test_tmp values (1);
      insert into app._test_tmp values (2);
      select count(*) from app._test_tmp;
      drop table app._test_tmp;
    `);
    if (!r.ok) throw new Error(r.error.message);
    const countRes = r.results[r.results.length - 2];
    eq(Number(countRes.rows[0][0]), 2);
  });
  test('script stops on error', async () => {
    const r = await runQueryScript(TEST_CONNECTION.id, `select 1; select * from nope; select 2;`);
    assert(!r.ok);
  });
  test('script with function definition', async () => {
    const r = await runQueryScript(TEST_CONNECTION.id, `
      create or replace function app._t_fn() returns int language plpgsql as $$
      begin
        perform 1;
        return 42;
      end
      $$;
      select app._t_fn();
      drop function app._t_fn();
    `);
    if (!r.ok) throw new Error(r.error.message);
    const callRes = r.results.find((x) => x.rows.length === 1 && x.rows[0][0] === 42);
    assert(callRes, 'should find result of 42');
  });

  // Parameterize: dozens of safe scripts to validate splitter+pg integration
  for (let n = 1; n <= 40; n++) {
    test(`script with ${n} SELECT statements`, async () => {
      const sql = Array.from({ length: n }, (_, i) => `select ${i + 1}`).join(';\n') + ';';
      const r = await runQueryScript(TEST_CONNECTION.id, sql);
      if (!r.ok) throw new Error(r.error.message);
      eq(r.results.length, n);
      for (let i = 0; i < n; i++) eq(r.results[i].rows[0][0], i + 1);
    });
  }
});

group('exec — large results', () => {
  for (const n of [100, 500, 1000, 5000]) {
    test(`generate_series ${n} rows`, async () => {
      const r = await runQuery(TEST_CONNECTION.id, `select g from generate_series(1, ${n}) g`);
      if (!r.ok) throw new Error(r.error.message);
      eq(r.results[0].rowCount, n);
      eq(r.results[0].rows[n - 1][0], n);
    });
  }
});

group('exec — empty result handling', () => {
  test('SELECT zero rows', async () => {
    const r = await runQuery(TEST_CONNECTION.id, `select * from app.empty_table`);
    if (!r.ok) throw new Error(r.error.message);
    eq(r.results[0].rowCount, 0);
    assert(r.results[0].columns.length > 0);
  });
  test('WHERE never matches', async () => {
    const r = await runQuery(TEST_CONNECTION.id, `select * from app.users where 1=0`);
    if (!r.ok) throw new Error(r.error.message);
    eq(r.results[0].rowCount, 0);
  });
});
