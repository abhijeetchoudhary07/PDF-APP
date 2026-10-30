import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { setupCapacitorMocks } from './fixtures/mocks';

async function signInPremium(page: Page): Promise<void> {
  const user = {
    id: 'user-premium',
    email: 'pro@example.com',
    displayName: 'Pro',
    authProvider: 'email',
    isActive: true,
    isVerified: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastLoginAt: null,
  };
  const entitlement = {
    isPremium: true,
    planId: 'pro_annual',
    status: 'active',
    validUntil: null,
    platform: 'manual_admin',
    daysRemaining: null,
  };

  await page.addInitScript(
    ({ user: u, entitlement: e }) => {
      const value = JSON.stringify({
        accessToken: 'token',
        refreshToken: 'refresh',
        user: u,
        entitlement: e,
        syncedAt: Date.now(),
      });
      try {
        localStorage.setItem('CapacitorStorage.IFH_PDF_ACCOUNT_SESSION_V1', value);
        localStorage.setItem('IFH_PDF_ACCOUNT_SESSION_V1', value);
      } catch {
        /* ignored */
      }
    },
    { user, entitlement },
  );

  await page.route('**/auth/me', (route) => route.fulfill({ json: { user, entitlement } }));
}

test.describe('Form Mail-Merge from CSV (M3) E2E Test Suite @forms @forms-mail-merge', () => {
  const fillablePath = path.resolve(__dirname, 'test-data/editor-audit/fillable-form.pdf');

  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await signInPremium(page);
  });

  test('M3-001: 4-Step Mail-Merge Wizard: Template -> CSV -> Mapping -> Settings -> ZIP Batch Generation', async ({ page }, testInfo) => {
    // 1. Create temporary 3-row CSV matching the 4 fields in fillable-form.pdf
    const csvPath = testInfo.outputPath('merge-sample.csv');
    const csvContent =
      'fullName,email,agreeTerms,deptCode\n' +
      'Aarav Sharma,aarav.sharma@example.in,true,FINANCE\n' +
      'Diya Patel,diya.patel@example.in,false,HR\n' +
      'Kavita Rao,kavita.rao@example.in,true,LEGAL\n';
    fs.writeFileSync(csvPath, csvContent, 'utf-8');

    // 2. Navigate to /features/pdf/forms/mail-merge
    await page.goto('/features/pdf/forms/mail-merge');
    await page.waitForLoadState('domcontentloaded');

    // Verify initial Step 1 UI
    await expect(page.locator('[data-testid="step-panel-1"]')).toBeVisible();
    await expect(page.locator('[data-testid="template-drop-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="step-pill-2"]')).toBeDisabled();

    // 3. Step 1: Upload PDF template
    const templateInput = page.locator('[data-testid="template-file-input"]');
    await templateInput.setInputFiles(fillablePath);

    // Verify template loaded card
    const loadedCard = page.locator('[data-testid="template-loaded-card"]');
    await expect(loadedCard).toBeVisible({ timeout: 15000 });
    await expect(loadedCard).toContainText('fillable-form.pdf');
    await expect(loadedCard).toContainText('4');

    // Click Next to advance to Step 2
    const nextBtn = page.locator('[data-testid="wizard-next-btn"]');
    await expect(nextBtn).toBeEnabled();
    await nextBtn.click();

    // 4. Step 2: Upload CSV
    await expect(page.locator('[data-testid="step-panel-2"]')).toBeVisible();
    const csvInput = page.locator('[data-testid="csv-file-input"]');
    await csvInput.setInputFiles(csvPath);

    // Verify CSV loaded card and sample preview table
    const csvLoadedCard = page.locator('[data-testid="csv-loaded-card"]');
    await expect(csvLoadedCard).toBeVisible({ timeout: 10000 });
    await expect(csvLoadedCard).toContainText('3');

    const sampleTable = page.locator('[data-testid="sample-table"]');
    await expect(sampleTable).toBeVisible();
    await expect(sampleTable).toContainText('Aarav Sharma');
    await expect(sampleTable).toContainText('Diya Patel');

    // Click Next to advance to Step 3
    await nextBtn.click();

    // 5. Step 3: Verify Mapping Controls
    await expect(page.locator('[data-testid="step-panel-3"]')).toBeVisible();
    const mappingsList = page.locator('[data-testid="mappings-list"]');
    await expect(mappingsList).toBeVisible();

    // Verify auto-matched pills for standard fields
    await expect(page.locator('[data-testid="auto-match-pill-fullName"]')).toBeVisible();
    await expect(page.locator('[data-testid="auto-match-pill-email"]')).toBeVisible();
    await expect(page.locator('[data-testid="auto-match-pill-agreeTerms"]')).toBeVisible();
    await expect(page.locator('[data-testid="auto-match-pill-deptCode"]')).toBeVisible();

    // Click Next to advance to Step 4
    await nextBtn.click();

    // 6. Step 4: Batch Generation Settings
    await expect(page.locator('[data-testid="step-panel-4"]')).toBeVisible();
    const namingInput = page.locator('[data-testid="naming-pattern-input"]');
    await expect(namingInput).toBeVisible();
    await namingInput.fill('Invoice_{index}_{fullName}.pdf');

    // Verify start batch button
    const startBatchBtn = page.locator('[data-testid="start-batch-btn"]');
    await expect(startBatchBtn).toBeVisible();
    await expect(startBatchBtn).toBeEnabled();

    // 7. Execute batch merge and observe progress modal
    await startBatchBtn.click();

    // Once finished, summary bottom sheet appears
    const summarySheet = page.locator('[data-testid="summary-bottom-sheet"]');
    await expect(summarySheet).toBeVisible({ timeout: 25000 });

    // Verify successful count is 3
    const successCount = page.locator('[data-testid="summary-success-count"]');
    await expect(successCount).toHaveText('3');

    // Verify download ZIP button is present and clickable
    const downloadZipBtn = page.locator('[data-testid="download-zip-btn"]');
    await expect(downloadZipBtn).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      downloadZipBtn.click()
    ]);

    expect(download.suggestedFilename()).toMatch(/\.zip$/);
  });

  test('M3-002: Cancellation of in-flight Mail-Merge Batch', async ({ page }, testInfo) => {
    // 1. Create a 100-row CSV to ensure multi-chunk processing
    const csvPath = testInfo.outputPath('large-batch.csv');
    let csvLines = 'fullName,email,agreeTerms,deptCode\n';
    for (let i = 1; i <= 100; i++) {
      csvLines += `User ${i},user${i}@example.com,true,DEPT_${i}\n`;
    }
    fs.writeFileSync(csvPath, csvLines, 'utf-8');

    // 2. Navigate and upload template
    await page.goto('/features/pdf/forms/mail-merge');
    await page.waitForLoadState('domcontentloaded');

    await page.locator('[data-testid="template-file-input"]').setInputFiles(fillablePath);
    await expect(page.locator('[data-testid="template-loaded-card"]')).toBeVisible({ timeout: 15000 });

    // Step 1 -> Step 2
    await page.locator('[data-testid="wizard-next-btn"]').click();

    // Step 2: Upload CSV
    await page.locator('[data-testid="csv-file-input"]').setInputFiles(csvPath);
    await expect(page.locator('[data-testid="csv-loaded-card"]')).toBeVisible({ timeout: 10000 });

    // Step 2 -> Step 3
    await page.locator('[data-testid="wizard-next-btn"]').click();

    // Step 3 -> Step 4
    await expect(page.locator('[data-testid="step-panel-3"]')).toBeVisible();
    await page.locator('[data-testid="wizard-next-btn"]').click();

    // Step 4: Click start batch
    await expect(page.locator('[data-testid="step-panel-4"]')).toBeVisible();
    await page.locator('[data-testid="start-batch-btn"]').click();

    // Progress modal should open
    const progressModal = page.locator('[data-testid="progress-modal-backdrop"]');
    await expect(progressModal).toBeVisible({ timeout: 5000 });

    // Cancel batch while in progress
    const cancelBtn = page.locator('[data-testid="cancel-batch-btn"] button');
    await cancelBtn.click({ force: true });

    // Progress modal dismisses and summary bottom sheet appears reporting skipped records
    await expect(progressModal).toBeHidden({ timeout: 10000 });
    const summarySheet = page.locator('[data-testid="summary-bottom-sheet"]');
    await expect(summarySheet).toBeVisible({ timeout: 10000 });

    // Verify skipped/failed pill is shown
    await expect(page.locator('[data-testid="summary-failed-pill"]')).toBeVisible();
  });

  test('M3-003: Mail-Merge Batch with Unicode Indian Regional Scripts (Devanagari & Bengali)', async ({ page }, testInfo) => {
    // 1. Create CSV with Hindi and Bengali records
    const csvPath = testInfo.outputPath('regional-batch.csv');
    const csvContent =
      'fullName,email,agreeTerms,deptCode\n' +
      'राहुल शर्मा,rahul.sharma@gov.in,true,FINANCE\n' +
      'অভিজিৎ চৌধুরী,abhijeet.choudhary@wb.gov.in,true,LEGAL\n';
    fs.writeFileSync(csvPath, csvContent, 'utf-8');

    // 2. Navigate and setup wizard
    await page.goto('/features/pdf/forms/mail-merge');
    await page.waitForLoadState('domcontentloaded');

    // Step 1: Upload template
    await page.locator('[data-testid="template-file-input"]').setInputFiles(fillablePath);
    await expect(page.locator('[data-testid="template-loaded-card"]')).toBeVisible({ timeout: 15000 });
    await page.locator('[data-testid="wizard-next-btn"]').click();

    // Step 2: Upload CSV
    await page.locator('[data-testid="csv-file-input"]').setInputFiles(csvPath);
    await expect(page.locator('[data-testid="csv-loaded-card"]')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="wizard-next-btn"]').click();

    // Step 3: Confirm mapping
    await expect(page.locator('[data-testid="step-panel-3"]')).toBeVisible();
    await page.locator('[data-testid="wizard-next-btn"]').click();

    // Step 4: Settings & Run batch
    await expect(page.locator('[data-testid="step-panel-4"]')).toBeVisible();
    await page.locator('[data-testid="start-batch-btn"]').click();

    // 3. Verify batch completes without WinAnsi encoding crash
    const summarySheet = page.locator('[data-testid="summary-bottom-sheet"]');
    await expect(summarySheet).toBeVisible({ timeout: 25000 });

    // Success count must be exactly 2
    const successCount = page.locator('[data-testid="summary-success-count"]');
    await expect(successCount).toHaveText('2');

    // Verify no failure pill is rendered
    await expect(page.locator('[data-testid="summary-failed-pill"]')).toBeHidden();
  });
});
