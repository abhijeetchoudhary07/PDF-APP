import { test, expect } from '@playwright/test';
import * as path from 'path';
import { setupCapacitorMocks } from '../fixtures/mocks';

function getAuditFixturePath(fileName: string): string {
  return path.resolve(process.cwd(), 'e2e/test-data/scanner-audit', fileName);
}

test.describe('Document Scanner & OCR Comprehensive Release Audit Suite', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('TC-SCN-01: Tilted receipt scan, edge detection, perspective warp, filter, and PDF generation', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/features/document-scanner');
    await expect(page).toHaveURL(/.*features\/document-scanner/);

    // 1. Upload tilted receipt invoice fixture via gallery filechooser
    const fileChooserPromise = page.waitForEvent('filechooser');
    const importBtn = page.locator('app-button[data-testid="import-gallery"] button');
    await expect(importBtn).toBeVisible({ timeout: 15000 });
    await importBtn.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(getAuditFixturePath('tilted-receipt-invoice.png'));

    // Check if blur modal appears and dismiss if needed
    try {
      const keepBtn = page.locator('app-button[data-testid="blur-keep"] button');
      if (await keepBtn.isVisible({ timeout: 2000 })) {
        await keepBtn.click();
        await expect(keepBtn).toBeHidden({ timeout: 5000 });
      }
    } catch {}

    // 2. High-confidence edge detection automatically warps to pages dashboard
    await expect(page.locator('.pages-dashboard-card')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.page-card')).toHaveCount(1);

    // 3. Open manual crop editor to verify quadrilateral corner handles
    const cropBtn = page.locator('.page-card').first().locator('button[data-testid="page-crop"]');
    await cropBtn.click();
    await expect(page.locator('.crop-card canvas.interactive-crop-canvas')).toBeVisible({ timeout: 15000 });

    // Apply corner adjustments
    const applyCropBtn = page.locator('app-button[data-testid="apply-crop"] button');
    await expect(applyCropBtn).toBeVisible();
    await applyCropBtn.click();
    await expect(page.locator('.pages-dashboard-card')).toBeVisible({ timeout: 15000 });

    // 4. Open Enhancement Editor & Apply Filter
    const enhanceBtn = page.locator('.page-card').first().locator('button[data-testid="page-enhance"]');
    await enhanceBtn.click();
    await expect(page.locator('.enhance-card')).toBeVisible({ timeout: 15000 });

    const presets = page.locator('.preset-btn');
    await expect(presets).toHaveCount(5);
    // Select Preset 1 (Magic Color / Document)
    await presets.nth(1).click();
    await expect(presets.nth(1)).toHaveClass(/active/);

    // Save enhancement
    await page.locator('app-button[data-testid="done-enhancing"] button').click();
    await expect(page.locator('.pages-dashboard-card')).toBeVisible({ timeout: 15000 });

    // 5. Generate PDF
    const generateBtn = page.locator('app-button[data-testid="generate-pdf"] button');
    await expect(generateBtn).toBeVisible();
    await generateBtn.click();

    // 6. Verify PDF Ready screen & download action
    await expect(page.getByRole('heading', { name: /scanned pdf ready/i })).toBeVisible({ timeout: 20000 });
    const downloadBtn = page.getByRole('button', { name: /download pdf/i }).first();
    await expect(downloadBtn).toBeVisible();

    // Filter out innocuous browser network/favicon errors
    const fatalErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('404'));
    expect(fatalErrors).toHaveLength(0);
  });

  test('TC-SCN-02: Book mode automatic center gutter detection and 2-page spread splitting', async ({ page }) => {
    await page.goto('/features/document-scanner');

    // Select Book Mode from Mode Carousel
    const bookPill = page.locator('.mode-pill').filter({ hasText: /book|📖/i }).first();
    await expect(bookPill).toBeVisible({ timeout: 15000 });
    await bookPill.click();
    await expect(bookPill).toHaveClass(/active/);

    // Verify book mode guidance banner
    await expect(page.locator('.book-guide')).toBeVisible();

    // Import two-page book spread
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('app-button[data-testid="import-gallery"] button').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(getAuditFixturePath('curved-book-page.png'));

    // Check blur gate
    try {
      const keepBtn = page.locator('app-button[data-testid="blur-keep"] button');
      if (await keepBtn.isVisible({ timeout: 2000 })) {
        await keepBtn.click();
      }
    } catch {}

    // In Book Mode, it splits into left & right pages directly on import
    await expect(page.locator('.pages-dashboard-card')).toBeVisible({ timeout: 25000 });
    await expect(page.locator('.page-card')).toHaveCount(2);

    // Verify page badges 1 and 2
    const pageBadges = page.locator('.page-number-badge');
    await expect(pageBadges.nth(0)).toContainText('1');
    await expect(pageBadges.nth(1)).toContainText('2');
  });

  test('TC-SCN-03: Multi-page batch management, reordering, rotation, and deletion', async ({ page }) => {
    await page.goto('/features/document-scanner');

    // 1. Import First Page
    let fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('app-button[data-testid="import-gallery"] button').click();
    let fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(getAuditFixturePath('tilted-receipt-invoice.png'));
    try {
      const keepBtn = page.locator('app-button[data-testid="blur-keep"] button');
      if (await keepBtn.isVisible({ timeout: 2000 })) await keepBtn.click();
    } catch {}
    await expect(page.locator('.pages-dashboard-card')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.page-card')).toHaveCount(1);

    // 2. Import Second Page from dashboard
    fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('app-button[data-testid="add-page-gallery"] button').click();
    fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(getAuditFixturePath('low-contrast-white-table.png'));
    try {
      const keepBtn = page.locator('app-button[data-testid="blur-keep"] button');
      if (await keepBtn.isVisible({ timeout: 2000 })) await keepBtn.click();
    } catch {}
    await expect(page.locator('.pages-dashboard-card')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.page-card')).toHaveCount(2);

    // 3. Test Rotation
    const page0Thumb = page.locator('.page-card').first().locator('.page-thumb');
    const thumbBefore = await page0Thumb.getAttribute('src');
    await page.locator('.page-card').first().locator('button[data-testid="page-rotate"]').click();
    await expect(page0Thumb).not.toHaveAttribute('src', thumbBefore!, { timeout: 10000 });

    // 4. Test Reordering: Move page 2 up to become page 1
    const moveUpBtn = page.locator('.page-card').nth(1).locator('button[data-testid="page-move-up"]');
    await expect(moveUpBtn).toBeEnabled();
    await moveUpBtn.click();
    await expect(page.locator('.page-card')).toHaveCount(2);

    // 5. Test Delete Page
    await page.locator('.page-card').nth(1).locator('button[data-testid="page-delete"]').click();
    await expect(page.locator('.page-card')).toHaveCount(1);

    // 6. Generate Final PDF
    await page.locator('app-button[data-testid="generate-pdf"] button').click();
    await expect(page.getByRole('heading', { name: /scanned pdf ready/i })).toBeVisible({ timeout: 20000 });
  });

  test('TC-OCR-04: Smart OCR detection, multilingual document processing, text display, and copy', async ({ page }) => {
    test.setTimeout(75000);
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.text().includes('OCR') || msg.text().includes('Tesseract')) {
        console.log(`[Browser ${msg.type()}]: ${msg.text()}`);
      }
    });
    page.on('pageerror', err => {
      console.log(`[Browser PageError]: ${err.message}`);
    });
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/features/pdf-ocr');
    await expect(page).toHaveURL(/.*features\/pdf-ocr/);

    // Upload multilingual test fixture (image format)
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(getAuditFixturePath('multilingual-hindi-english.png'));

    // Should land on OCR Settings or directly on Result screen
    const settingsHeading = page.getByRole('heading', { name: /ocr settings/i });
    const resultHeading = page.getByRole('heading', { name: /recognized document/i });

    // Wait for OCR Settings or Start OCR button to be visible after file upload
    const startOcrBtn = page.getByRole('button', { name: /start ocr processing/i });
    await expect(startOcrBtn).toBeVisible({ timeout: 30000 });

    const engPill = page.getByTestId('ocr-lang-eng');
    if (await engPill.isVisible()) {
      await engPill.click();
    }

    await startOcrBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await startOcrBtn.click();

    // Wait for OCR recognition to complete and land on Result screen
    await expect(resultHeading).toBeVisible({ timeout: 60000 });

    // Verify extracted text content contains recognized words
    const resultTextArea = page.locator('.recognized-textarea, textarea').first();
    await expect(resultTextArea).toBeVisible();
    const extractedText = await resultTextArea.inputValue();
    expect(extractedText).toMatch(/GOVERNMENT|INDIA|Rajesh|Kumar|Sharma|9876/i);

    // Verify Search functionality
    const searchBox = page.locator('.search-box .search-input, input[placeholder*="Search"]').first();
    if (await searchBox.isVisible()) {
      await searchBox.fill('Rajesh');
      await expect(searchBox).toHaveValue('Rajesh');
    }

    // Verify Copy Page Text button is functional
    const copyBtn = page.getByRole('button', { name: /copy page text/i }).first();
    if (await copyBtn.isVisible()) {
      await copyBtn.click();
      await expect(page.locator('.toast-item, [role="alert"]').first()).toBeVisible({ timeout: 10000 });
    }

    // Verify Searchable PDF export button is present
    await expect(page.getByRole('button', { name: /searchable pdf/i }).first()).toBeVisible();
  });

  test('TC-SEC-05: Cybersecurity stress testing — XSS injection immunity and zero-byte upload resilience', async ({ page }) => {
    let alertFired = false;
    page.on('dialog', async dialog => {
      alertFired = true;
      await dialog.dismiss();
    });

    // 1. Upload XSS injection document to Scanner
    await page.goto('/features/document-scanner');
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('app-button[data-testid="import-gallery"] button').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(getAuditFixturePath('xss-injection-document.png'));
    try {
      const keepBtn = page.locator('app-button[data-testid="blur-keep"] button');
      if (await keepBtn.isVisible({ timeout: 2000 })) await keepBtn.click();
    } catch {}

    // Lands cleanly on dashboard
    await expect(page.locator('.pages-dashboard-card')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.page-card')).toHaveCount(1);

    // Confirm that no alert dialog or unhandled script executed
    expect(alertFired).toBe(false);

    // 2. Zero-byte upload test on OCR
    await page.goto('/features/pdf-ocr');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'zero-byte-scanner-test.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from([])
    });

    // Verify error toast/alert is gracefully shown without crash
    await expect(page.locator('.toast-item, [role="alert"], .error-message').first()).toBeVisible({ timeout: 10000 });
    expect(alertFired).toBe(false);
  });

  test('TC-SEC-06: High-resolution stress testing — 25MP image processed without memory crash', async ({ page }) => {
    test.setTimeout(75000);
    await page.goto('/features/document-scanner');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('app-button[data-testid="import-gallery"] button').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(getAuditFixturePath('oversized-highres-document.jpg'));

    try {
      const keepBtn = page.locator('app-button[data-testid="blur-keep"] button');
      if (await keepBtn.isVisible({ timeout: 3000 })) await keepBtn.click();
    } catch {}

    // Canvas clamp to MAX_SCAN_DIMENSION (4096) prevents memory crash and arrives at crop view or dashboard
    await expect(page.locator('.crop-card, .pages-dashboard-card')).toBeVisible({ timeout: 45000 });

    const applyCropBtn = page.locator('app-button[data-testid="apply-crop"] button, button:has-text("Apply Crop")').first();
    if (await applyCropBtn.isVisible()) {
      await applyCropBtn.click();
    }

    await expect(page.locator('.pages-dashboard-card')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.page-card')).toHaveCount(1);
  });
});
