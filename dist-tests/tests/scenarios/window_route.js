"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const harness_1 = require("../harness");
const window_route_1 = require("../../src/shared/window-route");
(0, harness_1.group)('window-route — parseHashRoute', () => {
    (0, harness_1.test)('empty -> home', () => (0, harness_1.deepEq)((0, window_route_1.parseHashRoute)(''), { kind: 'home' }));
    (0, harness_1.test)('null -> home', () => (0, harness_1.deepEq)((0, window_route_1.parseHashRoute)(null), { kind: 'home' }));
    (0, harness_1.test)('undefined -> home', () => (0, harness_1.deepEq)((0, window_route_1.parseHashRoute)(undefined), { kind: 'home' }));
    (0, harness_1.test)('# only -> home', () => (0, harness_1.deepEq)((0, window_route_1.parseHashRoute)('#'), { kind: 'home' }));
    (0, harness_1.test)('#/connection/abc', () => (0, harness_1.deepEq)((0, window_route_1.parseHashRoute)('#/connection/abc'), { kind: 'connection', connectionId: 'abc' }));
    (0, harness_1.test)('connection/abc no hash', () => (0, harness_1.deepEq)((0, window_route_1.parseHashRoute)('connection/abc'), { kind: 'connection', connectionId: 'abc' }));
    (0, harness_1.test)('#/connection (no id) -> home', () => (0, harness_1.deepEq)((0, window_route_1.parseHashRoute)('#/connection'), { kind: 'home' }));
    (0, harness_1.test)('#/connection/abc/extra -> home', () => (0, harness_1.deepEq)((0, window_route_1.parseHashRoute)('#/connection/abc/extra'), { kind: 'home' }));
    (0, harness_1.test)('#/other/abc -> home', () => (0, harness_1.deepEq)((0, window_route_1.parseHashRoute)('#/other/abc'), { kind: 'home' }));
    (0, harness_1.test)('rejects unsafe id with slash', () => (0, harness_1.deepEq)((0, window_route_1.parseHashRoute)('#/connection/a/b'), { kind: 'home' }));
    (0, harness_1.test)('rejects unsafe id with space', () => (0, harness_1.deepEq)((0, window_route_1.parseHashRoute)('#/connection/a b'), { kind: 'home' }));
    (0, harness_1.test)('accepts hyphens, underscores, dots', () => {
        const r = (0, window_route_1.parseHashRoute)('#/connection/a-b_c.d');
        if (r.kind !== 'connection')
            throw new Error('expected connection');
        (0, harness_1.eq)(r.connectionId, 'a-b_c.d');
    });
});
(0, harness_1.group)('window-route — buildHashRoute', () => {
    (0, harness_1.test)('home -> empty', () => (0, harness_1.eq)((0, window_route_1.buildHashRoute)({ kind: 'home' }), ''));
    (0, harness_1.test)('connection -> #/connection/<id>', () => (0, harness_1.eq)((0, window_route_1.buildHashRoute)({ kind: 'connection', connectionId: 'xyz' }), '#/connection/xyz'));
    (0, harness_1.test)('round-trip', () => {
        const parsed = (0, window_route_1.parseHashRoute)((0, window_route_1.buildHashRoute)({ kind: 'connection', connectionId: 'roundtrip' }));
        (0, harness_1.deepEq)(parsed, { kind: 'connection', connectionId: 'roundtrip' });
    });
});
