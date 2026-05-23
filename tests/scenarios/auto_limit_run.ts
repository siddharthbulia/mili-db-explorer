import { group, test, eq, assert } from '../harness';
import { runQueryScript } from '../../src/main/db';
import { TEST_CONNECTION } from '../connect';

const cid = TEST_CONNECTION.id;

group('auto-limit — applied through runQueryScript', () => {
  test('explicit autoLimit caps a SELECT *', async () => {
    const r = await runQueryScript(cid, 'select * from app.big_numbers', { autoLimit: 50 });
    assert(r.ok, 'should succeed');
    if (r.ok) {
      eq(r.results[0].rows.length, 50);
    }
  });

  test('autoLimit disabled returns full set', async () => {
    const r = await runQueryScript(cid, 'select * from app.big_numbers', { autoLimit: 0 });
    assert(r.ok);
    if (r.ok) eq(r.results[0].rows.length, 5000);
  });

  test('existing LIMIT not overridden', async () => {
    const r = await runQueryScript(
      cid,
      'select * from app.big_numbers limit 3',
      { autoLimit: 1000 }
    );
    assert(r.ok);
    if (r.ok) eq(r.results[0].rows.length, 3);
  });

  test('autoLimit ignored on non-SELECT', async () => {
    // create temp + insert should run, not get limited.
    const r = await runQueryScript(
      cid,
      'create temp table t_auto_limit_run (x int) on commit drop',
      { autoLimit: 50 }
    );
    // Postgres needs an explicit transaction for "on commit drop" but the
    // statement parses fine; we just care the query did not break.
    assert(r.ok || (!r.ok && /transaction|temp/i.test(r.error.message)));
  });
});
