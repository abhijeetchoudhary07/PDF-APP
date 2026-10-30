import { test, expect } from '@playwright/test';
import * as path from 'path';

test.describe('N9 — Per-Document Privacy Report Card E2E Suite', () => {

  test.beforeEach(async ({ page }) => {
    // Ensure onboarding is marked complete
    await page.goto('/features/pdf/security/privacy-card');
    await page.evaluate(async () => {
      localStorage.setItem('CapacitorStorage.IFH_ONBOARDING_COMPLETED_V1', 'true');
      localStorage.setItem('IFH_ONBOARDING_COMPLETED_V1', 'true');
      if ((window as any).Capacitor?.Plugins?.Preferences) {
        await (window as any).Capacitor.Plugins.Preferences.set({
          key: 'IFH_ONBOARDING_COMPLETED_V1',
          value: 'true'
        });
      }
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('Route Access & Dropzone Initial State', async ({ page }) => {
    await page.goto('/features/pdf/security/privacy-card');
    await page.waitForLoadState('networkidle');

    // Verify Dropzone and Hero Banner
    const heroTitle = page.locator('.hero-title');
    await expect(heroTitle).toBeVisible();
    await expect(page.locator('.hero-desc')).toBeVisible();

    const dropzone = page.locator('.report-dropzone');
    await expect(dropzone).toBeVisible();

    // Verify Report Card Section is not yet rendered
    await expect(page.locator('.report-content-section')).not.toBeVisible();
  });

  test('Suspect Document Analysis: Circular Letter Grade Badge, Score Pill & Plain-Language Summary', async ({ page }) => {
    await page.goto('/features/pdf/security/privacy-card');
    await page.waitForLoadState('networkidle');

    // Upload suspect PDF with author, software, and GPS tags
    const suspectPath = path.resolve('e2e/test-data/audit/privacy-card-suspect.pdf');
    const fileInput = page.locator('.report-dropzone input[type="file"]');
    await fileInput.setInputFiles(suspectPath);

    // Wait for evaluation to complete
    await expect(page.locator('.report-content-section')).toBeVisible({ timeout: 15000 });

    // 1. Verify Circular Letter Grade Badge
    const gradeBadge = page.locator('.grade-badge-circle');
    await expect(gradeBadge).toBeVisible();
    const gradeLetter = page.locator('.grade-letter');
    const gradeText = await gradeLetter.innerText();
    expect(['C', 'D', 'F']).toContain(gradeText);
    expect(gradeText).not.toBe('A+');
    expect(gradeText).not.toBe('A');

    // 2. Verify Score Pill
    const scorePill = page.locator('.score-pill');
    await expect(scorePill).toBeVisible();
    const scorePillText = await scorePill.innerText();
    expect(scorePillText).toMatch(/Score:\s*(\d+)\/100/i);

    // 3. Verify Headline Summary
    const headline = page.locator('.headline-summary');
    await expect(headline).toBeVisible();

    // 4. Verify Plain-Language Synthesis Sentence
    const plainSentence = page.locator('.plain-sentence');
    await expect(plainSentence).toBeVisible();
    const sentenceText = await plainSentence.innerText();
    expect(sentenceText).toContain('John Doe');
  });

  test('Inspect 4 Layman Disclosure Cards & Itemized Deductions', async ({ page }) => {
    await page.goto('/features/pdf/security/privacy-card');
    await page.waitForLoadState('networkidle');

    const suspectPath = path.resolve('e2e/test-data/audit/privacy-card-suspect.pdf');
    await page.locator('.report-dropzone input[type="file"]').setInputFiles(suspectPath);
    await expect(page.locator('.report-content-section')).toBeVisible({ timeout: 15000 });

    // Verify 4 cards exist in the grid
    const cards = page.locator('.layman-cards-grid .disclosure-card');
    await expect(cards).toHaveCount(4);

    // Card 1: Creator card should flag Author John Doe
    const creatorCard = cards.nth(0);
    await expect(creatorCard).toBeVisible();
    await expect(creatorCard.locator('.card-headline')).toContainText('John Doe');

    // Card 2: Device & Software card should show exposed software/device
    const deviceCard = cards.nth(1);
    await expect(deviceCard).toBeVisible();

    // Card 3: Time & Location card should have danger/exposure badge
    const timeCard = cards.nth(2);
    await expect(timeCard).toBeVisible();

    // Card 4: Concealed content
    const concealedCard = cards.nth(3);
    await expect(concealedCard).toBeVisible();

    // Verify Deductions Breakdown Card
    const deductionsCard = page.locator('.deductions-card');
    await expect(deductionsCard).toBeVisible();
    const deductionRows = page.locator('.deduction-row');
    const rowCount = await deductionRows.count();
    expect(rowCount).toBeGreaterThanOrEqual(1);
  });

  test('Export Privacy Report Card as PDF with Success Notice', async ({ page }) => {
    await page.goto('/features/pdf/security/privacy-card');
    await page.waitForLoadState('networkidle');

    const suspectPath = path.resolve('e2e/test-data/audit/privacy-card-suspect.pdf');
    await page.locator('.report-dropzone input[type="file"]').setInputFiles(suspectPath);
    await expect(page.locator('.report-content-section')).toBeVisible({ timeout: 15000 });

    // Click Export PDF button in sticky footer
    const exportBtn = page.locator('.export-btn');
    await expect(exportBtn).toBeVisible();
    await exportBtn.click();

    // Verify saved notice banner appears
    const savedNotice = page.locator('.saved-notice-card');
    await expect(savedNotice).toBeVisible({ timeout: 10000 });
    await expect(savedNotice.locator('.btn-share')).toBeVisible();
  });

  test('1-Tap Handoff to Privacy Sanitizer via DocumentBridge', async ({ page }) => {
    await page.goto('/features/pdf/security/privacy-card');
    await page.waitForLoadState('networkidle');

    const suspectPath = path.resolve('e2e/test-data/audit/privacy-card-suspect.pdf');
    await page.locator('.report-dropzone input[type="file"]').setInputFiles(suspectPath);
    await expect(page.locator('.report-content-section')).toBeVisible({ timeout: 15000 });

    // Click "Sanitize Document in 1-Tap" button
    const sanitizeBtn = page.locator('.sanitize-btn');
    await expect(sanitizeBtn).toBeVisible();
    await sanitizeBtn.click();

    // Verify navigation to /features/pdf/privacy-sanitizer
    await page.waitForURL(/.*privacy-sanitizer/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // Verify file was bridged and auto-scanned
    const scanReport = page.locator('.scan-report-card');
    await expect(scanReport).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.file-name')).toContainText('privacy-card-suspect.pdf');

    // Verify Sanitizer button is available
    const startSanitizeBtn = page.locator('[data-testid="start-sanitization"]');
    await expect(startSanitizeBtn).toBeVisible();
  });

  test('Clean Sanitized Document Achieves Grade A+ and 100% Score', async ({ page }) => {
    await page.goto('/features/pdf/security/privacy-card');
    await page.waitForLoadState('networkidle');

    // Upload clean sanitized PDF
    const cleanPath = path.resolve('e2e/test-data/audit/privacy-card-clean.pdf');
    await page.locator('.report-dropzone input[type="file"]').setInputFiles(cleanPath);
    await expect(page.locator('.report-content-section')).toBeVisible({ timeout: 15000 });

    // 1. Verify Grade A+
    const gradeLetter = page.locator('.grade-letter');
    await expect(gradeLetter).toHaveText('A+');

    // 2. Verify 100/100 Score
    const scorePill = page.locator('.score-pill');
    await expect(scorePill).toContainText('100/100');

    // 3. Verify High Privacy Protection Headline
    const headline = page.locator('.headline-summary');
    await expect(headline).toContainText('High Privacy Protection');

    // 4. Verify Zero Exposure on all cards
    const badges = page.locator('.exposure-badge.clean');
    await expect(badges).toHaveCount(4);

    // 5. Deductions card must be absent
    await expect(page.locator('.deductions-card')).not.toBeVisible();
  });

  test('Change Document Button Resets Workflow to Dropzone', async ({ page }) => {
    await page.goto('/features/pdf/security/privacy-card');
    await page.waitForLoadState('networkidle');

    const cleanPath = path.resolve('e2e/test-data/audit/privacy-card-clean.pdf');
    await page.locator('.report-dropzone input[type="file"]').setInputFiles(cleanPath);
    await expect(page.locator('.report-content-section')).toBeVisible({ timeout: 15000 });

    // Click Change Document button
    const changeDocBtn = page.locator('.btn-change-doc');
    await expect(changeDocBtn).toBeVisible();
    await changeDocBtn.click();

    // Verify state resets to dropzone
    await expect(page.locator('.report-dropzone')).toBeVisible();
    await expect(page.locator('.report-content-section')).not.toBeVisible();
  });

  test('Cybersecurity Stress Test: Strict GPS Grade Ceiling (Cannot Report Grade A)', async ({ page }) => {
    await page.goto('/features/pdf/security/privacy-card');
    await page.waitForLoadState('networkidle');

    // Document with GPS coordinates must never be awarded Grade A or A+
    const suspectPath = path.resolve('e2e/test-data/audit/privacy-card-suspect.pdf');
    await page.locator('.report-dropzone input[type="file"]').setInputFiles(suspectPath);
    await expect(page.locator('.report-content-section')).toBeVisible({ timeout: 15000 });

    const gradeLetter = page.locator('.grade-letter');
    const gradeText = await gradeLetter.innerText();
    expect(gradeText).not.toBe('A+');
    expect(gradeText).not.toBe('A');
    expect(gradeText).not.toBe('B');

    const scorePill = page.locator('.score-pill');
    const scorePillText = await scorePill.innerText();
    const match = scorePillText.match(/(\d+)\/100/);
    if (match) {
      const numericScore = parseInt(match[1], 10);
      expect(numericScore).toBeLessThanOrEqual(65);
    }
  });

  test('Cybersecurity Stress Test: Neutralization of XSS Script Payloads in Metadata', async ({ page }) => {
    // Listen for unexpected alert dialogs that would indicate unescaped script execution
    let alertTriggered = false;
    page.on('dialog', async dialog => {
      alertTriggered = true;
      await dialog.dismiss();
    });

    await page.goto('/features/pdf/security/privacy-card');
    await page.waitForLoadState('networkidle');

    const xssPath = path.resolve('e2e/test-data/audit/privacy-card-xss.pdf');
    await page.locator('.report-dropzone input[type="file"]').setInputFiles(xssPath);
    await expect(page.locator('.report-content-section')).toBeVisible({ timeout: 15000 });

    // 1. Verify no dialog was triggered
    expect(alertTriggered).toBe(false);

    // 2. Verify raw <script> tag is NOT rendered in the DOM
    const rawScriptTags = page.locator('app-privacy-card script');
    await expect(rawScriptTags).toHaveCount(0);

    // 3. Verify plain sentence does not contain raw <script> or alert
    const plainText = await page.locator('.plain-sentence').innerText();
    expect(plainText).not.toContain('<script>');
    expect(plainText).not.toContain('javascript:');

    // 4. Verify deduction was made for malicious script payload
    const deductions = page.locator('.deduction-reason');
    const reasons = await deductions.allTextContents();
    const scriptDeduction = reasons.some(r => r.includes('script') || r.includes('Malicious'));
    expect(scriptDeduction).toBe(true);
  });
});
