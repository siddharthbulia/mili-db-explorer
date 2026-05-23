"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const harness_1 = require("../harness");
const grid_clipboard_1 = require("../../src/shared/grid-clipboard");
function makeResult() {
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
(0, harness_1.group)('grid-clipboard — rowsToTsv', () => {
    const r = makeResult();
    (0, harness_1.test)('header + tab-separated rows', () => {
        (0, harness_1.eq)((0, grid_clipboard_1.rowsToTsv)(r, [0, 1, 2]), 'id\temail\tdata\n1\ta@x.com\t{"x":1}\n2\tb,with,commas\t\n3\t\t[1,2]');
    });
    (0, harness_1.test)('subset', () => {
        (0, harness_1.eq)((0, grid_clipboard_1.rowsToTsv)(r, [0]), 'id\temail\tdata\n1\ta@x.com\t{"x":1}');
    });
    (0, harness_1.test)('empty selection still emits header', () => {
        (0, harness_1.eq)((0, grid_clipboard_1.rowsToTsv)(r, []), 'id\temail\tdata');
    });
    (0, harness_1.test)('strips tabs from cell values', () => {
        const r2 = { ...r, rows: [[1, 'a\tb', null]] };
        (0, harness_1.eq)((0, grid_clipboard_1.rowsToTsv)(r2, [0]), 'id\temail\tdata\n1\ta b\t');
    });
});
(0, harness_1.group)('grid-clipboard — rowsToCsv', () => {
    const r = makeResult();
    (0, harness_1.test)('csv with quoting on comma', () => {
        (0, harness_1.eq)((0, grid_clipboard_1.rowsToCsv)(r, [0, 1]), 'id,email,data\n1,a@x.com,"{""x"":1}"\n2,"b,with,commas",');
    });
});
(0, harness_1.group)('grid-clipboard — rowsToJson', () => {
    const r = makeResult();
    (0, harness_1.test)('produces array of objects with column keys', () => {
        const obj = JSON.parse((0, grid_clipboard_1.rowsToJson)(r, [0, 1]));
        (0, harness_1.eq)(Array.isArray(obj), true);
        (0, harness_1.eq)(obj.length, 2);
        (0, harness_1.eq)(obj[0].id, 1);
        (0, harness_1.eq)(obj[0].email, 'a@x.com');
        (0, harness_1.eq)(obj[1].data, null);
    });
});
(0, harness_1.group)('grid-clipboard — rowsToInserts', () => {
    const r = makeResult();
    (0, harness_1.test)('generates one INSERT per row', () => {
        const out = (0, grid_clipboard_1.rowsToInserts)(r, [0, 1], { schema: 'public', table: 'users' });
        const lines = out.split('\n');
        (0, harness_1.eq)(lines.length, 2);
        (0, harness_1.eq)(lines[0].startsWith('INSERT INTO "public"."users" ("id", "email", "data") VALUES (1, '), true);
        (0, harness_1.eq)(lines[0].endsWith(');'), true);
    });
    (0, harness_1.test)('NULL literal for nulls', () => {
        const out = (0, grid_clipboard_1.rowsToInserts)(r, [1], { schema: 'public', table: 'users' });
        (0, harness_1.eq)(/VALUES \(2, 'b,with,commas', NULL\);$/.test(out), true);
    });
    (0, harness_1.test)('jsonb cast for objects', () => {
        const out = (0, grid_clipboard_1.rowsToInserts)(r, [0], { table: 'users' });
        (0, harness_1.eq)(out.includes('jsonb'), true);
    });
});
(0, harness_1.group)('grid-clipboard — rowsToMarkdown', () => {
    const r = makeResult();
    (0, harness_1.test)('emits a separator row', () => {
        const out = (0, grid_clipboard_1.rowsToMarkdown)(r, [0]);
        (0, harness_1.eq)(out.split('\n')[1], '| --- | --- | --- |');
    });
});
(0, harness_1.group)('grid-clipboard — parsePastedRows', () => {
    (0, harness_1.test)('TSV with 3 columns', () => {
        (0, harness_1.deepEq)((0, grid_clipboard_1.parsePastedRows)('a\tb\tc\nd\te\tf'), [['a', 'b', 'c'], ['d', 'e', 'f']]);
    });
    (0, harness_1.test)('CSV with quoted comma', () => {
        (0, harness_1.deepEq)((0, grid_clipboard_1.parsePastedRows)('a,"b,c",d\n1,2,3'), [['a', 'b,c', 'd'], ['1', '2', '3']]);
    });
    (0, harness_1.test)('trailing newline ignored', () => {
        (0, harness_1.eq)((0, grid_clipboard_1.parsePastedRows)('a\tb\n').length, 1);
    });
});
