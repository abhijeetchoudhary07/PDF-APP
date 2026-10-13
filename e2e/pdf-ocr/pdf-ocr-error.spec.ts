import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';
import { attachPdf, cancelOcrButton, openConfigureStep, startOcrButton } from '../fixtures/ocr';

test.describe('Smart PDF OCR — Error Recovery & Interruption @ocr @error', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-ocr');
  });

  test('OCR-007 & OCR-045: Upload corrupted PDF and verify error notification', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(getTestDataPath('pdf/corrupt.pdf'));

    await expect(page.locator('.toast-item, [role="alert"], .error-message').first()).toBeVisible({ timeout: 10000 });
  });

  /*
   * This was two nested one-shot guards:
   *
   *     if (await startBtn.isVisible()) {
   *       await startBtn.click();
   *       if (await cancelBtn.isVisible()) { ...the assertion... }
   *     }
   *
   * Neither could be true at the moment it was checked. `.btn-start-ocr` is not
   * in the template, and the button it stands for only exists once the
   * configure step is open -- which is several async steps after the file is
   * attached. So the outer guard was false, the body never ran, and the test
   * passed without starting or cancelling anything.
   */
  test('OCR-041 & OCR-042: recognition can be cancelled and the page stays usable', async ({ page }) => {
    await attachPdf(page, 'pdf/scanned.pdf');
    await openConfigureStep(page);
    await startOcrButton(page).click();

    const cancel = cancelOcrButton(page);
    await expect(cancel).toBeVisible({ timeout: 30000 });
    await cancel.click();

    // Cancelling drops back to the settings step, with start offered again.
    await expect(startOcrButton(page)).toBeVisible({ timeout: 15000 });
    await expect(startOcrButton(page)).toBeEnabled();
  });
});
