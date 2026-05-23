import { group, test, eq } from '../harness';
import { applyAutoLimit } from '../../src/shared/auto-limit';

function inj(sql: string, limit = 1000) {
  const r = applyAutoLimit(sql, limit);
  return { injected: r.injected, sql: r.sql.replace(/\s+/g, ' ').trim() };
}

group('auto-limit — applies', () => {
  test('plain SELECT', () => {
    const r = inj('select * from t');
    eq(r.injected, true);
    eq(r.sql, 'select * from t limit 1000');
  });
  test('SELECT with trailing semi', () => {
    const r = inj('select * from t;');
    eq(r.injected, true);
    eq(r.sql, 'select * from t limit 1000;');
  });
  test('SELECT with order by', () => {
    const r = inj('select * from t order by id desc');
    eq(r.injected, true);
    eq(r.sql, 'select * from t order by id desc limit 1000');
  });
  test('CTE / WITH', () => {
    const r = inj('with x as (select 1) select * from x');
    eq(r.injected, true);
  });
  test('SELECT with where', () => {
    const r = inj("select * from t where name = 'limit'");
    eq(r.injected, true);
    eq(r.sql, "select * from t where name = 'limit' limit 1000");
  });
});

group('auto-limit — skips', () => {
  test('already has LIMIT', () => {
    eq(applyAutoLimit('select * from t limit 50', 1000).injected, false);
  });
  test('LIMIT inside subquery counts as existing', () => {
    eq(applyAutoLimit('select * from (select 1 limit 1) x', 1000).injected, false);
  });
  test('INSERT', () => {
    eq(applyAutoLimit('insert into t (a) values (1)', 1000).injected, false);
  });
  test('UPDATE', () => {
    eq(applyAutoLimit('update t set a = 1', 1000).injected, false);
  });
  test('DELETE', () => {
    eq(applyAutoLimit('delete from t', 1000).injected, false);
  });
  test('multiple statements', () => {
    eq(applyAutoLimit('select 1; select 2', 1000).injected, false);
  });
  test('SELECT INTO', () => {
    eq(applyAutoLimit('select * into newt from t', 1000).injected, false);
  });
  test('empty', () => {
    eq(applyAutoLimit('', 1000).injected, false);
    eq(applyAutoLimit('   ', 1000).injected, false);
  });
  test('limit=0 disables', () => {
    eq(applyAutoLimit('select 1', 0).injected, false);
  });
  test('comments do not confuse parser', () => {
    const r = applyAutoLimit('-- limit 1\nselect * from t', 1000);
    eq(r.injected, true);
  });
  test('string with limit literal', () => {
    const r = applyAutoLimit("select 'limit 1' as s", 1000);
    eq(r.injected, true);
  });
  test('string with semicolon literal', () => {
    const r = applyAutoLimit("select ';' as s", 1000);
    eq(r.injected, true);
  });
});

group('auto-limit — limit value', () => {
  test('uses custom limit', () => {
    eq(applyAutoLimit('select 1', 7).sql.trim(), 'select 1 limit 7');
  });
  test('floors fractional limit', () => {
    eq(applyAutoLimit('select 1', 12.9).sql.trim(), 'select 1 limit 12');
  });
});
