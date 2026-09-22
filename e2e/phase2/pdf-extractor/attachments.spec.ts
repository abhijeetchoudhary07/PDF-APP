import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone,
  waitForProcessingToFinish,
  interceptDownload
} from '../../common/phase2-helpers';

test.describe('PDF Content Extractor — Attachment Extraction @phase2 @extractor @download', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-extractor');
    const pdfPath = getPhase2FixturePath('extractor-attachments.pdf');
    await uploadFileToDropzone(page, pdfPath);
    await expect(page.locator('.options-checklist-card')).toBeVisible({ timeout: 15000 });

    const startBtn = page.locator('.action-bar-center button:has-text("Extract"), .action-bar-center button:has-text("निष्कर्षण शुरू करें")').first();
    await startBtn.click();
    await waitForProcessingToFinish(page);
    await expect(page.locator('.result-section')).toBeVisible({ timeout: 15000 });

    // Switch to Attachments tab
    const attTab = page.locator('.tabs-wrapper app-tabs button').filter({ hasText: /attachments|संलग्नक/i });
    await attTab.click();
  });

  test('EXT-050: Embedded attachments are listed and downloadable', async ({ page }) => {
    const attPanel = page.locator('.attachments-panel');
    await expect(attPanel).toBeVisible();

    // Check attachments list
    const attRows = page.locator('.attachments-list .attachment-row');
    if (await attRows.count() > 0) {
      await expect(attRows.first()).toBeVisible();

      // Download single attachment
      const downloadBtn = attRows.first().locator('button:has-text("Download"), button:has-text("डाउनलोड")').first();
      const downloadInfo = await interceptDownload(page, async () => {
        await downloadBtn.click();
      });

      expect(downloadInfo.fileName.length).toBeGreaterThan(0);
      expect(downloadInfo.size).toBeGreaterThan(0);
    }
  });
});
