import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';
import { getPhase2FixturePath, uploadFileToDropzone } from '../common/phase2-helpers';

test.describe('Part G: Diagnostic, Integrity & Trust (G1-G5) Mobile E2E Suite', () => {
  test.use({
    viewport: { width: 390, height: 844 }, // Mobile device viewport (Pixel 7 / iPhone standard)
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

  test('G1: Document Fingerprint & Integrity Receipt - generate, inspect, and verify receipt', async ({ page }) => {
    await page.goto('/features/pdf/fingerprint');
    await page.waitForLoadState('domcontentloaded');

    // 1. Initial State: Mode switcher and file dropzone visible
    await expect(page.locator('.mode-tabs')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('app-file-dropzone')).toBeVisible();
    await page.screenshot({ path: 'screenshots/mobile/01-g1-fingerprint-empty.png' });

    // 2. Upload multipage PDF
    const pdfPath = getPhase2FixturePath('hf-multipage-portrait.pdf');
    await uploadFileToDropzone(page, pdfPath);

    // 3. Overview Card and SHA-256 Hash Display
    await expect(page.locator('.overview-card')).toBeVisible({ timeout: 15000 });
    const hashEl = page.locator('.hash-string');
    await expect(hashEl).toBeVisible();
    const hashText = await hashEl.innerText();
    expect(hashText.length).toBe(64); // SHA-256 hex string length

    // 4. Page Hashes List
    await expect(page.locator('.pages-list-card')).toBeVisible();
    const pageRows = page.locator('.page-hash-row');
    await expect(pageRows.first()).toBeVisible();
    expect(await pageRows.count()).toBeGreaterThanOrEqual(1);

    // Capture mobile screenshot of generated fingerprint
    await page.screenshot({ path: 'screenshots/mobile/02-g1-fingerprint-overview.png' });

    // 5. Save Receipt to Local Storage
    const saveReceiptBtn = page.getByRole('button', { name: /save receipt|रसीद सहेजें/i }).first();
    await saveReceiptBtn.click();

    // 6. Switch to 'Saved Receipts' tab
    const savedTabBtn = page.locator('.mode-tab-btn').nth(2);
    await savedTabBtn.click();
    await expect(page.locator('.saved-item-card')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'screenshots/mobile/03-g1-fingerprint-saved.png' });
  });

  test('G2: Studio Health Strip & Byte Audit - inspect document health and heavy items', async ({ page }) => {
    await page.goto('/features/pdf');
    await page.waitForLoadState('domcontentloaded');

    // 1. Verify Health Strip section exists on the main PDF Studio page
    const healthCard = page.locator('.health-strip-card');
    await expect(healthCard).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: 'screenshots/mobile/04-g2-studio-health-empty.png' });

    // 2. Upload PDF into the Health Strip Dropzone
    const pdfPath = getPhase2FixturePath('hf-multipage-portrait.pdf');
    const healthDropzoneInput = healthCard.locator('input[type="file"]');
    await healthDropzoneInput.waitFor({ state: 'attached', timeout: 15000 });
    await healthDropzoneInput.setInputFiles(pdfPath);

    // 3. Wait for Health Report to render
    await expect(healthCard.locator('.health-indicators-grid')).toBeVisible({ timeout: 20000 });
    await expect(healthCard.locator('.health-row-item').first()).toBeVisible();

    // 4. Verify Byte Audit section
    const byteAudit = healthCard.locator('.byte-audit-container');
    await expect(byteAudit).toBeVisible();
    await expect(byteAudit.locator('.heavy-row').first()).toBeVisible();

    // Capture mobile screenshot of audited health strip
    await page.screenshot({ path: 'screenshots/mobile/05-g2-studio-health-audited.png' });
  });

  test('G3: Preflight & Submission Check - rule validation, profile modal, and auto-fix', async ({ page }) => {
    await page.goto('/features/pdf/preflight');
    await page.waitForLoadState('domcontentloaded');

    // 1. Verify Profiles Selector Chips
    await expect(page.locator('.profile-selection-card')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.profile-chip').first()).toBeVisible();

    // 2. Open JSON Profiles Modal
    const jsonBtn = page.locator('.json-profile-btn');
    await jsonBtn.click();
    await expect(page.locator('.modal-card')).toBeVisible();
    await expect(page.locator('.json-textarea')).toBeVisible();
    await page.screenshot({ path: 'screenshots/mobile/06-g3-preflight-modal.png' });

    // Close Modal
    await page.locator('.close-btn').click();
    await expect(page.locator('.modal-card')).toBeHidden();

    // 3. Upload Sample PDF
    const pdfPath = getPhase2FixturePath('hf-multipage-portrait.pdf');
    await uploadFileToDropzone(page, pdfPath);

    // 4. Verify Verdict Banner & Rules List
    await expect(page.locator('.verdict-banner')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.rules-container')).toBeVisible();
    const ruleCards = page.locator('.rule-card');
    await expect(ruleCards.first()).toBeVisible();
    expect(await ruleCards.count()).toBeGreaterThanOrEqual(5);

    // Capture mobile screenshot of preflight report
    await page.screenshot({ path: 'screenshots/mobile/07-g3-preflight-report.png' });
  });

  test('G4: Embedded Object Inspector - detect attachments, scripts, and links', async ({ page }) => {
    await page.goto('/features/pdf/inspect');
    await page.waitForLoadState('domcontentloaded');

    // 1. Upload PDF with scripts
    const pdfPath = getPhase2FixturePath('privacy-scripts.pdf');
    await uploadFileToDropzone(page, pdfPath);

    // 2. Verify Inspector Report Header & Tabs
    await expect(page.locator('.overview-box')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.inspect-tabs')).toBeVisible();

    // 3. Switch to JavaScript tab
    const jsTabBtn = page.locator('.tab-btn').nth(1);
    await jsTabBtn.click();

    // Expect script card with code view to be rendered
    await expect(page.locator('.object-card').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.code-view').first()).toBeVisible();
    await page.screenshot({ path: 'screenshots/mobile/08-g4-inspect-scripts.png' });

    // 4. Switch to Links tab
    const linksTabBtn = page.locator('.tab-btn').nth(2);
    await linksTabBtn.click();
    await page.screenshot({ path: 'screenshots/mobile/09-g4-inspect-links.png' });
  });

  test('G5: Signature Status Panel - offline report and zero-claim audit', async ({ page }) => {
    await page.goto('/features/pdf/signature-status');
    await page.waitForLoadState('domcontentloaded');

    // 1. Upload Sample PDF
    const pdfPath = getPhase2FixturePath('hf-multipage-portrait.pdf');
    await uploadFileToDropzone(page, pdfPath);

    // 2. Verify Neutral Offline Notice Box
    await expect(page.locator('.offline-notice-box')).toBeVisible({ timeout: 15000 });

    // 3. Verify Overview Card and Unsigned Document State
    await expect(page.locator('.overview-card')).toBeVisible();
    await expect(page.locator('.empty-signatures')).toBeVisible();

    // 4. Verify Related Diagnostic Navigation Links
    await expect(page.locator('.related-tools-box')).toBeVisible();
    const relatedLinks = page.locator('.chip-link');
    await expect(relatedLinks.first()).toBeVisible();

    // Capture mobile screenshot of signature status report
    await page.screenshot({ path: 'screenshots/mobile/10-g5-signature-status.png' });
  });
});
