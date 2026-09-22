import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone,
  waitForProcessingToFinish,
  interceptDownload,
  validateDownloadedText,
  validateDownloadedJson
} from '../../common/phase2-helpers';

test.describe('PDF Content Extractor — Text Extraction & Exports @phase2 @extractor @download', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-extractor');
    const pdfPath = getPhase2FixturePath('extractor-text.pdf');
    await uploadFileToDropzone(page, pdfPath);
    await expect(page.locator('.options-checklist-card')).toBeVisible({ timeout: 15000 });

    // Click Start Extraction
    const startBtn = page.locator('.action-bar-center button:has-text("Extract"), .action-bar-center button:has-text("निष्कर्षण शुरू करें")').first();
    await startBtn.click();
    await waitForProcessingToFinish(page);
    await expect(page.locator('.result-section')).toBeVisible({ timeout: 15000 });
  });

  test('EXT-010: Extracted text is displayed with paragraph structure', async ({ page }) => {
    const textPre = page.locator('.text-display-box pre');
    await expect(textPre).toBeVisible();

    const text = await textPre.innerText();
    expect(text).toContain('Annual Executive Summary 2026');
    expect(text).toContain('Paragraph 1');
  });

  test('EXT-011: Download TXT file contains extracted text content', async ({ page }) => {
    const downloadTxtBtn = page.locator('.panel-header button:has-text("TXT")');
    const downloadInfo = await interceptDownload(page, async () => {
      await downloadTxtBtn.click();
    });

    expect(downloadInfo.fileName).toContain('.txt');
    expect(downloadInfo.size).toBeGreaterThan(0);

    validateDownloadedText(downloadInfo.buffer, [
      'Annual Executive Summary 2026',
      'Paragraph 1'
    ]);
  });

  test('EXT-012: Download JSON file contains structured page texts', async ({ page }) => {
    const downloadJsonBtn = page.locator('.panel-header button:has-text("JSON")');
    const downloadInfo = await interceptDownload(page, async () => {
      await downloadJsonBtn.click();
    });

    expect(downloadInfo.fileName).toContain('.json');
    expect(downloadInfo.size).toBeGreaterThan(0);

    const jsonData = validateDownloadedJson<{ totalPages: number; pageTexts: any[] }>(downloadInfo.buffer);
    expect(jsonData.totalPages).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(jsonData.pageTexts)).toBe(true);
  });
});
