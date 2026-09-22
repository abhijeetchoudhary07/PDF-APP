import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone,
  waitForProcessingToFinish,
  setupErrorListener
} from '../../common/phase2-helpers';

test.describe('PDF Privacy Sanitizer — Privacy Scan @phase2 @privacy', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-privacy-sanitizer');
  });

  test('PRV-001: Page loads with dropzone and feature cards', async ({ page }) => {
    const { consoleErrors } = setupErrorListener(page);
    await expect(page).toHaveURL(/.*features\/pdf-privacy-sanitizer/);
    await expect(page.locator('h1.page-title, h1').first()).toBeVisible();
    await expect(page.locator('.dropzone-wrapper')).toBeVisible();
    await expect(page.locator('.privacy-features-grid')).toBeVisible();
    expect(consoleErrors).toHaveLength(0);
  });

  test('PRV-002: Upload clean PDF reports 0 privacy items detected', async ({ page }) => {
    const cleanPath = getPhase2FixturePath('privacy-clean.pdf');
    await uploadFileToDropzone(page, cleanPath);

    await waitForProcessingToFinish(page);
    await expect(page.locator('.scan-result-section')).toBeVisible({ timeout: 15000 });

    // Header badge shows 0 items found
    const reportHeader = page.locator('.scan-report-card .report-header');
    await expect(reportHeader).toContainText(/0 items found|0 संवेदनशील आइटम/i);

    // Metadata status box should NOT have .alert class
    const metaBox = page.locator('.status-box').first();
    await expect(metaBox).not.toHaveClass(/alert/);
  });

  test('PRV-003: Upload metadata PDF detects sensitive document metadata', async ({ page }) => {
    const metaPath = getPhase2FixturePath('privacy-metadata.pdf');
    await uploadFileToDropzone(page, metaPath);

    await waitForProcessingToFinish(page);
    await expect(page.locator('.scan-result-section')).toBeVisible({ timeout: 15000 });

    // Metadata box has alert
    const metaBox = page.locator('.status-box').filter({ hasText: /metadata|मेटाडेटा/i });
    await expect(metaBox).toHaveClass(/alert/);

    // Detailed items list contains detected metadata entries
    const itemsList = page.locator('.detected-items-list');
    await expect(itemsList).toBeVisible();
    await expect(itemsList).toContainText(/Confidential Quarterly Report|John Doe/i);
  });
});
