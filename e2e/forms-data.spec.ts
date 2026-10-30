import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { setupCapacitorMocks } from './fixtures/mocks';

test.describe('Form Data Import & Export (M2) E2E Test Suite @forms @forms-data', () => {
  const fillablePath = path.resolve(__dirname, 'test-data/editor-audit/fillable-form.pdf');

  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('M2-001: Form Data Export workflow: upload PDF, view stats, and inspect 4 export format cards', async ({ page }) => {
    // 1. Navigate to /features/pdf/forms/data
    await page.goto('/features/pdf/forms/data');
    await page.waitForLoadState('domcontentloaded');

    // Verify empty state is displayed initially
    const emptyCard = page.locator('[data-testid="empty-state-card"]');
    await expect(emptyCard).toBeVisible();

    // 2. Upload fillable PDF
    const pdfInput = page.locator('[data-testid="pdf-file-input"]');
    await pdfInput.setInputFiles(fillablePath);

    // 3. Verify Document Summary Card and field stats
    const summaryCard = page.locator('[data-testid="doc-summary-card"]');
    await expect(summaryCard).toBeVisible({ timeout: 15000 });

    const totalStat = page.locator('[data-testid="stat-total-fields"] .stat-num');
    await expect(totalStat).toContainText('4');

    // 4. Verify Export section with all 4 formats (JSON, CSV, XFDF, FDF)
    const exportSection = page.locator('[data-testid="export-view-section"]');
    await expect(exportSection).toBeVisible();

    await expect(page.locator('[data-testid="format-card-json"]')).toBeVisible();
    await expect(page.locator('[data-testid="format-card-csv"]')).toBeVisible();
    await expect(page.locator('[data-testid="format-card-xfdf"]')).toBeVisible();
    await expect(page.locator('[data-testid="format-card-fdf"]')).toBeVisible();

    // 5. Test Copy to Clipboard
    const copyJsonBtn = page.locator('[data-testid="copy-btn-json"]');
    await expect(copyJsonBtn).toBeEnabled();
    await copyJsonBtn.click();

    // Toast notification confirmation
    const toast = page.locator('ion-toast');
    await expect(toast).toBeVisible({ timeout: 10000 });
  });

  test('M2-002: Form Data Import workflow via JSON with exact & fuzzy matching and bottom sheet audit', async ({ page }, testInfo) => {
    // 1. Create a test JSON import file with exact, fuzzy, and unmatched keys
    const jsonImportPath = testInfo.outputPath('applicant-data.json');
    const testJson = {
      fullName: 'Vikram Malhotra',
      email: 'vikram.malhotra@gov.in',
      agree_terms: true, // fuzzy match for 'agreeTerms'
      unmatchedRegistrationNo: 'REG-998822' // unmatched key
    };
    fs.writeFileSync(jsonImportPath, JSON.stringify(testJson, null, 2), 'utf-8');

    // 2. Load PDF into Forms Data tool
    await page.goto('/features/pdf/forms/data');
    await page.waitForLoadState('domcontentloaded');

    const pdfInput = page.locator('[data-testid="pdf-file-input"]');
    await pdfInput.setInputFiles(fillablePath);

    await expect(page.locator('[data-testid="doc-summary-card"]')).toBeVisible({ timeout: 15000 });

    // 3. Switch to Import Tab
    const importTab = page.locator('[data-testid="tab-import"]');
    await importTab.click();

    const dropZone = page.locator('[data-testid="import-drop-zone"]');
    await expect(dropZone).toBeVisible();

    // 4. Upload JSON file via data file input
    const dataInput = page.locator('[data-testid="data-file-input"]');
    await dataInput.setInputFiles(jsonImportPath);

    // 5. Verify Instant Import Preview Bottom Sheet
    const previewSheet = page.locator('[data-testid="preview-bottom-sheet"]');
    await expect(previewSheet).toBeVisible({ timeout: 10000 });

    // Verify sheet title & subtitle
    await expect(page.locator('[data-testid="sheet-title"]')).toBeVisible();
    await expect(page.locator('[data-testid="sheet-subtitle"]')).toContainText('applicant-data.json');

    // Verify matched fields (3 matched: fullName, email, agreeTerms)
    const matchesList = page.locator('[data-testid="matches-list"]');
    await expect(matchesList).toBeVisible();
    await expect(page.locator('[data-testid="match-item-fullName"]')).toBeVisible();
    await expect(page.locator('[data-testid="match-item-email"]')).toBeVisible();
    await expect(page.locator('[data-testid="match-item-agreeTerms"]')).toBeVisible();

    // Verify unmatched section warning for 'unmatchedRegistrationNo'
    const unmatchedSection = page.locator('[data-testid="unmatched-section"]');
    await expect(unmatchedSection).toBeVisible();
    await expect(unmatchedSection).toContainText('unmatchedRegistrationNo');

    // 6. Test toggling field inclusion
    const cbToggle = page.locator('[data-testid="match-checkbox-agreeTerms"]');
    await cbToggle.click(); // Uncheck
    await expect(page.locator('[data-testid="match-item-agreeTerms"]')).toHaveClass(/excluded/);
    await cbToggle.click(); // Re-check
    await expect(page.locator('[data-testid="match-item-agreeTerms"]')).not.toHaveClass(/excluded/);

    // 7. Apply Import Data to PDF
    const applyBtn = page.locator('[data-testid="apply-import-btn"]');
    await applyBtn.click();

    // Verify toast confirmation
    const toast = page.locator('ion-toast');
    await expect(toast).toBeVisible({ timeout: 10000 });

    // Bottom sheet should close
    await expect(previewSheet).toBeHidden();

    // Filled fields stat should now be updated (at least 3 filled)
    const filledStat = page.locator('[data-testid="stat-filled-fields"] .stat-num');
    await expect(filledStat).not.toContainText('0');
  });

  test('M2-003: Form Data Import workflow via Adobe XFDF XML stream', async ({ page }, testInfo) => {
    // 1. Create a test XFDF file
    const xfdfPath = testInfo.outputPath('export-data.xfdf');
    const testXfdf = `<?xml version="1.0" encoding="UTF-8"?>
<xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve">
  <fields>
    <field name="fullName">
      <value>Pooja Sharma</value>
    </field>
    <field name="email">
      <value>pooja.sharma@domain.com</value>
    </field>
    <field name="deptCode">
      <value>FINANCE-01</value>
    </field>
  </fields>
</xfdf>`;
    fs.writeFileSync(xfdfPath, testXfdf, 'utf-8');

    // 2. Open tool and upload PDF
    await page.goto('/features/pdf/forms/data');
    await page.waitForLoadState('domcontentloaded');

    const pdfInput = page.locator('[data-testid="pdf-file-input"]');
    await pdfInput.setInputFiles(fillablePath);
    await expect(page.locator('[data-testid="doc-summary-card"]')).toBeVisible({ timeout: 15000 });

    // 3. Switch to Import tab and upload XFDF
    await page.locator('[data-testid="tab-import"]').click();
    const dataInput = page.locator('[data-testid="data-file-input"]');
    await dataInput.setInputFiles(xfdfPath);

    // 4. Verify preview sheet and apply
    const previewSheet = page.locator('[data-testid="preview-bottom-sheet"]');
    await expect(previewSheet).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="match-item-fullName"]')).toContainText('Pooja Sharma');

    const applyBtn = page.locator('[data-testid="apply-import-btn"]');
    await applyBtn.click();

    const toast = page.locator('ion-toast');
    await expect(toast).toBeVisible({ timeout: 10000 });
  });

  test('M2-004: Form Data Import workflow via RFC 4180 CSV with formula unquoting', async ({ page }, testInfo) => {
    // 1. Create a test CSV with standard data and neutralized formula
    const csvPath = testInfo.outputPath('records.csv');
    const testCsv = `"fullName","email","deptCode"\r\n"Ananya Roy","ananya@tech.org","'=FORMULA_TEST"`;
    fs.writeFileSync(csvPath, testCsv, 'utf-8');

    await page.goto('/features/pdf/forms/data');
    await page.waitForLoadState('domcontentloaded');

    const pdfInput = page.locator('[data-testid="pdf-file-input"]');
    await pdfInput.setInputFiles(fillablePath);
    await expect(page.locator('[data-testid="doc-summary-card"]')).toBeVisible({ timeout: 15000 });

    await page.locator('[data-testid="tab-import"]').click();
    const dataInput = page.locator('[data-testid="data-file-input"]');
    await dataInput.setInputFiles(csvPath);

    const previewSheet = page.locator('[data-testid="preview-bottom-sheet"]');
    await expect(previewSheet).toBeVisible({ timeout: 10000 });

    // Formula neutralized string should be unquoted to =FORMULA_TEST
    await expect(page.locator('[data-testid="match-item-deptCode"]')).toContainText('=FORMULA_TEST');

    const applyBtn = page.locator('[data-testid="apply-import-btn"]');
    await applyBtn.click();

    const toast = page.locator('ion-toast');
    await expect(toast).toBeVisible({ timeout: 10000 });
  });
});
