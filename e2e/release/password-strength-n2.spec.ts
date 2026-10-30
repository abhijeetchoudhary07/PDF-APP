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

test.describe('N2 — Password Strength Meter & Passphrase Component E2E Suite', () => {
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

  test('E2E Flow: Step 2 Score Transitions, Checklist Pills & Dictionary Warnings', async ({ page }) => {
    // 1. Navigate to Protect Tool
    await page.goto('/features/pdf/security/protect');
    await page.waitForLoadState('networkidle');

    // 2. Upload sample PDF to enter configuration view
    const fileInput = dropzoneInput(page);
    await fileInput.waitFor({ state: 'attached', timeout: 15000 });
    await fileInput.setInputFiles(auditFixture('standard-1page.pdf'));

    await expect(page.locator('.file-status-card')).toBeVisible({ timeout: 10000 });

    const userPassInput = page.locator('#user-password');
    const strengthBadge = page.locator('.strength-badge');
    const warningPill = page.locator('.warning-pill');

    // --- Input 1: "123456" -> Very Weak ---
    await userPassInput.fill('123456');
    await expect(strengthBadge).toHaveClass(/level-very-weak/, { timeout: 3000 });
    await expect(warningPill).toBeVisible();
    await expect(page.locator('.bar-segment').first()).toHaveClass(/fill-very-weak/);

    // --- Input 2: "password" -> Weak ---
    await userPassInput.fill('password');
    await expect(strengthBadge).toHaveClass(/level-weak/, { timeout: 3000 });
    await expect(warningPill).toBeVisible();
    await expect(page.locator('.bar-segment').first()).toHaveClass(/fill-weak/);

    // --- Input 3: "Admin@123" -> Fair ---
    await userPassInput.fill('Admin@123');
    await expect(strengthBadge).toHaveClass(/level-fair/, { timeout: 3000 });
    // All 4 criteria chips should be satisfied
    const chips = page.locator('.criteria-chip');
    await expect(chips.nth(0)).toHaveClass(/satisfied/);
    await expect(chips.nth(1)).toHaveClass(/satisfied/);
    await expect(chips.nth(2)).toHaveClass(/satisfied/);
    await expect(chips.nth(3)).toHaveClass(/satisfied/);

    // --- Input 4: "P@ssw0rd2026!" -> Strong ---
    await userPassInput.fill('P@ssw0rd2026!');
    await expect(strengthBadge).toHaveClass(/level-strong/, { timeout: 3000 });
    await expect(page.locator('.bar-segment').nth(2)).toHaveClass(/fill-strong/);

    // --- Input 5: Random 16-char string -> Excellent ---
    await userPassInput.fill('xK9#mQ2$vL8&pT4!');
    await expect(strengthBadge).toHaveClass(/level-excellent/, { timeout: 3000 });
    // All 4 bar segments should be filled
    await expect(page.locator('.bar-segment').nth(0)).toHaveClass(/fill-excellent/);
    await expect(page.locator('.bar-segment').nth(1)).toHaveClass(/fill-excellent/);
    await expect(page.locator('.bar-segment').nth(2)).toHaveClass(/fill-excellent/);
    await expect(page.locator('.bar-segment').nth(3)).toHaveClass(/fill-excellent/);
  });

  test('E2E Flow: Passphrase Generator, Clipboard Feedback, Fallback Warning & Educational Sheet', async ({ page }) => {
    await page.goto('/features/pdf/security/protect');
    await page.waitForLoadState('networkidle');

    const fileInput = dropzoneInput(page);
    await fileInput.waitFor({ state: 'attached', timeout: 15000 });
    await fileInput.setInputFiles(auditFixture('standard-1page.pdf'));

    await expect(page.locator('.file-status-card')).toBeVisible({ timeout: 10000 });

    // 1. Click "Generate Strong Passphrase" Button
    const genBtn = page.locator('.passphrase-gen-btn');
    await expect(genBtn).toBeVisible({ timeout: 5000 });
    await genBtn.click();

    // 2. Verify Passphrase populated in input & clipboard written
    const userPassInput = page.locator('#user-password');
    await expect(userPassInput).not.toHaveValue('', { timeout: 5000 });
    const generatedValue = await userPassInput.inputValue();
    expect(generatedValue.split('-').length).toBe(4);

    // Verify feedback notification in UI
    const feedbackPill = page.locator('.passphrase-feedback');
    await expect(feedbackPill).toBeVisible({ timeout: 5000 });

    // Verify clipboard received the generated passphrase if readable
    try {
      const copiedVal = await page.evaluate(async () => {
        try {
          return await navigator.clipboard.readText();
        } catch {
          return null;
        }
      });
      if (copiedVal) {
        expect(copiedVal).toBe(generatedValue);
      }
    } catch {
      // Permission blocked in headless environment
    }

    // 3. Verify ISO 32000 Owner Fallback Warning is displayed
    const fallbackNotice = page.locator('.owner-fallback-card');
    await expect(fallbackNotice).toBeVisible();
    await expect(fallbackNotice).toContainText('ISO 32000 Security Notice');

    // When Owner Password is supplied, the fallback notice disappears
    const ownerAccordion = page.locator('.owner-accordion-header');
    await ownerAccordion.click();
    const ownerPassInput = page.locator('.owner-accordion-body input[type="password"], .owner-accordion-body input').first();
    await ownerPassInput.fill('DistinctOwnerSecret2026!');
    // Trigger change event to ensure binding updates
    await ownerPassInput.dispatchEvent('input');
    await expect(fallbackNotice).not.toBeVisible({ timeout: 5000 });

    // 4. Trigger Educational Accordion (Understanding PDF Passwords)
    const eduTrigger = page.locator('.educational-tip-card .accordion-trigger');
    await expect(eduTrigger).toBeVisible();
    await expect(eduTrigger).toHaveAttribute('aria-expanded', 'false');

    await eduTrigger.click();
    await expect(eduTrigger).toHaveAttribute('aria-expanded', 'true');
    const eduContent = page.locator('#educational-accordion-content');
    await expect(eduContent).toBeVisible();
    await expect(eduContent).toContainText('User Password');
    await expect(eduContent).toContainText('Owner / Permissions Password');

    // Collapse again
    await eduTrigger.click();
    await expect(eduTrigger).toHaveAttribute('aria-expanded', 'false');
    await expect(eduContent).not.toBeVisible();
  });
});
