import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import { setupCapacitorMocks } from '../fixtures/mocks';

const FIXTURES_DIR = path.resolve(__dirname, '../test-data/audit');

function auditFixture(fileName: string): string {
  return path.join(FIXTURES_DIR, fileName);
}

function dropzoneInput(page: Page, nth = 0) {
  return page.locator('app-file-dropzone input[type="file"], input[type="file"]').nth(nth);
}

test.describe('N7 — Forensic Hidden-Content Audit E2E Suite', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (err) => {
      if (!err.message.includes('ResizeObserver')) {
        console.error('Unhandled page error:', err.message);
      }
    });

    await setupCapacitorMocks(page);

    try {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    } catch {
      // Ignore if not supported in mobile emulation
    }
  });

  test('E2E Flow: Suspect Document -> Health Gauge & Risk Score -> Expandable Categories -> Export PDF Report', async ({ page }) => {
    // 1. Navigate to Forensic Hidden-Content Audit tool
    await page.goto('/features/pdf/security/audit');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('.hero-title')).toBeVisible({ timeout: 10000 });
    const fileInput = dropzoneInput(page);
    await fileInput.waitFor({ state: 'attached', timeout: 15000 });

    // 2. Upload suspect document containing structural concealments
    await fileInput.setInputFiles(auditFixture('hidden-content-suspect.pdf'));

    // Verify report section appears
    const reportSection = page.locator('[data-testid="report-section"]');
    await expect(reportSection).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="doc-name"]')).toHaveText('hidden-content-suspect.pdf');

    // 3. Verify Health Gauge & High Risk Level
    const riskPill = page.locator('[data-testid="risk-pill"]');
    await expect(riskPill).toBeVisible();
    await expect(riskPill).toHaveClass(/pill-high/);

    // 4. Verify 5 Category Cards
    const categoryCards = page.locator('[data-testid="category-card"]');
    await expect(categoryCards).toHaveCount(5);

    // Verify categories with findings are expanded
    const invisCat = page.locator('[data-testid="category-card"][data-category="invisible_text"]');
    await expect(invisCat).toHaveClass(/expanded/);

    // Test accordion collapse/expand toggle
    const invisHeaderBtn = invisCat.locator('[data-testid="category-header-btn"]');
    await invisHeaderBtn.click();
    await expect(invisCat).not.toHaveClass(/expanded/);

    await invisHeaderBtn.click();
    await expect(invisCat).toHaveClass(/expanded/);

    // 5. Export Audit Report PDF
    const exportBtn = page.locator('[data-testid="btn-export-pdf"]');
    await exportBtn.click();

    // Verify export success notice appears
    const successCard = page.locator('[data-testid="saved-report-card"]');
    await expect(successCard).toBeVisible({ timeout: 15000 });
  });

  test('1-Tap Remediation Handoff: Bridges suspect file to Privacy Sanitizer', async ({ page }) => {
    await page.goto('/features/pdf/security/audit');
    await page.waitForLoadState('networkidle');

    const fileInput = dropzoneInput(page);
    await fileInput.setInputFiles(auditFixture('hidden-content-suspect.pdf'));
    await expect(page.locator('[data-testid="report-section"]')).toBeVisible({ timeout: 15000 });

    // Click "Clean with Privacy Sanitizer" handoff button
    const sanitizeBtn = page.locator('[data-testid="btn-sanitize-now"]');
    await sanitizeBtn.click();

    // Verify seamless navigation to Privacy Sanitizer
    await page.waitForURL('**/features/pdf/privacy-sanitizer**', { timeout: 15000 });
    expect(page.url()).toContain('/features/pdf/privacy-sanitizer');
  });

  test('Clean Document: Produces zero false positives, 0% score and clean badge', async ({ page }) => {
    await page.goto('/features/pdf/security/audit');
    await page.waitForLoadState('networkidle');

    const fileInput = dropzoneInput(page);
    await fileInput.setInputFiles(auditFixture('standard-1page.pdf'));
    await expect(page.locator('[data-testid="report-section"]')).toBeVisible({ timeout: 15000 });

    // Verify Low Risk state
    const riskPill = page.locator('[data-testid="risk-pill"]');
    await expect(riskPill).toBeVisible();
    await expect(riskPill).toHaveClass(/pill-low/);

    // Verify Clean Document Badge is displayed
    const cleanBadge = page.locator('[data-testid="clean-pill"]');
    await expect(cleanBadge).toBeVisible();
  });

  test('Route Redirection & Compatibility: /features/security-audit & /features/pdf/audit', async ({ page }) => {
    // 1. Verify /features/security-audit redirects to /features/pdf/security/audit
    await page.goto('/features/security-audit');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/features/pdf/security/audit');
    await expect(page.locator('.hero-title')).toBeVisible({ timeout: 10000 });

    // 2. Verify /features/pdf/audit redirects to /features/pdf/security/audit
    await page.goto('/features/pdf/audit');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/features/pdf/security/audit');
    await expect(page.locator('.hero-title')).toBeVisible({ timeout: 10000 });
  });
});
