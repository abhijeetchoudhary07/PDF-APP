import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';
import {
  attachPdf,
  customPageChips,
  detectionBadge,
  openConfigureStep,
  startOcrButton,
} from '../fixtures/ocr';

/*
 * Rewritten against the page as it actually behaves. The previous version
 * looked for `.selectable-text-banner`, `.btn-start-ocr` and a flat list of
 * page chips, none of which exist: detection reports through a badge, the
 * start button only appears once the configure step is open, and the per-page
 * chips are not rendered at all while page selection is on "all".
 */

test.describe('Smart PDF OCR — Processing & Selectable Text @ocr', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-ocr');
  });

  test('OCR-014 & OCR-016: a digital PDF is reported as having selectable text', async ({ page }) => {
    await attachPdf(page, 'pdf/text.pdf');

    await expect(detectionBadge(page)).toContainText(/selectable text found/i);
    await expect(page.locator('main')).toContainText(/found selectable text in \d+ of \d+ pages/i);

    // A digital PDF offers the direct extraction that skips recognition.
    await expect(page.getByRole('button', { name: /extract digital text/i })).toBeVisible();
  });

  test('OCR-017 & OCR-018: a scanned PDF is reported as needing OCR', async ({ page }) => {
    await attachPdf(page, 'pdf/scanned.pdf');

    await expect(detectionBadge(page)).toContainText(/scanned \/ image document/i);

    await openConfigureStep(page);
    await expect(startOcrButton(page)).toBeVisible();
  });

  test('OCR-020 to OCR-022: pages can be chosen individually', async ({ page }) => {
    await attachPdf(page, 'pdf/scanned-multipage.pdf');
    await openConfigureStep(page);

    const chips = await customPageChips(page);
    await expect(chips).toHaveCount(3);

    // Every page starts selected, so clicking one drops it out of the set.
    await expect(chips.locator('input:checked')).toHaveCount(3);
    await chips.first().click();
    await expect(chips.locator('input:checked')).toHaveCount(2);

    // Recognition needs at least one page, so emptying the set disables start.
    await chips.nth(1).click();
    await chips.nth(2).click();
    await expect(chips.locator('input:checked')).toHaveCount(0);
    await expect(startOcrButton(page)).toBeDisabled();
  });

  test('OCR-036 & OCR-038: recognition starts and reports progress', async ({ page }) => {
    await attachPdf(page, 'pdf/scanned.pdf');
    await openConfigureStep(page);

    await startOcrButton(page).click();

    // Progress is the point: the person must see that something is happening.
    await expect(page.locator('main')).toContainText(
      /initializ|recogni|processing|loading|%/i,
      { timeout: 30000 },
    );
  });
});
