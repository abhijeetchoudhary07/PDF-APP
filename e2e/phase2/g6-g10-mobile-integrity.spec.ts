import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';
import { getPhase2FixturePath, uploadFileToDropzone } from '../common/phase2-helpers';

test.describe('Part G: Integrity, Verification & Diagnostics (G6-G10) Mobile E2E Suite', () => {
  test.use({
    viewport: { width: 390, height: 844 }, // Mobile device viewport (Pixel / iPhone standard)
    hasTouch: true,
    isMobile: true
  });

  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('PAGE ERROR LOG:', msg.text());
      }
    });
  });

  test('G6: Archival Conversion (PDF/A-2b Best Effort) - honest readiness audit and preparation', async ({ page }) => {
    await page.goto('/features/pdf/archival');
    await page.waitForLoadState('domcontentloaded');

    // 1. Initial State: Disclaimer banner and file dropzone
    await expect(page.locator('.disclaimer-banner')).toBeVisible({ timeout: 15000 });
    const disclaimerText = await page.locator('.disclaimer-banner').innerText();
    // Verify no compliance badge or false claims
    expect(disclaimerText.toLowerCase()).not.toContain('pdf/a compliant');

    await expect(page.locator('app-file-dropzone')).toBeVisible();

    // 2. Upload PDF
    const pdfPath = getPhase2FixturePath('hf-multipage-portrait.pdf');
    await uploadFileToDropzone(page, pdfPath);

    // 3. Readiness checklist rendered
    await expect(page.locator('.report-box')).toBeVisible({ timeout: 20000 });
    const checklistItems = page.locator('.checklist-item');
    await expect(checklistItems.first()).toBeVisible();
    expect(await checklistItems.count()).toBeGreaterThanOrEqual(4);

    // Take screenshot of mobile readiness report
    await page.screenshot({ path: 'screenshots/mobile/11-g6-archival-readiness.png' });

    // 4. Convert / Prepare for Archiving
    const prepareBtn = page.getByRole('button', { name: /prepare.*archiving|संग्रहण/i }).or(page.locator('.action-footer button'));
    await prepareBtn.click();

    // 5. Result card appears
    await expect(page.locator('.result-card')).toBeVisible({ timeout: 25000 });
    await expect(page.locator('.metric-item').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /save archival pdf|डाउनलोड/i })).toBeVisible();

    // Take screenshot of post-conversion archival card
    await page.screenshot({ path: 'screenshots/mobile/12-g6-archival-converted.png' });
  });

  test('G7: Selective Flatten & Report - target selection & detailed bake audit', async ({ page }) => {
    await page.goto('/features/pdf/flatten');
    await page.waitForLoadState('domcontentloaded');

    // 1. Upload form PDF
    const pdfPath = getPhase2FixturePath('privacy-forms.pdf');
    await uploadFileToDropzone(page, pdfPath);

    // 2. Verify Selective Flatten Target Section
    const formsOnlyRadio = page.getByRole('radio', { name: /forms only/i }).or(page.locator('input[value="forms"]'));
    await expect(formsOnlyRadio).toBeVisible({ timeout: 20000 });

    // Select "Forms only" target
    await formsOnlyRadio.click();

    // Take screenshot of selective options
    await page.screenshot({ path: 'screenshots/mobile/13-g7-flatten-options.png' });

    // 3. Click Flatten Button
    const flattenBtn = page.getByRole('button', { name: /flatten pdf now/i }).or(page.locator('[data-testid="flatten-action-btn"]'));
    await flattenBtn.click();

    // 4. Verify Flatten Audit Report
    await expect(page.locator('.flatten-report-card').first()).toBeVisible({ timeout: 25000 });
    await expect(page.locator('.comparison-metrics-card')).toBeVisible();

    // Take screenshot of flatten report
    await page.screenshot({ path: 'screenshots/mobile/14-g7-flatten-report.png' });
  });

  test('G8 & G9: Compare: Word-level diff, ignore options & PDF report export', async ({ page }) => {
    await page.goto('/features/pdf/compare');
    await page.waitForLoadState('domcontentloaded');

    // 1. Upload original and modified files using distinct dropzone cards
    const origPath = getPhase2FixturePath('text-changed-original.pdf');
    const modPath = getPhase2FixturePath('text-changed-modified.pdf');

    const origInput = page.locator('.dropzone-card').nth(0).locator('input[type="file"]');
    await origInput.setInputFiles(origPath);

    const modInput = page.locator('.dropzone-card').nth(1).locator('input[type="file"]');
    await modInput.setInputFiles(modPath);

    // 2. Verify Comparison Options (G8)
    const optionsCard = page.locator('.compare-options-card');
    await expect(optionsCard).toBeVisible({ timeout: 15000 });
    await expect(page.locator('input[type="checkbox"]').first()).toBeVisible();

    // Take screenshot of comparison options
    await page.screenshot({ path: 'screenshots/mobile/15-g8-compare-options.png' });

    // 3. Start comparison
    const startCompareBtn = page.getByRole('button', { name: /compare documents|तुलना/i }).first();
    await startCompareBtn.click();

    // 4. Verify comparison results & Metadata diff (G9)
    await expect(page.locator('.summary-metrics-grid')).toBeVisible({ timeout: 25000 });
    await expect(page.locator('.metadata-diff-box').first()).toBeVisible();

    // Verify Export PDF Report button exists
    const exportPdfReportBtn = page.getByRole('button', { name: /export pdf report/i });
    await expect(exportPdfReportBtn).toBeVisible();

    // Take screenshot of comparison report with metadata diff
    await page.screenshot({ path: 'screenshots/mobile/16-g9-compare-report.png' });
  });

  test('G10: Repair: Encrypted document triage & recovery log export', async ({ page }) => {
    await page.goto('/features/pdf/repair');
    await page.waitForLoadState('domcontentloaded');

    // 1. Upload encrypted fixture to test triage routing
    const encPath = getPhase2FixturePath('repair-encrypted.pdf');
    await uploadFileToDropzone(page, encPath);

    // 2. Expect triage banner for password-protected document (not corrupt)
    const triageBanner = page.locator('[data-testid="triage-encrypted-banner"]');
    await expect(triageBanner).toBeVisible({ timeout: 20000 });
    await expect(triageBanner).toContainText(/password protected|एन्क्रिप्टेड/i);
    await expect(page.locator('[data-testid="route-unlock-btn"]')).toBeVisible();

    // Take screenshot of encrypted triage banner
    await page.screenshot({ path: 'screenshots/mobile/17-g10-repair-triage-encrypted.png' });

    // 3. Reset and upload healthy/damaged file to test recovery & log export
    await page.getByRole('button', { name: /choose another|अन्य/i }).first().click();

    const pdfPath = getPhase2FixturePath('repair-healthy.pdf');
    await uploadFileToDropzone(page, pdfPath);

    // 4. Start recovery
    const startRecoveryBtn = page.locator('[data-testid="start-recovery"]');
    await expect(startRecoveryBtn).toBeVisible({ timeout: 15000 });
    await startRecoveryBtn.click();

    // 5. Verify recovery completed screen
    await expect(page.locator('.recovery-report-section')).toBeVisible({ timeout: 25000 });
    await expect(page.locator('.page-detail-card').first()).toBeVisible();

    // 6. Verify "Download Recovery Log" button
    const downloadLogBtn = page.locator('[data-testid="download-recovery-log-btn"]');
    await expect(downloadLogBtn).toBeVisible();

    // Take screenshot of recovery complete screen with log download button
    await page.screenshot({ path: 'screenshots/mobile/18-g10-repair-completed-log.png' });
  });
});
