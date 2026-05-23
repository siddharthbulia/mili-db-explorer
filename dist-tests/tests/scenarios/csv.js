"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const harness_1 = require("../harness");
const csv_1 = require("../../src/shared/csv");
(0, harness_1.group)('csv — escape primitives', () => {
    const cases = [
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
        (0, harness_1.test)(`escape ${JSON.stringify(input)}`, () => {
            (0, harness_1.eq)((0, csv_1.csvEscape)(input), expected);
        });
    }
});
(0, harness_1.group)('csv — escape objects/arrays', () => {
    // For objects/arrays we JSON.stringify first, then CSV-escape.
    // The JSON form contains " (so must be CSV-quoted) and possibly ,.
    const cases = [
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
        (0, harness_1.test)(`obj ${JSON.stringify(input)}`, () => {
            (0, harness_1.eq)((0, csv_1.csvEscape)(input), expected);
        });
    }
});
(0, harness_1.group)('csv — full table', () => {
    (0, harness_1.test)('empty result', () => {
        const csv = (0, csv_1.toCsv)({ columns: [], rows: [] });
        (0, harness_1.eq)(csv, '');
    });
    (0, harness_1.test)('header only', () => {
        const csv = (0, csv_1.toCsv)({ columns: [{ name: 'a' }, { name: 'b' }], rows: [] });
        (0, harness_1.eq)(csv, 'a,b');
    });
    (0, harness_1.test)('single row', () => {
        const csv = (0, csv_1.toCsv)({ columns: [{ name: 'a' }, { name: 'b' }], rows: [[1, 'x']] });
        (0, harness_1.eq)(csv, 'a,b\n1,x');
    });
    (0, harness_1.test)('null cells', () => {
        const csv = (0, csv_1.toCsv)({ columns: [{ name: 'a' }, { name: 'b' }], rows: [[null, undefined]] });
        (0, harness_1.eq)(csv, 'a,b\n,');
    });
    (0, harness_1.test)('escapes in headers', () => {
        const csv = (0, csv_1.toCsv)({ columns: [{ name: 'a,b' }, { name: 'c"d' }], rows: [] });
        (0, harness_1.eq)(csv, '"a,b","c""d"');
    });
    (0, harness_1.test)('JSON column values', () => {
        // 2 rows, 1 column each → newline-separated, not comma-separated.
        const csv = (0, csv_1.toCsv)({ columns: [{ name: 'data' }], rows: [[{ x: 1 }], [[1, 2]]] });
        (0, harness_1.eq)(csv, 'data\n"{""x"":1}"\n"[1,2]"');
    });
    // Many parameterized round-trips
    for (let n = 1; n <= 50; n++) {
        (0, harness_1.test)(`${n} rows numeric`, () => {
            const rows = Array.from({ length: n }, (_, i) => [i, i * 2]);
            const csv = (0, csv_1.toCsv)({ columns: [{ name: 'a' }, { name: 'b' }], rows });
            const lines = csv.split('\n');
            (0, harness_1.eq)(lines.length, n + 1);
        });
    }
});
(0, harness_1.group)('csv — rowsToObjects', () => {
    (0, harness_1.test)('basic conversion', () => {
        const objs = (0, csv_1.rowsToObjects)({ columns: [{ name: 'a' }, { name: 'b' }], rows: [[1, 'x'], [2, 'y']] });
        (0, harness_1.eq)(objs.length, 2);
        (0, harness_1.eq)(objs[0].a, 1);
        (0, harness_1.eq)(objs[0].b, 'x');
        (0, harness_1.eq)(objs[1].a, 2);
        (0, harness_1.eq)(objs[1].b, 'y');
    });
    (0, harness_1.test)('preserves nulls', () => {
        const objs = (0, csv_1.rowsToObjects)({ columns: [{ name: 'a' }], rows: [[null]] });
        (0, harness_1.eq)(objs[0].a, null);
    });
    (0, harness_1.test)('empty', () => {
        const objs = (0, csv_1.rowsToObjects)({ columns: [], rows: [] });
        (0, harness_1.eq)(objs.length, 0);
    });
});
(0, harness_1.group)('csv — toJson', () => {
    (0, harness_1.test)('produces valid JSON', () => {
        const j = (0, csv_1.toJson)({ columns: [{ name: 'a' }], rows: [[1], [2]] });
        const parsed = JSON.parse(j);
        (0, harness_1.eq)(parsed.length, 2);
        (0, harness_1.eq)(parsed[0].a, 1);
    });
    for (let n = 1; n <= 30; n++) {
        (0, harness_1.test)(`${n} rows produce parseable JSON`, () => {
            const rows = Array.from({ length: n }, (_, i) => [i]);
            const j = (0, csv_1.toJson)({ columns: [{ name: 'x' }], rows });
            const parsed = JSON.parse(j);
            (0, harness_1.eq)(parsed.length, n);
        });
    }
});
