import { test, expect } from '@playwright/test';
import { launchApp } from './helpers';

test.describe('Boot', () => {
  test('app launches with the welcome screen and no console errors', async () => {
    const errors: string[] = [];
    const { app, page, dispose } = await launchApp();
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    try {
      // Welcome empty-state copy.
      await expect(page.getByText(/Pick a connection/i)).toBeVisible();
      // Sidebar CTA (icon button with title="New connection" + the visible
      // "Add connection" text). `.first()` collapses the two matches.
      await expect(page.getByRole('button', { name: /Add connection/i })).toBeVisible();
      // Bell button in the titlebar.
      await expect(page.getByRole('button', { name: /Notifications/i })).toBeVisible();
      // Native OS window title.
      expect(await app.evaluate(async ({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows()[0]?.getTitle();
      })).toMatch(/Mili DB Explorer/);

      // No console.error from React or runtime panics.
      // (Monaco CDN noise can produce non-error warns which we ignore.)
      const fatal = errors.filter((e) =>
        !/loader|Monaco|favicon|DevTools|Autofill|cdn/i.test(e),
      );
      expect(fatal, fatal.join('\n')).toHaveLength(0);
    } finally {
      await dispose();
    }
  });
});
