import { test, expect } from '@playwright/test';
import { setupCapacitorMocks, getTestDataPath } from '../fixtures/mocks';
import { importScannedPage, pageAction } from './scanner-helpers';
import * as path from 'path';

const SCREENSHOT_DIR = '/Users/abhijeetchoudhary/.gemini/antigravity/brain/6c277237-b8c8-4ed9-8dc0-900715274678/screenshots';

test.describe('Document Scanner — Mobile Experience & Play Store Screenshots', () => {
  test.use({ viewport: { width: 393, height: 851 } }); // Pixel 5 / Modern mobile viewport

  test('Capture complete mobile workflow screenshots', async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/document-scanner');

    // 1. Mobile Empty State with Horizontal Mode Selector
    await expect(page.locator('.capture-start-card')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.mode-pills-bar')).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-mobile-empty-scanner.png'), fullPage: true });

    // 2. ID Card Mode Guidance
    const idCardBtn = page.locator('.mode-pill').filter({ hasText: /ID Card/i });
    if (await idCardBtn.isVisible()) {
      await idCardBtn.click();
      await expect(page.locator('.id-card-guide')).toBeVisible({ timeout: 5000 });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-mobile-id-card-mode.png'), fullPage: true });
    }

    // 3. Book Mode Guidance
    const bookBtn = page.locator('.mode-pill').filter({ hasText: /Book/i });
    if (await bookBtn.isVisible()) {
      await bookBtn.click();
      await expect(page.locator('.book-guide')).toBeVisible({ timeout: 5000 });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-mobile-book-mode.png'), fullPage: true });
    }

    // Switch back to Document mode for clean import
    const docBtn = page.locator('.mode-pill').filter({ hasText: /Document/i });
    if (await docBtn.isVisible()) {
      await docBtn.click();
    }

    // 4. Import document and capture Crop Screen
    const chooser = page.waitForEvent('filechooser');
    await page.locator('app-button[data-testid="import-gallery"] button').click();
    await (await chooser).setFiles(getTestDataPath('scanner/clean-document.jpg'));

    // If blur alert appears, capture it and then keep anyway
    const blurAlert = page.locator('.blur-alert-card');
    if (await blurAlert.isVisible({ timeout: 4000 }).catch(() => false)) {
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03b-mobile-blur-warning.png'), fullPage: false });
      const keepBtn = blurAlert.locator('app-button').filter({ hasText: /Keep/i });
      if (await keepBtn.isVisible()) {
        await keepBtn.click();
      }
    }

    await expect(page.locator('.crop-card canvas.interactive-crop-canvas')).toBeVisible({ timeout: 15000 });
    await page.locator('.crop-card').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-mobile-crop-screen.png'), fullPage: false });

    // Apply crop to land on Pages Dashboard
    await page.locator('app-button[data-testid="apply-crop"] button').click();
    await expect(page.locator('.pages-dashboard-card')).toBeVisible({ timeout: 15000 });

    // 5. Mobile Pages Dashboard (with Sharpness Chip, Feature Chips, Editable Document Title, and PDF Options)
    await expect(page.locator('.page-card')).toBeVisible();
    await expect(page.locator('.doc-naming-section')).toBeVisible();
    await page.locator('.pages-dashboard-card').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-mobile-pages-dashboard.png'), fullPage: false });

    // 6. Enhancement Studio Screen
    await pageAction(page, 0, 'page-enhance').click();
    await expect(page.locator('.enhance-card')).toBeVisible({ timeout: 15000 });
    await page.locator('.enhance-card').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06-mobile-enhance-studio.png'), fullPage: false });

    // Apply enhancement and return
    await page.locator('app-button[data-testid="done-enhancing"] button').click();
    await expect(page.locator('.pages-dashboard-card')).toBeVisible({ timeout: 15000 });

    // 7. Generate PDF and capture PDF Ready Screen
    await page.locator('app-button[data-testid="generate-pdf"] button').click();
    await expect(page.locator('.pdf-ready-card')).toBeVisible({ timeout: 20000 });
    await page.locator('.pdf-ready-card').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07-mobile-pdf-ready-ocr-handoff.png'), fullPage: false });
  });
});
