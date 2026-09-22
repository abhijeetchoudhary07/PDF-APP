import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone,
  waitForProcessingToFinish,
  interceptDownload,
  validateDownloadedPdf
} from '../../common/phase2-helpers';

test.describe('PDF Repair — Recovered Document Export @phase2 @repair @download', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-repair');
  });

  test('REP-040: Download recovered PDF succeeds with valid output file', async ({ page }) => {
    const pdfPath = getPhase2FixturePath('repair-healthy.pdf');
    await uploadFileToDropzone(page, pdfPath);
    await waitForProcessingToFinish(page);

    const startBtn = page.locator('app-button button:has-text("Start Recovery"), app-button button:has-text("मरम्मत शुरू करें")').first();
    await startBtn.click();
    await waitForProcessingToFinish(page);

    await expect(page.locator('.recovery-report-section')).toBeVisible({ timeout: 15000 });

    const downloadBtn = page.locator('.result-actions button:has-text("Download"), .result-actions button:has-text("डाउनलोड")').first();
    const downloadInfo = await interceptDownload(page, async () => {
      await downloadBtn.click();
    });

    expect(downloadInfo.fileName).toContain('_repaired.pdf');
    expect(downloadInfo.size).toBeGreaterThan(0);

    const pdfInfo = await validateDownloadedPdf(downloadInfo.buffer, 1);
    expect(pdfInfo.pageCount).toBe(1);
  });
});
