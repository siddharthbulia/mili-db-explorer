import { test, expect } from '@playwright/test';
import { launchApp, openPalette } from './helpers';

test('Command palette opens and surfaces core commands', async () => {
  const { app, page, dispose } = await launchApp();
  try {
    await openPalette(app, page);
    const input = page.getByPlaceholder(/Type a command/i);
    await expect(input).toBeVisible();

    // Type to filter — verify core commands are reachable.
    await input.fill('settings');
    await expect(page.getByText(/Open settings/i)).toBeVisible();

    await input.fill('keyboard');
    await expect(page.getByText(/Show keyboard shortcuts/i)).toBeVisible();

    await input.fill('about');
    await expect(page.getByText(/About Mili DB Explorer/i)).toBeVisible();
  } finally {
    await dispose();
  }
});

test('Escape closes the palette', async () => {
  const { app, page, dispose } = await launchApp();
  try {
    await openPalette(app, page);
    await expect(page.getByPlaceholder(/Type a command/i)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByPlaceholder(/Type a command/i)).not.toBeVisible();
  } finally {
    await dispose();
  }
});

test('Clicking the backdrop closes the palette', async () => {
  const { app, page, dispose } = await launchApp();
  try {
    await openPalette(app, page);
    // Click far from the modal — the .modal-backdrop click handler closes.
    await page.mouse.click(50, 600);
    await expect(page.getByPlaceholder(/Type a command/i)).not.toBeVisible();
  } finally {
    await dispose();
  }
});
