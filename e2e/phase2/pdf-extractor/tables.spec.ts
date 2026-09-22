import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone,
  waitForProcessingToFinish,
  interceptDownload,
  validateDownloadedCsv,
  validateDownloadedXlsx
} from '../../common/phase2-helpers';

test.describe('PDF Content Extractor — Table Extraction, CSV & XLSX Export @phase2 @extractor @download', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-extractor');
    const pdfPath = getPhase2FixturePath('extractor-tables.pdf');
    await uploadFileToDropzone(page, pdfPath);
    await expect(page.locator('.options-checklist-card')).toBeVisible({ timeout: 15000 });

    const startBtn = page.locator('.action-bar-center button:has-text("Extract"), .action-bar-center button:has-text("निष्कर्षण शुरू करें")').first();
    await startBtn.click();
    await waitForProcessingToFinish(page);
    await expect(page.locator('.result-section')).toBeVisible({ timeout: 15000 });

    // Switch to Tables tab
    const tablesTab = page.locator('.tabs-wrapper app-tabs button').filter({ hasText: /tables|तालिकाएं/i });
    await tablesTab.click();
  });

  test('EXT-030: Tables tab displays table preview and limitation notice', async ({ page }) => {
    const tablesPanel = page.locator('.tables-panel');
    await expect(tablesPanel).toBeVisible();

    // Limitation notice should be present
    const notice = page.locator('.limitation-notice');
    await expect(notice).toBeVisible();

    // Table preview or empty state
    await expect(page.locator('.table-card, .empty-state')).toBeVisible();
  });

  test('EXT-031: Export table to CSV downloads valid delimited file', async ({ page }) => {
    const csvBtn = page.locator('.table-actions button:has-text("CSV")').first();
    if (await csvBtn.isVisible()) {
      const downloadInfo = await interceptDownload(page, async () => {
        await csvBtn.click();
      });

      expect(downloadInfo.fileName).toContain('.csv');
      expect(downloadInfo.size).toBeGreaterThan(0);

      const csvData = validateDownloadedCsv(downloadInfo.buffer, 1);
      expect(csvData.headers.length).toBeGreaterThan(0);
    }
  });

  test('EXT-032: Export table to XLSX downloads valid workbook', async ({ page }) => {
    const xlsxBtn = page.locator('.table-actions button:has-text("XLSX"), .table-actions button:has-text("एक्सेल")').first();
    if (await xlsxBtn.isVisible()) {
      const downloadInfo = await interceptDownload(page, async () => {
        await xlsxBtn.click();
      });

      expect(downloadInfo.fileName).toContain('.xlsx');
      expect(downloadInfo.size).toBeGreaterThan(0);

      const xlsxData = validateDownloadedXlsx(downloadInfo.buffer);
      expect(xlsxData.sheetNames.length).toBeGreaterThanOrEqual(1);
    }
  });
});
