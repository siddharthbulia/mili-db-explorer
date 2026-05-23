"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const harness_1 = require("../harness");
const db_1 = require("../../src/main/db");
const base = {
    id: 'unit-pool',
    name: 'unit',
    host: 'localhost',
    port: 5432,
    database: 'x',
    user: 'u',
    password: 'p',
    ssl: 'disable',
    createdAt: 0,
};
(0, harness_1.group)('pool — clampPoolSize', () => {
    (0, harness_1.test)('default when missing', () => (0, harness_1.eq)((0, db_1.clampPoolSize)(undefined), 5));
    (0, harness_1.test)('default when null', () => (0, harness_1.eq)((0, db_1.clampPoolSize)(null), 5));
    (0, harness_1.test)('clamps zero up to 1', () => (0, harness_1.eq)((0, db_1.clampPoolSize)(0), 1));
    (0, harness_1.test)('clamps negative up to 1', () => (0, harness_1.eq)((0, db_1.clampPoolSize)(-3), 1));
    (0, harness_1.test)('preserves typical', () => (0, harness_1.eq)((0, db_1.clampPoolSize)(8), 8));
    (0, harness_1.test)('floors floats', () => (0, harness_1.eq)((0, db_1.clampPoolSize)(7.7), 7));
    (0, harness_1.test)('caps at 32', () => (0, harness_1.eq)((0, db_1.clampPoolSize)(1000), 32));
    (0, harness_1.test)('NaN -> default', () => (0, harness_1.eq)((0, db_1.clampPoolSize)(NaN), 5));
});
(0, harness_1.group)('pool — buildPoolConfig', () => {
    (0, harness_1.test)('default size is 5', () => {
        const cfg = (0, db_1.buildPoolConfig)({ ...base });
        (0, harness_1.eq)(cfg.max, 5);
    });
    (0, harness_1.test)('honors poolSize', () => {
        const cfg = (0, db_1.buildPoolConfig)({ ...base, poolSize: 10 });
        (0, harness_1.eq)(cfg.max, 10);
    });
    (0, harness_1.test)('clamps high poolSize', () => {
        const cfg = (0, db_1.buildPoolConfig)({ ...base, poolSize: 9999 });
        (0, harness_1.eq)(cfg.max, 32);
    });
    (0, harness_1.test)('enables keepalive', () => {
        const cfg = (0, db_1.buildPoolConfig)({ ...base });
        (0, harness_1.eq)(cfg.keepAlive, true);
        (0, harness_1.assert)(cfg.keepAliveInitialDelayMillis > 0);
    });
    (0, harness_1.test)('sets connectionTimeoutMillis', () => {
        const cfg = (0, db_1.buildPoolConfig)({ ...base });
        (0, harness_1.assert)(cfg.connectionTimeoutMillis > 0);
    });
    (0, harness_1.test)('ssl disable -> false', () => {
        const cfg = (0, db_1.buildPoolConfig)({ ...base, ssl: 'disable' });
        (0, harness_1.eq)(cfg.ssl, false);
    });
    (0, harness_1.test)('ssl require -> rejectUnauthorized false', () => {
        const cfg = (0, db_1.buildPoolConfig)({ ...base, ssl: 'require' });
        (0, harness_1.eq)(cfg.ssl.rejectUnauthorized, false);
    });
    (0, harness_1.test)('ssl verify-full -> rejectUnauthorized true', () => {
        const cfg = (0, db_1.buildPoolConfig)({ ...base, ssl: 'verify-full' });
        (0, harness_1.eq)(cfg.ssl.rejectUnauthorized, true);
    });
    (0, harness_1.test)('sets application_name', () => {
        const cfg = (0, db_1.buildPoolConfig)({ ...base });
        (0, harness_1.eq)(cfg.application_name, 'Mili DB Explorer');
    });
});
