import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone,
  waitForProcessingToFinish
} from '../../common/phase2-helpers';

test.describe('PDF Privacy Sanitizer — Privacy Item Detection @phase2 @privacy', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-privacy-sanitizer');
  });

  test('PRV-010: Detects interactive form fields and values', async ({ page }) => {
    const formsPath = getPhase2FixturePath('privacy-forms.pdf');
    await uploadFileToDropzone(page, formsPath);

    await waitForProcessingToFinish(page);
    await expect(page.locator('.scan-result-section')).toBeVisible({ timeout: 15000 });

    const formBox = page.locator('.status-box').filter({ hasText: /form data|फ़ॉर्म डेटा/i });
    await expect(formBox).toHaveClass(/alert/);
  });

  test('PRV-011: Detects embedded file attachments', async ({ page }) => {
    const attPath = getPhase2FixturePath('privacy-attachments.pdf');
    await uploadFileToDropzone(page, attPath);

    await waitForProcessingToFinish(page);
    await expect(page.locator('.scan-result-section')).toBeVisible({ timeout: 15000 });

    const attBox = page.locator('.status-box').filter({ hasText: /attachments|संलग्नक/i });
    await expect(attBox).toHaveClass(/alert/);
  });

  test('PRV-012: Detects embedded scripts and JavaScript actions', async ({ page }) => {
    const scriptPath = getPhase2FixturePath('privacy-scripts.pdf');
    await uploadFileToDropzone(page, scriptPath);

    await waitForProcessingToFinish(page);
    await expect(page.locator('.scan-result-section')).toBeVisible({ timeout: 15000 });

    const scriptBox = page.locator('.status-box').filter({ hasText: /scripts|स्क्रिप्ट/i });
    await expect(scriptBox).toHaveClass(/alert/);
  });

  test('PRV-013: Detects multiple categories simultaneously in combined PDF', async ({ page }) => {
    const allPath = getPhase2FixturePath('privacy-all.pdf');
    await uploadFileToDropzone(page, allPath);

    await waitForProcessingToFinish(page);
    await expect(page.locator('.scan-result-section')).toBeVisible({ timeout: 15000 });

    // Header badge indicates multiple items found
    const reportHeader = page.locator('.scan-report-card .report-header');
    const badgeText = await reportHeader.innerText();
    expect(badgeText).not.toContain('0 items');
  });
});
