"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const harness_1 = require("../harness");
const grid_filters_1 = require("../../src/shared/grid-filters");
(0, harness_1.group)('grid-filters — filtersToSql basic ops', () => {
    (0, harness_1.test)('eq', () => (0, harness_1.eq)((0, grid_filters_1.filtersToSql)([{ column: 'email', op: 'eq', value: 'a@x' }]), `"email" = 'a@x'`));
    (0, harness_1.test)('neq', () => (0, harness_1.eq)((0, grid_filters_1.filtersToSql)([{ column: 'email', op: 'neq', value: 'a@x' }]), `"email" <> 'a@x'`));
    (0, harness_1.test)('gt', () => (0, harness_1.eq)((0, grid_filters_1.filtersToSql)([{ column: 'age', op: 'gt', value: '30' }]), `"age" > '30'`));
    (0, harness_1.test)('lte', () => (0, harness_1.eq)((0, grid_filters_1.filtersToSql)([{ column: 'age', op: 'lte', value: '10' }]), `"age" <= '10'`));
});
(0, harness_1.group)('grid-filters — pattern ops', () => {
    (0, harness_1.test)('like', () => (0, harness_1.eq)((0, grid_filters_1.filtersToSql)([{ column: 'n', op: 'like', value: '%abc%' }]), `"n"::text LIKE '%abc%'`));
    (0, harness_1.test)('ilike', () => (0, harness_1.eq)((0, grid_filters_1.filtersToSql)([{ column: 'n', op: 'ilike', value: 'X' }]), `"n"::text ILIKE 'X'`));
    (0, harness_1.test)('not-like', () => (0, harness_1.eq)((0, grid_filters_1.filtersToSql)([{ column: 'n', op: 'not-like', value: 'X' }]), `"n"::text NOT LIKE 'X'`));
});
(0, harness_1.group)('grid-filters — IN / NOT IN', () => {
    (0, harness_1.test)('IN with commas', () => {
        (0, harness_1.eq)((0, grid_filters_1.filtersToSql)([{ column: 'id', op: 'in', value: '1, 2, 3' }]), `"id" IN ('1', '2', '3')`);
    });
    (0, harness_1.test)('NOT IN', () => {
        (0, harness_1.eq)((0, grid_filters_1.filtersToSql)([{ column: 'id', op: 'not-in', value: '1,2' }]), `"id" NOT IN ('1', '2')`);
    });
    (0, harness_1.test)('empty IN dropped', () => {
        (0, harness_1.eq)((0, grid_filters_1.filtersToSql)([{ column: 'id', op: 'in', value: '   ' }]), '');
    });
});
(0, harness_1.group)('grid-filters — IS NULL / NOT NULL', () => {
    (0, harness_1.test)('is-null', () => (0, harness_1.eq)((0, grid_filters_1.filtersToSql)([{ column: 'x', op: 'is-null' }]), `"x" IS NULL`));
    (0, harness_1.test)('is-not-null', () => (0, harness_1.eq)((0, grid_filters_1.filtersToSql)([{ column: 'x', op: 'is-not-null' }]), `"x" IS NOT NULL`));
    (0, harness_1.test)('isNullary', () => {
        (0, harness_1.eq)((0, grid_filters_1.isNullary)('is-null'), true);
        (0, harness_1.eq)((0, grid_filters_1.isNullary)('eq'), false);
    });
});
(0, harness_1.group)('grid-filters — quoting safety', () => {
    (0, harness_1.test)('single quotes escaped', () => {
        (0, harness_1.eq)((0, grid_filters_1.filtersToSql)([{ column: "o'brien", op: 'eq', value: "it's" }]), `"o'brien" = 'it''s'`);
    });
    (0, harness_1.test)('double quote in ident', () => {
        (0, harness_1.eq)((0, grid_filters_1.filtersToSql)([{ column: 'a"b', op: 'eq', value: 'v' }]), `"a""b" = 'v'`);
    });
});
(0, harness_1.group)('grid-filters — combineWhere', () => {
    (0, harness_1.test)('only filters', () => (0, harness_1.eq)((0, grid_filters_1.combineWhere)('a = 1', ''), 'a = 1'));
    (0, harness_1.test)('only raw', () => (0, harness_1.eq)((0, grid_filters_1.combineWhere)('', 'x > 0'), 'x > 0'));
    (0, harness_1.test)('AND-combined', () => (0, harness_1.eq)((0, grid_filters_1.combineWhere)('a = 1', 'x > 0'), '(a = 1) AND (x > 0)'));
    (0, harness_1.test)('both empty', () => (0, harness_1.eq)((0, grid_filters_1.combineWhere)('', ''), ''));
});
(0, harness_1.group)('grid-filters — multiple filters AND-joined', () => {
    (0, harness_1.test)('two filters', () => {
        (0, harness_1.eq)((0, grid_filters_1.filtersToSql)([
            { column: 'a', op: 'eq', value: '1' },
            { column: 'b', op: 'ilike', value: 'x%' },
        ]), `"a" = '1' AND "b"::text ILIKE 'x%'`);
    });
});
(0, harness_1.group)('grid-filters — empty values skipped', () => {
    (0, harness_1.test)('empty value', () => (0, harness_1.eq)((0, grid_filters_1.filtersToSql)([{ column: 'a', op: 'eq', value: '' }]), ''));
    (0, harness_1.test)('whitespace value', () => (0, harness_1.eq)((0, grid_filters_1.filtersToSql)([{ column: 'a', op: 'like', value: '   ' }]), ''));
});
(0, harness_1.group)('grid-filters — opLabel sanity', () => {
    const expected = {
        eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=',
        like: 'LIKE', ilike: 'ILIKE', 'not-like': 'NOT LIKE',
        in: 'IN', 'not-in': 'NOT IN',
        'is-null': 'IS NULL', 'is-not-null': 'IS NOT NULL',
        between: 'BETWEEN', 'not-between': 'NOT BETWEEN',
        contains: 'Contains', 'not-contains': 'Not contains',
        prefix: 'Has prefix', suffix: 'Has suffix',
        raw: 'Raw SQL',
    };
    for (const k of Object.keys(expected)) {
        (0, harness_1.test)(k, () => (0, harness_1.eq)((0, grid_filters_1.opLabel)(k), expected[k]));
    }
});
(0, harness_1.group)('grid-filters — new ops', () => {
    (0, harness_1.test)('contains escapes percent', () => {
        (0, harness_1.eq)((0, grid_filters_1.filtersToSql)([{ column: 'n', op: 'contains', value: '50% off' }]), `"n"::text LIKE '%50\\% off%' ESCAPE '\\'`);
    });
    (0, harness_1.test)('contains-i (case-insensitive)', () => {
        (0, harness_1.eq)((0, grid_filters_1.filtersToSql)([{ column: 'n', op: 'contains-i', value: 'ABC' }]), `"n"::text ILIKE '%ABC%' ESCAPE '\\'`);
    });
    (0, harness_1.test)('prefix', () => {
        (0, harness_1.eq)((0, grid_filters_1.filtersToSql)([{ column: 'n', op: 'prefix', value: 'foo' }]), `"n"::text LIKE 'foo%' ESCAPE '\\'`);
    });
    (0, harness_1.test)('suffix-i', () => {
        (0, harness_1.eq)((0, grid_filters_1.filtersToSql)([{ column: 'n', op: 'suffix-i', value: '.com' }]), `"n"::text ILIKE '%.com' ESCAPE '\\'`);
    });
    (0, harness_1.test)('between', () => {
        (0, harness_1.eq)((0, grid_filters_1.filtersToSql)([{ column: 'age', op: 'between', value: '18, 65' }]), `"age" BETWEEN '18' AND '65'`);
    });
    (0, harness_1.test)('not-between', () => {
        (0, harness_1.eq)((0, grid_filters_1.filtersToSql)([{ column: 'age', op: 'not-between', value: '0, 17' }]), `"age" NOT BETWEEN '0' AND '17'`);
    });
    (0, harness_1.test)('raw passes through', () => {
        (0, harness_1.eq)((0, grid_filters_1.filtersToSql)([{ column: '', op: 'raw', value: 'updated_at > now() - interval \'7 days\'' }]), `(updated_at > now() - interval '7 days')`);
    });
    (0, harness_1.test)('disabled filter is skipped', () => {
        (0, harness_1.eq)((0, grid_filters_1.filtersToSql)([{ column: 'a', op: 'eq', value: '1', enabled: false }]), '');
    });
    (0, harness_1.test)('any column ORs across provided columns', () => {
        (0, harness_1.eq)((0, grid_filters_1.filtersToSql)([{ column: '*', op: 'contains-i', value: 'foo' }], ['a', 'b']), `("a"::text ILIKE '%foo%' ESCAPE '\\' OR "b"::text ILIKE '%foo%' ESCAPE '\\')`);
    });
});
