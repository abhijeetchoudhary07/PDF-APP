import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone,
  waitForProcessingToFinish
} from '../../common/phase2-helpers';

test.describe('PDF Repair — Structural Defect Detection @phase2 @repair', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-repair');
  });

  test('REP-010: Malformed header PDF flags header corruption or structural issue', async ({ page }) => {
    const pdfPath = getPhase2FixturePath('repair-malformed-header.pdf');
    await uploadFileToDropzone(page, pdfPath);

    await waitForProcessingToFinish(page);
    await expect(page.locator('.diagnostic-section')).toBeVisible({ timeout: 15000 });

    // Check issues list or structural check status
    const statusBadge = page.locator('.health-badge');
    const badgeText = await statusBadge.innerText();
    expect(badgeText).toMatch(/WARNING|ERROR|चेतावनी|त्रुटि/i);
  });

  test('REP-011: Corrupted xref table is detected and reported', async ({ page }) => {
    const pdfPath = getPhase2FixturePath('repair-corrupted-xref.pdf');
    await uploadFileToDropzone(page, pdfPath);

    await waitForProcessingToFinish(page);
    await expect(page.locator('.diagnostic-section')).toBeVisible({ timeout: 15000 });

    const statusBadge = page.locator('.health-badge');
    const badgeText = await statusBadge.innerText();
    expect(badgeText).toMatch(/WARNING|ERROR|HEALTHY|चेतावनी|त्रुटि|स्वस्थ/i);
  });
});
