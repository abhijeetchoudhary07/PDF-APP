import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';
import { importScannedPage, pageAction, pageCards } from './scanner-helpers';

/*
 * These three were gated on an `input[type="file"]` the scanner does not have,
 * so none of them reached an assertion -- multi-page management had no coverage
 * at all. See `scanner-helpers.ts`.
 */
test.describe('Document Scanner — Multi-page Management @scanner', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/document-scanner');
  });

  test('SCN-044 & SCN-045: Multi-page scanning thumbnail management', async ({ page }) => {
    await importScannedPage(page);
    await expect(pageCards(page)).toHaveCount(1);

    // A second import adds a page rather than replacing the first.
    await importScannedPage(page, 'scanner/tilted-document.jpg');
    await expect(pageCards(page)).toHaveCount(2);

    // Each card is numbered, and the order controls bound to the ends are
    // disabled so a page cannot be moved off the list.
    await expect(page.locator('.page-number-badge').first()).toContainText('1');
    await expect(pageAction(page, 0, 'Move Left/Up')).toBeDisabled();
    await expect(pageAction(page, 1, 'Move Right/Down')).toBeDisabled();

    // Reordering swaps them.
    await pageAction(page, 1, 'Move Left/Up').click();
    await expect(pageAction(page, 0, 'Move Left/Up')).toBeDisabled();
    await expect(pageCards(page)).toHaveCount(2);
  });

  test('SCN-049: Rotate page thumbnail', async ({ page }) => {
    await importScannedPage(page);

    const before = await page.locator('.page-card .page-thumb').getAttribute('src');
    await pageAction(page, 0, 'Rotate 90°').click();

    // Rotating re-renders the page to a new blob, so the thumbnail's object
    // URL changes. A rotation that did nothing would leave the same src.
    await expect(page.locator('.page-card .page-thumb')).not.toHaveAttribute('src', before!, { timeout: 15000 });
    await expect(pageCards(page)).toHaveCount(1);
  });

  test('SCN-047: Delete page', async ({ page }) => {
    await importScannedPage(page);
    await importScannedPage(page, 'scanner/tilted-document.jpg');
    await expect(pageCards(page)).toHaveCount(2);

    await pageAction(page, 0, 'Delete Page').click();
    await expect(pageCards(page)).toHaveCount(1);

    // Deleting the last page leaves the dashboard behind for the empty state.
    await pageAction(page, 0, 'Delete Page').click();
    await expect(pageCards(page)).toHaveCount(0);
  });
});
