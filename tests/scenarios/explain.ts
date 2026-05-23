import { group, test, assert, eq } from '../harness';
import { explainAnalyze } from '../../src/main/db';
import { TEST_CONNECTION } from '../connect';

const cid = TEST_CONNECTION.id;

group('explain — EXPLAIN ANALYZE', () => {
  test('simple SELECT returns planning + execution time', async () => {
    const r = await explainAnalyze(cid, 'select 1');
    assert(r.executionMs >= 0, 'execution time should be present');
    assert(r.planningMs >= 0, 'planning time should be present');
    eq(typeof r.planJson, 'object');
    eq(r.totalMs, r.planningMs + r.executionMs);
  });
  test('table scan returns plan with node type', async () => {
    const r = await explainAnalyze(cid, 'select count(*) from app.big_numbers');
    assert(r.planJson?.Plan?.['Node Type'], 'plan should include Node Type');
  });
  test('strips trailing semicolon', async () => {
    const r = await explainAnalyze(cid, 'select 1;');
    assert(r.executionMs >= 0);
  });
});
