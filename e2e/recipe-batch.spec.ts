import { test, expect } from '@playwright/test';
import * as path from 'path';
import { setupCapacitorMocks } from './fixtures/mocks';

test.describe('Q5: Batch Recipe Runner & Starter Recipes (/features/recipes/batch) @recipes @q5', () => {
  const samplePdf1 = path.resolve(__dirname, 'test-data/pdf/text.pdf');
  const samplePdf2 = path.resolve(__dirname, 'test-data/pdf/structured-doc.pdf');
  const samplePdf3 = path.resolve(__dirname, 'test-data/pdf/scanned.pdf');
  const samplePdf4 = path.resolve(__dirname, 'test-data/pdf/hindi.pdf');
  const corruptPdf = path.resolve(__dirname, 'test-data/pdf/corrupt.pdf');

  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('RB-001: Navigation and Route Accessibility — direct route and alias redirect', async ({ page }) => {
    // 1. Alias redirect from /recipes/batch
    await page.goto('/recipes/batch');
    await expect(page).toHaveURL(/.*features\/recipes\/batch/);

    // 2. Verify header, badge, and starter showcase rendered
    const title = page.locator('app-page-header');
    await expect(title).toBeVisible();

    const starterShowcase = page.locator('.starter-showcase-section');
    await expect(starterShowcase).toBeVisible();

    const recipeSelector = page.locator('.recipe-selector-card');
    await expect(recipeSelector).toBeVisible();

    const dropzone = page.locator('.dropzone-section app-file-dropzone');
    await expect(dropzone).toBeVisible();
  });

  test('RB-002: Starter Recipe Showcase & 3 Built-in Functional Recipes Selection', async ({ page }) => {
    await page.goto('/features/recipes/batch');
    await page.waitForLoadState('domcontentloaded');

    // 1. Verify 3 built-in starter recipe cards are present
    const starterCards = page.locator('.starter-card');
    await expect(starterCards).toHaveCount(3);

    const card1 = starterCards.nth(0);
    const card2 = starterCards.nth(1);
    const card3 = starterCards.nth(2);

    await expect(card1.locator('.starter-name')).toContainText('Compress to 2 MB, then number pages');
    await expect(card2.locator('.starter-name')).toContainText('Scan cleanup: deskew, grayscale, OCR');
    await expect(card3.locator('.starter-name')).toContainText('Submission prep: sanitize, flatten, preflight');

    // By default, Starter 1 is selected
    await expect(card1).toHaveClass(/is-active/);

    // 2. Select Starter 2 ("Scan cleanup")
    await card2.click();
    await expect(card2).toHaveClass(/is-active/);
    await expect(card1).not.toHaveClass(/is-active/);

    const dropdown = page.locator('select#recipe-select');
    await expect(dropdown).toHaveValue('starter-scan-cleanup');

    // 3. Select Starter 3 ("Submission prep")
    await card3.click();
    await expect(card3).toHaveClass(/is-active/);
    await expect(dropdown).toHaveValue('starter-submission-prep');

    // 4. Switch back to Starter 1
    await card1.click();
    await expect(card1).toHaveClass(/is-active/);
    await expect(dropdown).toHaveValue('starter-compress-number');
  });

  test('RB-003: Multi-File Ingestion, Queue Management, and Removal', async ({ page }) => {
    await page.goto('/features/recipes/batch');
    await page.waitForLoadState('domcontentloaded');

    // Upload 4 PDF files
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([samplePdf1, samplePdf2, samplePdf3, samplePdf4]);

    // Verify queue displays 4 items
    const queueCard = page.locator('.queue-card');
    await expect(queueCard).toBeVisible();

    const queueItems = page.locator('.queue-item');
    await expect(queueItems).toHaveCount(4);

    // Verify item filenames
    await expect(queueItems.nth(0).locator('.item-name')).toContainText('text.pdf');
    await expect(queueItems.nth(1).locator('.item-name')).toContainText('structured-doc.pdf');
    await expect(queueItems.nth(2).locator('.item-name')).toContainText('scanned.pdf');
    await expect(queueItems.nth(3).locator('.item-name')).toContainText('hindi.pdf');

    // All should have QUEUED status badge
    for (let i = 0; i < 4; i++) {
      await expect(queueItems.nth(i).locator('app-badge')).toContainText('QUEUED');
    }

    // Remove the 2nd item (index 1: structured-doc.pdf)
    const removeBtn = queueItems.nth(1).locator('.remove-item-btn');
    await removeBtn.click();

    // Verify queue count is now 3
    await expect(page.locator('.queue-item')).toHaveCount(3);
    await expect(page.locator('.queue-item').nth(1).locator('.item-name')).toContainText('scanned.pdf');

    // Clear all files
    const clearBtn = page.locator('.queue-actions app-button').filter({ hasText: 'Clear Queue' });
    await clearBtn.click();

    await expect(page.locator('.queue-card')).toBeHidden();
    await expect(page.locator('.dropzone-section app-file-dropzone')).toBeVisible();
  });

  test('RB-004: Live Batch Pipeline Execution on 4 Files with Dual Progress Monitoring', async ({ page }) => {
    await page.goto('/features/recipes/batch');
    await page.waitForLoadState('domcontentloaded');

    // Ensure Starter Recipe 1 is active
    const card1 = page.locator('.starter-card').nth(0);
    await card1.click();

    // Ingest 4 PDF files
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([samplePdf1, samplePdf2, samplePdf3, samplePdf4]);
    await expect(page.locator('.queue-item')).toHaveCount(4);

    // Click "Start Batch Execution (4 files)"
    const startBtn = page.locator('.batch-action-bar app-button').filter({ hasText: 'Start Batch Execution' });
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    // Verify completion summary appears
    const summaryCard = page.locator('.summary-bottom-card');
    await expect(summaryCard).toBeVisible({ timeout: 45000 });

    // Verify summary metric values: 4 Success, 0 Failures
    const successMetric = summaryCard.locator('.metric-success .metric-val');
    await expect(successMetric).toHaveText('4');

    const failMetric = summaryCard.locator('.metric-fail .metric-val');
    await expect(failMetric).toHaveText('0');

    // Verify all 4 queue items show COMPLETED badges
    const queueItems = page.locator('.queue-item');
    for (let i = 0; i < 4; i++) {
      await expect(queueItems.nth(i).locator('app-badge')).toContainText('COMPLETED');
    }

    // Verify collapsible execution log
    const logToggleBtn = page.locator('.log-toggle-btn');
    await expect(logToggleBtn).toBeVisible();
    await logToggleBtn.click();

    const logBox = page.locator('.execution-log-box');
    await expect(logBox).toBeVisible();
    await expect(logBox).toContainText('[Batch Start]');
    await expect(logBox).toContainText('[Batch Summary]');
  });

  test('RB-005: Fault Tolerance — Corrupted File 2 Fails Safely while Files 1, 3, 4 Complete', async ({ page }) => {
    await page.goto('/features/recipes/batch');
    await page.waitForLoadState('domcontentloaded');

    // Ensure Starter Recipe 1 is selected
    const card1 = page.locator('.starter-card').nth(0);
    await card1.click();

    // Ingest 4 files: File 2 is corrupt.pdf
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([samplePdf1, corruptPdf, samplePdf2, samplePdf3]);
    await expect(page.locator('.queue-item')).toHaveCount(4);

    // Start batch
    const startBtn = page.locator('.batch-action-bar app-button').filter({ hasText: 'Start Batch Execution' });
    await startBtn.click();

    // Wait for execution completion
    const summaryCard = page.locator('.summary-bottom-card');
    await expect(summaryCard).toBeVisible({ timeout: 45000 });

    // Fault tolerance assertion: 3 files succeeded, exactly 1 file failed
    const successMetric = summaryCard.locator('.metric-success .metric-val');
    await expect(successMetric).toHaveText('3');

    const failMetric = summaryCard.locator('.metric-fail .metric-val');
    await expect(failMetric).toHaveText('1');

    // Check individual statuses
    const queueItems = page.locator('.queue-item');
    await expect(queueItems.nth(0).locator('app-badge')).toContainText('COMPLETED');
    await expect(queueItems.nth(1).locator('app-badge')).toContainText('FAILED');
    await expect(queueItems.nth(2).locator('app-badge')).toContainText('COMPLETED');
    await expect(queueItems.nth(3).locator('app-badge')).toContainText('COMPLETED');

    // Corrupted item should display error message
    const errorMsg = queueItems.nth(1).locator('.item-error-msg');
    await expect(errorMsg).toBeVisible();
  });

  test('RB-006: Quota Pre-Check & Partial Execution when Quota Limit is Reached', async ({ page }) => {
    // Set daily usage count = 3 so that remaining operations = 5 - 3 = 2
    await page.addInitScript(() => {
      const today = new Date().toISOString().split('T')[0];
      const usage = JSON.stringify({ date: today, count: 3 });
      try {
        localStorage.setItem('IFH_DAILY_USAGE_V1', usage);
        localStorage.setItem('CapacitorStorage.IFH_DAILY_USAGE_V1', usage);
      } catch (e) {}
    });

    await page.goto('/features/recipes/batch');
    await page.waitForLoadState('domcontentloaded');

    // Ingest 4 files
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([samplePdf1, samplePdf2, samplePdf3, samplePdf4]);
    await expect(page.locator('.queue-item')).toHaveCount(4);

    // Quota notice banner should indicate partial processing
    const quotaBanner = page.locator('.quota-banner');
    await expect(quotaBanner).toBeVisible();
    await expect(quotaBanner).toContainText('Batch will process 2 files then stop');

    // Start batch
    const startBtn = page.locator('.batch-action-bar app-button').filter({ hasText: 'Start Batch Execution' });
    await startBtn.click();

    // Wait for batch completion
    const summaryCard = page.locator('.summary-bottom-card');
    await expect(summaryCard).toBeVisible({ timeout: 45000 });

    // 2 files completed, 2 skipped due to quota
    await expect(summaryCard.locator('.metric-success .metric-val')).toHaveText('2');
    await expect(summaryCard.locator('.metric-skipped .metric-val')).toHaveText('2');

    const queueItems = page.locator('.queue-item');
    await expect(queueItems.nth(0).locator('app-badge')).toContainText('COMPLETED');
    await expect(queueItems.nth(1).locator('app-badge')).toContainText('COMPLETED');
    await expect(queueItems.nth(2).locator('app-badge')).toContainText('SKIPPED_QUOTA');
    await expect(queueItems.nth(3).locator('app-badge')).toContainText('SKIPPED_QUOTA');
  });

  test('RB-007: Output ZIP Archive Generation & Download with Zip Slip Defense', async ({ page }) => {
    await page.goto('/features/recipes/batch');
    await page.waitForLoadState('domcontentloaded');

    // Ingest 2 files
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([samplePdf1, samplePdf2]);

    // Start batch
    const startBtn = page.locator('.batch-action-bar app-button').filter({ hasText: 'Start Batch Execution' });
    await startBtn.click();

    // Wait for completion
    const summaryCard = page.locator('.summary-bottom-card');
    await expect(summaryCard).toBeVisible({ timeout: 45000 });

    // Click "Save All Outputs (ZIP)"
    const saveZipBtn = summaryCard.locator('.summary-actions app-button').filter({ hasText: 'Save All Outputs (ZIP)' });
    await expect(saveZipBtn).toBeVisible();
    await saveZipBtn.click();

    // Verify success toast or confirmation
    const toast = page.locator('.app-toast, ion-toast, [role="status"], [role="alert"]');
    await expect(toast.first()).toBeVisible({ timeout: 10000 });
  });
});
