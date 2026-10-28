import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import { setupCapacitorMocks } from '../fixtures/mocks';

const FIXTURES_DIR = path.resolve(__dirname, '../test-data/conversion-audit');

function auditFixture(fileName: string): string {
  return path.join(FIXTURES_DIR, fileName);
}

function dropzoneInput(page: Page) {
  return page.locator('input[type="file"]').first();
}

test.describe('Audit & Verification: Document Conversion Suite (Desktop & Mobile)', () => {
  test.beforeEach(async ({ page }) => {
    // Monitor unhandled exceptions and promise rejections
    page.on('pageerror', (err) => {
      if (!err.message.includes('ResizeObserver')) {
        console.error('Unhandled page error:', err.message);
      }
    });

    await setupCapacitorMocks(page);
  });

  // =========================================================================
  // 1. WORD TO PDF CONVERSION
  // =========================================================================
  test('STEP 2.1 - Word to PDF: Converts formatted .docx with headings and tables', async ({ page }) => {
    await page.goto('/features/pdf/conversion/word-to-pdf');
    await page.waitForLoadState('networkidle');

    const input = dropzoneInput(page);
    await input.waitFor({ state: 'attached', timeout: 15000 });
    await input.setInputFiles(auditFixture('sample-formatted.docx'));

    // Verify selected file card appears
    await expect(page.locator('.selected-file-card')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.file-text strong')).toHaveText('sample-formatted.docx');

    // Click Start Conversion
    const convertBtn = page.getByRole('button', { name: 'Start Conversion' });
    await expect(convertBtn).toBeVisible({ timeout: 10000 });
    await convertBtn.click();

    // Verify success result card and action button
    await expect(page.locator('.result-card')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.result-card h3')).toHaveText('Conversion Successful!');
    await expect(page.getByRole('button', { name: /Save PDF/i })).toBeVisible({ timeout: 10000 });
  });

  // =========================================================================
  // 2. EXCEL TO PDF CONVERSION
  // =========================================================================
  test('STEP 2.2 - Excel to PDF: Converts multi-sheet spreadsheet and displays table preview', async ({ page }) => {
    await page.goto('/features/pdf/conversion/excel-to-pdf');
    await page.waitForLoadState('networkidle');

    const input = dropzoneInput(page);
    await input.waitFor({ state: 'attached', timeout: 15000 });
    await input.setInputFiles(auditFixture('sample-multisheet.xlsx'));

    await expect(page.locator('.selected-file-card')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.file-text strong')).toHaveText('sample-multisheet.xlsx');

    const convertBtn = page.getByRole('button', { name: 'Start Conversion' });
    await expect(convertBtn).toBeVisible({ timeout: 10000 });
    await convertBtn.click();

    await expect(page.locator('.result-card')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.result-card h3')).toHaveText('Conversion Successful!');
    await expect(page.getByRole('button', { name: /Save PDF/i })).toBeVisible({ timeout: 10000 });
    // Check extracted table preview
    await expect(page.locator('.table-preview-wrap')).toBeVisible({ timeout: 10000 });
  });

  // =========================================================================
  // 3. HTML TO PDF CONVERSION
  // =========================================================================
  test('STEP 2.3 - HTML to PDF: Converts messy HTML document into safe PDF pages', async ({ page }) => {
    await page.goto('/features/pdf/conversion/html-to-pdf');
    await page.waitForLoadState('networkidle');

    const input = dropzoneInput(page);
    await input.waitFor({ state: 'attached', timeout: 15000 });
    await input.setInputFiles(auditFixture('sample-messy.html'));

    await expect(page.locator('.selected-file-card')).toBeVisible({ timeout: 15000 });

    const convertBtn = page.getByRole('button', { name: 'Start Conversion' });
    await expect(convertBtn).toBeVisible({ timeout: 10000 });
    await convertBtn.click();

    await expect(page.locator('.result-card')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.result-card h3')).toHaveText('Conversion Successful!');
    await expect(page.getByRole('button', { name: /Save PDF/i })).toBeVisible({ timeout: 10000 });
  });

  // =========================================================================
  // 4. CSV TO PDF CONVERSION
  // =========================================================================
  test('STEP 2.4 - CSV to PDF: Converts CSV dataset into formatted PDF table grid', async ({ page }) => {
    await page.goto('/features/pdf/conversion/csv-to-pdf');
    await page.waitForLoadState('networkidle');

    const input = dropzoneInput(page);
    await input.waitFor({ state: 'attached', timeout: 15000 });
    await input.setInputFiles(auditFixture('sample-regional.csv'));

    await expect(page.locator('.selected-file-card')).toBeVisible({ timeout: 15000 });

    const convertBtn = page.getByRole('button', { name: 'Start Conversion' });
    await expect(convertBtn).toBeVisible({ timeout: 10000 });
    await convertBtn.click();

    await expect(page.locator('.result-card')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.result-card h3')).toHaveText('Conversion Successful!');
    await expect(page.getByRole('button', { name: /Save PDF/i })).toBeVisible({ timeout: 10000 });
  });

  // =========================================================================
  // 5. REVERSE CONVERSION: PDF TO WORD
  // =========================================================================
  test('STEP 2.5 - PDF to Word: Converts multi-page PDF into editable DOCX', async ({ page }) => {
    await page.goto('/features/pdf/conversion/pdf-to-word');
    await page.waitForLoadState('networkidle');

    const input = dropzoneInput(page);
    await input.waitFor({ state: 'attached', timeout: 15000 });
    await input.setInputFiles(auditFixture('sample-multi-page.pdf'));

    await expect(page.locator('.selected-file-card')).toBeVisible({ timeout: 15000 });

    const convertBtn = page.getByRole('button', { name: 'Start Conversion' });
    await expect(convertBtn).toBeVisible({ timeout: 10000 });
    await convertBtn.click();

    await expect(page.locator('.result-card')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.result-card h3')).toHaveText('Conversion Successful!');
    await expect(page.getByRole('button', { name: /Save DOCX/i })).toBeVisible({ timeout: 10000 });
  });

  // =========================================================================
  // 6. REVERSE CONVERSION: PDF TO EXCEL
  // =========================================================================
  test('STEP 2.6 - PDF to Excel: Detects tabular structures and produces XLSX', async ({ page }) => {
    await page.goto('/features/pdf/conversion/pdf-to-excel');
    await page.waitForLoadState('networkidle');

    const input = dropzoneInput(page);
    await input.waitFor({ state: 'attached', timeout: 15000 });
    await input.setInputFiles(auditFixture('sample-multi-page.pdf'));

    await expect(page.locator('.selected-file-card')).toBeVisible({ timeout: 15000 });

    const convertBtn = page.getByRole('button', { name: 'Start Conversion' });
    await expect(convertBtn).toBeVisible({ timeout: 10000 });
    await convertBtn.click();

    await expect(page.locator('.result-card')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.result-card h3')).toHaveText('Conversion Successful!');
    await expect(page.getByRole('button', { name: /Save XLSX/i })).toBeVisible({ timeout: 10000 });
  });

  // =========================================================================
  // 7. OFFENSIVE SECURITY STRESS-TESTING
  // =========================================================================
  test('STEP 5.1 - Polyglot Rejection: Disguised shell script as .docx is rejected cleanly', async ({ page }) => {
    let unhandledCrash = false;
    page.on('pageerror', () => { unhandledCrash = true; });

    await page.goto('/features/pdf/conversion/word-to-pdf');
    await page.waitForLoadState('networkidle');

    const input = dropzoneInput(page);
    await input.waitFor({ state: 'attached', timeout: 15000 });
    await input.setInputFiles(auditFixture('polyglot-script.docx'));

    // Should show error banner or toast rejecting the file with invalid signature
    await expect(page.locator('.error-banner, .toast-message, ion-toast')).toBeVisible({ timeout: 15000 });
    expect(unhandledCrash).toBe(false);
  });
});
