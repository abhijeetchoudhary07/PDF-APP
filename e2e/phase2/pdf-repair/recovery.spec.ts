import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone,
  waitForProcessingToFinish
} from '../../common/phase2-helpers';

test.describe('PDF Repair — Recovery Workflow & Multi-Strategy Rebuilding @phase2 @repair', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-repair');
  });

  test('REP-020: Recovery workflow successfully executes and displays operations log', async ({ page }) => {
    const pdfPath = getPhase2FixturePath('repair-partial.pdf');
    await uploadFileToDropzone(page, pdfPath);
    await waitForProcessingToFinish(page);

    await expect(page.locator('.diagnostic-section')).toBeVisible({ timeout: 15000 });

    // Click Start Recovery
    const startBtn = page.locator('app-button button:has-text("Start Recovery"), app-button button:has-text("मरम्मत शुरू करें")').first();
    await startBtn.click();

    await waitForProcessingToFinish(page);
    await expect(page.locator('.recovery-report-section')).toBeVisible({ timeout: 15000 });

    // Verify recovery counts summary
    const countsSummary = page.locator('.page-counts-summary');
    await expect(countsSummary).toBeVisible();

    // Verify operations log
    const operationsLog = page.locator('.recovery-log-box');
    await expect(operationsLog).toBeVisible();
    await expect(operationsLog.locator('li').first()).toBeVisible();
  });
});
