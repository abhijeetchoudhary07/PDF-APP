import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';

test.describe('Document Validator — PDF Validation Rules @validator', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/document-validator');
  });

  /*
   * The default preset (SSC) asks for a photo and a signature and nothing
   * else, so there is no PDF slot on arrival. This spec used to drop the PDF
   * into `input[type="file"]` `.last()` -- the *signature* dropzone -- and
   * passed only because the page accepted any file handed to any slot. It
   * refuses a mistyped file now, so the spec has to pick a preset that
   * actually takes a PDF.
   */
  async function selectPresetWithPdfSlot(page: import('@playwright/test').Page) {
    /*
     * `PresetService.getAllGroupedPresets` merges the three preset files by id,
     * so `pdf-presets.json`'s "UPSC Document" folds into the photo preset
     * called "UPSC" -- that merged entry is the one with a PDF slot.
     */
    await page.locator('.preset-search-input').fill('UPSC');
    const pill = page.locator('.preset-pill').filter({ hasText: 'UPSC' }).first();
    await expect(pill).toBeVisible();
    await pill.click();
    // The dropzone keeps its <input type="file"> display:none and opens it by
    // click, so attachment -- not visibility -- is what says the slot is there.
    await expect(page.locator('.slot-card input[accept="application/pdf"]')).toBeAttached();
  }

  test('VAL-048: Upload valid PDF and verify validation status', async ({ page }) => {
    await selectPresetWithPdfSlot(page);

    await page.locator('.slot-card input[accept="application/pdf"]').setInputFiles(getTestDataPath('pdf/text.pdf'));

    // Validation runs on selection, so the report appears without a button.
    await expect(page.locator('.validation-report, .rule-row, .rule-item').first()).toBeVisible({ timeout: 10000 });
  });

  test('VAL-049: a non-PDF offered to the PDF slot is refused', async ({ page }) => {
    await selectPresetWithPdfSlot(page);

    await page.locator('.slot-card input[accept="application/pdf"]').setInputFiles(getTestDataPath('photos/valid-photo.jpg'));

    await expect(page.locator('.toast-item, [role="alert"]').first()).toBeVisible({ timeout: 10000 });
  });
});
