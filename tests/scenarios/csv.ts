import { group, test, eq } from '../harness';
import { csvEscape, toCsv, toJson, rowsToObjects } from '../../src/shared/csv';

group('csv — escape primitives', () => {
  const cases: Array<[any, string]> = [
    [null, ''],
    [undefined, ''],
    ['', ''],
    ['hello', 'hello'],
    [0, '0'],
    [1, '1'],
    [-1, '-1'],
    [3.14, '3.14'],
    [true, 'true'],
    [false, 'false'],
    ['simple,string', '"simple,string"'],
    ['"quoted"', '"""quoted"""'],
    ['line1\nline2', '"line1\nline2"'],
    ['carriage\rreturn', '"carriage\rreturn"'],
    ['tab\there', 'tab\there'],
    [' leading space', ' leading space'],
    ['trailing space ', 'trailing space '],
    ['"', '""""'],
    [',', '","'],
    ['"\n,', '"""\n,"'],
    ['nothing special', 'nothing special'],
  ];
  for (const [input, expected] of cases) {
    test(`escape ${JSON.stringify(input)}`, () => {
      eq(csvEscape(input), expected);
    });
  }
});

group('csv — escape objects/arrays', () => {
  // For objects/arrays we JSON.stringify first, then CSV-escape.
  // The JSON form contains " (so must be CSV-quoted) and possibly ,.
  const cases: Array<[any, string]> = [
    [{}, '{}'],
    [[], '[]'],
    [{ a: 1 }, '"{""a"":1}"'],
    [[1, 2, 3], '"[1,2,3]"'],
    [{ a: 'b,c' }, '"{""a"":""b,c""}"'],
    // 'a\nb' becomes JSON "a\\nb" (no real newline in the JSON-encoded form)
    [{ nested: { x: 'a\nb' } }, '"{""nested"":{""x"":""a\\nb""}}"'],
    [[null, null], '"[null,null]"'],
  ];
  for (const [input, expected] of cases) {
    test(`obj ${JSON.stringify(input)}`, () => {
      eq(csvEscape(input), expected);
    });
  }
});

group('csv — full table', () => {
  test('empty result', () => {
    const csv = toCsv({ columns: [], rows: [] });
    eq(csv, '');
  });
  test('header only', () => {
    const csv = toCsv({ columns: [{ name: 'a' }, { name: 'b' }], rows: [] });
    eq(csv, 'a,b');
  });
  test('single row', () => {
    const csv = toCsv({ columns: [{ name: 'a' }, { name: 'b' }], rows: [[1, 'x']] });
    eq(csv, 'a,b\n1,x');
  });
  test('null cells', () => {
    const csv = toCsv({ columns: [{ name: 'a' }, { name: 'b' }], rows: [[null, undefined]] });
    eq(csv, 'a,b\n,');
  });
  test('escapes in headers', () => {
    const csv = toCsv({ columns: [{ name: 'a,b' }, { name: 'c"d' }], rows: [] });
    eq(csv, '"a,b","c""d"');
  });
  test('JSON column values', () => {
    // 2 rows, 1 column each → newline-separated, not comma-separated.
    const csv = toCsv({ columns: [{ name: 'data' }], rows: [[{ x: 1 }], [[1, 2]]] });
    eq(csv, 'data\n"{""x"":1}"\n"[1,2]"');
  });

  // Many parameterized round-trips
  for (let n = 1; n <= 50; n++) {
    test(`${n} rows numeric`, () => {
      const rows = Array.from({ length: n }, (_, i) => [i, i * 2]);
      const csv = toCsv({ columns: [{ name: 'a' }, { name: 'b' }], rows });
      const lines = csv.split('\n');
      eq(lines.length, n + 1);
    });
  }
});

group('csv — rowsToObjects', () => {
  test('basic conversion', () => {
    const objs = rowsToObjects({ columns: [{ name: 'a' }, { name: 'b' }], rows: [[1, 'x'], [2, 'y']] });
    eq(objs.length, 2);
    eq(objs[0].a, 1); eq(objs[0].b, 'x');
    eq(objs[1].a, 2); eq(objs[1].b, 'y');
  });
  test('preserves nulls', () => {
    const objs = rowsToObjects({ columns: [{ name: 'a' }], rows: [[null]] });
    eq(objs[0].a, null);
  });
  test('empty', () => {
    const objs = rowsToObjects({ columns: [], rows: [] });
    eq(objs.length, 0);
  });
});

group('csv — toJson', () => {
  test('produces valid JSON', () => {
    const j = toJson({ columns: [{ name: 'a' }], rows: [[1], [2]] });
    const parsed = JSON.parse(j);
    eq(parsed.length, 2);
    eq(parsed[0].a, 1);
  });
  for (let n = 1; n <= 30; n++) {
    test(`${n} rows produce parseable JSON`, () => {
      const rows = Array.from({ length: n }, (_, i) => [i]);
      const j = toJson({ columns: [{ name: 'x' }], rows });
      const parsed = JSON.parse(j);
      eq(parsed.length, n);
    });
  }
});
