import { group, test, eq, assert } from '../harness';
import { closeAll, closeConnection, openConnection, testConnection } from '../../src/main/db';
import { TEST_CONNECTION } from '../connect';

group('connections — testConnection', () => {
  test('valid credentials', async () => {
    const r = await testConnection(TEST_CONNECTION);
    assert(r.ok, r.error);
    assert(r.serverVersion && r.serverVersion.toLowerCase().includes('postgresql'));
  });
  test('wrong password', async () => {
    const r = await testConnection({ ...TEST_CONNECTION, password: 'wrong-' + Math.random() });
    assert(!r.ok);
  });
  test('wrong user', async () => {
    const r = await testConnection({ ...TEST_CONNECTION, user: 'no_such_user_' + Date.now() });
    assert(!r.ok);
  });
  test('wrong database', async () => {
    const r = await testConnection({ ...TEST_CONNECTION, database: 'no_such_db_' + Date.now() });
    assert(!r.ok);
  });
  test('wrong port', async () => {
    const r = await testConnection({ ...TEST_CONNECTION, port: 1 });
    assert(!r.ok);
  });
  test('wrong host', async () => {
    const r = await testConnection({ ...TEST_CONNECTION, host: '127.255.255.254' });
    assert(!r.ok);
  });
});

group('connections — openConnection lifecycle', () => {
  test('open twice — second supersedes first', async () => {
    const r1 = await openConnection(TEST_CONNECTION);
    assert(r1.ok, r1.error);
    const r2 = await openConnection(TEST_CONNECTION);
    assert(r2.ok, r2.error);
  });
  test('close then re-open', async () => {
    closeConnection(TEST_CONNECTION.id);
    const r = await openConnection(TEST_CONNECTION);
    assert(r.ok, r.error);
  });
  test('closeAll is idempotent', async () => {
    closeAll();
    closeAll();
    const r = await openConnection(TEST_CONNECTION);
    assert(r.ok, r.error);
  });
});
