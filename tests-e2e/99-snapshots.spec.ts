import { test, expect } from '@playwright/test';
import { launchApp, openKeymap } from './helpers';

/**
 * Visual regression. Run on the host with:
 *   npm run test:e2e:update-snapshots
 *
 * Baselines live in `tests-e2e/__screenshots__/`. They're OS- and DPI-
 * specific — store only the macOS baselines in git for now and use
 * `maxDiffPixelRatio` (0.02 in playwright.config.ts) to absorb minor
 * font-rendering differences.
 */
// Clip to a fixed 1400×800 region so cold-start variations in the OS window
// height don't churn the baseline. The top-left corner of the BrowserWindow
// is what we care about — the rest is background.
const CLIP = { x: 0, y: 0, width: 1400, height: 800 };
const STABLE_CSS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
`;

test.describe('Snapshots', () => {
  test('home window welcome', async () => {
    const { page, dispose } = await launchApp();
    try {
      await page.addStyleTag({ content: STABLE_CSS });
      await expect(page).toHaveScreenshot('welcome.png', { clip: CLIP });
    } finally {
      await dispose();
    }
  });

  test('connection form empty', async () => {
    const { page, dispose } = await launchApp();
    try {
      await page.getByRole('button', { name: /Add connection/i }).click();
      await page.addStyleTag({ content: STABLE_CSS });
      await expect(page.getByLabel('Host')).toBeVisible();
      await expect(page).toHaveScreenshot('connection-form.png', { clip: CLIP });
    } finally {
      await dispose();
    }
  });

  test('keymap modal default', async () => {
    const { page, dispose } = await launchApp();
    try {
      await openKeymap(page);
      await page.addStyleTag({ content: STABLE_CSS });
      await expect(page).toHaveScreenshot('keymap.png', { clip: CLIP });
    } finally {
      await dispose();
    }
  });
});
