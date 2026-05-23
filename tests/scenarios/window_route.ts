import { group, test, eq, deepEq } from '../harness';
import { parseHashRoute, buildHashRoute } from '../../src/shared/window-route';

group('window-route — parseHashRoute', () => {
  test('empty -> home', () => deepEq(parseHashRoute(''), { kind: 'home' }));
  test('null -> home', () => deepEq(parseHashRoute(null), { kind: 'home' }));
  test('undefined -> home', () => deepEq(parseHashRoute(undefined), { kind: 'home' }));
  test('# only -> home', () => deepEq(parseHashRoute('#'), { kind: 'home' }));
  test('#/connection/abc', () =>
    deepEq(parseHashRoute('#/connection/abc'), { kind: 'connection', connectionId: 'abc' }));
  test('connection/abc no hash', () =>
    deepEq(parseHashRoute('connection/abc'), { kind: 'connection', connectionId: 'abc' }));
  test('#/connection (no id) -> home', () =>
    deepEq(parseHashRoute('#/connection'), { kind: 'home' }));
  test('#/connection/abc/extra -> home', () =>
    deepEq(parseHashRoute('#/connection/abc/extra'), { kind: 'home' }));
  test('#/other/abc -> home', () =>
    deepEq(parseHashRoute('#/other/abc'), { kind: 'home' }));
  test('rejects unsafe id with slash', () =>
    deepEq(parseHashRoute('#/connection/a/b'), { kind: 'home' }));
  test('rejects unsafe id with space', () =>
    deepEq(parseHashRoute('#/connection/a b'), { kind: 'home' }));
  test('accepts hyphens, underscores, dots', () => {
    const r = parseHashRoute('#/connection/a-b_c.d');
    if (r.kind !== 'connection') throw new Error('expected connection');
    eq(r.connectionId, 'a-b_c.d');
  });
});

group('window-route — buildHashRoute', () => {
  test('home -> empty', () => eq(buildHashRoute({ kind: 'home' }), ''));
  test('connection -> #/connection/<id>', () =>
    eq(buildHashRoute({ kind: 'connection', connectionId: 'xyz' }), '#/connection/xyz'));
  test('round-trip', () => {
    const parsed = parseHashRoute(buildHashRoute({ kind: 'connection', connectionId: 'roundtrip' }));
    deepEq(parsed, { kind: 'connection', connectionId: 'roundtrip' });
  });
});
