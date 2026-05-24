import type { ConnectionConfig } from '../src/shared/types';

/**
 * The test suite needs a live Postgres. Local dev defaults to the long-time
 * project DB; CI provides the values via env vars set by the workflow
 * (which runs a postgres:16 service container). Either way the test runner
 * reads from the same constants here, so a CI failure can be reproduced
 * locally by exporting the same vars before `npm test`.
 */
const E = process.env;
export const TEST_CONNECTION: ConnectionConfig = {
  id: 'test-conn',
  name: 'test',
  host: E.MILI_TEST_PG_HOST || 'localhost',
  port: Number(E.MILI_TEST_PG_PORT) || 5432,
  database: E.MILI_TEST_PG_DATABASE || 'mili_db_explorer_test',
  user: E.MILI_TEST_PG_USER || 'miliuser',
  password: E.MILI_TEST_PG_PASSWORD || 'anduyag61bbwqas',
  ssl: 'disable',
  createdAt: Date.now(),
};
