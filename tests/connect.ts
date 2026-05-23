import type { ConnectionConfig } from '../src/shared/types';

export const TEST_CONNECTION: ConnectionConfig = {
  id: 'test-conn',
  name: 'test',
  host: 'localhost',
  port: 5432,
  database: 'mili_db_explorer_test',
  user: 'miliuser',
  password: 'anduyag61bbwqas',
  ssl: 'disable',
  createdAt: Date.now(),
};
