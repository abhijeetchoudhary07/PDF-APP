import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone,
  waitForProcessingToFinish,
  interceptDownload,
  validateDownloadedPdf
} from '../../common/phase2-helpers';

test.describe('Header / Footer Studio — Orientation & Multi-Page Handling @phase2 @header-footer', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('HF-040: Multi-page portrait PDF processes and preserves page count', async ({ page }) => {
    await page.goto('/features/pdf-header-footer');
    const pdfPath = getPhase2FixturePath('hf-multipage-portrait.pdf');
    await uploadFileToDropzone(page, pdfPath);
    await expect(page.locator('.configure-section')).toBeVisible({ timeout: 15000 });

    // Set page numbers in footer
    const footerCenter = page.locator('.input-group input.form-input').nth(1);
    await footerCenter.fill('Page {page} of {totalPages}');

    // Apply
    const applyBtn = page.locator('.apply-action-bar button:has-text("Apply"), .apply-action-bar button:has-text("लागू करें")').first();
    await applyBtn.click();
    await waitForProcessingToFinish(page);

    await expect(page.locator('.result-section')).toBeVisible({ timeout: 15000 });

    // Download and verify 6 pages
    const downloadBtn = page.locator('.result-actions button:has-text("Download"), .result-actions button:has-text("डाउनलोड")').first();
    const downloadInfo = await interceptDownload(page, async () => {
      await downloadBtn.click();
    });

    const pdfInfo = await validateDownloadedPdf(downloadInfo.buffer, 6);
    expect(pdfInfo.pageCount).toBe(6);
  });

  test('HF-041: Landscape PDF applies headers/footers accurately', async ({ page }) => {
    await page.goto('/features/pdf-header-footer');
    const pdfPath = getPhase2FixturePath('hf-multipage-landscape.pdf');
    await uploadFileToDropzone(page, pdfPath);
    await expect(page.locator('.configure-section')).toBeVisible({ timeout: 15000 });

    const footerCenter = page.locator('.input-group input.form-input').nth(1);
    await footerCenter.fill('Landscape Document - Page {page}');

    const applyBtn = page.locator('.apply-action-bar button:has-text("Apply"), .apply-action-bar button:has-text("लागू करें")').first();
    await applyBtn.click();
    await waitForProcessingToFinish(page);

    await expect(page.locator('.result-section')).toBeVisible({ timeout: 15000 });
    const downloadBtn = page.locator('.result-actions button:has-text("Download"), .result-actions button:has-text("डाउनलोड")').first();
    const downloadInfo = await interceptDownload(page, async () => {
      await downloadBtn.click();
    });

    const pdfInfo = await validateDownloadedPdf(downloadInfo.buffer, 3);
    expect(pdfInfo.pageCount).toBe(3);
  });
});
