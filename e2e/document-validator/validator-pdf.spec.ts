import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';

test.describe('Document Validator — PDF Validation Rules @validator', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/document-validator');
  });

  test('VAL-048: Upload valid PDF and verify validation status', async ({ page }) => {
    // Select a preset that requires PDF if available or use PDF slot
    const pdfSlotInput = page.locator('.slot-pdf input[type="file"], input[type="file"]').last();
    if (await pdfSlotInput.count() > 0) {
      await pdfSlotInput.setInputFiles(getTestDataPath('pdf/text.pdf'));

      const validateBtn = page.locator('.btn-validate-all, button:has-text("Validate")');
      if (await validateBtn.isVisible()) {
        await validateBtn.click();
      }

      await expect(page.locator('.validation-report, .rule-row, .status-badge')).toBeVisible({ timeout: 10000 });
    }
  });
});
