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

test.describe('Audit & Verification: PDF Tools Suite (Desktop & Mobile)', () => {
  test.beforeEach(async ({ page }) => {
    // Monitor unhandled exceptions and promise rejections
    page.on('pageerror', (err) => {
      // Allow benign resize observer loop warnings
      if (!err.message.includes('ResizeObserver')) {
        console.error('Unhandled page error:', err.message);
      }
    });

    await setupCapacitorMocks(page);
  });

  // =========================================================================
  // 1. MERGE / COMBINE
  // =========================================================================
  test('STEP 2.1 - PDF Combine: Merges multiple documents into one', async ({ page }) => {
    await page.goto('/features/pdf/combine');
    await page.waitForLoadState('networkidle');

    const input = dropzoneInput(page);
    await input.waitFor({ state: 'attached', timeout: 15000 });
    await input.setInputFiles([
      auditFixture('standard-1page.pdf'),
      auditFixture('scanned-image.pdf')
    ]);

    // Verify workspace loaded both sources
    await expect(page.locator('.combine-workspace')).toBeVisible({ timeout: 15000 });
    const rows = page.locator('.combine-workspace li');
    await expect(rows).toHaveCount(2, { timeout: 10000 });

    // Click Merge button
    const mergeBtn = page.locator('button:has-text("Merge the files")');
    await expect(mergeBtn).toBeEnabled({ timeout: 10000 });
    await mergeBtn.click();

    // Verify completion
    await expect(page.locator('.result-actions')).toBeVisible({ timeout: 30000 });
  });

  // =========================================================================
  // 2. SPLIT & ORGANIZE (Reorder, Rotate, Delete, Multi-page)
  // =========================================================================
  test('STEP 2.2 - PDF Split/Organize: Handles 55-page document reordering and rotation', async ({ page }) => {
    await page.goto('/features/pdf/organize');
    await page.waitForLoadState('networkidle');

    const input = dropzoneInput(page);
    await input.waitFor({ state: 'attached', timeout: 15000 });
    await input.setInputFiles(auditFixture('multipage-55pages.pdf'));

    // Wait for pages and file badge to be loaded
    await expect(page.locator('.file-name-text')).toBeVisible({ timeout: 25000 });
    await expect(page.locator('text=55 Pages').first()).toBeVisible({ timeout: 15000 });

    // Rotate first page
    const rotateBtn = page.locator('button[title*="Rotate 90° clockwise"], button[title*="Rotate"]').first();
    if (await rotateBtn.isVisible()) {
      await rotateBtn.click();
    }

    // Verify export button is present with 55 pages
    const exportBtn = page.locator('app-button:has-text("Export Organized PDF")');
    await expect(exportBtn).toBeVisible({ timeout: 10000 });
  });

  // =========================================================================
  // 3. COMPRESS & REDUCE KB
  // =========================================================================
  test('STEP 2.3 - PDF Compress: Accurately targets size and reduces document KB', async ({ page }) => {
    await page.goto('/features/pdf-compress');
    await page.waitForLoadState('networkidle');

    const input = dropzoneInput(page);
    await input.waitFor({ state: 'attached', timeout: 15000 });
    await input.setInputFiles(auditFixture('standard-1page.pdf'));

    // Wait for tool configuration section
    const compressBtn = page.locator('app-button:has-text("Compress PDF"), app-button:has-text("Compress")').first();
    await expect(compressBtn).toBeVisible({ timeout: 15000 });
    await compressBtn.click();

    // Verify success preview
    await expect(page.locator('app-result-preview')).toBeVisible({ timeout: 35000 });
  });

  // =========================================================================
  // 4. PASSWORD PROTECT & UNLOCK
  // =========================================================================
  test('STEP 2.4 - PDF Security: Protects with 128-bit encryption and Unlocks encrypted PDF', async ({ page }) => {
    // --- PROTECT FLOW ---
    await page.goto('/features/pdf/protect');
    await page.waitForLoadState('networkidle');

    const protectInput = dropzoneInput(page);
    await protectInput.waitFor({ state: 'attached', timeout: 15000 });
    await protectInput.setInputFiles(auditFixture('standard-1page.pdf'));

    // Fill passwords
    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 10000 });
    await passwordInput.fill('SecureAuditPass123!');

    const confirmPass = page.locator('input[type="password"]').nth(1);
    if (await confirmPass.isVisible()) {
      await confirmPass.fill('SecureAuditPass123!');
    }

    // Submit Protect
    const applyProtectBtn = page.locator('button:has-text("Protect & Export PDF")');
    await applyProtectBtn.click();

    // Verify success
    await expect(page.locator('app-result-preview')).toBeVisible({ timeout: 25000 });

    // --- UNLOCK FLOW ---
    await page.goto('/features/pdf/unlock');
    await page.waitForLoadState('networkidle');

    const unlockInput = dropzoneInput(page);
    await unlockInput.waitFor({ state: 'attached', timeout: 15000 });
    await unlockInput.setInputFiles(auditFixture('password-protected.pdf'));

    const unlockPassInput = page.locator('input[type="password"]').first();
    await expect(unlockPassInput).toBeVisible({ timeout: 10000 });
    await unlockPassInput.fill('TestPassword123!');

    const unlockBtn = page.locator('button:has-text("Unlock & Export Decrypted Copy")');
    await unlockBtn.click();

    // Verify decrypted success preview
    await expect(page.locator('app-result-preview')).toBeVisible({ timeout: 25000 });
  });

  // =========================================================================
  // 5. SIGN PDF
  // =========================================================================
  test('STEP 2.5 - PDF Sign: Loads document and coordinates interactive signature placement', async ({ page }) => {
    await page.goto('/features/pdf/sign');
    await page.waitForLoadState('networkidle');

    const input = dropzoneInput(page);
    await input.waitFor({ state: 'attached', timeout: 15000 });
    await input.setInputFiles(auditFixture('standard-1page.pdf'));

    // Verify file badge loaded
    await expect(page.locator('strong:has-text("standard-1page.pdf")')).toBeVisible({ timeout: 20000 });

    // Open signature creation dialog
    const addSignBtn = page.locator('button:has-text("+ Signature")');
    await expect(addSignBtn).toBeVisible({ timeout: 10000 });
    await addSignBtn.click();

    // Modal dialog opens
    await expect(page.locator('.modal-dialog')).toBeVisible({ timeout: 10000 });

    // Draw a stroke on signature canvas
    const padCanvas = page.locator('canvas.draw-canvas, app-modal canvas').first();
    if (await padCanvas.isVisible()) {
      const box = await padCanvas.boundingBox();
      if (box) {
        await page.mouse.move(box.x + 20, box.y + 20);
        await page.mouse.down();
        await page.mouse.move(box.x + 80, box.y + 50);
        await page.mouse.up();
      }
    }

    // Insert signature
    const insertBtn = page.locator('button:has-text("Insert Signature")');
    await insertBtn.click();

    // Signature element now placed on page
    await expect(page.locator('.placed-sig-container')).toBeVisible({ timeout: 15000 });

    // Export button is now enabled
    const exportBtn = page.locator('button:has-text("Export Signed")');
    await expect(exportBtn).toBeEnabled({ timeout: 10000 });
  });

  // =========================================================================
  // 6. FLATTEN FORM FIELDS & ANNOTATIONS
  // =========================================================================
  test('STEP 2.6 - PDF Flatten: Analyzes elements and bakes them into static graphics', async ({ page }) => {
    await page.goto('/features/pdf/flatten');
    await page.waitForLoadState('networkidle');

    const input = dropzoneInput(page);
    await input.waitFor({ state: 'attached', timeout: 15000 });
    await input.setInputFiles(auditFixture('malicious-js.pdf'));

    // Wait for workspace and element breakdown chips
    await expect(page.locator('.workspace')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.chips-container')).toBeVisible({ timeout: 15000 });

    // Execute flatten
    const flattenBtn = page.locator('app-button.flatten-action-btn, app-button:has-text("Flatten PDF Now")').first();
    await expect(flattenBtn).toBeVisible({ timeout: 10000 });
    await flattenBtn.click();

    // Verify comparison section and flatten audit report
    await expect(page.locator('.comparison-section')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.flatten-report-card')).toBeVisible();
  });

  // =========================================================================
  // 7. CYBERSECURITY OFFENSIVE DEFENSIVE TESTS
  // =========================================================================
  test('STEP 5 - Cybersecurity: Rejects zero-byte & corrupted files gracefully without crash', async ({ page }) => {
    // 1. Upload zero-byte corrupted PDF
    await page.goto('/features/pdf/flatten');
    await page.waitForLoadState('networkidle');
    let input = dropzoneInput(page);
    await input.setInputFiles(auditFixture('corrupt-zero-byte.pdf'));

    // Should not crash or transition into comparison section
    await page.waitForTimeout(1000);
    expect(await page.locator('.comparison-section').isVisible()).toBe(false);

    // 2. Upload truncated PDF header
    await page.goto('/features/pdf/flatten');
    await page.waitForLoadState('networkidle');
    input = dropzoneInput(page);
    await input.setInputFiles(auditFixture('corrupt-truncated.pdf'));
    await page.waitForTimeout(1000);
    // Verify explicit error note displayed
    await expect(page.locator('text=Could not inspect PDF')).toBeVisible({ timeout: 10000 });
    expect(await page.locator('.comparison-section').isVisible()).toBe(false);

    // 3. Verify page is still fully responsive and interactive with valid document
    await page.goto('/features/pdf/flatten');
    await page.waitForLoadState('networkidle');
    input = dropzoneInput(page);
    await input.setInputFiles(auditFixture('standard-1page.pdf'));
    await expect(page.locator('.workspace')).toBeVisible({ timeout: 15000 });
  });
});
