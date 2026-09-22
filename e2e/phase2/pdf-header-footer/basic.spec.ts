import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone,
  setupErrorListener
} from '../../common/phase2-helpers';

test.describe('Header / Footer Studio — Basic Page & Navigation @phase2 @header-footer', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-header-footer');
  });

  test('HF-001: Page loads with header, dropzone, and template presets', async ({ page }) => {
    const { consoleErrors } = setupErrorListener(page);
    await expect(page).toHaveURL(/.*features\/pdf-header-footer/);
    await expect(page.locator('h1.page-title, h1').first()).toBeVisible();
    await expect(page.locator('.dropzone-wrapper')).toBeVisible();
    await expect(page.locator('.templates-showcase')).toBeVisible();
    expect(consoleErrors).toHaveLength(0);
  });

  test('HF-002: Upload valid PDF transitions to configure studio grid', async ({ page }) => {
    const pdfPath = getPhase2FixturePath('hf-1page-portrait.pdf');
    await uploadFileToDropzone(page, pdfPath);

    await expect(page.locator('.configure-section')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.studio-grid')).toBeVisible();
    await expect(page.locator('.controls-panel')).toBeVisible();
    await expect(page.locator('.preview-panel')).toBeVisible();
  });

  test('HF-003: Studio tabs allow switching between Header, Footer, Settings, and Rules', async ({ page }) => {
    const pdfPath = getPhase2FixturePath('hf-1page-portrait.pdf');
    await uploadFileToDropzone(page, pdfPath);
    await expect(page.locator('.configure-section')).toBeVisible();

    const tabs = page.locator('.controls-panel app-tabs button');
    await expect(tabs).toHaveCount(4);

    // Switch to Header tab
    await tabs.filter({ hasText: /header|शीर्षलेख/i }).click();
    await expect(page.locator('input[placeholder*="header"], label:has-text("Header"), label:has-text("शीर्षलेख")').first()).toBeVisible();

    // Switch to Typography / Settings tab
    await tabs.filter({ hasText: /settings|typography|टाइपोग्राफी/i }).click();
    await expect(page.locator('select.form-select, input.form-range').first()).toBeVisible();

    // Switch to First Page Rules tab
    await tabs.filter({ hasText: /rules|targeting|नियम/i }).click();
    await expect(page.locator('input[name="firstPageMode"]').first()).toBeVisible();
  });
});
