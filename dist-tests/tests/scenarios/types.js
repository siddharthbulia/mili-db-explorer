"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const harness_1 = require("../harness");
const db_1 = require("../../src/main/db");
const connect_1 = require("../connect");
const cid = connect_1.TEST_CONNECTION.id;
async function val(sql) {
    const r = await (0, db_1.runQuery)(cid, sql);
    if (!r.ok)
        throw new Error(r.error.message);
    return r.results[0].rows[0][0];
}
(0, harness_1.group)('types — boolean', () => {
    (0, harness_1.test)('true', async () => (0, harness_1.eq)(await val('select true'), true));
    (0, harness_1.test)('false', async () => (0, harness_1.eq)(await val('select false'), false));
    (0, harness_1.test)('null bool', async () => (0, harness_1.eq)(await val('select null::boolean'), null));
    (0, harness_1.test)('cast from int 1', async () => (0, harness_1.eq)(await val('select 1::int::boolean'), true));
    (0, harness_1.test)('cast from int 0', async () => (0, harness_1.eq)(await val('select 0::int::boolean'), false));
});
(0, harness_1.group)('types — integers', () => {
    (0, harness_1.test)('int4', async () => (0, harness_1.eq)(await val('select 12345::int'), 12345));
    (0, harness_1.test)('int4 negative', async () => (0, harness_1.eq)(await val('select -12345::int'), -12345));
    (0, harness_1.test)('int4 max', async () => (0, harness_1.eq)(await val('select 2147483647::int'), 2147483647));
    (0, harness_1.test)('int4 min', async () => (0, harness_1.eq)(await val('select (-2147483648)::int'), -2147483648));
    (0, harness_1.test)('int2', async () => (0, harness_1.eq)(await val('select 32767::int2'), 32767));
    (0, harness_1.test)('int8 small', async () => (0, harness_1.eq)(await val('select 42::bigint'), '42'));
    (0, harness_1.test)('int8 large', async () => (0, harness_1.eq)(await val('select 9223372036854775807::bigint'), '9223372036854775807'));
    for (let i = -10; i <= 10; i++) {
        (0, harness_1.test)(`int4 round trip ${i}`, async () => (0, harness_1.eq)(Number(await val(`select ${i}::int`)), i));
    }
});
(0, harness_1.group)('types — floats / numerics', () => {
    (0, harness_1.test)('real', async () => (0, harness_1.eq)(await val('select 3.5::real'), 3.5));
    (0, harness_1.test)('double', async () => (0, harness_1.eq)(await val('select 2.718281828::double precision'), 2.718281828));
    (0, harness_1.test)('numeric whole', async () => (0, harness_1.eq)(await val('select 100::numeric'), '100'));
    (0, harness_1.test)('numeric decimal', async () => (0, harness_1.eq)(await val('select 123.45::numeric(5,2)'), '123.45'));
    (0, harness_1.test)('numeric high precision', async () => (0, harness_1.eq)(await val('select 1.234567890123456789::numeric'), '1.234567890123456789'));
    (0, harness_1.test)('NaN double', async () => {
        const v = await val(`select 'NaN'::double precision`);
        (0, harness_1.assert)(Number.isNaN(v));
    });
    (0, harness_1.test)('Infinity double', async () => {
        const v = await val(`select 'Infinity'::double precision`);
        (0, harness_1.eq)(v, Infinity);
    });
});
(0, harness_1.group)('types — strings', () => {
    const samples = [
        '',
        'hello',
        'with spaces',
        'with "double" quotes',
        "with 'single' quotes",
        'line1\nline2',
        'tab\there',
        'unicode: αβγ',
        'emoji: 🎉🚀',
        '日本語',
        'a'.repeat(1000),
        'null in middle\x00end', // raw nulls not allowed in PG strings — special-case skip
    ];
    for (const s of samples) {
        (0, harness_1.test)(`text round trip: ${JSON.stringify(s).slice(0, 40)}`, async () => {
            if (s.includes('\x00'))
                return; // pg rejects null bytes
            const r = await (0, db_1.runQuery)(cid, 'select $1::text', [s]);
            if (!r.ok)
                throw new Error(r.error.message);
            (0, harness_1.eq)(r.results[0].rows[0][0], s);
        });
    }
});
(0, harness_1.group)('types — bytea', () => {
    (0, harness_1.test)('hex literal', async () => {
        const v = await val(`select '\\xdeadbeef'::bytea`);
        (0, harness_1.assert)(Buffer.isBuffer(v));
        (0, harness_1.eq)(v.toString('hex'), 'deadbeef');
    });
    (0, harness_1.test)('empty', async () => {
        const v = await val(`select ''::bytea`);
        (0, harness_1.eq)(v.length, 0);
    });
    for (let i = 0; i < 10; i++) {
        (0, harness_1.test)(`random bytea ${i}`, async () => {
            const buf = Buffer.from([i, i + 1, i + 2, 255 - i]);
            const r = await (0, db_1.runQuery)(cid, 'select $1::bytea', [buf]);
            if (!r.ok)
                throw new Error(r.error.message);
            (0, harness_1.eq)(r.results[0].rows[0][0].toString('hex'), buf.toString('hex'));
        });
    }
});
(0, harness_1.group)('types — json / jsonb', () => {
    const samples = [
        null,
        1,
        'string',
        true,
        [],
        [1, 2, 3],
        {},
        { a: 1 },
        { nested: { x: [1, 'two', false] } },
        { unicode: '日本語' },
    ];
    for (const s of samples) {
        (0, harness_1.test)(`jsonb round trip: ${JSON.stringify(s)}`, async () => {
            const r = await (0, db_1.runQuery)(cid, 'select $1::jsonb', [JSON.stringify(s)]);
            if (!r.ok)
                throw new Error(r.error.message);
            (0, harness_1.deepEq)(r.results[0].rows[0][0], s);
        });
        (0, harness_1.test)(`json round trip: ${JSON.stringify(s)}`, async () => {
            const r = await (0, db_1.runQuery)(cid, 'select $1::json', [JSON.stringify(s)]);
            if (!r.ok)
                throw new Error(r.error.message);
            (0, harness_1.deepEq)(r.results[0].rows[0][0], s);
        });
    }
});
(0, harness_1.group)('types — uuid', () => {
    (0, harness_1.test)('fixed value', async () => {
        (0, harness_1.eq)(await val(`select '11111111-1111-1111-1111-111111111111'::uuid`), '11111111-1111-1111-1111-111111111111');
    });
    (0, harness_1.test)('gen_random_uuid', async () => {
        const v = await val('select gen_random_uuid()');
        (0, harness_1.assert)(/^[0-9a-f-]{36}$/.test(v));
    });
});
(0, harness_1.group)('types — date/time', () => {
    (0, harness_1.test)('date', async () => {
        const v = await val(`select '2024-06-15'::date`);
        (0, harness_1.assert)(v instanceof Date);
    });
    (0, harness_1.test)('timestamp', async () => {
        const v = await val(`select '2024-06-15 12:34:56'::timestamp`);
        (0, harness_1.assert)(v instanceof Date);
    });
    (0, harness_1.test)('timestamptz', async () => {
        const v = await val(`select '2024-06-15 12:34:56+00'::timestamptz`);
        (0, harness_1.assert)(v instanceof Date);
        (0, harness_1.eq)(v.getUTCFullYear(), 2024);
        (0, harness_1.eq)(v.getUTCMonth(), 5);
        (0, harness_1.eq)(v.getUTCDate(), 15);
        (0, harness_1.eq)(v.getUTCHours(), 12);
    });
    (0, harness_1.test)('interval', async () => {
        const v = await val(`select interval '1 day 2 hours'`);
        (0, harness_1.assert)(v != null);
    });
    for (const d of ['2000-01-01', '2024-12-31', '0001-01-01', '9999-12-31']) {
        (0, harness_1.test)(`date ${d}`, async () => {
            const v = await val(`select '${d}'::date`);
            (0, harness_1.assert)(v instanceof Date);
        });
    }
});
(0, harness_1.group)('types — arrays', () => {
    (0, harness_1.test)('int[]', async () => {
        const v = await val(`select array[1,2,3]`);
        (0, harness_1.deepEq)(v, [1, 2, 3]);
    });
    (0, harness_1.test)('text[]', async () => {
        const v = await val(`select array['a','b','c']`);
        (0, harness_1.deepEq)(v, ['a', 'b', 'c']);
    });
    (0, harness_1.test)('empty array', async () => {
        const v = await val(`select '{}'::int[]`);
        (0, harness_1.deepEq)(v, []);
    });
    (0, harness_1.test)('nested array', async () => {
        const v = await val(`select array[array[1,2],array[3,4]]`);
        (0, harness_1.deepEq)(v, [[1, 2], [3, 4]]);
    });
    (0, harness_1.test)('array with nulls', async () => {
        const v = await val(`select array[1, null, 3]::int[]`);
        (0, harness_1.deepEq)(v, [1, null, 3]);
    });
    for (let n = 1; n <= 20; n++) {
        (0, harness_1.test)(`int[] of size ${n}`, async () => {
            const arr = Array.from({ length: n }, (_, i) => i + 1);
            const v = await val(`select array[${arr.join(',')}]::int[]`);
            (0, harness_1.deepEq)(v, arr);
        });
    }
});
(0, harness_1.group)('types — network', () => {
    (0, harness_1.test)('inet ipv4', async () => (0, harness_1.eq)(await val(`select '192.168.1.1'::inet`), '192.168.1.1'));
    (0, harness_1.test)('inet ipv6', async () => (0, harness_1.eq)(await val(`select '::1'::inet`), '::1'));
    (0, harness_1.test)('cidr', async () => (0, harness_1.eq)(await val(`select '10.0.0.0/8'::cidr`), '10.0.0.0/8'));
    (0, harness_1.test)('macaddr', async () => (0, harness_1.eq)(await val(`select '08:00:2b:01:02:03'::macaddr`), '08:00:2b:01:02:03'));
});
(0, harness_1.group)('types — ranges and other', () => {
    (0, harness_1.test)('int4range', async () => {
        const v = await val(`select '[1,10)'::int4range`);
        (0, harness_1.assert)(v != null);
    });
    (0, harness_1.test)('point', async () => {
        const v = await val(`select point(1.5, 2.5)`);
        (0, harness_1.deepEq)(v, { x: 1.5, y: 2.5 });
    });
    (0, harness_1.test)('xml', async () => {
        const v = await val(`select '<root><x>1</x></root>'::xml`);
        (0, harness_1.assert)(typeof v === 'string' && v.includes('<root>'));
    });
});
(0, harness_1.group)('types — kitchen_sink table read', () => {
    (0, harness_1.test)('select kitchen_sink row 1', async () => {
        const r = await (0, db_1.runQuery)(cid, 'select * from app.kitchen_sink where id=1');
        if (!r.ok)
            throw new Error(r.error.message);
        (0, harness_1.eq)(r.results[0].rowCount, 1);
    });
    (0, harness_1.test)('select kitchen_sink row 2 (all nulls)', async () => {
        const r = await (0, db_1.runQuery)(cid, 'select * from app.kitchen_sink where id=2');
        if (!r.ok)
            throw new Error(r.error.message);
        (0, harness_1.eq)(r.results[0].rowCount, 1);
        // every value other than id should be null
        for (let i = 1; i < r.results[0].rows[0].length; i++) {
            (0, harness_1.eq)(r.results[0].rows[0][i], null);
        }
    });
    (0, harness_1.test)('select kitchen_sink row 3 (extreme values)', async () => {
        const r = await (0, db_1.runQuery)(cid, 'select * from app.kitchen_sink where id=3');
        if (!r.ok)
            throw new Error(r.error.message);
        (0, harness_1.eq)(r.results[0].rowCount, 1);
    });
});
