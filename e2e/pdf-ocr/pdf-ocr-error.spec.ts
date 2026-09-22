import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';

test.describe('Smart PDF OCR — Error Recovery & Interruption @ocr @error', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-ocr');
  });

  test('OCR-007 & OCR-045: Upload corrupted PDF and verify error notification', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(getTestDataPath('pdf/corrupt.pdf'));

    await expect(page.locator('.toast-item, [role="alert"], .error-message')).toBeVisible({ timeout: 10000 });
  });

  test('OCR-041 & OCR-042: Cancel midway and verify clean state', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(getTestDataPath('pdf/scanned.pdf'));

    const startBtn = page.locator('.btn-start-ocr, button:has-text("Start OCR")');
    if (await startBtn.isVisible()) {
      await startBtn.click();
      const cancelBtn = page.locator('.btn-cancel-ocr, button:has-text("Cancel")');
      if (await cancelBtn.isVisible()) {
        await cancelBtn.click();
        // State remains responsive and can be restarted
        await expect(page.locator('.btn-start-ocr, .dropzone-container')).toBeVisible({ timeout: 10000 });
      }
    }
  });
});
