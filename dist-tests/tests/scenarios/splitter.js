"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sql_split_1 = require("../../src/shared/sql-split");
const harness_1 = require("../harness");
// Mirror what callers (runQueryScript) actually do: trim, drop empty,
// and drop comment-only segments since PG accepts them as no-ops anyway.
function clean(stmts) {
    return stmts
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((s) => {
        // Strip leading line+block comments and check for residual content.
        let i = 0;
        while (i < s.length) {
            if (s[i] === '-' && s[i + 1] === '-') {
                const nl = s.indexOf('\n', i);
                if (nl < 0)
                    return false;
                i = nl + 1;
            }
            else if (s[i] === '/' && s[i + 1] === '*') {
                const end = s.indexOf('*/', i + 2);
                if (end < 0)
                    return false;
                i = end + 2;
            }
            else if (s[i] === ' ' || s[i] === '\t' || s[i] === '\n' || s[i] === '\r') {
                i++;
            }
            else {
                return true;
            }
        }
        return false;
    });
}
(0, harness_1.group)('splitter — basic single statements', () => {
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
        (0, harness_1.test)(`single: ${s.slice(0, 40)}`, () => {
            const r = clean((0, sql_split_1.splitStatements)(s));
            (0, harness_1.eq)(r.length, 1);
            (0, harness_1.eq)(r[0].replace(/;\s*$/, ''), s.replace(/;\s*$/, ''));
        });
    }
});
(0, harness_1.group)('splitter — multi statements', () => {
    for (let n = 2; n <= 25; n++) {
        (0, harness_1.test)(`n=${n} simple statements`, () => {
            const sql = Array.from({ length: n }, (_, i) => `select ${i + 1}`).join(';\n') + ';';
            const r = clean((0, sql_split_1.splitStatements)(sql));
            (0, harness_1.eq)(r.length, n);
            for (let i = 0; i < n; i++)
                (0, harness_1.eq)(r[i].trim(), `select ${i + 1}`);
        });
        (0, harness_1.test)(`n=${n} statements no trailing semicolon`, () => {
            const sql = Array.from({ length: n }, (_, i) => `select ${i + 1}`).join(';\n');
            const r = clean((0, sql_split_1.splitStatements)(sql));
            (0, harness_1.eq)(r.length, n);
        });
        (0, harness_1.test)(`n=${n} statements with blank lines`, () => {
            const sql = Array.from({ length: n }, (_, i) => `select ${i + 1};\n\n`).join('');
            const r = clean((0, sql_split_1.splitStatements)(sql));
            (0, harness_1.eq)(r.length, n);
        });
    }
});
(0, harness_1.group)('splitter — comments', () => {
    (0, harness_1.test)('line comment before statement', () => {
        const r = clean((0, sql_split_1.splitStatements)(`-- hello\nselect 1;`));
        (0, harness_1.eq)(r.length, 1);
    });
    (0, harness_1.test)('line comment between statements', () => {
        const r = clean((0, sql_split_1.splitStatements)(`select 1;\n-- comment\nselect 2;`));
        (0, harness_1.eq)(r.length, 2);
    });
    (0, harness_1.test)('line comment with semicolon inside', () => {
        const r = clean((0, sql_split_1.splitStatements)(`select 1; -- ; not real`));
        (0, harness_1.eq)(r.length, 1);
    });
    (0, harness_1.test)('block comment ignores semicolons', () => {
        const r = clean((0, sql_split_1.splitStatements)(`select 1 /* ; */ ; select 2;`));
        (0, harness_1.eq)(r.length, 2);
    });
    (0, harness_1.test)('nested block comments tolerated (only outer parsed)', () => {
        const r = clean((0, sql_split_1.splitStatements)(`/* a; b */ select 1;`));
        (0, harness_1.eq)(r.length, 1);
    });
    (0, harness_1.test)('comment at end', () => {
        const r = clean((0, sql_split_1.splitStatements)(`select 1; -- trailing`));
        (0, harness_1.eq)(r.length, 1);
    });
    for (let i = 0; i < 20; i++) {
        (0, harness_1.test)(`comment-with-${i}-semicolons doesn't split`, () => {
            const sc = ';'.repeat(i + 1);
            const r = clean((0, sql_split_1.splitStatements)(`select 1; /* ${sc} */ select 2;`));
            (0, harness_1.eq)(r.length, 2);
        });
    }
});
(0, harness_1.group)('splitter — string literals', () => {
    (0, harness_1.test)('single quote with semicolon', () => {
        const r = clean((0, sql_split_1.splitStatements)(`select 'a;b'; select 1;`));
        (0, harness_1.eq)(r.length, 2);
    });
    (0, harness_1.test)('single quote escape', () => {
        const r = clean((0, sql_split_1.splitStatements)(`select 'it''s; ok'; select 1;`));
        (0, harness_1.eq)(r.length, 2);
        (0, harness_1.assert)(r[0].includes("it''s"));
    });
    (0, harness_1.test)('double quoted identifier with semicolon', () => {
        const r = clean((0, sql_split_1.splitStatements)(`select "a;b" from t; select 1;`));
        (0, harness_1.eq)(r.length, 2);
    });
    (0, harness_1.test)('double quoted identifier escape', () => {
        const r = clean((0, sql_split_1.splitStatements)(`select "He said ""hi""" ; select 1;`));
        (0, harness_1.eq)(r.length, 2);
    });
    for (let n = 1; n <= 15; n++) {
        (0, harness_1.test)(`${n} semicolons inside single quotes`, () => {
            const lit = `'${';'.repeat(n)}'`;
            const r = clean((0, sql_split_1.splitStatements)(`select ${lit}; select 2;`));
            (0, harness_1.eq)(r.length, 2);
        });
    }
});
(0, harness_1.group)('splitter — dollar quotes', () => {
    (0, harness_1.test)('basic $$', () => {
        const r = clean((0, sql_split_1.splitStatements)(`select $$a;b$$; select 1;`));
        (0, harness_1.eq)(r.length, 2);
    });
    (0, harness_1.test)('tagged $tag$', () => {
        const r = clean((0, sql_split_1.splitStatements)(`select $foo$a;b$foo$; select 1;`));
        (0, harness_1.eq)(r.length, 2);
    });
    (0, harness_1.test)('function body with semicolons', () => {
        const body = `create function f() returns int language plpgsql as $$
begin
  perform 1;
  perform 2;
  return 1;
end
$$;`;
        const r = clean((0, sql_split_1.splitStatements)(body + 'select 1;'));
        (0, harness_1.eq)(r.length, 2);
    });
    (0, harness_1.test)('function body with tagged dollar', () => {
        const body = `create function f() returns int language plpgsql as $body$
begin
  perform 1;
  return 2;
end
$body$;`;
        const r = clean((0, sql_split_1.splitStatements)(body + 'select 1;'));
        (0, harness_1.eq)(r.length, 2);
    });
    (0, harness_1.test)('two dollar-quoted statements', () => {
        const r = clean((0, sql_split_1.splitStatements)(`select $$a;b$$; select $$c;d$$;`));
        (0, harness_1.eq)(r.length, 2);
    });
    for (let n = 1; n <= 20; n++) {
        (0, harness_1.test)(`dollar quote with ${n} semicolons inside`, () => {
            const sc = ';'.repeat(n);
            const r = clean((0, sql_split_1.splitStatements)(`select $$x${sc}y$$; select 1;`));
            (0, harness_1.eq)(r.length, 2);
        });
    }
});
(0, harness_1.group)('splitter — empty / whitespace', () => {
    (0, harness_1.test)('empty string', () => {
        const r = clean((0, sql_split_1.splitStatements)(''));
        (0, harness_1.eq)(r.length, 0);
    });
    (0, harness_1.test)('only whitespace', () => {
        const r = clean((0, sql_split_1.splitStatements)('   \n\t '));
        (0, harness_1.eq)(r.length, 0);
    });
    (0, harness_1.test)('only semicolons', () => {
        const r = clean((0, sql_split_1.splitStatements)(';;;;;'));
        (0, harness_1.eq)(r.length, 0);
    });
    (0, harness_1.test)('comment-only', () => {
        const r = clean((0, sql_split_1.splitStatements)('-- nothing\n/* also */'));
        (0, harness_1.eq)(r.length, 0);
    });
});
(0, harness_1.group)('splitter — combined edge cases', () => {
    (0, harness_1.test)('mixed quotes + comments + dollar', () => {
        const sql = `
      -- start
      select 'a;' as a, "b;c" as b, $$x;y$$ as c;
      /* mid; */ select 2;
      select $tag$;$tag$, '"' , "'";
    `;
        const r = clean((0, sql_split_1.splitStatements)(sql));
        (0, harness_1.eq)(r.length, 3);
    });
    (0, harness_1.test)('CTE with semicolons in string', () => {
        const sql = `with x as (select 'a;b' as v) select * from x;`;
        const r = clean((0, sql_split_1.splitStatements)(sql));
        (0, harness_1.eq)(r.length, 1);
    });
});
