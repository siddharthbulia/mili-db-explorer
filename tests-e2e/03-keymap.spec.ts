import { test, expect } from '@playwright/test';
import { launchApp, openKeymap } from './helpers';

test('Keymap modal renders all sections', async () => {
  const { page, dispose } = await launchApp();
  try {
    await openKeymap(page);
    await expect(page.getByText('Keyboard shortcuts')).toBeVisible();
    await expect(page.getByText('Tabs & windows')).toBeVisible();
    await expect(page.getByText('SQL editor')).toBeVisible();
    await expect(page.getByText('Data grid')).toBeVisible();
  } finally {
    await dispose();
  }
});

test('Keymap filter narrows to matching rows', async () => {
  const { page, dispose } = await launchApp();
  try {
    await openKeymap(page);
    const filter = page.getByPlaceholder(/Filter — try/i);
    await filter.fill('EXPLAIN');
    await expect(page.getByText(/EXPLAIN ANALYZE current query/i)).toBeVisible();
    await expect(page.getByText(/First \/ last row/i)).not.toBeVisible();
  } finally {
    await dispose();
  }
});

test('Keymap filter shows the empty state for no-match queries', async () => {
  const { page, dispose } = await launchApp();
  try {
    await openKeymap(page);
    await page.getByPlaceholder(/Filter — try/i).fill('zzz_no_match');
    await expect(page.getByText(/No shortcut matches/i)).toBeVisible();
  } finally {
    await dispose();
  }
});
