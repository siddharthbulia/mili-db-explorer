import { splitStatements } from '../../src/shared/sql-split';
import { group, test, assert, eq, deepEq } from '../harness';

// Mirror what callers (runQueryScript) actually do: trim, drop empty,
// and drop comment-only segments since PG accepts them as no-ops anyway.
function clean(stmts: string[]): string[] {
  return stmts
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => {
      // Strip leading line+block comments and check for residual content.
      let i = 0;
      while (i < s.length) {
        if (s[i] === '-' && s[i + 1] === '-') {
          const nl = s.indexOf('\n', i);
          if (nl < 0) return false;
          i = nl + 1;
        } else if (s[i] === '/' && s[i + 1] === '*') {
          const end = s.indexOf('*/', i + 2);
          if (end < 0) return false;
          i = end + 2;
        } else if (s[i] === ' ' || s[i] === '\t' || s[i] === '\n' || s[i] === '\r') {
          i++;
        } else {
          return true;
        }
      }
      return false;
    });
}

group('splitter — basic single statements', () => {
  const single = [
    'select 1',
    'select 1;',
    'select * from t',
    'select * from t;',
    'update t set a = 1',
    'delete from t where a = 1',
    'insert into t values (1, 2, 3)',
    'create table t (a int)',
    'drop table t',
    'alter table t add column b text',
    'begin',
    'commit',
    'rollback',
    'savepoint sp1',
    'set search_path = public',
    'show search_path',
    'analyze',
    'vacuum t',
    'reindex table t',
    'truncate t',
  ];
  for (const s of single) {
    test(`single: ${s.slice(0, 40)}`, () => {
      const r = clean(splitStatements(s));
      eq(r.length, 1);
      eq(r[0].replace(/;\s*$/, ''), s.replace(/;\s*$/, ''));
    });
  }
});

group('splitter — multi statements', () => {
  for (let n = 2; n <= 25; n++) {
    test(`n=${n} simple statements`, () => {
      const sql = Array.from({ length: n }, (_, i) => `select ${i + 1}`).join(';\n') + ';';
      const r = clean(splitStatements(sql));
      eq(r.length, n);
      for (let i = 0; i < n; i++) eq(r[i].trim(), `select ${i + 1}`);
    });
    test(`n=${n} statements no trailing semicolon`, () => {
      const sql = Array.from({ length: n }, (_, i) => `select ${i + 1}`).join(';\n');
      const r = clean(splitStatements(sql));
      eq(r.length, n);
    });
    test(`n=${n} statements with blank lines`, () => {
      const sql = Array.from({ length: n }, (_, i) => `select ${i + 1};\n\n`).join('');
      const r = clean(splitStatements(sql));
      eq(r.length, n);
    });
  }
});

group('splitter — comments', () => {
  test('line comment before statement', () => {
    const r = clean(splitStatements(`-- hello\nselect 1;`));
    eq(r.length, 1);
  });
  test('line comment between statements', () => {
    const r = clean(splitStatements(`select 1;\n-- comment\nselect 2;`));
    eq(r.length, 2);
  });
  test('line comment with semicolon inside', () => {
    const r = clean(splitStatements(`select 1; -- ; not real`));
    eq(r.length, 1);
  });
  test('block comment ignores semicolons', () => {
    const r = clean(splitStatements(`select 1 /* ; */ ; select 2;`));
    eq(r.length, 2);
  });
  test('nested block comments tolerated (only outer parsed)', () => {
    const r = clean(splitStatements(`/* a; b */ select 1;`));
    eq(r.length, 1);
  });
  test('comment at end', () => {
    const r = clean(splitStatements(`select 1; -- trailing`));
    eq(r.length, 1);
  });
  for (let i = 0; i < 20; i++) {
    test(`comment-with-${i}-semicolons doesn't split`, () => {
      const sc = ';'.repeat(i + 1);
      const r = clean(splitStatements(`select 1; /* ${sc} */ select 2;`));
      eq(r.length, 2);
    });
  }
});

group('splitter — string literals', () => {
  test('single quote with semicolon', () => {
    const r = clean(splitStatements(`select 'a;b'; select 1;`));
    eq(r.length, 2);
  });
  test('single quote escape', () => {
    const r = clean(splitStatements(`select 'it''s; ok'; select 1;`));
    eq(r.length, 2);
    assert(r[0].includes("it''s"));
  });
  test('double quoted identifier with semicolon', () => {
    const r = clean(splitStatements(`select "a;b" from t; select 1;`));
    eq(r.length, 2);
  });
  test('double quoted identifier escape', () => {
    const r = clean(splitStatements(`select "He said ""hi""" ; select 1;`));
    eq(r.length, 2);
  });
  for (let n = 1; n <= 15; n++) {
    test(`${n} semicolons inside single quotes`, () => {
      const lit = `'${';'.repeat(n)}'`;
      const r = clean(splitStatements(`select ${lit}; select 2;`));
      eq(r.length, 2);
    });
  }
});

group('splitter — dollar quotes', () => {
  test('basic $$', () => {
    const r = clean(splitStatements(`select $$a;b$$; select 1;`));
    eq(r.length, 2);
  });
  test('tagged $tag$', () => {
    const r = clean(splitStatements(`select $foo$a;b$foo$; select 1;`));
    eq(r.length, 2);
  });
  test('function body with semicolons', () => {
    const body = `create function f() returns int language plpgsql as $$
begin
  perform 1;
  perform 2;
  return 1;
end
$$;`;
    const r = clean(splitStatements(body + 'select 1;'));
    eq(r.length, 2);
  });
  test('function body with tagged dollar', () => {
    const body = `create function f() returns int language plpgsql as $body$
begin
  perform 1;
  return 2;
end
$body$;`;
    const r = clean(splitStatements(body + 'select 1;'));
    eq(r.length, 2);
  });
  test('two dollar-quoted statements', () => {
    const r = clean(splitStatements(`select $$a;b$$; select $$c;d$$;`));
    eq(r.length, 2);
  });
  for (let n = 1; n <= 20; n++) {
    test(`dollar quote with ${n} semicolons inside`, () => {
      const sc = ';'.repeat(n);
      const r = clean(splitStatements(`select $$x${sc}y$$; select 1;`));
      eq(r.length, 2);
    });
  }
});

group('splitter — empty / whitespace', () => {
  test('empty string', () => {
    const r = clean(splitStatements(''));
    eq(r.length, 0);
  });
  test('only whitespace', () => {
    const r = clean(splitStatements('   \n\t '));
    eq(r.length, 0);
  });
  test('only semicolons', () => {
    const r = clean(splitStatements(';;;;;'));
    eq(r.length, 0);
  });
  test('comment-only', () => {
    const r = clean(splitStatements('-- nothing\n/* also */'));
    eq(r.length, 0);
  });
});

group('splitter — combined edge cases', () => {
  test('mixed quotes + comments + dollar', () => {
    const sql = `
      -- start
      select 'a;' as a, "b;c" as b, $$x;y$$ as c;
      /* mid; */ select 2;
      select $tag$;$tag$, '"' , "'";
    `;
    const r = clean(splitStatements(sql));
    eq(r.length, 3);
  });
  test('CTE with semicolons in string', () => {
    const sql = `with x as (select 'a;b' as v) select * from x;`;
    const r = clean(splitStatements(sql));
    eq(r.length, 1);
  });
});
