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

  test('HF-010: Enter static text in header and footer inputs', async ({ page }) => {
    // Footer inputs are active on default tab
    const footerCenterInput = page.locator('.input-group input.form-input').nth(1);
    await footerCenterInput.fill('Confidential Document');
    await expect(footerCenterInput).toHaveValue('Confidential Document');

    // Switch to Header tab
    const headerTab = page.locator('.controls-panel app-tabs button').filter({ hasText: /header|शीर्षलेख/i });
    await headerTab.click();

    const headerLeftInput = page.locator('.input-group input.form-input').nth(0);
    await headerLeftInput.fill('Department of Operations');
    await expect(headerLeftInput).toHaveValue('Department of Operations');
  });

  test('HF-011: Insert dynamic variable chips into input fields', async ({ page }) => {
    // Click '{page}' chip
    const pageChip = page.locator('.tag-chip').filter({ hasText: '{page}' });
    await pageChip.click();

    // Click '{totalPages}' chip
    const totalPagesChip = page.locator('.tag-chip').filter({ hasText: '{totalPages}' });
    await totalPagesChip.click();

    // Center input should now contain the tags
    const centerInput = page.locator('.input-group input.form-input').nth(1);
    const val = await centerInput.inputValue();
    expect(val).toContain('{page}');
    expect(val).toContain('{totalPages}');
  });
});
