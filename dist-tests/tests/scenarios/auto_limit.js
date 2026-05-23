"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const harness_1 = require("../harness");
const auto_limit_1 = require("../../src/shared/auto-limit");
function inj(sql, limit = 1000) {
    const r = (0, auto_limit_1.applyAutoLimit)(sql, limit);
    return { injected: r.injected, sql: r.sql.replace(/\s+/g, ' ').trim() };
}
(0, harness_1.group)('auto-limit — applies', () => {
    (0, harness_1.test)('plain SELECT', () => {
        const r = inj('select * from t');
        (0, harness_1.eq)(r.injected, true);
        (0, harness_1.eq)(r.sql, 'select * from t limit 1000');
    });
    (0, harness_1.test)('SELECT with trailing semi', () => {
        const r = inj('select * from t;');
        (0, harness_1.eq)(r.injected, true);
        (0, harness_1.eq)(r.sql, 'select * from t limit 1000;');
    });
    (0, harness_1.test)('SELECT with order by', () => {
        const r = inj('select * from t order by id desc');
        (0, harness_1.eq)(r.injected, true);
        (0, harness_1.eq)(r.sql, 'select * from t order by id desc limit 1000');
    });
    (0, harness_1.test)('CTE / WITH', () => {
        const r = inj('with x as (select 1) select * from x');
        (0, harness_1.eq)(r.injected, true);
    });
    (0, harness_1.test)('SELECT with where', () => {
        const r = inj("select * from t where name = 'limit'");
        (0, harness_1.eq)(r.injected, true);
        (0, harness_1.eq)(r.sql, "select * from t where name = 'limit' limit 1000");
    });
});
(0, harness_1.group)('auto-limit — skips', () => {
    (0, harness_1.test)('already has LIMIT', () => {
        (0, harness_1.eq)((0, auto_limit_1.applyAutoLimit)('select * from t limit 50', 1000).injected, false);
    });
    (0, harness_1.test)('LIMIT inside subquery counts as existing', () => {
        (0, harness_1.eq)((0, auto_limit_1.applyAutoLimit)('select * from (select 1 limit 1) x', 1000).injected, false);
    });
    (0, harness_1.test)('INSERT', () => {
        (0, harness_1.eq)((0, auto_limit_1.applyAutoLimit)('insert into t (a) values (1)', 1000).injected, false);
    });
    (0, harness_1.test)('UPDATE', () => {
        (0, harness_1.eq)((0, auto_limit_1.applyAutoLimit)('update t set a = 1', 1000).injected, false);
    });
    (0, harness_1.test)('DELETE', () => {
        (0, harness_1.eq)((0, auto_limit_1.applyAutoLimit)('delete from t', 1000).injected, false);
    });
    (0, harness_1.test)('multiple statements', () => {
        (0, harness_1.eq)((0, auto_limit_1.applyAutoLimit)('select 1; select 2', 1000).injected, false);
    });
    (0, harness_1.test)('SELECT INTO', () => {
        (0, harness_1.eq)((0, auto_limit_1.applyAutoLimit)('select * into newt from t', 1000).injected, false);
    });
    (0, harness_1.test)('empty', () => {
        (0, harness_1.eq)((0, auto_limit_1.applyAutoLimit)('', 1000).injected, false);
        (0, harness_1.eq)((0, auto_limit_1.applyAutoLimit)('   ', 1000).injected, false);
    });
    (0, harness_1.test)('limit=0 disables', () => {
        (0, harness_1.eq)((0, auto_limit_1.applyAutoLimit)('select 1', 0).injected, false);
    });
    (0, harness_1.test)('comments do not confuse parser', () => {
        const r = (0, auto_limit_1.applyAutoLimit)('-- limit 1\nselect * from t', 1000);
        (0, harness_1.eq)(r.injected, true);
    });
    (0, harness_1.test)('string with limit literal', () => {
        const r = (0, auto_limit_1.applyAutoLimit)("select 'limit 1' as s", 1000);
        (0, harness_1.eq)(r.injected, true);
    });
    (0, harness_1.test)('string with semicolon literal', () => {
        const r = (0, auto_limit_1.applyAutoLimit)("select ';' as s", 1000);
        (0, harness_1.eq)(r.injected, true);
    });
});
(0, harness_1.group)('auto-limit — limit value', () => {
    (0, harness_1.test)('uses custom limit', () => {
        (0, harness_1.eq)((0, auto_limit_1.applyAutoLimit)('select 1', 7).sql.trim(), 'select 1 limit 7');
    });
    (0, harness_1.test)('floors fractional limit', () => {
        (0, harness_1.eq)((0, auto_limit_1.applyAutoLimit)('select 1', 12.9).sql.trim(), 'select 1 limit 12');
    });
});
