import { group, test, assert, eq } from '../harness';
import { runQueryScript, cancelQuery, listRunningQueries } from '../../src/main/db';
import { TEST_CONNECTION } from '../connect';

const cid = TEST_CONNECTION.id;

group('cancel — pg_cancel_backend', () => {
  test('long pg_sleep query can be cancelled', async () => {
    const qid = 'cancel-test-1';
    const pending = runQueryScript(cid, 'select pg_sleep(10)', { queryId: qid });
    // Wait briefly for the backend pid to register.
    for (let i = 0; i < 50; i++) {
      const live = listRunningQueries();
      if (live.find((q) => q.id === qid)) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    const before = listRunningQueries();
    assert(!!before.find((q) => q.id === qid), 'query should be registered before cancel');

    const c = await cancelQuery(qid);
    eq(c.ok, true);
    const r = await pending;
    assert(!r.ok, 'cancelled query should not succeed');
    if (!r.ok) {
      // Postgres reports SQLSTATE 57014 (query_canceled) when cancelled.
      assert(
        r.error.code === '57014' || /cancel|terminat/i.test(r.error.message),
        `unexpected error: ${r.error.code} ${r.error.message}`
      );
    }
    // After completion, registry should be empty for that id.
    assert(!listRunningQueries().find((q) => q.id === qid), 'registry should clear after cancel');
  });

  test('cancelQuery on unknown id returns error', async () => {
    const r = await cancelQuery('not-a-real-id');
    eq(r.ok, false);
  });
});
