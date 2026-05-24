import { test, expect } from '@playwright/test';
import { launchApp } from './helpers';

/**
 * The home window has no active connection, so the keyboard shortcuts that
 * need one (⌘T, ⌘R, ⌘W) are no-ops. We assert the *absence* of misbehavior
 * — the Welcome screen stays visible — instead of trying to trigger them.
 *
 * The full keyboard suite for the workspace window is covered by the
 * Postgres-backed E2E pass in `09-workspace.spec.ts`, which auto-skips when
 * MILI_E2E_PG_URL is unset.
 */
test('Welcome screen stays visible when no connection is active', async () => {
  const { page, dispose } = await launchApp();
  try {
    // Send a no-op shortcut just to prove it doesn't crash anything.
    await page.keyboard.press('Meta+R');
    await expect(page.getByText(/Pick a connection/i)).toBeVisible();
  } finally {
    await dispose();
  }
});

test('Notifications bell opens the panel even with empty history', async () => {
  const { page, dispose } = await launchApp();
  try {
    await page.getByRole('button', { name: /Notifications/i }).click();
    // Header text inside the panel.
    const header = page.locator('strong', { hasText: /^Notifications$/ });
    await expect(header).toBeVisible();
    // Empty-state copy — accept either "No notifications." or "yet" variant.
    await expect(page.getByText(/No notifications/i)).toBeVisible();
    // Category tabs — `name: 'all'` would collide with "Clear all" so we
    // match exactly.
    await expect(page.getByRole('button', { name: 'all', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'error', exact: true })).toBeVisible();
  } finally {
    await dispose();
  }
});
