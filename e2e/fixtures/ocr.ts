import { expect, type Page } from '@playwright/test';
import { getTestDataPath } from './mocks';

/**
 * Helpers for the Smart PDF OCR page.
 *
 * The page is a five-step workflow -- select, detect, configure, processing,
 * result -- and most of what a test wants to assert only exists in one of
 * them. Specs that treated it as a single screen were looking for controls
 * that had not been rendered yet, which surfaced as "element(s) not found"
 * rather than as anything to do with the step they were stuck on.
 */

/** Attaches a fixture PDF and waits for detection to report on it. */
export async function attachPdf(page: Page, fixture: string): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles(getTestDataPath(fixture));
  await expect(detectionBadge(page)).toBeVisible({ timeout: 30000 });
}

/** The badge naming what detection found: selectable text, or a scan. */
export function detectionBadge(page: Page) {
  return page
    .locator('app-badge')
    .filter({ hasText: /selectable text found|scanned \/ image document/i })
    .first();
}

/**
 * Moves from the detection summary on to the OCR settings.
 *
 * The related-tools strip renders in the same tick as the detection result and
 * reflows the column under it, so a click fired the moment the button appears
 * can land on nothing at all -- and the symptom shows up much later, as
 * missing language pills. Settling first is what makes this reliable.
 */
export async function openConfigureStep(page: Page): Promise<void> {
  const configure = page.getByRole('button', { name: /configure ocr|run full ocr/i }).first();
  await expect(configure).toBeVisible({ timeout: 30000 });
  await configure.scrollIntoViewIfNeeded();
  await page.waitForLoadState('networkidle');
  await configure.click();
  await expect(page.getByTestId('ocr-lang-eng')).toBeVisible({ timeout: 15000 });
}

/** The button that starts recognition, only present on the configure step. */
export function startOcrButton(page: Page) {
  return page.getByRole('button', { name: /start ocr/i }).first();
}

/**
 * Switches page selection to "custom" and returns the per-page chips.
 * They are not rendered at all while the mode is "all", which is the default.
 */
export async function customPageChips(page: Page) {
  await page.getByRole('button', { name: /custom/i }).first().click();
  return page.locator('.page-chip');
}
