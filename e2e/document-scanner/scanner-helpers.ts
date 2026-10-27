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

  await dismissBlurGate(page);

  // Import lands on the crop step; accepting it moves to the pages dashboard.
  await expect(page.locator('.crop-card canvas.interactive-crop-canvas')).toBeVisible({ timeout: 15000 });
  await page.locator('app-button[data-testid="apply-crop"] button').click();
  await expect(page.locator('.pages-dashboard-card')).toBeVisible({ timeout: 15000 });
}

/**
 * Clears the H4 blur gate if it opens.
 *
 * The fixtures these specs use -- `clean-document.jpg` and its siblings -- are
 * all the same 350x450 synthetic gradient: Laplacian variance 3.2 against a
 * threshold of 80, and only 8 distinct luminance levels, so the gate correctly
 * calls every one of them blurry. (The sharper `*-document.png` fixtures added
 * for the H4-H8 pipeline spec are not used here.)
 * It used to render inline and could be ignored; it is a real modal now, so a
 * test that does not answer it cannot reach anything behind it.
 *
 * Keep, rather than retake: retaking deletes the page and reopens the picker,
 * which is not what these specs are driving.
 */
export async function dismissBlurGate(page: Page): Promise<void> {
  const keep = page.locator('app-button[data-testid="blur-keep"] button');
  // Asserted, not guarded. Every fixture in `e2e/test-data/scanner` is the
  // same 350x450 gradient -- Laplacian variance 3.2 against a threshold of 80,
  // eight distinct luminance levels -- so the gate opens on every import here.
  // If one of them is ever replaced with a real scan this fails loudly, which
  // is the point: a conditional guard would quietly stop exercising the gate.
  await expect(keep).toBeVisible({ timeout: 20000 });
  await keep.click();
  await expect(keep).toBeHidden({ timeout: 10000 });
}

/*
 * The per-page action buttons, by `data-testid`.
 *
 * This used to select them by their `title` attribute -- `button[title="Delete
 * Page"]` -- which worked only because those titles were hardcoded English. They
 * are translated now, so the attribute holds whatever the app's current language
 * says, and a run in any of the other four languages would have matched nothing
 * and timed out.
 */
export function pageAction(page: Page, index: number, testId: string) {
  return page.locator('.page-card').nth(index).locator(`button[data-testid="${testId}"]`);
}

export function pageCards(page: Page) {
  return page.locator('.page-card');
}
