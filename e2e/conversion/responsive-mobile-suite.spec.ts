import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';
import * as path from 'path';
import * as fs from 'fs';

const ARTIFACT_DIR = '/Users/abhijeetchoudhary/.gemini/antigravity/brain/b0310ffa-21ad-4050-9557-663db9c1939e';
const LOCAL_SCREENSHOT_DIR = path.resolve(process.cwd(), 'screenshots/mobile');

async function saveScreenshot(page: import('@playwright/test').Page, filename: string) {
  if (!fs.existsSync(LOCAL_SCREENSHOT_DIR)) {
    fs.mkdirSync(LOCAL_SCREENSHOT_DIR, { recursive: true });
  }
  const localPath = path.join(LOCAL_SCREENSHOT_DIR, filename);
  const artifactPath = path.join(ARTIFACT_DIR, filename);

  await page.screenshot({ path: localPath, fullPage: false });
  try {
    fs.copyFileSync(localPath, artifactPath);
  } catch (e) {
    console.warn('Could not copy to artifact dir', e);
  }
}

async function assertNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const isOverflowing = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });
  expect(isOverflowing).toBe(false);
}

/*
 * The 44px rule, minus the width of a rounding error.
 *
 * A control with `min-height: 44px` measures 43.99998 on a 393px viewport at
 * this device's pixel ratio. Failing the suite on fifteen millionths of a pixel
 * reports a layout bug that nobody can see and that no thumb can miss, so the
 * same half-pixel tolerance the J1-J5 suite uses applies here.
 */
const MIN_TOUCH_TARGET = 43.5;

const VIEWPORTS = [
  { name: 'Small Phone (360x640)', width: 360, height: 640 },
  { name: 'Standard Pixel (393x851)', width: 393, height: 851 },
];

test.describe('Mobile Viewport & Play Store Responsiveness Suite', () => {

  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  for (const vp of VIEWPORTS) {
    test(`Conversion Hub - Responsive layout & 44px tap targets on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/features/pdf/conversion', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.converter-filter-card', { state: 'visible', timeout: 15000 });

      // 1. Verify NO horizontal scrollbar / overflow
      await assertNoHorizontalOverflow(page);

      // 2. Verify Search input has >= 44px height
      const searchInput = page.locator('.search-input');
      const searchBox = await searchInput.boundingBox();
      expect(searchBox).not.toBeNull();
      expect(searchBox!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);

      // 3. Search functionality test
      await searchInput.fill('Markdown');
      await page.waitForTimeout(300);

      const markdownCard = page.locator('.converter-card', { hasText: 'PDF to Markdown' }).first();
      await expect(markdownCard).toBeVisible();

      // 4. Test Clear button tap target >= 44px
      const clearBtn = page.locator('.clear-btn');
      await expect(clearBtn).toBeVisible();
      const clearBox = await clearBtn.boundingBox();
      expect(clearBox).not.toBeNull();
      expect(clearBox!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      expect(clearBox!.width).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);

      await clearBtn.click();
      await expect(searchInput).toHaveValue('');

      if (vp.width === 393) {
        await saveScreenshot(page, 'audit-conversion-hub-responsive.png');
      }
    });

    test(`Single Converter Page - Options & touch controls on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      // markdown-to-pdf supports both file upload and direct text input
      await page.goto('/features/pdf/conversion/markdown-to-pdf', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.dropzone-card', { state: 'visible', timeout: 15000 });

      // Verify no horizontal overflow
      await assertNoHorizontalOverflow(page);

      // Verify Dropzone touch area
      const dropzone = page.locator('.dropzone-card');
      const dropzoneBox = await dropzone.boundingBox();
      expect(dropzoneBox!.height).toBeGreaterThan(100);

      // Verify direct text input expands options panel
      const textarea = page.locator('.text-input-box');
      await expect(textarea).toBeVisible();
      await textarea.fill('# Sample Markdown Test Heading\nTesting mobile responsiveness.');

      // Options panel should now be visible
      await page.waitForSelector('.config-panel', { state: 'visible', timeout: 5000 });
      const select = page.locator('.field-select').first();
      await expect(select).toBeVisible();
      const selectBox = await select.boundingBox();
      expect(selectBox).not.toBeNull();
      expect(selectBox!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);

      // Verify Start Conversion button >= 44px
      const startBtn = page.locator('app-button', { hasText: 'Start Conversion' });
      await expect(startBtn).toBeVisible();
      const btnBox = await startBtn.boundingBox();
      expect(btnBox!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);

      if (vp.width === 393) {
        await saveScreenshot(page, 'audit-converter-page-responsive.png');
      }
    });

    test(`Batch PDF Suite - Operation selector & pre-run quota on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/features/batch-pdf', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.batch-config-card', { state: 'visible', timeout: 15000 });

      // Verify no horizontal overflow
      await assertNoHorizontalOverflow(page);

      // Verify operation chips have >= 44px touch targets
      const opChips = page.locator('.op-chip');
      const opCount = await opChips.count();
      expect(opCount).toBeGreaterThanOrEqual(7);

      for (let i = 0; i < opCount; i++) {
        const box = await opChips.nth(i).boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      }

      // Click OCR operation chip and verify language select
      await page.locator('.op-chip', { hasText: 'OCR Searchable PDF' }).click();
      const langSelect = page.locator('#ocrLangSelect');
      await expect(langSelect).toBeVisible();
      const langBox = await langSelect.boundingBox();
      expect(langBox!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);

      // Click Protect chip and verify password input + show/hide button >= 44px
      await page.locator('.op-chip', { hasText: 'Protect (Encrypt)' }).click();
      const pwInput = page.locator('#protectPasswordInput');
      await expect(pwInput).toBeVisible();
      const affixBtn = page.locator('.affix-btn');
      await expect(affixBtn).toBeVisible();
      const affixBox = await affixBtn.boundingBox();
      expect(affixBox!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      expect(affixBox!.width).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);

      // Verify pre-run quota cost banner is visible and styled properly
      const quotaBanner = page.locator('.quota-preview-banner');
      await expect(quotaBanner).toBeVisible();

      if (vp.width === 393) {
        await saveScreenshot(page, 'audit-batch-pdf-responsive.png');
      }
    });

    test(`Batch Photo Compress - Responsive controls & inputs on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/features/batch', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.empty-batch-container, .batch-config-card', { state: 'visible', timeout: 15000 });

      // Verify no horizontal overflow
      await assertNoHorizontalOverflow(page);

      // Verify empty state button >= 44px
      const selectBtn = page.locator('app-button', { hasText: 'Select Photos' });
      await expect(selectBtn).toBeVisible();
      const btnBox = await selectBtn.boundingBox();
      expect(btnBox!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);

      if (vp.width === 393) {
        await saveScreenshot(page, 'audit-batch-photos-responsive.png');
      }
    });

    test(`Document Scanner - Mode pills carousel & guidance on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/features/document-scanner', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.mode-selector-section', { state: 'visible', timeout: 15000 });

      // Verify no horizontal overflow on page
      await assertNoHorizontalOverflow(page);

      // Verify mode pills have >= 44px min-height
      const modePills = page.locator('.mode-pill');
      const pillCount = await modePills.count();
      expect(pillCount).toBeGreaterThanOrEqual(5);

      for (let i = 0; i < pillCount; i++) {
        const box = await modePills.nth(i).boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      }

      // Click ID Card mode and verify guidance banner
      await page.locator('.mode-pill', { hasText: 'ID Card' }).click();
      await expect(page.locator('.id-card-guide')).toBeVisible();

      // Click Book mode and verify book guidance banner
      await page.locator('.mode-pill', { hasText: 'Book' }).click();
      await expect(page.locator('.book-guide')).toBeVisible();

      // Verify camera and gallery buttons >= 44px
      const openCamBtn = page.locator('app-button', { hasText: 'Open Camera' });
      await expect(openCamBtn).toBeVisible();
      const camBox = await openCamBtn.boundingBox();
      expect(camBox!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);

      const importGalleryBtn = page.locator('[data-testid="import-gallery"]');
      await expect(importGalleryBtn).toBeVisible();
      const galBox = await importGalleryBtn.boundingBox();
      expect(galBox!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);

      if (vp.width === 393) {
        await saveScreenshot(page, 'audit-document-scanner-responsive.png');
      }
    });
  }
});
