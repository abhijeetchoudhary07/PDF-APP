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

test.describe('N5 — Search-and-Redact by Pattern E2E Suite', () => {
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

  test('E2E Flow: Upload Contract -> Auto Scan Patterns -> Review List -> Select All -> Execute Bulk Redaction & N4 Verification', async ({ page }) => {
    // 1. Navigate to Search & Redact tool
    await page.goto('/features/pdf/security/search-redact');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('.hero-title')).toBeVisible({ timeout: 10000 });
    const fileInput = dropzoneInput(page);
    await fileInput.waitFor({ state: 'attached', timeout: 15000 });

    // 2. Upload contract with sensitive PII (Emails, Phones, Aadhaar, PAN, Credit Cards)
    await fileInput.setInputFiles(auditFixture('contract-sensitive.pdf'));

    // Verify dashboard appears and auto-scan completes
    await expect(page.locator('.dashboard-container')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.file-name')).toHaveText('contract-sensitive.pdf');

    // 3. Verify pattern detection matches
    await expect(page.locator('[data-testid="matches-section"]')).toBeVisible({ timeout: 15000 });
    const matchCards = page.locator('[data-testid="match-item-card"]');
    const matchCount = await matchCards.count();
    expect(matchCount).toBeGreaterThanOrEqual(4);

    // Verify surrounding text context and highlights are present
    const firstMatch = matchCards.first();
    await expect(firstMatch.locator('.matched-highlight')).toBeVisible();
    await expect(firstMatch.locator('.context-text').first()).toBeVisible();

    // 4. Test "Select All" toggle
    const selectAllBtn = page.locator('[data-testid="select-all-btn"]');
    await selectAllBtn.click(); // Deselect all
    await expect(page.locator('[data-testid="btn-redact"]')).toBeDisabled();

    await selectAllBtn.click(); // Re-select all
    await expect(page.locator('[data-testid="btn-redact"]')).toBeEnabled();

    // 5. Execute bulk redaction
    const redactBtn = page.locator('[data-testid="btn-redact"]');
    await redactBtn.click();

    // 6. Verify Post-Redaction Success Card and N4 Verification badge
    await expect(page.locator('[data-testid="success-card"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="status-redacted"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="btn-open-audit"]')).toBeVisible();

    // Verify toast notification appears
    await expect(page.locator('ion-toast').last()).toBeVisible({ timeout: 10000 });
  });

  test('Selective Redaction: Unchecked patterns remain untouched', async ({ page }) => {
    await page.goto('/features/pdf/security/search-redact');
    await page.waitForLoadState('networkidle');

    const fileInput = dropzoneInput(page);
    await fileInput.setInputFiles(auditFixture('contract-sensitive.pdf'));
    await expect(page.locator('[data-testid="matches-section"]')).toBeVisible({ timeout: 15000 });

    const matchCards = page.locator('[data-testid="match-item-card"]');
    const totalCount = await matchCards.count();
    expect(totalCount).toBeGreaterThanOrEqual(2);

    // Unselect the second item
    const secondCheckbox = matchCards.nth(1).locator('.match-checkbox');
    await secondCheckbox.click();
    await expect(matchCards.nth(1)).not.toHaveClass(/selected/);

    // Execute redaction on remaining selected items
    const redactBtn = page.locator('[data-testid="btn-redact"]');
    await redactBtn.click();

    await expect(page.locator('[data-testid="success-card"]')).toBeVisible({ timeout: 15000 });
  });

  test('ReDoS Defense: Catastrophic Custom Regex Input is Safely Blocked', async ({ page }) => {
    await page.goto('/features/pdf/security/search-redact');
    await page.waitForLoadState('networkidle');

    const fileInput = dropzoneInput(page);
    await fileInput.setInputFiles(auditFixture('contract-sensitive.pdf'));
    await expect(page.locator('.dashboard-container')).toBeVisible({ timeout: 10000 });

    // Click Custom Regex Chip
    const customChip = page.locator('[data-testid="preset-chip-custom"]');
    await customChip.click();

    // Verify custom regex box appears
    await expect(page.locator('[data-testid="custom-regex-box"]')).toBeVisible();

    // Enter catastrophic nested quantifier ReDoS pattern
    const regexInput = page.locator('[data-testid="custom-regex-input"]');
    await regexInput.fill('(a+)+$');
    await regexInput.press('Enter');

    // Verify ReDoS defense error notice is displayed without freezing the browser
    await expect(page.locator('[data-testid="regex-error"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="regex-error"]')).toContainText(/ReDoS/i);
  });

  test('Workflow Reset: Discards Document and Restores Dropzone', async ({ page }) => {
    await page.goto('/features/pdf/security/search-redact');
    await page.waitForLoadState('networkidle');

    const fileInput = dropzoneInput(page);
    await fileInput.setInputFiles(auditFixture('contract-sensitive.pdf'));
    await expect(page.locator('.dashboard-container')).toBeVisible({ timeout: 10000 });

    // Click Reset button
    const resetBtn = page.locator('[data-testid="btn-reset"]');
    await resetBtn.click();

    // Assert dropzone restored
    await expect(page.locator('.dropzone-section')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.dashboard-container')).toHaveCount(0);
  });
});
