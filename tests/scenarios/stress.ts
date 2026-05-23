import { group, test, eq, assert } from '../harness';
import { runQuery, fetchTableRows } from '../../src/main/db';
import { TEST_CONNECTION } from '../connect';

const cid = TEST_CONNECTION.id;

group('stress — concurrent queries', () => {
  test('20 parallel SELECTs', async () => {
    const ps = Array.from({ length: 20 }, (_, i) =>
      runQuery(cid, `select ${i} as i, count(*) from app.big_numbers`)
    );
    const out = await Promise.all(ps);
    for (let i = 0; i < out.length; i++) {
      const r = out[i];
      if (!r.ok) throw new Error(`p${i}: ${r.error.message}`);
      eq(r.results[0].rows[0][0], i);
    }
  });
});

group('stress — big_numbers scan', () => {
  test('full scan returns 5000', async () => {
    const r = await runQuery(cid, `select count(*) from app.big_numbers`);
    if (!r.ok) throw new Error(r.error.message);
    eq(Number(r.results[0].rows[0][0]), 5000);
  });
  test('order by squared desc top 5', async () => {
    const r = await runQuery(cid, `select n from app.big_numbers order by squared desc limit 5`);
    if (!r.ok) throw new Error(r.error.message);
    eq(r.results[0].rowCount, 5);
    eq(r.results[0].rows[0][0], 5000);
  });
});

group('stress — long string', () => {
  for (const len of [100, 1000, 10000, 50000]) {
    test(`length ${len} text round-trip`, async () => {
      const s = 'A'.repeat(len);
      const r = await runQuery(cid, 'select length($1::text), $1::text', [s]);
      if (!r.ok) throw new Error(r.error.message);
      eq(Number(r.results[0].rows[0][0]), len);
      eq((r.results[0].rows[0][1] as string).length, len);
    });
  }
});

group('stress — many columns', () => {
  test('SELECT 100 expression columns', async () => {
    const cols = Array.from({ length: 100 }, (_, i) => `${i} as c${i}`).join(', ');
    const r = await runQuery(cid, `select ${cols}`);
    if (!r.ok) throw new Error(r.error.message);
    eq(r.results[0].columns.length, 100);
    eq(r.results[0].rows[0].length, 100);
    for (let i = 0; i < 100; i++) eq(r.results[0].rows[0][i], i);
  });
});

group('stress — wide row', () => {
  test('200-element jsonb array', async () => {
    const arr = JSON.stringify(Array.from({ length: 200 }, (_, i) => i));
    const r = await runQuery(cid, 'select $1::jsonb', [arr]);
    if (!r.ok) throw new Error(r.error.message);
    assert(Array.isArray(r.results[0].rows[0][0]));
    eq((r.results[0].rows[0][0] as any[]).length, 200);
  });
});

group('stress — repeated open/close-like operations', () => {
  for (let i = 0; i < 50; i++) {
    test(`select iteration ${i}`, async () => {
      const r = await runQuery(cid, `select ${i}::int`);
      if (!r.ok) throw new Error(r.error.message);
      eq(r.results[0].rows[0][0], i);
    });
  }
});
