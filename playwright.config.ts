import { defineConfig } from '@playwright/test';

/**
 * Playwright config for the Electron E2E suite.
 *
 * - Tests live in `tests-e2e/` and drive the real Electron binary via the
 *   `_electron` API (built into playwright/test).
 * - We launch the locally-installed `electron` (node_modules/.bin/electron .)
 *   so the suite uses the same version the user runs. No packaged DMG needed.
 * - Each test spec is in charge of launching/closing the app — there's no
 *   global setup. This keeps each test isolated and CI-friendly.
 * - Screenshots are stored at `tests-e2e/__screenshots__/`. Update them with
 *   `npm run test:e2e:update-snapshots`.
 */
export default defineConfig({
  testDir: 'tests-e2e',
  // Electron tests share a single OS-level Chromium instance via Playwright's
  // `_electron.launch` — running them serially avoids window-focus races.
  fullyParallel: false,
  workers: 1,
  // Each test is small, but Electron cold-start is ~2-3 seconds.
  timeout: 60_000,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  // The snapshot folder lives next to the specs — easier to PR-review.
  snapshotDir: 'tests-e2e/__screenshots__',
  // Visual snapshots: allow tiny anti-aliasing differences cross-OS without
  // turning into a noise machine. Tighten per-test if you want strict pixels.
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled' },
  },
  use: {
    trace: process.env.CI ? 'retain-on-failure' : 'off',
    screenshot: 'only-on-failure',
    video: 'off',
  },
});
