import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone,
  waitForProcessingToFinish,
  setupErrorListener
} from '../../common/phase2-helpers';

test.describe('PDF Repair — Corrupted & Invalid File Handling @phase2 @repair @errors', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-repair');
  });

  test('REP-030: Completely unreadable file is handled gracefully without crash', async ({ page }) => {
    const { pageErrors } = setupErrorListener(page);
    const pdfPath = getPhase2FixturePath('repair-corrupted.pdf');
    await uploadFileToDropzone(page, pdfPath);

    await waitForProcessingToFinish(page);

    // Application remains responsive, no uncaught exceptions
    expect(pageErrors).toHaveLength(0);
    // User sees diagnostic report (marked ERROR) or user-friendly toast
    await expect(page.locator('.diagnostic-section, .select-step-section, .toast-container').first()).toBeVisible({ timeout: 15000 });
  });

  test('REP-031: Non-PDF file renamed as .pdf is rejected or reported safely', async ({ page }) => {
    const { pageErrors } = setupErrorListener(page);
    const pdfPath = getPhase2FixturePath('repair-not-a-pdf.pdf');
    await uploadFileToDropzone(page, pdfPath);

    await waitForProcessingToFinish(page);
    expect(pageErrors).toHaveLength(0);
  });
});
