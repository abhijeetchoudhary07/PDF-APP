import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';
import { attachPdf, extractDigitalText } from '../fixtures/ocr';

/*
 * Both tests here stopped at the detection step and then asked about controls
 * that live on the result step, behind one-shot guards that were never true:
 * `if (await copyBtn.isVisible())` around the copy assertion, and an
 * `expect(startBtn).toBeEnabled()` that was never awaited, so it could not fail
 * either. Nothing in this file reached the result screen at all.
 *
 * A digital PDF gets there without recognition -- `extractExistingDigitalText`
 * produces the same result view in a second or so -- which is what both tests
 * use now.
 */

test.describe('Smart PDF OCR — Result UI & Export @ocr @critical', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-ocr');
  });

  test('OCR-048 to OCR-062: the result screen shows the text, with search and copy', async ({ page }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    await attachPdf(page, 'pdf/text.pdf');
    await expect(page.locator('.file-name').first()).toContainText('text.pdf');
    await expect(page.locator('.detection-info-box .headline')).not.toBeEmpty();

    await extractDigitalText(page);
    await expect(page.locator('.recognized-textarea')).not.toBeEmpty();
    await expect(page.locator('.search-box .search-input')).toBeVisible();

    await page.getByRole('button', { name: /copy page text/i }).click();
    await expect(page.locator('.toast-item').first()).toContainText(/copied/i, { timeout: 10000 });
  });

  test('OCR-063 to OCR-070: the recognised text exports as a .txt file', async ({ page }) => {
    await attachPdf(page, 'pdf/text.pdf');
    await extractDigitalText(page);

    /*
     * Scoped to the tile grid: the searchable PDF is also offered as a button
     * in the result header, and an unscoped role query matches both.
     */
    const exports = page.locator('.export-options-grid');
    await expect(exports.getByRole('button', { name: /searchable pdf/i })).toBeVisible();

    // The searchable PDF is the slow export; the text file exercises the path.
    await exports.getByRole('button', { name: /plain text/i }).click();
    await expect(page.locator('.toast-item').first()).toContainText(/saved/i, { timeout: 15000 });
  });
});
