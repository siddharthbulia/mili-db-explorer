import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Renderer unit tests run under jsdom with React + RTL. We deliberately keep
 * them OUT of the existing node-based test suite (`npm test` / `tests/run.ts`)
 * which targets shared helpers and the main process — those need plain Node
 * and a live Postgres. Run with `npm run test:unit`.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests-unit/**/*.test.{ts,tsx}'],
    setupFiles: ['tests-unit/setup.ts'],
    css: false,           // we don't need stylesheets compiled for logic tests
    pool: 'forks',        // jsdom + react state is happier in forked workers
    isolate: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/renderer/**/*.{ts,tsx}'],
      exclude: ['**/*.d.ts', 'src/renderer/main.tsx'],
    },
  },
});
