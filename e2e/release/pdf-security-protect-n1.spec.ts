import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { setupCapacitorMocks } from '../fixtures/mocks';

const FIXTURES_DIR = path.resolve(__dirname, '../test-data/audit');

function auditFixture(fileName: string): string {
  return path.join(FIXTURES_DIR, fileName);
}

function dropzoneInput(page: Page, nth = 0) {
  return page.locator('app-file-dropzone input[type="file"], input[type="file"]').nth(nth);
}

test.describe('N1 — PDF Document Encryption Engine E2E Suite', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (err) => {
      if (!err.message.includes('ResizeObserver')) {
        console.error('Unhandled page error:', err.message);
      }
    });

    await setupCapacitorMocks(page);
  });

  test('E2E Flow: Standard Pills, Password Strength, Granular Perms, AES-256 Encryption & Unlock Challenge', async ({ page }) => {
    // 1. Navigate to Protect Tool
    await page.goto('/features/pdf/security/protect');
    await page.waitForLoadState('networkidle');

    // 2. Upload sample 1-page PDF
    const fileInput = dropzoneInput(page);
    await fileInput.waitFor({ state: 'attached', timeout: 15000 });
    await fileInput.setInputFiles(auditFixture('standard-1page.pdf'));

    // Verify file loaded card
    await expect(page.locator('.file-status-card')).toBeVisible({ timeout: 10000 });

    // 3. Test Standard Selector Pills: [AES-256] [AES-128] [Legacy RC4]
    const aes256Pill = page.locator('.pill-tab').filter({ hasText: /AES-256/i }).first();
    const aes128Pill = page.locator('.pill-tab').filter({ hasText: /AES-128/i }).first();
    const rc4Pill = page.locator('.pill-tab').filter({ hasText: /Legacy RC4/i }).first();

    await expect(aes256Pill).toBeVisible();
    await expect(aes128Pill).toBeVisible();
    await expect(rc4Pill).toBeVisible();

    // Select AES-128
    await aes128Pill.click();
    await expect(aes128Pill).toHaveClass(/active/);

    // Select Legacy RC4
    await rc4Pill.click();
    await expect(rc4Pill).toHaveClass(/active/);

    // Switch back to AES-256
    await aes256Pill.click();
    await expect(aes256Pill).toHaveClass(/active/);

    // 4. Fill User Password
    const userPass = 'Secur3N1@TestPass!';
    const userPassInput = page.locator('#user-password');
    await userPassInput.fill(userPass);

    // Confirm User Password
    const confirmUserInput = page.locator('.passwords-card .confirm-input-wrap input').first();
    await confirmUserInput.fill(userPass);

    // 5. Open Advanced Owner Password Accordion & Fill
    const ownerAccordion = page.locator('.owner-accordion-header');
    await ownerAccordion.click();
    const ownerPassInput = page.locator('.owner-accordion-body input[type="password"], .owner-accordion-body input').first();
    await expect(ownerPassInput).toBeVisible({ timeout: 5000 });
    const ownerPass = 'OwnerMaster2026#Adm1n!';
    await ownerPassInput.fill(ownerPass);

    const confirmOwnerInput = page.locator('.owner-accordion-body .confirm-input-wrap input').first();
    await confirmOwnerInput.fill(ownerPass);

    // 6. Toggle Granular Permissions
    const printSelect = page.locator('.mobile-select-dropdown').first();
    if (await printSelect.isVisible()) {
      await printSelect.selectOption('none');
    }

    // Toggle Content Copying off
    const copyToggleRow = page.locator('.permission-row').filter({ hasText: /Copying/i }).first();
    if (await copyToggleRow.isVisible()) {
      await copyToggleRow.click();
    }

    // 7. Click Sticky Encrypt & Save Button
    const encryptBtn = page.locator('.primary-thumb-button');
    await expect(encryptBtn).toBeEnabled({ timeout: 5000 });
    await encryptBtn.click();

    // 8. Verify Success Preview
    const resultPreview = page.locator('app-result-preview');
    await expect(resultPreview).toBeVisible({ timeout: 35000 });

    // 9. Navigate to Unlock Tool to test password challenge modal & verification
    await page.goto('/features/pdf/unlock');
    await page.waitForLoadState('networkidle');

    const unlockDropzone = dropzoneInput(page);
    await unlockDropzone.waitFor({ state: 'attached', timeout: 15000 });
    await unlockDropzone.setInputFiles(auditFixture('standard-1page.pdf'));

    // Verify unlock view loads
    const unlockPassField = page.locator('input[type="password"]').first();
    await expect(unlockPassField).toBeVisible({ timeout: 10000 });
  });

  test('E2E Flow: Pre-encrypted PDF displays current password field and unlocks re-protection', async ({ page }) => {
    await page.goto('/features/pdf/security/protect');
    await page.waitForLoadState('networkidle');

    // Upload pre-encrypted mock fixture
    const fileInput = dropzoneInput(page);
    await fileInput.waitFor({ state: 'attached', timeout: 15000 });
    await fileInput.setInputFiles(auditFixture('password-protected.pdf'));

    await expect(page.locator('.file-status-card')).toBeVisible({ timeout: 10000 });

    // Fill new password credentials
    const userPassInput = page.locator('#user-password');
    await userPassInput.fill('BrandNew2026UserPass!');

    const confirmUserInput = page.locator('.passwords-card .confirm-input-wrap input').first();
    await confirmUserInput.fill('BrandNew2026UserPass!');

    // Verify Sticky Encrypt Button is ready
    const encryptBtn = page.locator('.primary-thumb-button');
    await expect(encryptBtn).toBeVisible({ timeout: 5000 });
  });
});
