import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';

test.describe('Photo Converter In-Depth Testing', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    page.on('console', msg => console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', err => console.error(`[BROWSER ERROR] ${err}`));
  });

  const testCases = [
    { name: 'oversized-photo.jpg', targetKB: 50, border: 'Thin Black Border', format: 'image/jpeg' },
    { name: 'oversized-photo.jpg', targetKB: 20, border: 'Thin Black Border', format: 'image/jpeg' },
    { name: 'small-photo.jpg', targetKB: 20, border: 'Thin Black Border', format: 'image/jpeg' },
    { name: 'exif-rotated-90cw.jpg', targetKB: 50, border: 'Thin Black Border', format: 'image/jpeg' },
    { name: 'portrait-person.png', targetKB: 50, border: 'Thin Black Border', format: 'image/png' },
    { name: 'valid-photo.jpg', targetKB: 50, border: 'Passport White Frame', format: 'image/jpeg' },
    { name: 'valid-photo.jpg', targetKB: 20, border: 'Thin Black Border', format: 'image/webp' },
  ];

  for (const tc of testCases) {
    test(`Test ${tc.name} target ${tc.targetKB}KB border ${tc.border} format ${tc.format}`, async ({ page }) => {
      await page.goto('/features/photo');
      await expect(page).toHaveURL(/.*features\/photo/);

      const fileInput = page.locator('input[type="file"]').first();
      await expect(fileInput).toBeAttached();

      const photoPath = getTestDataPath(`photos/${tc.name}`);
      await fileInput.setInputFiles(photoPath);

      await expect(page.locator('.configuring-section')).toBeVisible({ timeout: 10000 });

      // If custom KB
      if (tc.targetKB !== 50) {
        // Look for preset chip or custom chip
        const chip = page.locator('.preset-chip', { hasText: `${tc.targetKB} KB` });
        if (await chip.isVisible()) {
          await chip.click();
        } else {
          const customChip = page.locator('.custom-chip');
          await customChip.click();
          const kbInput = page.locator('.custom-kb-input');
          await kbInput.fill(String(tc.targetKB));
          await kbInput.dispatchEvent('input');
        }
      }

      // Customize style
      const customizeBtn = page.locator('.style-toggle-btn');
      await customizeBtn.click();

      // Border
      const borderBtn = page.locator('button.format-chip', { hasText: tc.border });
      await expect(borderBtn).toBeVisible();
      await borderBtn.click();

      // Format
      if (tc.format === 'image/png') {
        const pngBtn = page.locator('button.format-chip', { hasText: 'PNG' });
        await pngBtn.click();
      } else if (tc.format === 'image/webp') {
        const webpBtn = page.locator('button.format-chip', { hasText: 'WebP' });
        await webpBtn.click();
      }

      // Compress
      const compressBtn = page.locator('.btn-primary', { hasText: /Compress to/i });
      await compressBtn.click();

      // Wait for success or error
      await page.waitForTimeout(4000);

      const hasError = await page.locator('.error-banner, .toast-error, .workflow-error').isVisible();
      const hasSuccess = await page.locator('app-result-preview').isVisible();

      console.log(`[RESULT ${tc.name} ${tc.targetKB}KB ${tc.format}]: success=${hasSuccess}, error=${hasError}`);
      if (hasError) {
        const errorText = await page.locator('.error-banner, .toast-error, .workflow-error').textContent();
        console.error(`[ERROR MSG]: ${errorText}`);
      }
      expect(hasSuccess).toBe(true);
      expect(hasError).toBe(false);
    });
  }
});
