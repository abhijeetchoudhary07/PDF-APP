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

test.describe('N6 — PDF Metadata Editor E2E Suite', () => {
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

  test('E2E Flow: Upload PDF -> Edit Metadata -> Add/Remove Tags -> Set Current Time -> Save PDF', async ({ page }) => {
    // 1. Navigate to Metadata Editor
    await page.goto('/features/pdf/security/metadata');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('.hero-title')).toBeVisible({ timeout: 10000 });
    const fileInput = dropzoneInput(page);
    await fileInput.waitFor({ state: 'attached', timeout: 15000 });

    // 2. Upload sample PDF
    await fileInput.setInputFiles(auditFixture('standard-1page.pdf'));

    // Verify editor container is loaded with file info
    await expect(page.locator('.file-name')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.file-name')).toHaveText('standard-1page.pdf');
    await expect(page.locator('.xmp-sync-badge')).toBeVisible();

    // 3. Edit Title, Author, Subject
    const titleInput = page.locator('[data-testid="meta-title-input"]');
    await titleInput.fill('Enterprise Strategy 2026 (Audited)');

    const authorInput = page.locator('[data-testid="meta-author-input"]');
    await authorInput.fill('Security Compliance Officer');

    const subjectInput = page.locator('[data-testid="meta-subject-input"]');
    await subjectInput.fill('Official Enterprise System Architecture & Compliance Review');

    // 4. Add and remove keyword tag chips
    const keywordInput = page.locator('[data-testid="meta-keyword-input"]');
    const addKwBtn = page.locator('[data-testid="add-keyword-btn"]');

    await keywordInput.fill('enterprise-gov');
    await addKwBtn.click();

    await keywordInput.fill('security-audit');
    await addKwBtn.click();

    await keywordInput.fill('temporary-tag');
    await addKwBtn.click();

    // Verify 3 chips are visible
    const chips = page.locator('[data-testid="keyword-chip"]');
    await expect(chips).toHaveCount(3);

    // Remove the temporary tag chip
    const removeBtns = page.locator('[data-testid="remove-keyword-btn"]');
    await removeBtns.last().click();
    await expect(chips).toHaveCount(2);

    // 5. Set Modification Date to current time
    const nowModBtn = page.locator('[data-testid="btn-now-mod"]');
    await nowModBtn.click();
    const modDateInput = page.locator('[data-testid="meta-mod-date"]');
    const modValue = await modDateInput.inputValue();
    expect(modValue).toBeTruthy();

    // 6. Save updated PDF
    const saveBtn = page.locator('[data-testid="btn-save-meta"]');
    await saveBtn.click();

    // Verify save toast appears
    const toast = page.locator('ion-toast').last();
    await expect(toast).toBeVisible({ timeout: 10000 });
  });

  test('Side-by-Side Comparison Drawer: Highlight modified vs unchanged fields', async ({ page }) => {
    await page.goto('/features/pdf/security/metadata');
    await page.waitForLoadState('networkidle');

    const fileInput = dropzoneInput(page);
    await fileInput.setInputFiles(auditFixture('standard-1page.pdf'));
    await expect(page.locator('.file-name')).toBeVisible({ timeout: 10000 });

    // Modify Title field
    const titleInput = page.locator('[data-testid="meta-title-input"]');
    await expect(titleInput).toBeVisible({ timeout: 10000 });
    await titleInput.fill('Revised Strategic Whitepaper 2026');

    // Verify modified count badge updates
    const badge = page.locator('[data-testid="modified-count-badge"]');
    await expect(badge).toBeVisible();

    // Open comparison drawer
    const compareBtn = page.locator('[data-testid="btn-compare"]');
    await compareBtn.click();

    // Verify drawer appears
    const drawer = page.locator('[data-testid="comparison-drawer"]');
    await expect(drawer).toBeVisible({ timeout: 10000 });

    // Check that title row reflects modified state
    const titleRow = drawer.locator('[data-testid="comparison-row"]').first();
    await expect(titleRow).toHaveClass(/is-modified/);
    await expect(titleRow.locator('[data-testid="upd-val"]')).toHaveText('Revised Strategic Whitepaper 2026');

    // Close comparison drawer
    const closeBtn = page.locator('[data-testid="drawer-close-btn"]');
    await closeBtn.click();
    await expect(drawer).not.toBeVisible();
  });

  test('Quick Actions: Clear All Fields and Copy From Original restoration', async ({ page }) => {
    await page.goto('/features/pdf/security/metadata');
    await page.waitForLoadState('networkidle');

    const fileInput = dropzoneInput(page);
    await fileInput.setInputFiles(auditFixture('standard-1page.pdf'));
    await expect(page.locator('.file-name')).toBeVisible({ timeout: 10000 });

    // Populate custom title
    const titleInput = page.locator('[data-testid="meta-title-input"]');
    await expect(titleInput).toBeVisible({ timeout: 10000 });
    await titleInput.fill('Temporary Title Before Clear');

    // Click "Clear All"
    const clearBtn = page.locator('[data-testid="btn-clear-all"]');
    await clearBtn.click();

    await expect(titleInput).toHaveValue('');

    // Click "Copy From Original"
    const copyOriginalBtn = page.locator('[data-testid="btn-copy-original"]');
    await copyOriginalBtn.click();

    // Verify notification toast
    const toast = page.locator('ion-toast').last();
    await expect(toast).toBeVisible({ timeout: 10000 });
  });

  test('Route Redirection & Compatibility: /features/pdf/metadata and /features/metadata-editor', async ({ page }) => {
    // 1. Verify /features/pdf/metadata redirects cleanly
    await page.goto('/features/pdf/metadata');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/features/pdf/security/metadata');
    await expect(page.locator('.hero-title')).toBeVisible({ timeout: 10000 });

    // 2. Verify /features/metadata-editor redirects cleanly
    await page.goto('/features/metadata-editor');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/features/pdf/security/metadata');
    await expect(page.locator('.hero-title')).toBeVisible({ timeout: 10000 });
  });
});
