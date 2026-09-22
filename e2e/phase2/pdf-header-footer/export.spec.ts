import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone,
  waitForProcessingToFinish,
  interceptDownload,
  validateDownloadedPdf
} from '../../common/phase2-helpers';

test.describe('Header / Footer Studio — Export & Output Validation @phase2 @header-footer @download', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-header-footer');
  });

  test('HF-050: Export generated PDF contains expected structure and page count', async ({ page }) => {
    const pdfPath = getPhase2FixturePath('hf-1page-portrait.pdf');
    await uploadFileToDropzone(page, pdfPath);
    await expect(page.locator('.configure-section')).toBeVisible({ timeout: 15000 });

    const footerRight = page.locator('.input-group input.form-input').nth(2);
    await footerRight.fill('{page} of {totalPages}');

    const applyBtn = page.locator('.apply-action-bar button:has-text("Apply"), .apply-action-bar button:has-text("लागू करें")').first();
    await applyBtn.click();
    await waitForProcessingToFinish(page);

    await expect(page.locator('.result-section')).toBeVisible({ timeout: 15000 });

    const downloadBtn = page.locator('.result-actions button:has-text("Download"), .result-actions button:has-text("डाउनलोड")').first();
    const downloadInfo = await interceptDownload(page, async () => {
      await downloadBtn.click();
    });

    expect(downloadInfo.fileName).toContain('.pdf');
    expect(downloadInfo.size).toBeGreaterThan(0);

    const pdfInfo = await validateDownloadedPdf(downloadInfo.buffer, 1);
    expect(pdfInfo.pageCount).toBe(1);
  });

  test('HF-051: Reset button clears state and allows new upload', async ({ page }) => {
    const pdfPath = getPhase2FixturePath('hf-1page-portrait.pdf');
    await uploadFileToDropzone(page, pdfPath);
    await expect(page.locator('.configure-section')).toBeVisible({ timeout: 15000 });

    const resetBtn = page.locator('.apply-action-bar button:has-text("Choose another"), .apply-action-bar button:has-text("दूसरा चुनें")').first();
    await resetBtn.click();

    await expect(page.locator('.select-section')).toBeVisible();
    await expect(page.locator('.dropzone-wrapper')).toBeVisible();
  });
});
