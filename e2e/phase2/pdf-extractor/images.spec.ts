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

  /*
   * The download assertions used to sit inside `if (await btn.isVisible())`, so
   * a gallery that rendered no download control -- or rendered no images at all
   * -- passed this test rather than failing it. The `beforeEach` extracts a PDF
   * that is there precisely because it contains images; if the button is
   * missing, that is the bug this test is for.
   */
  test('EXT-021: Single image download succeeds', async ({ page }) => {
    const downloadSingleBtn = page.locator('.image-card').first().getByRole('button', { name: /download/i });
    await expect(downloadSingleBtn).toBeVisible();

    const downloadInfo = await interceptDownload(page, async () => {
      await downloadSingleBtn.click();
    });

    expect(downloadInfo.fileName).toMatch(/\.(png|jpg|jpeg)$/i);
    expect(downloadInfo.size).toBeGreaterThan(0);
  });

  test('EXT-022: Batch ZIP export downloads archive with images', async ({ page }) => {
    /*
     * This test exported nothing, for two compounding reasons.
     *
     * It opened by clicking "Toggle Select All" to select the images. Every
     * extracted image arrives already selected, so that click *cleared* the
     * selection -- and ZIP export is disabled with nothing selected. The
     * `if (await zipBtn.isEnabled())` wrapped around the rest was then false,
     * the whole export was skipped, and the test passed.
     *
     * So the toggle is exercised for what it actually does, in both
     * directions, and the export runs from the state the page starts in.
     */
    const panel = page.locator('.images-panel');
    const zipBtn = panel.getByRole('button', { name: /zip/i }).first();
    const toggleAll = panel.getByRole('button', { name: /select all/i }).first();

    await expect(zipBtn).toBeEnabled();

    await toggleAll.click();
    await expect(zipBtn).toBeDisabled();
    await toggleAll.click();
    await expect(zipBtn).toBeEnabled();

    const downloadInfo = await interceptDownload(page, async () => {
      await zipBtn.click();
    });

    expect(downloadInfo.fileName).toContain('.zip');
    expect(downloadInfo.size).toBeGreaterThan(0);

    const zipData = await validateDownloadedZip(downloadInfo.buffer, 1);
    expect(zipData.fileCount).toBeGreaterThanOrEqual(1);
  });
});
