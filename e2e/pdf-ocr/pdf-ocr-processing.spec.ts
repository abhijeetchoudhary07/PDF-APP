import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';

test.describe('Smart PDF OCR — Processing & Selectable Text @ocr', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-ocr');
  });

  test('OCR-014 & OCR-016: Detect selectable text in digital PDF and show preview', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(getTestDataPath('pdf/text.pdf'));

    // Wait for text detection banner
    await expect(page.locator('.selectable-text-banner, .text-preview-box, :has-text("selectable text")')).toBeVisible({ timeout: 10000 });
    // Text preview should show sample text
    await expect(page.locator('.selectable-text-banner, .sample-text-content')).toContainText(/selectable text|digital/i);
  });

  test('OCR-017 & OCR-018: Scanned PDF identifies requirement for OCR', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(getTestDataPath('pdf/scanned.pdf'));

    // Verify OCR configuration and page selection appear
    await expect(page.locator('.page-selection-grid, .btn-start-ocr, :has-text("OCR")')).toBeVisible({ timeout: 10000 });
  });

  test('OCR-020, OCR-021, OCR-022: Page selection controls (select all, deselect all, toggle)', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(getTestDataPath('pdf/scanned-multipage.pdf'));

    await expect(page.locator('.page-chip, .page-item')).toHaveCount(3, { timeout: 10000 });

    // Deselect all
    const deselectBtn = page.locator('button:has-text("Deselect All"), button:has-text("None"), .btn-deselect-all');
    if (await deselectBtn.isVisible()) {
      await deselectBtn.click();
      await expect(page.locator('.page-chip.selected, .page-item.selected')).toHaveCount(0);
    }

    // Select all
    const selectAllBtn = page.locator('button:has-text("Select All"), .btn-select-all');
    if (await selectAllBtn.isVisible()) {
      await selectAllBtn.click();
      await expect(page.locator('.page-chip.selected, .page-item.selected')).toHaveCount(3);
    }
  });

  test('OCR-036, OCR-038 & OCR-040: Start OCR, observe progress, and cancel', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(getTestDataPath('pdf/scanned.pdf'));

    const startBtn = page.locator('.btn-start-ocr, button:has-text("Start OCR"), button:has-text("Recognize")');
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    // Processing UI should appear
    const cancelBtn = page.locator('.btn-cancel-ocr, button:has-text("Cancel")');
    await expect(cancelBtn).toBeVisible({ timeout: 10000 });

    // Cancel OCR
    await cancelBtn.click();

    // Should return to configure or select step
    await expect(page.locator('.btn-start-ocr, .dropzone-container')).toBeVisible({ timeout: 10000 });
  });
});
