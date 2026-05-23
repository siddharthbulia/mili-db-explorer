"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const harness_1 = require("../harness");
const db_1 = require("../../src/main/db");
(0, harness_1.group)('quoteIdent', () => {
    const cases = [
        ['users', '"users"'],
        ['Users', '"Users"'],
        ['order', '"order"'],
        ['select', '"select"'],
        ['weird-name', '"weird-name"'],
        ['weird name', '"weird name"'],
        ['quoted"name', '"quoted""name"'],
        ['', '""'],
        ['a', '"a"'],
        ['тест', '"тест"'],
        ['日本語', '"日本語"'],
        ['  spaced  ', '"  spaced  "'],
        ['"', '""""'],
        ['""', '""""""'],
        ['quote"a"middle', '"quote""a""middle"'],
        [' \t\n', '" \t\n"'],
        ['a.b', '"a.b"'],
        ['a;b', '"a;b"'],
        ['a/*b*/', '"a/*b*/"'],
        ['a--b', '"a--b"'],
    ];
    for (const [input, expected] of cases) {
        (0, harness_1.test)(`quote(${JSON.stringify(input)})`, () => {
            (0, harness_1.eq)((0, db_1.quoteIdent)(input), expected);
        });
    }
});
