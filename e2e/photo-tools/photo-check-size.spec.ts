import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';

test('Check actual output size and dimensions in KB mode with thin border', async ({ page }) => {
  await setupCapacitorMocks(page);
  await page.goto('/features/photo');

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(getTestDataPath('photos/portrait-person.png'));
  await expect(page.locator('.configuring-section')).toBeVisible();

  // Customize style
  await page.locator('.style-toggle-btn').click();
  // Thin black border
  await page.locator('button.format-chip', { hasText: 'Thin Black Border' }).click();

  // Set 20 KB
  const chip20 = page.locator('.preset-chip', { hasText: '20 KB' });
  await chip20.click();

  // Compress
  await page.locator('.btn-primary', { hasText: /Compress to/i }).click();

  await expect(page.locator('app-result-preview')).toBeVisible({ timeout: 15000 });

  // Read the result preview values
  const textContent = await page.locator('app-result-preview').textContent();
  console.log(`[RESULT PREVIEW TEXT]: ${textContent}`);
});
