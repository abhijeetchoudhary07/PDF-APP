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

test.describe('N4 — Verified Redaction & Forensic Stream Audit E2E Suite', () => {
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

  test('E2E Flow: Fake Redaction Audit -> Leakage Detection -> One-Tap 300 DPI Rasterize -> Claim Integrity Verified', async ({ page }) => {
    // 1. Navigate to Verified Redaction & Forensic Audit
    await page.goto('/features/pdf/security/redact-verify');
    await page.waitForLoadState('networkidle');

    // Verify Hero title & Dropzone
    await expect(page.locator('.hero-title')).toBeVisible({ timeout: 10000 });
    const fileInput = dropzoneInput(page);
    await fileInput.waitFor({ state: 'attached', timeout: 15000 });

    // 2. Upload fake-redacted PDF (contains superficial black rectangle over raw text)
    await fileInput.setInputFiles(auditFixture('fake-redacted.pdf'));

    // Wait for Dashboard to appear
    await expect(page.locator('.dashboard-container')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.file-name')).toHaveText('fake-redacted.pdf');

    // 3. Auto-detected target is analyzed immediately
    const failedMetric = page.locator('.metric-failed .metric-num');
    await expect(failedMetric).toHaveText('1', { timeout: 10000 });

    // Claim integrity: Header badge MUST display Leakage Detected, NOT Permanently Removed
    await expect(page.locator('[data-testid="claim-leaked"]')).toBeVisible();
    await expect(page.locator('[data-testid="claim-purged"]')).toHaveCount(0);

    // Verify row details
    const itemRow = page.locator('.audit-item-row').first();
    await expect(itemRow).toHaveClass(/item-failed/);
    await expect(page.locator('.overlay-warning-badge').first()).toBeVisible();
    await expect(page.locator('.status-pill.pill-failed').first()).toBeVisible();
    await expect(page.locator('.failure-reason-text').first()).toContainText('Naive black rectangle');

    // 4. One-Tap Remediation: Click "Rasterize Region to Guarantee Privacy"
    const remediateBtn = page.locator('.remediate-action-btn').first();
    await expect(remediateBtn).toBeVisible({ timeout: 10000 });
    await remediateBtn.evaluate((el: HTMLElement) => el.click());

    // 5. Verify Post-Remediation Status: Status transitions to Verified
    await expect(page.locator('.metric-verified .metric-num')).toHaveText('1', { timeout: 15000 });
    await expect(page.locator('.metric-failed .metric-num')).toHaveText('0');

    // Claim integrity: Header badge transitions to Permanently Removed
    await expect(page.locator('[data-testid="claim-purged"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.status-pill.pill-verified').first()).toBeVisible();

    // 6. Test adding an additional target snippet via keyboard Enter
    const snippetInput = page.locator('.snippet-input');
    await snippetInput.scrollIntoViewIfNeeded();
    await snippetInput.fill('CLEAN-PATIENT-RECORD');
    await snippetInput.press('Enter');

    // Total verified is now 2
    await expect(page.locator('.metric-verified .metric-num')).toHaveText('2', { timeout: 10000 });

    // 7. Comparison Views & Tap Zoom
    const originalTab = page.locator('.segment-btn').filter({ hasText: /Original/i });
    if (await originalTab.count() > 0) {
      await originalTab.click();
      await expect(originalTab).toHaveClass(/active/);
    }

    const splitTab = page.locator('.segment-btn').filter({ hasText: /Split/i });
    if (await splitTab.count() > 0) {
      await splitTab.click();
      await expect(splitTab).toHaveClass(/active/);
      await expect(page.locator('.split-preview-grid')).toBeVisible();
    }

    // Zoom test
    const zoomPlusBtn = page.locator('.zoom-toolbar .zoom-btn').last();
    if (await zoomPlusBtn.count() > 0) {
      await zoomPlusBtn.click();
      await expect(page.locator('.zoom-pct')).not.toHaveText('100%');
    }

    // 8. Approve & Save Verified PDF
    const approveBtn = page.locator('.btn-approve');
    await expect(approveBtn).toBeEnabled();
    await approveBtn.click();

    // Verify Toast notification appears
    await expect(page.locator('ion-toast').last()).toBeVisible({ timeout: 10000 });
  });

  test('Clean PDF Flow: Pre-Sanitized Document Passes 100% Instantly Without Remediation', async ({ page }) => {
    await page.goto('/features/pdf/security/redact-verify');
    await page.waitForLoadState('networkidle');

    const fileInput = dropzoneInput(page);
    await fileInput.setInputFiles(auditFixture('properly-redacted.pdf'));

    await expect(page.locator('.dashboard-container')).toBeVisible({ timeout: 10000 });

    // Target a token that was successfully scrubbed
    const snippetInput = page.locator('.snippet-input');
    await snippetInput.scrollIntoViewIfNeeded();
    await snippetInput.fill('CONFIDENTIAL-SSN-9988');
    await snippetInput.press('Enter');

    // Audit passes immediately
    await expect(page.locator('.metric-verified .metric-num')).toHaveText('1', { timeout: 10000 });
    await expect(page.locator('.metric-failed .metric-num')).toHaveText('0');
    await expect(page.locator('[data-testid="claim-purged"]')).toBeVisible();
    await expect(page.locator('.remediate-action-btn')).toHaveCount(0);
  });

  test('Claim Integrity Enforcement: Blocking Premature Approval on Unverified PDFs', async ({ page }) => {
    await page.goto('/features/pdf/security/redact-verify');
    await page.waitForLoadState('networkidle');

    const fileInput = dropzoneInput(page);
    await fileInput.setInputFiles(auditFixture('fake-redacted.pdf'));
    await expect(page.locator('.dashboard-container')).toBeVisible({ timeout: 10000 });

    // fake-redacted.pdf auto-detects CONFIDENTIAL and fails audit
    await expect(page.locator('.metric-failed .metric-num')).toHaveText('1', { timeout: 10000 });

    // Attempt to approve non-purged PDF
    const approveBtn = page.locator('.btn-approve');
    await approveBtn.click();

    // Warning confirmation modal MUST appear
    await expect(page.locator('ion-alert')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('ion-alert .alert-title').first()).toContainText(/Residual Risk/i);

    // Cancel out of alert
    const cancelAlertBtn = page.locator('ion-alert button').filter({ hasText: /Cancel/i });
    await cancelAlertBtn.click();
    await expect(page.locator('ion-alert')).toHaveCount(0);
  });

  test('Workflow Reset: Clears Document and Restores Clean State', async ({ page }) => {
    await page.goto('/features/pdf/security/redact-verify');
    await page.waitForLoadState('networkidle');

    const fileInput = dropzoneInput(page);
    await fileInput.setInputFiles(auditFixture('fake-redacted.pdf'));
    await expect(page.locator('.dashboard-container')).toBeVisible({ timeout: 10000 });

    // Click cancel/reset in bottom bar
    const resetBtn = page.locator('.btn-reset');
    await resetBtn.click();

    // Should return to empty dropzone
    await expect(page.locator('.dropzone-section')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.dashboard-container')).toHaveCount(0);
  });
});
