import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';
import { importScannedPage, pageCards } from './scanner-helpers';

/*
 * Both of these hung off an `input[type="file"]` the scanner does not have, so
 * the setup never added a page, the generate button was never visible and both
 * bodies were skipped. PDF generation and the OCR handoff -- the two things
 * this page exists to do -- had no coverage. See `scanner-helpers.ts`.
 */
test.describe('Document Scanner — PDF Generation & OCR Handoff @scanner @critical', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/document-scanner');
    await importScannedPage(page);
    await expect(pageCards(page)).toHaveCount(1);
  });

  test('SCN-053 & SCN-056: Generate PDF from scanned page', async ({ page }) => {
    await page.locator('app-button[data-testid="generate-pdf"] button').click();

    await expect(page.locator('.pdf-ready-card')).toBeVisible({ timeout: 30000 });
    // The summary names the file and its page count, so what was produced is
    // visible before anyone downloads it.
    await expect(page.locator('.pdf-ready-card .subtitle')).toContainText(/\.pdf/i);
    await expect(page.locator('.pdf-ready-card .subtitle')).toContainText('1 Pages');
  });

  test('SCN-064 & SCN-065: Scanner to OCR Handoff via "Make Searchable"', async ({ page }) => {
    await page.locator('app-button[data-testid="generate-pdf"] button').click();
    await expect(page.locator('.pdf-ready-card')).toBeVisible({ timeout: 30000 });

    await page.locator('app-button[data-testid="make-searchable"] button').click();

    // The handoff carries the generated PDF to the OCR page, which should show
    // it already selected rather than asking for a file again.
    await expect(page).toHaveURL(/.*features\/pdf-ocr/, { timeout: 15000 });
    await expect(page.locator('.file-name').first()).toContainText(/\.pdf/i, { timeout: 15000 });
  });
});
