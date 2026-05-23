import { group, test, eq, deepEq } from '../harness';
import {
  rowsToTsv, rowsToCsv, rowsToJson, rowsToInserts, rowsToMarkdown,
  parsePastedRows,
} from '../../src/shared/grid-clipboard';
import type { QueryResult } from '../../src/shared/types';

function makeResult(): QueryResult {
  return {
    columns: [
      { name: 'id', dataType: 'int' },
      { name: 'email', dataType: 'text' },
      { name: 'data', dataType: 'jsonb' },
    ],
    rows: [
      [1, 'a@x.com', { x: 1 }],
      [2, 'b,with,commas', null],
      [3, null, [1, 2]],
    ],
    rowCount: 3,
    durationMs: 0,
  };
}

group('grid-clipboard — rowsToTsv', () => {
  const r = makeResult();
  test('header + tab-separated rows', () => {
    eq(rowsToTsv(r, [0, 1, 2]), 'id\temail\tdata\n1\ta@x.com\t{"x":1}\n2\tb,with,commas\t\n3\t\t[1,2]');
  });
  test('subset', () => {
    eq(rowsToTsv(r, [0]), 'id\temail\tdata\n1\ta@x.com\t{"x":1}');
  });
  test('empty selection still emits header', () => {
    eq(rowsToTsv(r, []), 'id\temail\tdata');
  });
  test('strips tabs from cell values', () => {
    const r2: QueryResult = { ...r, rows: [[1, 'a\tb', null]] };
    eq(rowsToTsv(r2, [0]), 'id\temail\tdata\n1\ta b\t');
  });
});

group('grid-clipboard — rowsToCsv', () => {
  const r = makeResult();
  test('csv with quoting on comma', () => {
    eq(
      rowsToCsv(r, [0, 1]),
      'id,email,data\n1,a@x.com,"{""x"":1}"\n2,"b,with,commas",',
    );
  });
});

group('grid-clipboard — rowsToJson', () => {
  const r = makeResult();
  test('produces array of objects with column keys', () => {
    const obj = JSON.parse(rowsToJson(r, [0, 1]));
    eq(Array.isArray(obj), true);
    eq(obj.length, 2);
    eq(obj[0].id, 1);
    eq(obj[0].email, 'a@x.com');
    eq(obj[1].data, null);
  });
});

group('grid-clipboard — rowsToInserts', () => {
  const r = makeResult();
  test('generates one INSERT per row', () => {
    const out = rowsToInserts(r, [0, 1], { schema: 'public', table: 'users' });
    const lines = out.split('\n');
    eq(lines.length, 2);
    eq(lines[0].startsWith('INSERT INTO "public"."users" ("id", "email", "data") VALUES (1, '), true);
    eq(lines[0].endsWith(');'), true);
  });
  test('NULL literal for nulls', () => {
    const out = rowsToInserts(r, [1], { schema: 'public', table: 'users' });
    eq(/VALUES \(2, 'b,with,commas', NULL\);$/.test(out), true);
  });
  test('jsonb cast for objects', () => {
    const out = rowsToInserts(r, [0], { table: 'users' });
    eq(out.includes('jsonb'), true);
  });
});

group('grid-clipboard — rowsToMarkdown', () => {
  const r = makeResult();
  test('emits a separator row', () => {
    const out = rowsToMarkdown(r, [0]);
    eq(out.split('\n')[1], '| --- | --- | --- |');
  });
});

group('grid-clipboard — parsePastedRows', () => {
  test('TSV with 3 columns', () => {
    deepEq(parsePastedRows('a\tb\tc\nd\te\tf'), [['a', 'b', 'c'], ['d', 'e', 'f']]);
  });
  test('CSV with quoted comma', () => {
    deepEq(parsePastedRows('a,"b,c",d\n1,2,3'), [['a', 'b,c', 'd'], ['1', '2', '3']]);
  });
  test('trailing newline ignored', () => {
    eq(parsePastedRows('a\tb\n').length, 1);
  });
});
