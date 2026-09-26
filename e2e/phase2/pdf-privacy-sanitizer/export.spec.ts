import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone,
  waitForProcessingToFinish,
  interceptDownload,
  validateDownloadedPdf
} from '../../common/phase2-helpers';

test.describe('PDF Privacy Sanitizer — Export & Reset Actions @phase2 @privacy @download', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-privacy-sanitizer');
  });

  test('PRV-040: Download sanitized PDF succeeds and produces valid output', async ({ page }) => {
    const cleanPath = getPhase2FixturePath('privacy-clean.pdf');
    await uploadFileToDropzone(page, cleanPath);
    await waitForProcessingToFinish(page);

    const sanitizeBtn = page.locator('app-button[data-testid="start-sanitization"] button').first();
    await sanitizeBtn.click();
    await waitForProcessingToFinish(page);

    const downloadBtn = page.locator('.result-actions button:has-text("Download"), .result-actions button:has-text("डाउनलोड")').first();
    const downloadInfo = await interceptDownload(page, async () => {
      await downloadBtn.click();
    });

    expect(downloadInfo.fileName).toContain('.pdf');
    expect(downloadInfo.size).toBeGreaterThan(0);
    const pdfDoc = await validateDownloadedPdf(downloadInfo.buffer, 1);
    expect(pdfDoc.pageCount).toBe(1);
  });

  test('PRV-041: Reset button returns to file select step', async ({ page }) => {
    const cleanPath = getPhase2FixturePath('privacy-clean.pdf');
    await uploadFileToDropzone(page, cleanPath);
    await waitForProcessingToFinish(page);

    const resetBtn = page.locator('app-button button:has-text("Choose another"), app-button button:has-text("दूसरा चुनें")').first();
    await resetBtn.click();

    await expect(page.locator('.select-step-section')).toBeVisible();
    await expect(page.locator('.dropzone-wrapper')).toBeVisible();
  });
});
