import { group, test, eq, deepEq, assert } from '../harness';
import { runQuery } from '../../src/main/db';
import { TEST_CONNECTION } from '../connect';

const cid = TEST_CONNECTION.id;

async function val(sql: string): Promise<any> {
  const r = await runQuery(cid, sql);
  if (!r.ok) throw new Error(r.error.message);
  return r.results[0].rows[0][0];
}

group('types — boolean', () => {
  test('true', async () => eq(await val('select true'), true));
  test('false', async () => eq(await val('select false'), false));
  test('null bool', async () => eq(await val('select null::boolean'), null));
  test('cast from int 1', async () => eq(await val('select 1::int::boolean'), true));
  test('cast from int 0', async () => eq(await val('select 0::int::boolean'), false));
});

group('types — integers', () => {
  test('int4', async () => eq(await val('select 12345::int'), 12345));
  test('int4 negative', async () => eq(await val('select -12345::int'), -12345));
  test('int4 max', async () => eq(await val('select 2147483647::int'), 2147483647));
  test('int4 min', async () => eq(await val('select (-2147483648)::int'), -2147483648));
  test('int2', async () => eq(await val('select 32767::int2'), 32767));
  test('int8 small', async () => eq(await val('select 42::bigint'), '42'));
  test('int8 large', async () => eq(await val('select 9223372036854775807::bigint'), '9223372036854775807'));
  for (let i = -10; i <= 10; i++) {
    test(`int4 round trip ${i}`, async () => eq(Number(await val(`select ${i}::int`)), i));
  }
});

group('types — floats / numerics', () => {
  test('real', async () => eq(await val('select 3.5::real'), 3.5));
  test('double', async () => eq(await val('select 2.718281828::double precision'), 2.718281828));
  test('numeric whole', async () => eq(await val('select 100::numeric'), '100'));
  test('numeric decimal', async () => eq(await val('select 123.45::numeric(5,2)'), '123.45'));
  test('numeric high precision', async () => eq(await val('select 1.234567890123456789::numeric'), '1.234567890123456789'));
  test('NaN double', async () => {
    const v = await val(`select 'NaN'::double precision`);
    assert(Number.isNaN(v));
  });
  test('Infinity double', async () => {
    const v = await val(`select 'Infinity'::double precision`);
    eq(v, Infinity);
  });
});

group('types — strings', () => {
  const samples = [
    '',
    'hello',
    'with spaces',
    'with "double" quotes',
    "with 'single' quotes",
    'line1\nline2',
    'tab\there',
    'unicode: αβγ',
    'emoji: 🎉🚀',
    '日本語',
    'a'.repeat(1000),
    'null in middle\x00end',  // raw nulls not allowed in PG strings — special-case skip
  ];
  for (const s of samples) {
    test(`text round trip: ${JSON.stringify(s).slice(0, 40)}`, async () => {
      if (s.includes('\x00')) return; // pg rejects null bytes
      const r = await runQuery(cid, 'select $1::text', [s]);
      if (!r.ok) throw new Error(r.error.message);
      eq(r.results[0].rows[0][0], s);
    });
  }
});

group('types — bytea', () => {
  test('hex literal', async () => {
    const v = await val(`select '\\xdeadbeef'::bytea`);
    assert(Buffer.isBuffer(v));
    eq((v as Buffer).toString('hex'), 'deadbeef');
  });
  test('empty', async () => {
    const v = await val(`select ''::bytea`);
    eq((v as Buffer).length, 0);
  });
  for (let i = 0; i < 10; i++) {
    test(`random bytea ${i}`, async () => {
      const buf = Buffer.from([i, i + 1, i + 2, 255 - i]);
      const r = await runQuery(cid, 'select $1::bytea', [buf]);
      if (!r.ok) throw new Error(r.error.message);
      eq((r.results[0].rows[0][0] as Buffer).toString('hex'), buf.toString('hex'));
    });
  }
});

group('types — json / jsonb', () => {
  const samples: any[] = [
    null,
    1,
    'string',
    true,
    [],
    [1, 2, 3],
    {},
    { a: 1 },
    { nested: { x: [1, 'two', false] } },
    { unicode: '日本語' },
  ];
  for (const s of samples) {
    test(`jsonb round trip: ${JSON.stringify(s)}`, async () => {
      const r = await runQuery(cid, 'select $1::jsonb', [JSON.stringify(s)]);
      if (!r.ok) throw new Error(r.error.message);
      deepEq(r.results[0].rows[0][0], s);
    });
    test(`json round trip: ${JSON.stringify(s)}`, async () => {
      const r = await runQuery(cid, 'select $1::json', [JSON.stringify(s)]);
      if (!r.ok) throw new Error(r.error.message);
      deepEq(r.results[0].rows[0][0], s);
    });
  }
});

group('types — uuid', () => {
  test('fixed value', async () => {
    eq(await val(`select '11111111-1111-1111-1111-111111111111'::uuid`), '11111111-1111-1111-1111-111111111111');
  });
  test('gen_random_uuid', async () => {
    const v = await val('select gen_random_uuid()');
    assert(/^[0-9a-f-]{36}$/.test(v));
  });
});

group('types — date/time', () => {
  test('date', async () => {
    const v = await val(`select '2024-06-15'::date`);
    assert(v instanceof Date);
  });
  test('timestamp', async () => {
    const v = await val(`select '2024-06-15 12:34:56'::timestamp`);
    assert(v instanceof Date);
  });
  test('timestamptz', async () => {
    const v = await val(`select '2024-06-15 12:34:56+00'::timestamptz`);
    assert(v instanceof Date);
    eq((v as Date).getUTCFullYear(), 2024);
    eq((v as Date).getUTCMonth(), 5);
    eq((v as Date).getUTCDate(), 15);
    eq((v as Date).getUTCHours(), 12);
  });
  test('interval', async () => {
    const v = await val(`select interval '1 day 2 hours'`);
    assert(v != null);
  });
  for (const d of ['2000-01-01', '2024-12-31', '0001-01-01', '9999-12-31']) {
    test(`date ${d}`, async () => {
      const v = await val(`select '${d}'::date`);
      assert(v instanceof Date);
    });
  }
});

group('types — arrays', () => {
  test('int[]', async () => {
    const v = await val(`select array[1,2,3]`);
    deepEq(v, [1, 2, 3]);
  });
  test('text[]', async () => {
    const v = await val(`select array['a','b','c']`);
    deepEq(v, ['a', 'b', 'c']);
  });
  test('empty array', async () => {
    const v = await val(`select '{}'::int[]`);
    deepEq(v, []);
  });
  test('nested array', async () => {
    const v = await val(`select array[array[1,2],array[3,4]]`);
    deepEq(v, [[1, 2], [3, 4]]);
  });
  test('array with nulls', async () => {
    const v = await val(`select array[1, null, 3]::int[]`);
    deepEq(v, [1, null, 3]);
  });
  for (let n = 1; n <= 20; n++) {
    test(`int[] of size ${n}`, async () => {
      const arr = Array.from({ length: n }, (_, i) => i + 1);
      const v = await val(`select array[${arr.join(',')}]::int[]`);
      deepEq(v, arr);
    });
  }
});

group('types — network', () => {
  test('inet ipv4', async () => eq(await val(`select '192.168.1.1'::inet`), '192.168.1.1'));
  test('inet ipv6', async () => eq(await val(`select '::1'::inet`), '::1'));
  test('cidr', async () => eq(await val(`select '10.0.0.0/8'::cidr`), '10.0.0.0/8'));
  test('macaddr', async () => eq(await val(`select '08:00:2b:01:02:03'::macaddr`), '08:00:2b:01:02:03'));
});

group('types — ranges and other', () => {
  test('int4range', async () => {
    const v = await val(`select '[1,10)'::int4range`);
    assert(v != null);
  });
  test('point', async () => {
    const v = await val(`select point(1.5, 2.5)`);
    deepEq(v, { x: 1.5, y: 2.5 });
  });
  test('xml', async () => {
    const v = await val(`select '<root><x>1</x></root>'::xml`);
    assert(typeof v === 'string' && v.includes('<root>'));
  });
});

group('types — kitchen_sink table read', () => {
  test('select kitchen_sink row 1', async () => {
    const r = await runQuery(cid, 'select * from app.kitchen_sink where id=1');
    if (!r.ok) throw new Error(r.error.message);
    eq(r.results[0].rowCount, 1);
  });
  test('select kitchen_sink row 2 (all nulls)', async () => {
    const r = await runQuery(cid, 'select * from app.kitchen_sink where id=2');
    if (!r.ok) throw new Error(r.error.message);
    eq(r.results[0].rowCount, 1);
    // every value other than id should be null
    for (let i = 1; i < r.results[0].rows[0].length; i++) {
      eq(r.results[0].rows[0][i], null);
    }
  });
  test('select kitchen_sink row 3 (extreme values)', async () => {
    const r = await runQuery(cid, 'select * from app.kitchen_sink where id=3');
    if (!r.ok) throw new Error(r.error.message);
    eq(r.results[0].rowCount, 1);
  });
});
