import { test, expect } from '@playwright/test';
import { launchApp, openAbout, openChangelog } from './helpers';

test('About modal shows the version + platform info', async () => {
  const { page, dispose } = await launchApp();
  try {
    await openAbout(page);
    // Header is a <strong>, not a real heading — match by exact text.
    await expect(page.locator('strong', { hasText: /^About$/ })).toBeVisible();
    // Version pill like "v2.0.1" — we don't pin a specific value.
    await expect(page.locator('text=/^v\\d+\\.\\d+\\.\\d+$/').first()).toBeVisible();
    await expect(page.locator('text=/Electron \\d+/')).toBeVisible();
  } finally {
    await dispose();
  }
});

test('Changelog modal opens and lists at least one known version', async () => {
  const { page, dispose } = await launchApp();
  try {
    await openChangelog(page);
    await expect(page.locator('strong', { hasText: /^Changelog$/ })).toBeVisible();
    // Any release line is fine.
    await expect(page.locator('text=/v\\d+\\.\\d+\\.\\d+/').first()).toBeVisible();
  } finally {
    await dispose();
  }
});
