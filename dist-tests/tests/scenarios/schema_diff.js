"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const harness_1 = require("../harness");
const schema_diff_1 = require("../../src/shared/schema-diff");
function mkSchema(name, opts = {}) {
    return {
        schema: name,
        tables: [], views: [], matViews: [],
        functions: [], sequences: [],
        ...opts,
    };
}
(0, harness_1.group)('schema-diff — empty cases', () => {
    (0, harness_1.test)('two empty snapshots: unchanged', () => {
        const d = (0, schema_diff_1.diffSchemas)([], []);
        (0, harness_1.eq)(d.unchanged, true);
    });
    (0, harness_1.test)('identical single schema: unchanged', () => {
        const before = [mkSchema('public')];
        const after = [mkSchema('public')];
        (0, harness_1.eq)((0, schema_diff_1.diffSchemas)(before, after).unchanged, true);
    });
});
(0, harness_1.group)('schema-diff — schema add/remove', () => {
    (0, harness_1.test)('schema added', () => {
        const d = (0, schema_diff_1.diffSchemas)([], [mkSchema('public')]);
        (0, harness_1.deepEq)(d.schemas.added, ['public']);
        (0, harness_1.eq)(d.unchanged, false);
    });
    (0, harness_1.test)('schema removed', () => {
        const d = (0, schema_diff_1.diffSchemas)([mkSchema('legacy')], []);
        (0, harness_1.deepEq)(d.schemas.removed, ['legacy']);
    });
});
(0, harness_1.group)('schema-diff — table changes', () => {
    (0, harness_1.test)('table added', () => {
        const before = [mkSchema('public')];
        const after = [mkSchema('public', {
                tables: [{ name: 'users', kind: 'r' }],
            })];
        const d = (0, schema_diff_1.diffSchemas)(before, after);
        (0, harness_1.deepEq)(d.tables.added, ['public.users']);
    });
    (0, harness_1.test)('table removed', () => {
        const before = [mkSchema('public', {
                tables: [{ name: 'users', kind: 'r' }],
            })];
        const after = [mkSchema('public')];
        const d = (0, schema_diff_1.diffSchemas)(before, after);
        (0, harness_1.deepEq)(d.tables.removed, ['public.users']);
    });
    (0, harness_1.test)('table size change marked changed', () => {
        const before = [mkSchema('public', {
                tables: [{ name: 'users', kind: 'r', size: '8 kB' }],
            })];
        const after = [mkSchema('public', {
                tables: [{ name: 'users', kind: 'r', size: '16 kB' }],
            })];
        const d = (0, schema_diff_1.diffSchemas)(before, after);
        (0, harness_1.deepEq)(d.tables.changed, ['public.users']);
        (0, harness_1.deepEq)(d.tables.added, []);
        (0, harness_1.deepEq)(d.tables.removed, []);
    });
    (0, harness_1.test)('table kind change marked changed', () => {
        const before = [mkSchema('public', {
                tables: [{ name: 'users', kind: 'r' }],
            })];
        const after = [mkSchema('public', {
                tables: [{ name: 'users', kind: 'p' }],
            })];
        (0, harness_1.deepEq)((0, schema_diff_1.diffSchemas)(before, after).tables.changed, ['public.users']);
    });
});
(0, harness_1.group)('schema-diff — functions & sequences', () => {
    (0, harness_1.test)('function added', () => {
        const before = [mkSchema('public')];
        const after = [mkSchema('public', {
                functions: [{ name: 'foo', args: 'a int', returns: 'int', language: 'sql' }],
            })];
        const d = (0, schema_diff_1.diffSchemas)(before, after);
        (0, harness_1.deepEq)(d.functions.added, ['public.foo(a int)']);
    });
    (0, harness_1.test)('function signature change is a new function', () => {
        const before = [mkSchema('public', {
                functions: [{ name: 'foo', args: 'a int', returns: 'int', language: 'sql' }],
            })];
        const after = [mkSchema('public', {
                functions: [{ name: 'foo', args: 'a text', returns: 'int', language: 'sql' }],
            })];
        const d = (0, schema_diff_1.diffSchemas)(before, after);
        (0, harness_1.deepEq)(d.functions.added, ['public.foo(a text)']);
        (0, harness_1.deepEq)(d.functions.removed, ['public.foo(a int)']);
    });
    (0, harness_1.test)('sequence added & removed', () => {
        const before = [mkSchema('public', {
                sequences: [{ name: 'a' }, { name: 'b' }],
            })];
        const after = [mkSchema('public', {
                sequences: [{ name: 'b' }, { name: 'c' }],
            })];
        const d = (0, schema_diff_1.diffSchemas)(before, after);
        (0, harness_1.deepEq)(d.sequences.added, ['public.c']);
        (0, harness_1.deepEq)(d.sequences.removed, ['public.a']);
    });
});
(0, harness_1.group)('schema-diff — views & matviews', () => {
    (0, harness_1.test)('view added in one schema, removed in another', () => {
        const before = [
            mkSchema('a', { views: [{ name: 'v1', kind: 'v' }] }),
            mkSchema('b'),
        ];
        const after = [
            mkSchema('a'),
            mkSchema('b', { views: [{ name: 'v2', kind: 'v' }] }),
        ];
        const d = (0, schema_diff_1.diffSchemas)(before, after);
        (0, harness_1.deepEq)(d.views.added, ['b.v2']);
        (0, harness_1.deepEq)(d.views.removed, ['a.v1']);
    });
    (0, harness_1.test)('matview size change tracked', () => {
        const before = [mkSchema('public', {
                matViews: [{ name: 'mv', kind: 'm', size: '1 MB' }],
            })];
        const after = [mkSchema('public', {
                matViews: [{ name: 'mv', kind: 'm', size: '2 MB' }],
            })];
        (0, harness_1.deepEq)((0, schema_diff_1.diffSchemas)(before, after).matViews.changed, ['public.mv']);
    });
});
(0, harness_1.group)('schema-diff — large parallel changes are sorted deterministically', () => {
    (0, harness_1.test)('many adds are sorted', () => {
        const after = [mkSchema('public', {
                tables: ['t3', 't1', 't2'].map((n) => ({ name: n, kind: 'r' })),
            })];
        const d = (0, schema_diff_1.diffSchemas)([mkSchema('public')], after);
        (0, harness_1.deepEq)(d.tables.added, ['public.t1', 'public.t2', 'public.t3']);
    });
});
