import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import { setupCapacitorMocks } from './fixtures/mocks';

test.describe('P3 Continuous Barcode Batch Scanner & 1D Generator @barcode-batch @p3', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('P3-001: Continuous Batch Scanning Simulation, Cooldown Deduplication, and CSV Export', async ({ page }) => {
    // 1. Navigate to /features/qr-barcode/batch
    await page.goto('/features/qr-barcode/batch');
    await page.waitForLoadState('domcontentloaded');

    // Verify title and active batchScan tab
    const title = page.locator('.page-title');
    await expect(title).toBeVisible();

    const batchTab = page.locator('.tab-pill-batch');
    await expect(batchTab).toHaveClass(/active/);

    // Initial count is 0
    const countBadge = page.locator('.live-count-badge');
    await expect(countBadge).toBeVisible();
    await expect(countBadge).toContainText('0');

    // 2. Simulate First Barcode Scan: SKU-1001
    await page.evaluate(() => {
      (window as any).__simulateBarcodeScan('SKU-1001', 'CODE_128');
    });

    // Count updates to 1
    await expect(countBadge).toContainText('1');
    const drawerTitle = page.locator('.drawer-title');
    await expect(drawerTitle).toContainText('(1)');

    const scannedCards = page.locator('.scanned-item-card');
    await expect(scannedCards).toHaveCount(1);
    await expect(scannedCards.first()).toContainText('SKU-1001');

    // 3. Test Deduplication: Immediate scan of same barcode should be rejected by cooldown
    await page.evaluate(() => {
      (window as any).__simulateBarcodeScan('SKU-1001', 'CODE_128');
    });

    // Count must remain 1
    await expect(countBadge).toContainText('1');
    await expect(scannedCards).toHaveCount(1);

    // 4. Scan a Different Barcode: SKU-1002
    await page.evaluate(() => {
      (window as any).__simulateBarcodeScan('SKU-1002', 'CODE_128');
    });

    // Count updates to 2
    await expect(countBadge).toContainText('2');
    await expect(scannedCards).toHaveCount(2);

    // 5. Export to CSV
    const exportCsvBtn = page.locator('.export-csv-btn');
    await expect(exportCsvBtn).toBeEnabled();

    const [csvDownload] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      exportCsvBtn.click()
    ]);

    expect(csvDownload.suggestedFilename()).toMatch(/\.csv$/i);
    const downloadPath = await csvDownload.path();
    if (downloadPath) {
      const csvContent = fs.readFileSync(downloadPath, 'utf8');
      expect(csvContent).toContain('SKU-1001');
      expect(csvContent).toContain('SKU-1002');
    }

    // 6. Delete single item
    const deleteBtn = page.locator('.btn-delete').first();
    await deleteBtn.click();
    await expect(scannedCards).toHaveCount(1);
    await expect(countBadge).toContainText('1');

    // 7. Clear all scanned items
    const clearBtn = page.locator('.btn-text-clear');
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();
    await expect(scannedCards).toHaveCount(0);
    await expect(countBadge).toContainText('0');
  });

  test('P3-002: Deduplication Mode Toggling — Session Mode Enforces Strict Duplicate Rejection', async ({ page }) => {
    await page.goto('/features/qr-barcode/batch');
    await page.waitForLoadState('domcontentloaded');

    // Switch to Session Deduplication Mode
    const sessionChip = page.locator('.chip-dedup-session');
    await expect(sessionChip).toBeVisible();
    await sessionChip.click();
    await expect(sessionChip).toHaveClass(/active/);

    // Scan an item
    await page.evaluate(() => {
      (window as any).__simulateBarcodeScan('ASSET-TAG-99', 'CODE_39');
    });

    const countBadge = page.locator('.live-count-badge');
    await expect(countBadge).toContainText('1');

    // Repeat the scan under session mode — must reject regardless of time
    await page.evaluate(() => {
      (window as any).__simulateBarcodeScan('ASSET-TAG-99', 'CODE_39');
    });
    await expect(countBadge).toContainText('1');

    // Scan new item
    await page.evaluate(() => {
      (window as any).__simulateBarcodeScan('ASSET-TAG-100', 'CODE_39');
    });
    await expect(countBadge).toContainText('2');
  });

  test('P3-003: 1D Generator — Code 128, Code 39, and EAN-13 Check Digit Validation', async ({ page }) => {
    await page.goto('/features/qr-barcode/batch');
    await page.waitForLoadState('domcontentloaded');

    // Switch to 1D Generator tab
    const genTab = page.locator('.tab-pill-gen');
    await expect(genTab).toBeVisible();
    await genTab.click();
    await expect(genTab).toHaveClass(/active/);

    // 1. Code 128 vector preview
    const payloadInput = page.locator('.payload-input');
    await expect(payloadInput).toBeVisible();
    await payloadInput.fill('PALLET-4022');

    const svgPreview = page.locator('.svg-container svg');
    await expect(svgPreview).toBeVisible({ timeout: 10000 });
    await expect(svgPreview).toContainText('PALLET-4022');

    // 2. Switch to EAN-13 format
    const eanPill = page.locator('.format-pill-ean13');
    await expect(eanPill).toBeVisible();
    await eanPill.click();
    await expect(eanPill).toHaveClass(/selected/);

    // Test Invalid EAN-13 Check Digit (4006381333939: check digit is 1, not 9)
    await payloadInput.fill('4006381333939');

    const errorBanner = page.locator('.validation-error-banner');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText(/Invalid EAN-13 check digit/i);

    const emptyPreview = page.locator('.preview-empty');
    await expect(emptyPreview).toBeVisible();

    // Test Valid 12 digits (auto-computes 13th check digit 1)
    await payloadInput.fill('400638133393');
    await expect(errorBanner).not.toBeVisible();
    await expect(svgPreview).toBeVisible();
    await expect(svgPreview).toContainText('4006381333931');

    // 3. Export single barcode to A4 label sheet PDF
    const genLabelBtn = page.locator('.btn-gen-labels');
    await expect(genLabelBtn).toBeEnabled();

    const [pdfDownload] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      genLabelBtn.click()
    ]);

    expect(pdfDownload.suggestedFilename()).toMatch(/\.pdf$/i);
    const downloadPath = await pdfDownload.path();
    if (downloadPath) {
      const pdfBytes = fs.readFileSync(downloadPath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      expect(pdfDoc.getPageCount()).toBeGreaterThanOrEqual(1);
    }
  });

  test('P3-004: Bulk Barcode Mode — Generates Multi-Page Printable PDF (24-Up) and ZIP Archive', async ({ page }) => {
    await page.goto('/features/qr-barcode/batch');
    await page.waitForLoadState('domcontentloaded');

    // Switch to Generator tab
    const genTab = page.locator('.tab-pill-gen');
    await genTab.click();

    // Toggle Bulk Mode switch
    const toggleSwitch = page.locator('.toggle-switch');
    await expect(toggleSwitch).toBeVisible();
    await page.locator('.switch-slider').click();

    const bulkSection = page.locator('.bulk-gen-section');
    await expect(bulkSection).toBeVisible();

    // Prepare 50 barcode payloads
    const fiftyPayloads: string[] = [];
    for (let i = 1; i <= 50; i++) {
      fiftyPayloads.push(`BATCH-ITEM-${i.toString().padStart(4, '0')}`);
    }

    const bulkTextarea = page.locator('.bulk-textarea');
    await bulkTextarea.fill(fiftyPayloads.join('\n'));

    const countHint = page.locator('.bulk-count-hint');
    await expect(countHint).toContainText('50 barcode payload(s)');

    // Select 24-up Grid
    const grid24 = page.locator('.grid-pill-24');
    await expect(grid24).toBeVisible();
    await grid24.click();
    await expect(grid24).toHaveClass(/active/);

    // 1. Generate Printable PDF Label Sheet (50 items on 24-up grid = 3 pages)
    const genSheetBtn = page.locator('.btn-gen-labels');
    await expect(genSheetBtn).toBeEnabled();

    const [pdfDownload] = await Promise.all([
      page.waitForEvent('download', { timeout: 25000 }),
      genSheetBtn.click()
    ]);

    expect(pdfDownload.suggestedFilename()).toMatch(/\.pdf$/i);
    const pdfPath = await pdfDownload.path();
    if (pdfPath) {
      const pdfBytes = fs.readFileSync(pdfPath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      // 50 barcodes on 24-up grid = 3 pages
      expect(pdfDoc.getPageCount()).toBe(3);
    }

    // 2. Download ZIP Archive of PNG Barcode Images
    const dlZipBtn = page.locator('.btn-dl-zip');
    await expect(dlZipBtn).toBeEnabled();

    const [zipDownload] = await Promise.all([
      page.waitForEvent('download', { timeout: 25000 }),
      dlZipBtn.click()
    ]);

    expect(zipDownload.suggestedFilename()).toMatch(/\.zip$/i);
    const zipPath = await zipDownload.path();
    if (zipPath) {
      const stat = fs.statSync(zipPath);
      expect(stat.size).toBeGreaterThan(1000);
    }
  });
});
