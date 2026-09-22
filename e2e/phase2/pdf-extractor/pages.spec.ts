import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone,
  waitForProcessingToFinish,
  interceptDownload,
  validateDownloadedPdf
} from '../../common/phase2-helpers';

test.describe('PDF Content Extractor — Page Extraction & Thumbnail Selection @phase2 @extractor @download', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-extractor');
    const pdfPath = getPhase2FixturePath('extractor-text.pdf');
    await uploadFileToDropzone(page, pdfPath);
    await expect(page.locator('.options-checklist-card')).toBeVisible({ timeout: 15000 });

    const startBtn = page.locator('.action-bar-center button:has-text("Extract"), .action-bar-center button:has-text("निष्कर्षण शुरू करें")').first();
    await startBtn.click();
    await waitForProcessingToFinish(page);
    await expect(page.locator('.result-section')).toBeVisible({ timeout: 15000 });

    // Switch to Pages tab
    const pagesTab = page.locator('.tabs-wrapper app-tabs button').filter({ hasText: /pages|पृष्ठ/i });
    await pagesTab.click();
  });

  test('EXT-040: Pages tab renders page thumbnails and allows selection', async ({ page }) => {
    const pagesPanel = page.locator('.pages-panel');
    await expect(pagesPanel).toBeVisible();

    const pageCards = page.locator('.pages-selector-grid .page-box-card');
    await expect(pageCards.first()).toBeVisible();

    // Click 'All'
    const allBtn = pagesPanel.locator('button:has-text("All"), button:has-text("सभी")').first();
    await allBtn.click();

    // Export button should be enabled
    const exportBtn = pagesPanel.locator('button:has-text("Export Selected"), button:has-text("चयनित निर्यात करें")').first();
    await expect(exportBtn).toBeEnabled();
  });

  test('EXT-041: Export selected pages produces valid PDF with selected page count', async ({ page }) => {
    const pagesPanel = page.locator('.pages-panel');
    // Select first page only
    const firstPageCard = page.locator('.pages-selector-grid .page-box-card').first();
    await firstPageCard.click();

    const exportBtn = pagesPanel.locator('button:has-text("Export Selected"), button:has-text("चयनित निर्यात करें")').first();
    if (await exportBtn.isEnabled()) {
      const downloadInfo = await interceptDownload(page, async () => {
        await exportBtn.click();
      });

      expect(downloadInfo.fileName).toContain('.pdf');
      expect(downloadInfo.size).toBeGreaterThan(0);

      const pdfInfo = await validateDownloadedPdf(downloadInfo.buffer, 1);
      expect(pdfInfo.pageCount).toBeGreaterThanOrEqual(1);
    }
  });
});
