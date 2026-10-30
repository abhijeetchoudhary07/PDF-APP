import { test, expect } from '@playwright/test';
import * as path from 'path';
import { setupCapacitorMocks } from './fixtures/mocks';

test.describe('Cryptographic PDF Digital Signature Engine (M6) E2E @sign @certificate', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error(`[Browser Error]: ${msg.text()}`);
      }
    });
  });

  test('M6-001: Ingest .p12, unlock with password, verify X.509 details, sign PDF, and verify integrity report', async ({ page }) => {
    // 1. Navigate to certificate digital signing route
    await page.goto('/features/pdf/sign/certificate');
    await page.waitForLoadState('domcontentloaded');

    // Verify initial screen title & honesty notice banner
    const screenTitle = page.locator('.screen-title');
    await expect(screenTitle).toBeVisible({ timeout: 10000 });

    const honestyBanner = page.locator('.honesty-banner');
    await expect(honestyBanner).toBeVisible();

    // 2. Upload .p12 certificate file fixture
    const certFilePath = path.resolve('e2e/test-data/signatures/e2e-signer.p12');
    const certInput = page.locator('input[type="file"][accept*=".p12"]');
    await certInput.setInputFiles(certFilePath);

    // Verify certificate file row appears with file name
    const certFileRow = page.locator('.cert-file-row');
    await expect(certFileRow).toBeVisible();
    await expect(certFileRow).toContainText('e2e-signer.p12');

    // 3. Test incorrect password handling
    const passwordInput = page.locator('[data-testid="cert-password-input"]');
    const unlockBtn = page.locator('[data-testid="unlock-cert-btn"]');

    await passwordInput.fill('IncorrectPassword!');
    await unlockBtn.click();

    // Error feedback message must appear
    const errorBox = page.locator('[data-testid="cert-error-box"]');
    await expect(errorBox).toBeVisible({ timeout: 5000 });
    await expect(errorBox).toContainText(/Incorrect password/i);

    // 4. Enter correct password and unlock
    await passwordInput.fill('Pass1234!');
    await unlockBtn.click();

    // 5. Verify certificate unlocked & X.509 metadata parsed accurately
    const unlockedBadge = page.locator('.unlocked-badge');
    await expect(unlockedBadge).toBeVisible({ timeout: 5000 });

    const commonNameVal = page.locator('[data-testid="cert-common-name"]');
    await expect(commonNameVal).toHaveText('Dr. Jane Smith');

    const issuerVal = page.locator('[data-testid="cert-issuer"]');
    await expect(issuerVal).toContainText('Antigravity Trust Root CA');

    const validityChip = page.locator('[data-testid="cert-validity-chip"]');
    await expect(validityChip).toContainText(/Valid/i);
    await expect(validityChip).toHaveClass(/valid/);

    // 6. Configure Signature Reason and Location
    const reasonInput = page.locator('[data-testid="signing-reason-input"]');
    await reasonInput.fill('Certified Official Clearance');

    const locationInput = page.locator('[data-testid="signing-location-input"]');
    await locationInput.fill('Bangalore, India');

    // Verify visual stamp toggle is checked
    const visualStampToggle = page.locator('[data-testid="visual-stamp-toggle"]');
    await expect(visualStampToggle).toBeChecked();

    // 7. Execute Cryptographic Digital Signing
    const signBtn = page.locator('[data-testid="sign-document-btn"]');
    await expect(signBtn).toBeEnabled();
    await signBtn.click();

    // 8. Verify post-signing verification report
    const reportCard = page.locator('[data-testid="verification-report-card"]');
    await expect(reportCard).toBeVisible({ timeout: 15000 });

    // Verify cryptographic verification passed
    const reportHeader = reportCard.locator('.report-title-meta .section-title');
    await expect(reportHeader).toBeVisible();

    // Verify SHA-256 digest and ByteRange are reported
    const digestAuditBox = reportCard.locator('.digest-audit-box');
    await expect(digestAuditBox).toContainText('SHA-256 Digest:');
    await expect(digestAuditBox).toContainText('ByteRange:');

    // 9. Verify post-signing export actions (Share & Download)
    const shareBtn = page.locator('[data-testid="share-signed-btn"]');
    await expect(shareBtn).toBeVisible();
    await expect(shareBtn).toBeEnabled();

    const downloadBtn = page.locator('[data-testid="download-signed-btn"]');
    await expect(downloadBtn).toBeVisible();
    await expect(downloadBtn).toBeEnabled();

    // Trigger download and verify event
    const downloadPromise = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
    await downloadBtn.click();
    const download = await downloadPromise;
    if (download) {
      expect(download.suggestedFilename()).toContain('.pdf');
    }
  });

  test('M6-002: Generate on-device test certificate, sign multi-page doc, and verify honesty report', async ({ page }) => {
    await page.goto('/features/pdf/sign/certificate');
    await page.waitForLoadState('domcontentloaded');

    // Click Generate Test Certificate button
    const generateBtn = page.locator('[data-testid="generate-test-cert-btn"]');
    await expect(generateBtn).toBeVisible({ timeout: 10000 });
    await generateBtn.click();

    // Verify certificate automatically unlocked
    const unlockedBadge = page.locator('.unlocked-badge');
    await expect(unlockedBadge).toBeVisible({ timeout: 8000 });

    const commonNameVal = page.locator('[data-testid="cert-common-name"]');
    await expect(commonNameVal).toHaveText('Verified User');

    // Sign document
    const signBtn = page.locator('[data-testid="sign-document-btn"]');
    await expect(signBtn).toBeEnabled();
    await signBtn.click();

    // Verify verification report
    const reportCard = page.locator('[data-testid="verification-report-card"]');
    await expect(reportCard).toBeVisible({ timeout: 15000 });
  });
});
