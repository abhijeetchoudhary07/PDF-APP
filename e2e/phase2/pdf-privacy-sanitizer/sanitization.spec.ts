import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone,
  waitForProcessingToFinish,
  interceptDownload,
  validateDownloadedPdf
} from '../../common/phase2-helpers';

test.describe('PDF Privacy Sanitizer — Sanitization Execution & Output Verification @phase2 @privacy @download', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-privacy-sanitizer');
  });

  test('PRV-020: Metadata sanitization removes document metadata while preserving pages', async ({ page }) => {
    const metaPath = getPhase2FixturePath('privacy-metadata.pdf');
    await uploadFileToDropzone(page, metaPath);

    await waitForProcessingToFinish(page);
    await expect(page.locator('.scan-result-section')).toBeVisible({ timeout: 15000 });

    // Ensure remove metadata checkbox is checked
    const metaCheckbox = page.locator('.option-checkbox input[type="checkbox"]').first();
    await metaCheckbox.setChecked(true);

    // Click Sanitize button
    const sanitizeBtn = page.locator('app-button button:has-text("Sanitize"), app-button button:has-text("संवेदनशील डेटा हटाएं")').first();
    await sanitizeBtn.click();

    await waitForProcessingToFinish(page);
    await expect(page.locator('.sanitized-result-section')).toBeVisible({ timeout: 15000 });

    // Intercept download of sanitized PDF
    const downloadBtn = page.locator('.result-actions button:has-text("Download"), .result-actions button:has-text("डाउनलोड")').first();
    const downloadInfo = await interceptDownload(page, async () => {
      await downloadBtn.click();
    });

    expect(downloadInfo.fileName).toContain('_sanitized.pdf');
    expect(downloadInfo.size).toBeGreaterThan(0);

    // Validate PDF structure and verify metadata was stripped
    const pdfInfo = await validateDownloadedPdf(downloadInfo.buffer, 1);
    expect(pdfInfo.pageCount).toBe(1);
    // Title and author should now be absent/empty
    expect(pdfInfo.title || '').not.toContain('Confidential Quarterly Report');
    expect(pdfInfo.author || '').not.toContain('John Doe');
  });

  test('PRV-021: Sanitizing combined privacy items produces clean output', async ({ page }) => {
    const allPath = getPhase2FixturePath('privacy-all.pdf');
    await uploadFileToDropzone(page, allPath);

    await waitForProcessingToFinish(page);
    await expect(page.locator('.scan-result-section')).toBeVisible({ timeout: 15000 });

    // Check all sanitization options
    const checkboxes = page.locator('.option-checkbox input[type="checkbox"]');
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      await checkboxes.nth(i).setChecked(true);
    }

    const sanitizeBtn = page.locator('app-button button:has-text("Sanitize"), app-button button:has-text("संवेदनशील डेटा हटाएं")').first();
    await sanitizeBtn.click();

    await waitForProcessingToFinish(page);
    await expect(page.locator('.sanitized-result-section')).toBeVisible({ timeout: 15000 });

    // Verify after metric is 0
    const afterMetric = page.locator('.before-after-metrics .metric.after .value');
    await expect(afterMetric).toHaveText('0');
  });
});
