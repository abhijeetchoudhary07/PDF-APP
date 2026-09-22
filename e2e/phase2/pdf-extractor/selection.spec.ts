import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone,
  setupErrorListener
} from '../../common/phase2-helpers';

test.describe('PDF Content Extractor — Content Type Selection @phase2 @extractor', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-extractor');
  });

  test('EXT-001: Page loads with dropzone and file selection', async ({ page }) => {
    const { consoleErrors } = setupErrorListener(page);
    await expect(page).toHaveURL(/.*features\/pdf-extractor/);
    await expect(page.locator('h1.page-title, h1').first()).toBeVisible();
    await expect(page.locator('.dropzone-wrapper')).toBeVisible();
    expect(consoleErrors).toHaveLength(0);
  });

  test('EXT-002: Uploading PDF reveals extraction options checklist', async ({ page }) => {
    const pdfPath = getPhase2FixturePath('extractor-mixed.pdf');
    await uploadFileToDropzone(page, pdfPath);

    await expect(page.locator('.options-checklist-card')).toBeVisible({ timeout: 15000 });

    // Verify 5 content type checkboxes: Text, Images, Tables, Pages, Attachments
    const checkboxes = page.locator('.checklist-grid .check-box-item input[type="checkbox"]');
    await expect(checkboxes).toHaveCount(5);

    // Start extraction button is visible
    const startBtn = page.locator('.action-bar-center button:has-text("Extract"), .action-bar-center button:has-text("निष्कर्षण शुरू करें")').first();
    await expect(startBtn).toBeVisible();
  });
});
