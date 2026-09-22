import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone,
  setupErrorListener
} from '../../common/phase2-helpers';

test.describe('PDF Compare — Basic Page & File Selection @phase2 @compare', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('CMP-001: Page loads with header, dropzones, and disabled compare button', async ({ page }) => {
    const { consoleErrors } = setupErrorListener(page);
    await page.goto('/features/pdf-compare');

    await expect(page).toHaveURL(/.*features\/pdf-compare/);
    await expect(page.locator('h1.page-title, h1').first()).toBeVisible();

    // Two dropzone cards: Original & Modified
    const dropzones = page.locator('.dropzone-card');
    await expect(dropzones).toHaveCount(2);

    // Compare button is disabled before files are selected
    const compareBtn = page.locator('.action-bar-center button, button:has-text("Compare")').first();
    await expect(compareBtn).toBeVisible();
    await expect(compareBtn).toBeDisabled();

    expect(consoleErrors).toHaveLength(0);
  });

  test('CMP-002: Upload original and modified valid PDFs enables compare button', async ({ page }) => {
    await page.goto('/features/pdf-compare');

    const origPath = getPhase2FixturePath('identical-original.pdf');
    const modPath = getPhase2FixturePath('identical-modified.pdf');

    // Upload original file
    await uploadFileToDropzone(page, origPath, 0);
    await expect(page.locator('.dropzone-card').first().locator('.file-name')).toHaveText('identical-original.pdf');

    // Compare button still disabled with only 1 file
    const compareBtn = page.locator('.action-bar-center button, button:has-text("Compare")').first();
    await expect(compareBtn).toBeDisabled();

    // Upload modified file
    await uploadFileToDropzone(page, modPath, 1);
    await expect(page.locator('.dropzone-card').nth(1).locator('.file-name')).toHaveText('identical-modified.pdf');

    // Now compare button is enabled
    await expect(compareBtn).toBeEnabled();
  });

  test('CMP-003: Choose another button clears selection', async ({ page }) => {
    await page.goto('/features/pdf-compare');
    const origPath = getPhase2FixturePath('identical-original.pdf');

    await uploadFileToDropzone(page, origPath, 0);
    await expect(page.locator('.dropzone-card').first().locator('.file-name')).toBeVisible();

    // Click 'Choose another' on original card
    const chooseAnotherBtn = page.locator('.dropzone-card').first().locator('button:has-text("Choose another"), button:has-text("दूसरा चुनें")');
    await chooseAnotherBtn.click();

    // Dropzone reappears
    await expect(page.locator('.dropzone-card').first().locator('input[type="file"]')).toBeAttached();
  });

  test('CMP-004: Direct route navigation from home page', async ({ page }) => {
    await page.goto('/');
    // Check tool card navigation to pdf-compare
    const compareLink = page.locator('a[href*="/features/pdf-compare"], [routerLink*="/features/pdf-compare"]').first();
    if (await compareLink.isVisible()) {
      await compareLink.click();
      await expect(page).toHaveURL(/.*features\/pdf-compare/);
    }
  });
});
