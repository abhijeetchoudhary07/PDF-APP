import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone
} from '../../common/phase2-helpers';

test.describe('Header / Footer Studio — Header & Footer Inputs & Tags @phase2 @header-footer', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-header-footer');
    const pdfPath = getPhase2FixturePath('hf-1page-portrait.pdf');
    await uploadFileToDropzone(page, pdfPath);
    await expect(page.locator('.configure-section')).toBeVisible({ timeout: 15000 });
  });

  /*
   * Scoped to the panel, not `.input-group input.form-input` `.nth(n)`.
   *
   * The header and footer field sets are mutually exclusive `@if` blocks that
   * use identical class names, so a bare `nth(0)` taken right after the tab
   * click could still resolve against the outgoing footer panel: `fill` wrote
   * into an input that was then destroyed, and the re-resolved locator read
   * back "". That lost roughly one full parallel run in three while passing
   * every time the spec was run on its own.
   */
  test('HF-010: Enter static text in header and footer inputs', async ({ page }) => {
    const footerFields = page.locator('[data-testid="footer-fields"]');
    await expect(footerFields).toBeVisible();

    const footerCenterInput = footerFields.locator('input.form-input').nth(1);
    await footerCenterInput.fill('Confidential Document');
    await expect(footerCenterInput).toHaveValue('Confidential Document');

    const headerTab = page.locator('.controls-panel app-tabs button').filter({ hasText: /header|शीर्षलेख/i });
    await headerTab.click();

    // Wait for the swap rather than racing it.
    const headerFields = page.locator('[data-testid="header-fields"]');
    await expect(headerFields).toBeVisible();
    await expect(footerFields).toBeHidden();

    const headerLeftInput = headerFields.locator('input.form-input').nth(0);
    await headerLeftInput.fill('Department of Operations');
    await expect(headerLeftInput).toHaveValue('Department of Operations');

    // The footer text survives the round trip rather than being reset.
    await page.locator('.controls-panel app-tabs button').filter({ hasText: /footer|पादलेख/i }).click();
    await expect(footerFields).toBeVisible();
    await expect(footerFields.locator('input.form-input').nth(1)).toHaveValue('Confidential Document');
  });

  test('HF-011: Insert dynamic variable chips into input fields', async ({ page }) => {
    // Click '{page}' chip
    const pageChip = page.locator('.tag-chip').filter({ hasText: '{page}' });
    await pageChip.click();

    // Click '{totalPages}' chip
    const totalPagesChip = page.locator('.tag-chip').filter({ hasText: '{totalPages}' });
    await totalPagesChip.click();

    // Center input should now contain the tags
    const centerInput = page.locator('[data-testid="footer-fields"] input.form-input').nth(1);
    const val = await centerInput.inputValue();
    expect(val).toContain('{page}');
    expect(val).toContain('{totalPages}');
  });
});
