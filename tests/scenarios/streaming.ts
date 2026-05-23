import { group, test, eq, assert } from '../harness';
import { streamQuery } from '../../src/main/db';
import { TEST_CONNECTION } from '../connect';

const cid = TEST_CONNECTION.id;

group('streaming — cursor-based batched delivery', () => {
  test('streams 5000-row table in chunks', async () => {
    const chunks: number[] = [];
    let cols = 0;
    const r = await streamQuery(
      cid,
      'select n, squared from app.big_numbers order by n',
      (c) => { chunks.push(c.rows.length); cols = c.columns.length; },
      { chunkSize: 500 }
    );
    eq(r.totalRows, 5000);
    eq(cols, 2);
    eq(chunks.length, 10);
    for (let i = 0; i < 10; i++) eq(chunks[i], 500);
  });

  test('preserves order of rows', async () => {
    const collected: number[] = [];
    await streamQuery(
      cid,
      'select n from app.big_numbers order by n',
      (c) => { for (const row of c.rows) collected.push(Number(row[0])); },
      { chunkSize: 1000 }
    );
    eq(collected.length, 5000);
    eq(collected[0], 1);
    eq(collected[4999], 5000);
  });

  test('chunk index is monotonic', async () => {
    let last = -1;
    await streamQuery(
      cid,
      'select n from app.big_numbers order by n limit 2500',
      (c) => { eq(c.index, last + 1); last = c.index; },
      { chunkSize: 500 }
    );
    eq(last, 4);
  });

  test('totalSoFar grows correctly', async () => {
    let lastTotal = 0;
    await streamQuery(
      cid,
      'select n from app.big_numbers order by n limit 1500',
      (c) => {
        assert(c.totalSoFar > lastTotal, 'totalSoFar must be increasing');
        lastTotal = c.totalSoFar;
      },
      { chunkSize: 500 }
    );
    eq(lastTotal, 1500);
  });

  test('empty result triggers no chunks', async () => {
    let count = 0;
    const r = await streamQuery(
      cid,
      'select n from app.big_numbers where n = -1',
      () => { count++; },
      { chunkSize: 500 }
    );
    eq(count, 0);
    eq(r.totalRows, 0);
  });

  test('clamps chunkSize bounds', async () => {
    // Below 50 clamps to 50.
    let chunks: number[] = [];
    const r = await streamQuery(
      cid,
      'select n from app.big_numbers order by n limit 100',
      (c) => { chunks.push(c.rows.length); },
      { chunkSize: 10 }
    );
    // 100 rows with min-clamped 50/batch -> two batches of 50.
    eq(r.totalRows, 100);
    eq(chunks.length, 2);
  });

  test('strips trailing semicolon', async () => {
    const r = await streamQuery(
      cid, 'select 1;', () => {}, { chunkSize: 1000 }
    );
    eq(r.totalRows, 1);
  });

  test('throws on invalid SQL but releases client', async () => {
    let threw = false;
    try {
      await streamQuery(cid, 'select * from not_a_table_xyz', () => {});
    } catch {
      threw = true;
    }
    eq(threw, true);
    // Subsequent normal query should succeed (client was released).
    const r = await streamQuery(cid, 'select 1', () => {});
    eq(r.totalRows, 1);
  });
});
