import { test, expect } from '@playwright/test';
import { launchApp } from './helpers';

test('New connection form opens, accepts a postgres:// URL, fills the fields', async () => {
  const { page, dispose } = await launchApp();
  try {
    await page.getByRole('button', { name: /New connection/i }).first().click();

    const urlBox = page.getByPlaceholder(/Paste postgres:\/\//);
    await expect(urlBox).toBeVisible();

    await urlBox.fill('postgres://alice:secret@db.example.com:6543/orders?sslmode=require');
    await page.getByRole('button', { name: /^Parse$/ }).click();

    // Verify the parser plumbed fields through.
    await expect(page.getByLabel('Host')).toHaveValue('db.example.com');
    await expect(page.getByLabel('Port')).toHaveValue('6543');
    await expect(page.getByLabel('Database')).toHaveValue('orders');
    await expect(page.getByLabel('User')).toHaveValue('alice');
    await expect(page.getByLabel('Password')).toHaveValue('secret');
    await expect(page.getByLabel('SSL')).toHaveValue('require');
  } finally {
    await dispose();
  }
});

test('Cancel button closes the form without persisting', async () => {
  const { page, dispose } = await launchApp();
  try {
    await page.getByRole('button', { name: /New connection/i }).first().click();
    await page.getByLabel('Name').fill('temp');
    await page.getByRole('button', { name: /^Cancel$/ }).click();
    await expect(page.getByPlaceholder(/Paste postgres:\/\//)).not.toBeVisible();
    // Sidebar still shows the empty state.
    await expect(page.getByText(/No connections yet/i)).toBeVisible();
  } finally {
    await dispose();
  }
});
