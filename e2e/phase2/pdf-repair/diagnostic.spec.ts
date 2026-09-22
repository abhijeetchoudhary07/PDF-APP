import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone,
  waitForProcessingToFinish,
  setupErrorListener
} from '../../common/phase2-helpers';

test.describe('PDF Repair — Diagnostic Stage & Health Checks @phase2 @repair', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-repair');
  });

  test('REP-001: Page loads with dropzone and capability cards', async ({ page }) => {
    const { consoleErrors } = setupErrorListener(page);
    await expect(page).toHaveURL(/.*features\/pdf-repair/);
    await expect(page.locator('h1.page-title, h1').first()).toBeVisible();
    await expect(page.locator('.dropzone-wrapper')).toBeVisible();
    await expect(page.locator('.capabilities-grid')).toBeVisible();
    expect(consoleErrors).toHaveLength(0);
  });

  test('REP-002: Upload healthy PDF generates healthy diagnostic report', async ({ page }) => {
    const pdfPath = getPhase2FixturePath('repair-healthy.pdf');
    await uploadFileToDropzone(page, pdfPath);

    await waitForProcessingToFinish(page);
    await expect(page.locator('.diagnostic-section')).toBeVisible({ timeout: 15000 });

    // Status badge is HEALTHY
    const statusBadge = page.locator('.health-badge');
    await expect(statusBadge).toHaveText(/HEALTHY|स्वस्थ/i);

    // 4 structural checks should be passed
    const checks = page.locator('.checks-grid .check-item');
    await expect(checks).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      await expect(checks.nth(i)).toHaveClass(/passed/);
    }
  });
});
