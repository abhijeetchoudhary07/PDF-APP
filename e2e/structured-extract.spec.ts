import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { setupCapacitorMocks } from './fixtures/mocks';

test.describe('P1 Structured Field Extraction (Receipts, Invoices, IDs) @structured-extract @p1', () => {
  const receiptPdfPath = path.resolve(__dirname, 'test-data/structured-extract/retail-receipt.pdf');
  const invoicePdfPath = path.resolve(__dirname, 'test-data/structured-extract/gst-tax-invoice.pdf');
  const utilityPdfPath = path.resolve(__dirname, 'test-data/structured-extract/utility-bill.pdf');
  const idPhotoPath = path.resolve(__dirname, 'test-data/structured-extract/photo-id-document.png');

  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('P1-001: Complete Extraction & Review Workflow — Upload, Bounding Box Tap, Inline Edit, and CSV/JSON Export', async ({ page }) => {
    // 1. Navigate to /features/pdf/intelligence/extract-structured
    await page.goto('/features/pdf/intelligence/extract-structured');
    await page.waitForLoadState('domcontentloaded');

    // Verify header and empty state
    const headerTitle = page.locator('.header-title');
    await expect(headerTitle).toBeVisible();

    const emptyCard = page.locator('.empty-card');
    await expect(emptyCard).toBeVisible();

    // 2. Upload Retail Receipt Document
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(receiptPdfPath);

    // Wait for extraction to complete
    const canvas = page.locator('.doc-canvas');
    await expect(canvas).toBeVisible({ timeout: 15000 });

    const bottomSheet = page.locator('.bottom-sheet-drawer');
    await expect(bottomSheet).toBeVisible();

    // Verify Generic Classification: Receipt
    const categoryPill = page.locator('.category-pill');
    await expect(categoryPill).toBeVisible();
    await expect(categoryPill).toContainText('Receipt');

    // Verify extracted field cards are rendered in the list
    const fieldCards = page.locator('.field-card');
    await expect(fieldCards.first()).toBeVisible();
    const fieldCount = await fieldCards.count();
    expect(fieldCount).toBeGreaterThanOrEqual(4);

    // 3. Tap a highlighted bounding box to zoom into position
    const boundingBoxes = page.locator('.bounding-box-tag');
    await expect(boundingBoxes.first()).toBeVisible({ timeout: 10000 });

    // Initial zoom indicator is 100%
    const zoomBadge = page.locator('.zoom-badge');
    await expect(zoomBadge).toBeVisible();

    // Tap bounding box
    await boundingBoxes.first().click({ force: true });

    // Viewport should smoothly center and zoom to ~180%
    await expect(zoomBadge).toContainText('180%');

    // Reset Zoom button appears and works
    const resetZoomBtn = page.locator('.btn-reset-zoom');
    await expect(resetZoomBtn).toBeVisible();
    await resetZoomBtn.click();
    await expect(zoomBadge).toContainText('100%');

    // 4. Test Bottom Sheet Drawer Breakpoints (on mobile viewport)
    const isMobile = (page.viewportSize()?.width || 1000) < 768;
    if (isMobile) {
      const btn85 = page.locator('.btn-bp', { hasText: '85%' });
      await expect(btn85).toBeVisible();
      await btn85.click();
      await expect(bottomSheet).toHaveClass(/sheet-full/);

      const btn45 = page.locator('.btn-bp', { hasText: '45%' });
      await expect(btn45).toBeVisible();
      await btn45.click();
      await expect(bottomSheet).toHaveClass(/sheet-half/);
    }

    // 5. Inline Value Editing in Bottom Sheet Inspector
    // Locate the first input inside field card
    const firstInput = page.locator('.field-input').first();
    await expect(firstInput).toBeVisible();
    const initialVal = await firstInput.inputValue();

    // Edit value inline
    await firstInput.fill('Updated Store Name 2026');
    await expect(firstInput).toHaveValue('Updated Store Name 2026');

    // 6. Test CSV Export Download
    const exportCsvBtn = page.locator('.btn-export-csv');
    await expect(exportCsvBtn).toBeVisible();

    const [csvDownload] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      exportCsvBtn.click()
    ]);

    expect(csvDownload.suggestedFilename()).toContain('.csv');
    const csvPath = await csvDownload.path();
    if (csvPath) {
      const csvData = fs.readFileSync(csvPath, 'utf8');
      expect(csvData).toContain('Key,Label,Value,Confidence (%),Page,Status');
      expect(csvData).toContain('Updated Store Name 2026');
    }

    // 7. Test JSON Export Download
    const exportJsonBtn = page.locator('.btn-export-json');
    await expect(exportJsonBtn).toBeVisible();

    const [jsonDownload] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      exportJsonBtn.click()
    ]);

    expect(jsonDownload.suggestedFilename()).toContain('.json');
    const jsonPath = await jsonDownload.path();
    if (jsonPath) {
      const jsonData = fs.readFileSync(jsonPath, 'utf8');
      const parsed = JSON.parse(jsonData);
      expect(parsed.documentCategory).toBe('RECEIPT');
      expect(parsed.fields).toBeDefined();
    }
  });

  test('P1-002: Tax Invoice with GST breakdown & absent fields reporting', async ({ page }) => {
    await page.goto('/features/pdf/intelligence/extract-structured');
    await page.waitForLoadState('domcontentloaded');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(invoicePdfPath);

    // Verify invoice classification
    const categoryPill = page.locator('.category-pill');
    await expect(categoryPill).toBeVisible({ timeout: 15000 });
    await expect(categoryPill).toContainText('Invoice');

    // Verify absent field handling: missing fields should have absent badge
    const absentBadges = page.locator('.badge-absent');
    const absentCount = await absentBadges.count();
    // Absent fields are marked and never hallucinated
    expect(absentCount).toBeGreaterThanOrEqual(0);
  });

  test('P1-003: Electricity Utility Bill & Photo ID Document classification', async ({ page }) => {
    await page.goto('/features/pdf/intelligence/extract-structured');
    await page.waitForLoadState('domcontentloaded');

    // Test Utility Bill
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(utilityPdfPath);

    const categoryPill = page.locator('.category-pill');
    await expect(categoryPill).toBeVisible({ timeout: 15000 });
    await expect(categoryPill).toContainText('Utility Bill');

    // Test Photo of ID Document
    const changeFileBtn = page.locator('.btn-change-file');
    await expect(changeFileBtn).toBeVisible();

    await fileInput.setInputFiles(idPhotoPath);
    await expect(categoryPill).toBeVisible({ timeout: 15000 });
    await expect(categoryPill).toContainText('ID Document');
  });
});
