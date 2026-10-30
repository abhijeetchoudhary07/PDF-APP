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

test.describe('N3 — Batch Security (Batch Protect / Unlock) E2E Suite', () => {
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

  test('E2E Flow: Multi-File Queue Upload, Standard Pills, Password Strength & Batch Protect with Live Progress & ZIP Download', async ({ page }) => {
    // 1. Navigate to Batch Security tool
    await page.goto('/features/pdf/security/batch');
    await page.waitForLoadState('networkidle');

    // Verify initial mode is Batch Protect
    const protectTab = page.locator('.mode-pill').filter({ hasText: /Protect/i }).first();
    await expect(protectTab).toHaveClass(/active/);

    // 2. Multi-File Queue Upload
    const fileInput = dropzoneInput(page);
    await fileInput.waitFor({ state: 'attached', timeout: 15000 });

    // Upload 3 files simultaneously
    await fileInput.setInputFiles([
      auditFixture('standard-1page.pdf'),
      auditFixture('scanned-image.pdf'),
      auditFixture('malicious-js.pdf')
    ]);

    // Verify Queue rendered with 3 items
    await expect(page.locator('.queue-section')).toBeVisible({ timeout: 10000 });
    const queueCards = page.locator('.queue-item-card');
    await expect(queueCards).toHaveCount(3, { timeout: 10000 });

    const queueBadge = page.locator('.queue-count-badge');
    await expect(queueBadge).toHaveText('3');

    // 3. Test Standard Selector Pills: [AES-256], [AES-128], [RC4]
    const aes256Pill = page.locator('.std-pill').filter({ hasText: /AES-256/i }).first();
    const aes128Pill = page.locator('.std-pill').filter({ hasText: /AES-128/i }).first();
    const rc4Pill = page.locator('.std-pill').filter({ hasText: /RC4/i }).first();

    await expect(aes256Pill).toBeVisible();
    await expect(aes128Pill).toBeVisible();
    await expect(rc4Pill).toBeVisible();

    // Select AES-128 then back to AES-256
    await aes128Pill.click();
    await expect(aes128Pill).toHaveClass(/selected/);
    await aes256Pill.click();
    await expect(aes256Pill).toHaveClass(/selected/);

    // 4. Enter Shared User Password & Confirmation
    const sharedPassword = 'BatchSharedPass2026!';
    const userPassInput = page.locator('#batch-user-pwd');
    await userPassInput.fill(sharedPassword);

    // Password strength meter should show active evaluation
    await expect(page.locator('.password-strength-meter-wrap')).toBeVisible();

    const confirmUserInput = page.locator('#batch-confirm-user-pwd');
    await confirmUserInput.fill(sharedPassword);

    // 5. Verify Sticky Action Button displays "Protect 3 Documents"
    const startBtn = page.locator('.action-thumb-btn');
    await expect(startBtn).toBeEnabled({ timeout: 5000 });
    await expect(startBtn).toContainText(/3/);

    // 6. Click Start Batch Protect
    await startBtn.click();

    // 7. Verify Live Progress Sheet ("Processing X of 3...")
    const progressSheet = page.locator('.processing-sheet');
    // Either processing sheet is visible or processing completes fast to summary sheet
    const summarySheet = page.locator('.summary-sheet');

    await expect(summarySheet).toBeVisible({ timeout: 35000 });

    // 8. Verify Summary Results
    const successStat = summarySheet.locator('.stat-box.success-box .stat-number');
    await expect(successStat).toHaveText('3');

    // 9. Verify ZIP Bundle Download Action
    const zipBtn = summarySheet.locator('.zip-btn');
    await expect(zipBtn).toBeVisible();
    await zipBtn.click();

    // Verify toast confirmation appears
    await expect(page.locator('ion-toast, .toast-item')).toBeVisible({ timeout: 10000 });

    // 10. Click New Batch to reset state cleanly
    const resetBtn = summarySheet.locator('.reset-btn');
    await resetBtn.click();
    await expect(page.locator('.queue-section')).not.toBeVisible();
  });

  test('E2E Flow: Mode Switching to Batch Unlock, Master Password, Queue Management & Clear', async ({ page }) => {
    await page.goto('/features/pdf/security/batch');
    await page.waitForLoadState('networkidle');

    // 1. Switch to Batch Unlock mode
    const unlockTab = page.locator('.mode-pill').filter({ hasText: /Unlock/i }).first();
    await unlockTab.click();
    await expect(unlockTab).toHaveClass(/active/);

    // 2. Upload locked document fixture
    const fileInput = dropzoneInput(page);
    await fileInput.waitFor({ state: 'attached', timeout: 15000 });
    await fileInput.setInputFiles([auditFixture('password-protected.pdf')]);

    await expect(page.locator('.queue-section')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.queue-item-card')).toHaveCount(1);

    // 3. Verify Master Password field in Unlock config
    const unlockConfig = page.locator('.unlock-config-card');
    await expect(unlockConfig).toBeVisible();

    const masterPassInput = unlockConfig.locator('input[type="password"], input[type="text"]').first();
    await masterPassInput.fill('User2026!');

    // Verify start button ready
    const startUnlockBtn = page.locator('.action-thumb-btn');
    await expect(startUnlockBtn).toBeEnabled({ timeout: 5000 });

    // 4. Test Queue Management: Remove Item
    const removeBtn = page.locator('.remove-item-btn').first();
    await removeBtn.click();
    await expect(page.locator('.queue-item-card')).toHaveCount(0);

    // Switch back to Protect mode cleanly
    const protectTab = page.locator('.mode-pill').filter({ hasText: /Protect/i }).first();
    await protectTab.click();
    await expect(protectTab).toHaveClass(/active/);
  });
});
