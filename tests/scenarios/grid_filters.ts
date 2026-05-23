import { group, test, eq } from '../harness';
import { filtersToSql, combineWhere, isNullary, opLabel } from '../../src/shared/grid-filters';
import type { FilterOp } from '../../src/shared/grid-filters';

group('grid-filters — filtersToSql basic ops', () => {
  test('eq', () => eq(filtersToSql([{ column: 'email', op: 'eq', value: 'a@x' }]), `"email" = 'a@x'`));
  test('neq', () => eq(filtersToSql([{ column: 'email', op: 'neq', value: 'a@x' }]), `"email" <> 'a@x'`));
  test('gt', () => eq(filtersToSql([{ column: 'age', op: 'gt', value: '30' }]), `"age" > '30'`));
  test('lte', () => eq(filtersToSql([{ column: 'age', op: 'lte', value: '10' }]), `"age" <= '10'`));
});

group('grid-filters — pattern ops', () => {
  test('like', () => eq(filtersToSql([{ column: 'n', op: 'like', value: '%abc%' }]), `"n"::text LIKE '%abc%'`));
  test('ilike', () => eq(filtersToSql([{ column: 'n', op: 'ilike', value: 'X' }]), `"n"::text ILIKE 'X'`));
  test('not-like', () => eq(filtersToSql([{ column: 'n', op: 'not-like', value: 'X' }]), `"n"::text NOT LIKE 'X'`));
});

group('grid-filters — IN / NOT IN', () => {
  test('IN with commas', () => {
    eq(filtersToSql([{ column: 'id', op: 'in', value: '1, 2, 3' }]), `"id" IN ('1', '2', '3')`);
  });
  test('NOT IN', () => {
    eq(filtersToSql([{ column: 'id', op: 'not-in', value: '1,2' }]), `"id" NOT IN ('1', '2')`);
  });
  test('empty IN dropped', () => {
    eq(filtersToSql([{ column: 'id', op: 'in', value: '   ' }]), '');
  });
});

group('grid-filters — IS NULL / NOT NULL', () => {
  test('is-null', () => eq(filtersToSql([{ column: 'x', op: 'is-null' }]), `"x" IS NULL`));
  test('is-not-null', () => eq(filtersToSql([{ column: 'x', op: 'is-not-null' }]), `"x" IS NOT NULL`));
  test('isNullary', () => {
    eq(isNullary('is-null'), true);
    eq(isNullary('eq'), false);
  });
});

group('grid-filters — quoting safety', () => {
  test('single quotes escaped', () => {
    eq(filtersToSql([{ column: "o'brien", op: 'eq', value: "it's" }]), `"o'brien" = 'it''s'`);
  });
  test('double quote in ident', () => {
    eq(filtersToSql([{ column: 'a"b', op: 'eq', value: 'v' }]), `"a""b" = 'v'`);
  });
});

group('grid-filters — combineWhere', () => {
  test('only filters', () => eq(combineWhere('a = 1', ''), 'a = 1'));
  test('only raw', () => eq(combineWhere('', 'x > 0'), 'x > 0'));
  test('AND-combined', () => eq(combineWhere('a = 1', 'x > 0'), '(a = 1) AND (x > 0)'));
  test('both empty', () => eq(combineWhere('', ''), ''));
});

group('grid-filters — multiple filters AND-joined', () => {
  test('two filters', () => {
    eq(
      filtersToSql([
        { column: 'a', op: 'eq', value: '1' },
        { column: 'b', op: 'ilike', value: 'x%' },
      ]),
      `"a" = '1' AND "b"::text ILIKE 'x%'`,
    );
  });
});

group('grid-filters — empty values skipped', () => {
  test('empty value', () => eq(filtersToSql([{ column: 'a', op: 'eq', value: '' }]), ''));
  test('whitespace value', () => eq(filtersToSql([{ column: 'a', op: 'like', value: '   ' }]), ''));
});

group('grid-filters — opLabel sanity', () => {
  const expected: Partial<Record<FilterOp, string>> = {
    eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=',
    like: 'LIKE', ilike: 'ILIKE', 'not-like': 'NOT LIKE',
    in: 'IN', 'not-in': 'NOT IN',
    'is-null': 'IS NULL', 'is-not-null': 'IS NOT NULL',
    between: 'BETWEEN', 'not-between': 'NOT BETWEEN',
    contains: 'Contains', 'not-contains': 'Not contains',
    prefix: 'Has prefix', suffix: 'Has suffix',
    raw: 'Raw SQL',
  };
  for (const k of Object.keys(expected) as FilterOp[]) {
    test(k, () => eq(opLabel(k), expected[k]!));
  }
});

group('grid-filters — new ops', () => {
  test('contains escapes percent', () => {
    eq(filtersToSql([{ column: 'n', op: 'contains', value: '50% off' }]),
       `"n"::text LIKE '%50\\% off%' ESCAPE '\\'`);
  });
  test('contains-i (case-insensitive)', () => {
    eq(filtersToSql([{ column: 'n', op: 'contains-i', value: 'ABC' }]),
       `"n"::text ILIKE '%ABC%' ESCAPE '\\'`);
  });
  test('prefix', () => {
    eq(filtersToSql([{ column: 'n', op: 'prefix', value: 'foo' }]),
       `"n"::text LIKE 'foo%' ESCAPE '\\'`);
  });
  test('suffix-i', () => {
    eq(filtersToSql([{ column: 'n', op: 'suffix-i', value: '.com' }]),
       `"n"::text ILIKE '%.com' ESCAPE '\\'`);
  });
  test('between', () => {
    eq(filtersToSql([{ column: 'age', op: 'between', value: '18, 65' }]),
       `"age" BETWEEN '18' AND '65'`);
  });
  test('not-between', () => {
    eq(filtersToSql([{ column: 'age', op: 'not-between', value: '0, 17' }]),
       `"age" NOT BETWEEN '0' AND '17'`);
  });
  test('raw passes through', () => {
    eq(filtersToSql([{ column: '', op: 'raw', value: 'updated_at > now() - interval \'7 days\'' }]),
       `(updated_at > now() - interval '7 days')`);
  });
  test('disabled filter is skipped', () => {
    eq(filtersToSql([{ column: 'a', op: 'eq', value: '1', enabled: false }]), '');
  });
  test('any column ORs across provided columns', () => {
    eq(filtersToSql([{ column: '*', op: 'contains-i', value: 'foo' }], ['a', 'b']),
       `("a"::text ILIKE '%foo%' ESCAPE '\\' OR "b"::text ILIKE '%foo%' ESCAPE '\\')`);
  });
});
