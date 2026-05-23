"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const harness_1 = require("../harness");
const db_1 = require("../../src/main/db");
const connect_1 = require("../connect");
(0, harness_1.group)('connections — testConnection', () => {
    (0, harness_1.test)('valid credentials', async () => {
        const r = await (0, db_1.testConnection)(connect_1.TEST_CONNECTION);
        (0, harness_1.assert)(r.ok, r.error);
        (0, harness_1.assert)(r.serverVersion && r.serverVersion.toLowerCase().includes('postgresql'));
    });
    (0, harness_1.test)('wrong password', async () => {
        const r = await (0, db_1.testConnection)({ ...connect_1.TEST_CONNECTION, password: 'wrong-' + Math.random() });
        (0, harness_1.assert)(!r.ok);
    });
    (0, harness_1.test)('wrong user', async () => {
        const r = await (0, db_1.testConnection)({ ...connect_1.TEST_CONNECTION, user: 'no_such_user_' + Date.now() });
        (0, harness_1.assert)(!r.ok);
    });
    (0, harness_1.test)('wrong database', async () => {
        const r = await (0, db_1.testConnection)({ ...connect_1.TEST_CONNECTION, database: 'no_such_db_' + Date.now() });
        (0, harness_1.assert)(!r.ok);
    });
    (0, harness_1.test)('wrong port', async () => {
        const r = await (0, db_1.testConnection)({ ...connect_1.TEST_CONNECTION, port: 1 });
        (0, harness_1.assert)(!r.ok);
    });
    (0, harness_1.test)('wrong host', async () => {
        const r = await (0, db_1.testConnection)({ ...connect_1.TEST_CONNECTION, host: '127.255.255.254' });
        (0, harness_1.assert)(!r.ok);
    });
});
(0, harness_1.group)('connections — openConnection lifecycle', () => {
    (0, harness_1.test)('open twice — second supersedes first', async () => {
        const r1 = await (0, db_1.openConnection)(connect_1.TEST_CONNECTION);
        (0, harness_1.assert)(r1.ok, r1.error);
        const r2 = await (0, db_1.openConnection)(connect_1.TEST_CONNECTION);
        (0, harness_1.assert)(r2.ok, r2.error);
    });
    (0, harness_1.test)('close then re-open', async () => {
        (0, db_1.closeConnection)(connect_1.TEST_CONNECTION.id);
        const r = await (0, db_1.openConnection)(connect_1.TEST_CONNECTION);
        (0, harness_1.assert)(r.ok, r.error);
    });
    (0, harness_1.test)('closeAll is idempotent', async () => {
        (0, db_1.closeAll)();
        (0, db_1.closeAll)();
        const r = await (0, db_1.openConnection)(connect_1.TEST_CONNECTION);
        (0, harness_1.assert)(r.ok, r.error);
    });
});
