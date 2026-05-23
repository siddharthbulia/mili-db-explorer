import { group, test, eq, assert, deepEq } from '../harness';
import { diffSchemas } from '../../src/shared/schema-diff';
import type { SchemaEntry } from '../../src/shared/types';

function mkSchema(name: string, opts: Partial<SchemaEntry> = {}): SchemaEntry {
  return {
    schema: name,
    tables: [], views: [], matViews: [],
    functions: [], sequences: [],
    ...opts,
  };
}

group('schema-diff — empty cases', () => {
  test('two empty snapshots: unchanged', () => {
    const d = diffSchemas([], []);
    eq(d.unchanged, true);
  });
  test('identical single schema: unchanged', () => {
    const before: SchemaEntry[] = [mkSchema('public')];
    const after: SchemaEntry[] = [mkSchema('public')];
    eq(diffSchemas(before, after).unchanged, true);
  });
});

group('schema-diff — schema add/remove', () => {
  test('schema added', () => {
    const d = diffSchemas([], [mkSchema('public')]);
    deepEq(d.schemas.added, ['public']);
    eq(d.unchanged, false);
  });
  test('schema removed', () => {
    const d = diffSchemas([mkSchema('legacy')], []);
    deepEq(d.schemas.removed, ['legacy']);
  });
});

group('schema-diff — table changes', () => {
  test('table added', () => {
    const before: SchemaEntry[] = [mkSchema('public')];
    const after: SchemaEntry[] = [mkSchema('public', {
      tables: [{ name: 'users', kind: 'r' }],
    })];
    const d = diffSchemas(before, after);
    deepEq(d.tables.added, ['public.users']);
  });
  test('table removed', () => {
    const before: SchemaEntry[] = [mkSchema('public', {
      tables: [{ name: 'users', kind: 'r' }],
    })];
    const after: SchemaEntry[] = [mkSchema('public')];
    const d = diffSchemas(before, after);
    deepEq(d.tables.removed, ['public.users']);
  });
  test('table size change marked changed', () => {
    const before: SchemaEntry[] = [mkSchema('public', {
      tables: [{ name: 'users', kind: 'r', size: '8 kB' }],
    })];
    const after: SchemaEntry[] = [mkSchema('public', {
      tables: [{ name: 'users', kind: 'r', size: '16 kB' }],
    })];
    const d = diffSchemas(before, after);
    deepEq(d.tables.changed, ['public.users']);
    deepEq(d.tables.added, []);
    deepEq(d.tables.removed, []);
  });
  test('table kind change marked changed', () => {
    const before: SchemaEntry[] = [mkSchema('public', {
      tables: [{ name: 'users', kind: 'r' }],
    })];
    const after: SchemaEntry[] = [mkSchema('public', {
      tables: [{ name: 'users', kind: 'p' }],
    })];
    deepEq(diffSchemas(before, after).tables.changed, ['public.users']);
  });
});

group('schema-diff — functions & sequences', () => {
  test('function added', () => {
    const before: SchemaEntry[] = [mkSchema('public')];
    const after: SchemaEntry[] = [mkSchema('public', {
      functions: [{ name: 'foo', args: 'a int', returns: 'int', language: 'sql' }],
    })];
    const d = diffSchemas(before, after);
    deepEq(d.functions.added, ['public.foo(a int)']);
  });
  test('function signature change is a new function', () => {
    const before: SchemaEntry[] = [mkSchema('public', {
      functions: [{ name: 'foo', args: 'a int', returns: 'int', language: 'sql' }],
    })];
    const after: SchemaEntry[] = [mkSchema('public', {
      functions: [{ name: 'foo', args: 'a text', returns: 'int', language: 'sql' }],
    })];
    const d = diffSchemas(before, after);
    deepEq(d.functions.added, ['public.foo(a text)']);
    deepEq(d.functions.removed, ['public.foo(a int)']);
  });
  test('sequence added & removed', () => {
    const before: SchemaEntry[] = [mkSchema('public', {
      sequences: [{ name: 'a' }, { name: 'b' }],
    })];
    const after: SchemaEntry[] = [mkSchema('public', {
      sequences: [{ name: 'b' }, { name: 'c' }],
    })];
    const d = diffSchemas(before, after);
    deepEq(d.sequences.added, ['public.c']);
    deepEq(d.sequences.removed, ['public.a']);
  });
});

group('schema-diff — views & matviews', () => {
  test('view added in one schema, removed in another', () => {
    const before: SchemaEntry[] = [
      mkSchema('a', { views: [{ name: 'v1', kind: 'v' }] }),
      mkSchema('b'),
    ];
    const after: SchemaEntry[] = [
      mkSchema('a'),
      mkSchema('b', { views: [{ name: 'v2', kind: 'v' }] }),
    ];
    const d = diffSchemas(before, after);
    deepEq(d.views.added, ['b.v2']);
    deepEq(d.views.removed, ['a.v1']);
  });
  test('matview size change tracked', () => {
    const before: SchemaEntry[] = [mkSchema('public', {
      matViews: [{ name: 'mv', kind: 'm', size: '1 MB' }],
    })];
    const after: SchemaEntry[] = [mkSchema('public', {
      matViews: [{ name: 'mv', kind: 'm', size: '2 MB' }],
    })];
    deepEq(diffSchemas(before, after).matViews.changed, ['public.mv']);
  });
});

group('schema-diff — large parallel changes are sorted deterministically', () => {
  test('many adds are sorted', () => {
    const after: SchemaEntry[] = [mkSchema('public', {
      tables: ['t3', 't1', 't2'].map((n) => ({ name: n, kind: 'r' as const })),
    })];
    const d = diffSchemas([mkSchema('public')], after);
    deepEq(d.tables.added, ['public.t1', 'public.t2', 'public.t3']);
  });
});
