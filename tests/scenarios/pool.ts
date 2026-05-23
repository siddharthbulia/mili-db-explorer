import { group, test, eq, assert } from '../harness';
import { buildPoolConfig, clampPoolSize } from '../../src/main/db';
import type { ConnectionConfig } from '../../src/shared/types';

const base: ConnectionConfig = {
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

group('pool — clampPoolSize', () => {
  test('default when missing', () => eq(clampPoolSize(undefined), 5));
  test('default when null', () => eq(clampPoolSize(null), 5));
  test('clamps zero up to 1', () => eq(clampPoolSize(0), 1));
  test('clamps negative up to 1', () => eq(clampPoolSize(-3), 1));
  test('preserves typical', () => eq(clampPoolSize(8), 8));
  test('floors floats', () => eq(clampPoolSize(7.7), 7));
  test('caps at 32', () => eq(clampPoolSize(1000), 32));
  test('NaN -> default', () => eq(clampPoolSize(NaN), 5));
});

group('pool — buildPoolConfig', () => {
  test('default size is 5', () => {
    const cfg = buildPoolConfig({ ...base }) as any;
    eq(cfg.max, 5);
  });
  test('honors poolSize', () => {
    const cfg = buildPoolConfig({ ...base, poolSize: 10 }) as any;
    eq(cfg.max, 10);
  });
  test('clamps high poolSize', () => {
    const cfg = buildPoolConfig({ ...base, poolSize: 9999 }) as any;
    eq(cfg.max, 32);
  });
  test('enables keepalive', () => {
    const cfg = buildPoolConfig({ ...base }) as any;
    eq(cfg.keepAlive, true);
    assert(cfg.keepAliveInitialDelayMillis > 0);
  });
  test('sets connectionTimeoutMillis', () => {
    const cfg = buildPoolConfig({ ...base }) as any;
    assert(cfg.connectionTimeoutMillis > 0);
  });
  test('ssl disable -> false', () => {
    const cfg = buildPoolConfig({ ...base, ssl: 'disable' }) as any;
    eq(cfg.ssl, false);
  });
  test('ssl require -> rejectUnauthorized false', () => {
    const cfg = buildPoolConfig({ ...base, ssl: 'require' }) as any;
    eq(cfg.ssl.rejectUnauthorized, false);
  });
  test('ssl verify-full -> rejectUnauthorized true', () => {
    const cfg = buildPoolConfig({ ...base, ssl: 'verify-full' }) as any;
    eq(cfg.ssl.rejectUnauthorized, true);
  });
  test('sets application_name', () => {
    const cfg = buildPoolConfig({ ...base }) as any;
    eq(cfg.application_name, 'Mili DB Explorer');
  });
});
