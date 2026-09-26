import { Page, expect } from '@playwright/test';
import { getTestDataPath } from '../fixtures/mocks';

/**
 * Gets a scanned page into the scanner and returns on the pages dashboard.
 *
 * Every spec in this folder used to open with
 *
 *     const fileInput = page.locator('input[type="file"]');
 *     if (await fileInput.count() > 0) { ...the entire test... }
 *
 * The scanner template contains no `<input type="file"]` at all -- `FileService`
 * builds one in JavaScript, clicks it and throws it away -- so that count was
 * always zero, every body was skipped, and eight of the fourteen scanner tests
 * passed while asserting nothing. The whole feature was green and uncovered.
 *
 * Answering the file chooser is the only way to drive this page from a test.
 */
export async function importScannedPage(
  page: Page,
  fixture = 'scanner/clean-document.jpg'
): Promise<void> {
  /*
   * The empty state and the pages dashboard each have their own gallery
   * button -- "Import from gallery" and "Add page from gallery" -- both wired
   * to `importFromGallery`. Only one is on screen at a time, so take whichever
   * it is; a second import happens from the dashboard.
   */
  const entry = page.locator(
    'app-button[data-testid="import-gallery"] button, app-button[data-testid="add-page-gallery"] button'
  ).first();
  await expect(entry).toBeVisible({ timeout: 15000 });

  const chooser = page.waitForEvent('filechooser');
  await entry.click();
  await (await chooser).setFiles(getTestDataPath(fixture));

  // Import lands on the crop step; accepting it moves to the pages dashboard.
  await expect(page.locator('.crop-card canvas.interactive-crop-canvas')).toBeVisible({ timeout: 15000 });
  await page.locator('app-button[data-testid="apply-crop"] button').click();
  await expect(page.locator('.pages-dashboard-card')).toBeVisible({ timeout: 15000 });
}

/** The per-page action buttons carry English `title` attributes. */
export function pageAction(page: Page, index: number, title: string) {
  return page.locator('.page-card').nth(index).locator(`button[title="${title}"]`);
}

export function pageCards(page: Page) {
  return page.locator('.page-card');
}
