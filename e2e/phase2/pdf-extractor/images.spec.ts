import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone,
  waitForProcessingToFinish,
  interceptDownload,
  validateDownloadedZip
} from '../../common/phase2-helpers';

test.describe('PDF Content Extractor — Image Extraction & ZIP Export @phase2 @extractor @download', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-extractor');
    const pdfPath = getPhase2FixturePath('extractor-images.pdf');
    await uploadFileToDropzone(page, pdfPath);
    await expect(page.locator('.options-checklist-card')).toBeVisible({ timeout: 15000 });

    const startBtn = page.locator('.action-bar-center button:has-text("Extract"), .action-bar-center button:has-text("निष्कर्षण शुरू करें")').first();
    await startBtn.click();
    await waitForProcessingToFinish(page);
    await expect(page.locator('.result-section')).toBeVisible({ timeout: 15000 });

    // Switch to Images tab
    const imagesTab = page.locator('.tabs-wrapper app-tabs button').filter({ hasText: /images|छवियां/i });
    await imagesTab.click();
  });

  test('EXT-020: Embedded images are detected and rendered with metadata', async ({ page }) => {
    const imagesPanel = page.locator('.images-panel');
    await expect(imagesPanel).toBeVisible();

    // Check image cards or gallery
    const imageCards = page.locator('.image-gallery-grid .image-card');
    const count = await imageCards.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Verify metadata (dimensions and size)
    const imgSpecs = imageCards.first().locator('.img-specs');
    await expect(imgSpecs).toBeVisible();
  });

  test('EXT-021: Single image download succeeds', async ({ page }) => {
    const downloadSingleBtn = page.locator('.image-card button:has-text("Download"), .image-card button:has-text("डाउनलोड")').first();
    if (await downloadSingleBtn.isVisible()) {
      const downloadInfo = await interceptDownload(page, async () => {
        await downloadSingleBtn.click();
      });

      expect(downloadInfo.fileName).toMatch(/\.(png|jpg|jpeg)$/i);
      expect(downloadInfo.size).toBeGreaterThan(0);
    }
  });

  test('EXT-022: Batch ZIP export downloads archive with images', async ({ page }) => {
    // Select all images
    const selectAllBtn = page.locator('.images-panel button:has-text("Select All"), .images-panel button:has-text("सभी चुनें")').first();
    if (await selectAllBtn.isVisible()) {
      await selectAllBtn.click();
    }

    const zipBtn = page.locator('.images-panel button:has-text("ZIP"), .images-panel button:has-text("ज़िप")').first();
    if (await zipBtn.isEnabled()) {
      const downloadInfo = await interceptDownload(page, async () => {
        await zipBtn.click();
      });

      expect(downloadInfo.fileName).toContain('.zip');
      expect(downloadInfo.size).toBeGreaterThan(0);

      const zipData = await validateDownloadedZip(downloadInfo.buffer, 1);
      expect(zipData.fileCount).toBeGreaterThanOrEqual(1);
    }
  });
});
