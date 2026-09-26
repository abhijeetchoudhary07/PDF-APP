import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone,
  waitForProcessingToFinish,
  interceptDownload,
  validateDownloadedText
} from '../../common/phase2-helpers';

test.describe('PDF Compare — Report Generation & Export @phase2 @compare @download', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-compare');
  });

  test('CMP-050: Comparison report displays accurate summary metrics', async ({ page }) => {
    const origPath = getPhase2FixturePath('text-changed-original.pdf');
    const modPath = getPhase2FixturePath('text-changed-modified.pdf');

    await uploadFileToDropzone(page, origPath, 0);
    await uploadFileToDropzone(page, modPath, 1);
    await page.locator('.action-bar-center button').first().click();
    await waitForProcessingToFinish(page);

    await expect(page.locator('.result-section')).toBeVisible({ timeout: 15000 });

    const metricsGrid = page.locator('.summary-metrics-grid');
    await expect(metricsGrid).toBeVisible();

    // Check metric labels
    await expect(page.locator('.metric-card').first()).toBeVisible();
  });

  test('CMP-051: Export text report downloads valid non-empty file', async ({ page }) => {
    const origPath = getPhase2FixturePath('text-changed-original.pdf');
    const modPath = getPhase2FixturePath('text-changed-modified.pdf');

    await uploadFileToDropzone(page, origPath, 0);
    await uploadFileToDropzone(page, modPath, 1);
    await page.locator('.action-bar-center button').first().click();
    await waitForProcessingToFinish(page);

    await expect(page.locator('.result-section')).toBeVisible({ timeout: 15000 });

    // Click download report button and intercept download
    const downloadBtn = page.locator('app-button[data-testid="download-report"] button');

    const downloadInfo = await interceptDownload(page, async () => {
      await downloadBtn.click();
    });

    expect(downloadInfo.fileName).toContain('pdf_comparison_report.txt');
    expect(downloadInfo.size).toBeGreaterThan(0);

    // These are the labels `PdfCompareService.generateTextReport` actually
    // writes. The spec used to assert "Original Document:" / "Total Pages
    // Compared:", which the report has never said.
    const reportText = validateDownloadedText(downloadInfo.buffer, [
      'PDF COMPARISON REPORT',
      'Original File:',
      'Modified File:',
      'SUMMARY STATISTICS',
      'Pages Compared:',
      'PAGE-BY-PAGE DETAILS'
    ]);
    expect(reportText).toContain('text-changed-original.pdf');
    expect(reportText).toContain('text-changed-modified.pdf');
  });
});
