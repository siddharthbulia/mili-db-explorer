import { group, test, eq } from '../harness';
import { quoteIdent } from '../../src/main/db';

group('quoteIdent', () => {
  const cases: Array<[string, string]> = [
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
    test(`quote(${JSON.stringify(input)})`, () => {
      eq(quoteIdent(input), expected);
    });
  }
});
