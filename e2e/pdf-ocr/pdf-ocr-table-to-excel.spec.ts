import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';

test.describe('O5 Scanned Table OCR → Excel (.xlsx / .csv) @ocr', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/ocr/table-to-excel');
    await page.waitForLoadState('domcontentloaded');
  });

  test('O5-E2E-01: verifies initial landing state, file selection, and boundary setup step', async ({ page }) => {
    // 1. Verify dropzone is visible
    const dropzone = page.getByTestId('dropzone-box');
    await expect(dropzone).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.header-title')).toContainText(/Table OCR → Excel/i);

    // 2. Upload sample image file
    const fileInput = page.getByTestId('table-file-input');
    await fileInput.setInputFiles(getTestDataPath('photos/valid-photo.jpg'));

    // 3. Verify boundary step is displayed with 4 corner pins
    const boundaryStep = page.getByTestId('boundary-step');
    await expect(boundaryStep).toBeVisible({ timeout: 15000 });

    const pinTopLeft = page.getByTestId('corner-pin-top-left');
    const pinTopRight = page.getByTestId('corner-pin-top-right');
    const pinBottomRight = page.getByTestId('corner-pin-bottom-right');
    const pinBottomLeft = page.getByTestId('corner-pin-bottom-left');

    await expect(pinTopLeft).toBeVisible();
    await expect(pinTopRight).toBeVisible();
    await expect(pinBottomRight).toBeVisible();
    await expect(pinBottomLeft).toBeVisible();

    // 4. Verify Detect & OCR button is enabled
    const detectBtn = page.getByTestId('btn-detect-ocr');
    await expect(detectBtn).toBeVisible();
    await expect(detectBtn).toBeEnabled();
  });

  test('O5-E2E-02: adjusts table boundary and runs table detection & localized cell OCR', async ({ page }) => {
    // Ensure Angular runtime is ready before injecting state
    await page.waitForFunction(() => {
      const el = document.querySelector('app-table-to-excel');
      return el && typeof (window as any).ng !== 'undefined' && !!(window as any).ng.getComponent(el);
    }, { timeout: 15000 });

    // Inject state with realistic mock scanned document ready for boundary adjustment
    await page.evaluate(() => {
      const el = document.querySelector('app-table-to-excel');
      if (!el || !(window as any).ng) return;
      const comp = (window as any).ng.getComponent(el);
      if (!comp) return;

      const dummyCanvas = document.createElement('canvas');
      dummyCanvas.width = 600;
      dummyCanvas.height = 400;
      const ctx = dummyCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, 600, 400);
      }
      comp.sourceCanvas = dummyCanvas;
      comp.selectedFile = new File(['mock content'], 'statement.png', { type: 'image/png' });
      comp.previewUrl = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="%23f9fafb"/></svg>';
      comp.imageNaturalWidth = 600;
      comp.imageNaturalHeight = 400;
      comp.currentStep = 'boundary';
      comp.tableCorners = {
        topLeft: { x: 40, y: 40 },
        topRight: { x: 560, y: 40 },
        bottomRight: { x: 560, y: 360 },
        bottomLeft: { x: 40, y: 360 }
      };

      // Mock OCR words
      comp.cachedOcrWords = [
        { text: 'Item', confidence: 95, bbox: { x0: 50, y0: 50, x1: 90, y1: 70, width: 40, height: 20 } },
        { text: 'Amount', confidence: 93, bbox: { x0: 250, y0: 50, x1: 310, y1: 70, width: 60, height: 20 } },
        { text: 'Consulting', confidence: 91, bbox: { x0: 50, y0: 100, x1: 130, y1: 120, width: 80, height: 20 } },
        { text: '$1,200.00', confidence: 94, bbox: { x0: 250, y0: 100, x1: 320, y1: 120, width: 70, height: 20 } }
      ];

      comp.cdr.detectChanges();
      (window as any).ng.applyChanges(comp);
    });

    // 1. Verify boundary step is displayed
    const boundaryStep = page.getByTestId('boundary-step');
    await expect(boundaryStep).toBeVisible();

    // 2. Click "Detect & OCR Table"
    const detectBtn = page.getByTestId('btn-detect-ocr');
    await detectBtn.click();

    // 3. Verify editor step is reached with spreadsheet grid
    const editorStep = page.getByTestId('editor-step');
    await expect(editorStep).toBeVisible({ timeout: 15000 });

    // 4. Verify Structure Badge and Dimensions text
    const badge = page.getByTestId('structure-badge');
    await expect(badge).toBeVisible();

    const dimensions = page.getByTestId('dimensions-text');
    await expect(dimensions).toBeVisible();
    await expect(dimensions).toContainText(/Rows/i);
  });

  test('O5-E2E-03: verifies interactive spreadsheet grid, inline cell editing drawer, and data updates', async ({ page }) => {
    await page.waitForFunction(() => {
      const el = document.querySelector('app-table-to-excel');
      return el && typeof (window as any).ng !== 'undefined' && !!(window as any).ng.getComponent(el);
    }, { timeout: 15000 });

    // Inject state with populated table matrix in editor view
    await page.evaluate(() => {
      const el = document.querySelector('app-table-to-excel');
      if (!el || !(window as any).ng) return;
      const comp = (window as any).ng.getComponent(el);
      if (!comp) return;

      comp.selectedFile = new File(['mock content'], 'invoice.png', { type: 'image/png' });
      comp.currentStep = 'editor';
      comp.activeViewTab = 'grid';
      comp.matrix = [
        ['Description', 'Quantity', 'Unit Price', 'Total'],
        ['Web Hosting', '1', '$120.00', '$120.00'],
        ['Domain Name', '2', '$15.00', '$30.00']
      ];
      comp.tableResult = {
        fileName: 'invoice.png',
        pageNumber: 1,
        matrix: comp.matrix,
        cells: [] as any,
        rowCount: 3,
        colCount: 4,
        structure: {
          rowCount: 3,
          colCount: 4,
          method: 'ruled',
          cells: [] as any,
          cellBboxes: [],
          rowBoundaries: [20, 60, 100, 140],
          colBoundaries: [20, 140, 220, 320, 420]
        },
        confidence: 94,
        processingTimeMs: 90
      };

      comp.cdr.detectChanges();
      (window as any).ng.applyChanges(comp);
    });

    // 1. Verify Spreadsheet Grid is rendered
    const grid = page.getByTestId('mobile-excel-grid');
    await expect(grid).toBeVisible({ timeout: 10000 });

    // 2. Click on cell 'Web Hosting' (row 1, col 0)
    const hostingCell = page.getByTestId('data-grid-cell').filter({ hasText: 'Web Hosting' });
    await expect(hostingCell).toBeVisible();
    await hostingCell.click();

    // 3. Verify Quick Cell Editor Drawer opens
    const drawer = page.getByTestId('cell-editor-sheet');
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // 4. Verify input contains original cell value
    const cellInput = page.getByTestId('cell-editor-input');
    await expect(cellInput).toHaveValue('Web Hosting');

    // 5. Edit cell value to 'Cloud Hosting Pro'
    await cellInput.fill('Cloud Hosting Pro');

    // 6. Click Apply
    const applyBtn = page.getByTestId('btn-apply-cell');
    await applyBtn.click();

    // 7. Verify drawer closed and cell updated in grid
    await expect(drawer).not.toBeVisible();
    await expect(page.getByTestId('data-grid-cell').filter({ hasText: 'Cloud Hosting Pro' })).toBeVisible();
  });

  test('O5-E2E-04: tests spreadsheet grid actions (add row, delete row, add column, delete column)', async ({ page }) => {
    await page.waitForFunction(() => {
      const el = document.querySelector('app-table-to-excel');
      return el && typeof (window as any).ng !== 'undefined' && !!(window as any).ng.getComponent(el);
    }, { timeout: 15000 });

    await page.evaluate(() => {
      const el = document.querySelector('app-table-to-excel');
      if (!el || !(window as any).ng) return;
      const comp = (window as any).ng.getComponent(el);
      if (!comp) return;

      comp.selectedFile = new File(['mock content'], 'test.png', { type: 'image/png' });
      comp.currentStep = 'editor';
      comp.activeViewTab = 'grid';
      comp.matrix = [
        ['Header A', 'Header B'],
        ['Val 1', 'Val 2']
      ];
      comp.cdr.detectChanges();
      (window as any).ng.applyChanges(comp);
    });

    // 1. Initial dimensions: 2 rows x 2 cols
    const dimensionsText = page.getByTestId('dimensions-text');
    await expect(dimensionsText).toContainText('2 Rows × 2 Columns');

    // 2. Add Row
    const addRowBtn = page.getByTestId('btn-add-row');
    await addRowBtn.click();
    await expect(dimensionsText).toContainText('3 Rows × 2 Columns');

    // 3. Add Column
    const addColBtn = page.getByTestId('btn-add-col');
    await addColBtn.click();
    await expect(dimensionsText).toContainText('3 Rows × 3 Columns');

    // 4. Delete Row
    const deleteRowBtn = page.getByTestId('btn-delete-row');
    await deleteRowBtn.click();
    await expect(dimensionsText).toContainText('2 Rows × 3 Columns');

    // 5. Delete Column
    const deleteColBtn = page.getByTestId('btn-delete-col');
    await deleteColBtn.click();
    await expect(dimensionsText).toContainText('2 Rows × 2 Columns');
  });

  test('O5-E2E-05: switches between spreadsheet grid and original scan viewer with zoom controls', async ({ page }) => {
    await page.waitForFunction(() => {
      const el = document.querySelector('app-table-to-excel');
      return el && typeof (window as any).ng !== 'undefined' && !!(window as any).ng.getComponent(el);
    }, { timeout: 15000 });

    await page.evaluate(() => {
      const el = document.querySelector('app-table-to-excel');
      if (!el || !(window as any).ng) return;
      const comp = (window as any).ng.getComponent(el);
      if (!comp) return;

      comp.selectedFile = new File(['mock content'], 'scan.png', { type: 'image/png' });
      comp.previewUrl = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="%23ffffff"/><text x="20" y="40">Scanned Document</text></svg>';
      comp.currentStep = 'editor';
      comp.activeViewTab = 'grid';
      comp.matrix = [['A', 'B'], ['1', '2']];
      comp.cdr.detectChanges();
      (window as any).ng.applyChanges(comp);
    });

    // 1. Switch to Original Scan Tab
    const tabScan = page.getByTestId('tab-scan');
    await tabScan.click();
    await expect(tabScan).toHaveClass(/active/);

    const scanViewer = page.locator('.scan-viewer-container');
    await expect(scanViewer).toBeVisible({ timeout: 5000 });

    // 2. Verify Zoom Indicator and Controls
    const zoomText = page.locator('.zoom-level-text');
    await expect(zoomText).toHaveText('100%');

    const zoomInBtn = page.getByLabel('Zoom In');
    await zoomInBtn.click();
    await expect(zoomText).toHaveText('120%');

    const zoomOutBtn = page.getByLabel('Zoom Out');
    await zoomOutBtn.click();
    await expect(zoomText).toHaveText('100%');

    // 3. Switch back to Spreadsheet Grid Tab
    const tabGrid = page.getByTestId('tab-grid');
    await tabGrid.click();
    await expect(tabGrid).toHaveClass(/active/);
    await expect(page.getByTestId('mobile-excel-grid')).toBeVisible();
  });

  test('O5-E2E-06: exports table directly to Excel (.xlsx) and standard CSV with toast feedback', async ({ page }) => {
    await page.waitForFunction(() => {
      const el = document.querySelector('app-table-to-excel');
      return el && typeof (window as any).ng !== 'undefined' && !!(window as any).ng.getComponent(el);
    }, { timeout: 15000 });

    await page.evaluate(() => {
      const el = document.querySelector('app-table-to-excel');
      if (!el || !(window as any).ng) return;
      const comp = (window as any).ng.getComponent(el);
      if (!comp) return;

      comp.selectedFile = new File(['mock content'], 'balance_sheet.png', { type: 'image/png' });
      comp.currentStep = 'editor';
      comp.activeViewTab = 'grid';
      comp.matrix = [
        ['Account', 'Balance'],
        ['Cash', '$15,400.00'],
        ['Accounts Receivable', '$8,950.00']
      ];

      // Mock exports
      comp.scannedTableService.exportToExcelWithQuota = async () => ({
        file: new File(['mock xlsx'], 'balance_sheet_table.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        savedUri: 'file:///storage/balance_sheet_table.xlsx',
        quotaEnforced: true
      });

      comp.scannedTableService.exportToCsvWithQuota = async () => ({
        file: new File(['mock csv'], 'balance_sheet_table.csv', { type: 'text/csv' }),
        savedUri: 'file:///storage/balance_sheet_table.csv',
        quotaEnforced: true
      });

      comp.cdr.detectChanges();
      (window as any).ng.applyChanges(comp);
    });

    // 1. Click Export to Excel (.xlsx)
    const exportExcelBtn = page.getByTestId('btn-export-excel');
    await expect(exportExcelBtn).toBeVisible({ timeout: 10000 });
    await exportExcelBtn.click();

    // 2. Verify success toast notification for Excel export
    await expect(page.locator('.toast-item').first()).toContainText(/Excel file exported successfully|exported/i, { timeout: 10000 });

    // 3. Click Export to CSV
    const exportCsvBtn = page.getByTestId('btn-export-csv');
    await expect(exportCsvBtn).toBeVisible();
    await exportCsvBtn.click();

    // 4. Verify success toast notification for CSV export
    await expect(page.locator('.toast-item').first()).toContainText(/CSV file exported successfully|exported/i, { timeout: 10000 });
  });
});
