import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';
import * as path from 'path';
import * as fs from 'fs';

const ARTIFACT_DIR = '/Users/abhijeetchoudhary/.gemini/antigravity/brain/96bc7618-aa74-48a9-a922-115e95a65de0';
const LOCAL_SCREENSHOT_DIR = path.resolve(__dirname, '../../e2e-screenshots/mobile');

async function saveScreenshot(page: import('@playwright/test').Page, filename: string) {
  if (!fs.existsSync(LOCAL_SCREENSHOT_DIR)) {
    fs.mkdirSync(LOCAL_SCREENSHOT_DIR, { recursive: true });
  }
  const localPath = path.join(LOCAL_SCREENSHOT_DIR, filename);
  const artifactPath = path.join(ARTIFACT_DIR, filename);

  await page.screenshot({ path: localPath, fullPage: true });
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

async function assertTouchTargets(page: import('@playwright/test').Page, selector: string) {
  const elements = page.locator(selector);
  const count = await elements.count();
  for (let i = 0; i < Math.min(count, 5); i++) {
    const box = await elements.nth(i).boundingBox();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(40);
    }
  }
}

// Mobile viewport matching modern smartphone (Pixel 5 / iPhone 14)
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true
});

test.describe('Part I Image Tools — Mobile View & Production Responsiveness (I6 to I10)', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('I7: Photo Metadata & Date Repair mobile workflow', async ({ page }) => {
    await page.goto('/features/photo/metadata');
    await expect(page).toHaveURL(/.*features\/photo\/metadata/);
    await assertNoHorizontalOverflow(page);

    // Empty state
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached();
    await saveScreenshot(page, '13_photo_metadata_mobile_empty.png');

    // Upload photo
    const photoPath = getTestDataPath('photos/portrait-person.png');
    await fileInput.setInputFiles(photoPath);

    // Verify metadata cards render
    await expect(page.locator('.meta-card').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.camera-card, .meta-card').first()).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await saveScreenshot(page, '14_photo_metadata_mobile_view.png');

    // Test stripping metadata
    const stripBtn = page.getByRole('button', { name: /strip all metadata/i });
    if (await stripBtn.isVisible()) {
      await assertTouchTargets(page, 'button');
      await stripBtn.click();
      await page.waitForTimeout(500);
      await assertNoHorizontalOverflow(page);
      await saveScreenshot(page, '15_photo_metadata_mobile_stripped.png');
    }
  });

  test('I8: Photo Watermarking mobile workflow and touch interaction', async ({ page }) => {
    await page.goto('/features/photo/watermark');
    await expect(page).toHaveURL(/.*features\/photo\/watermark/);
    await assertNoHorizontalOverflow(page);

    // Empty state
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached();
    await saveScreenshot(page, '16_photo_watermark_mobile_empty.png');

    // Upload photo
    const photoPath = getTestDataPath('photos/portrait-person.png');
    await fileInput.setInputFiles(photoPath);

    // Wait for live canvas preview
    await expect(page.locator('canvas.preview-canvas').first()).toBeVisible({ timeout: 15000 });
    await assertNoHorizontalOverflow(page);

    // Click presets: e.g. "Sample" or "Draft"
    const samplePreset = page.locator('.preset-chip').filter({ hasText: /sample|draft/i }).first();
    if (await samplePreset.isVisible()) {
      await assertTouchTargets(page, '.preset-chip');
      await samplePreset.click();
      await page.waitForTimeout(400);
    }

    // Switch between single anchor and tile mode
    const tileBtn = page.getByRole('button', { name: /tile/i });
    if (await tileBtn.isVisible()) {
      await tileBtn.click();
      await page.waitForTimeout(400);
    }

    await assertNoHorizontalOverflow(page);
    await saveScreenshot(page, '17_photo_watermark_mobile_configuring.png');
  });

  test('I9: Photo Sheet Layout mobile workflow and presets', async ({ page }) => {
    await page.goto('/features/photo/sheet');
    await expect(page).toHaveURL(/.*features\/photo\/sheet/);
    await assertNoHorizontalOverflow(page);

    // Empty state
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached();
    await saveScreenshot(page, '18_photo_sheet_mobile_empty.png');

    // Upload photo
    const photoPath = getTestDataPath('photos/portrait-person.png');
    await fileInput.setInputFiles(photoPath);

    // Wait for sheet preview canvas
    await expect(page.locator('canvas.sheet-preview-canvas').first()).toBeVisible({ timeout: 15000 });
    await assertNoHorizontalOverflow(page);

    // Switch paper size to 4x6
    const paper4x6 = page.locator('.paper-btn').filter({ hasText: /4 × 6/i });
    if (await paper4x6.isVisible()) {
      await assertTouchTargets(page, '.paper-btn');
      await paper4x6.click();
      await page.waitForTimeout(400);
    }

    // Switch grid preset to 2x2
    const grid2x2 = page.locator('.preset-btn').filter({ hasText: /2 × 2/i });
    if (await grid2x2.isVisible()) {
      await assertTouchTargets(page, '.preset-btn');
      await grid2x2.click();
      await page.waitForTimeout(400);
    }

    await assertNoHorizontalOverflow(page);
    await saveScreenshot(page, '19_photo_sheet_mobile_configuring.png');
  });

  test('I10: Batch Image Suite mobile additions and per-file targets', async ({ page }) => {
    await page.goto('/features/batch');
    await expect(page).toHaveURL(/.*features\/batch/);
    await assertNoHorizontalOverflow(page);

    // Verify empty state
    await expect(page.locator('.empty-batch-container')).toBeVisible();
    await saveScreenshot(page, '20_batch_image_mobile_empty.png');

    // Add photos via file picker
    const selectBtn = page.getByRole('button', { name: /select photos/i });
    await expect(selectBtn).toBeVisible();

    const p1 = getTestDataPath('photos/portrait-person.png');
    const p2 = getTestDataPath('signatures/signature-ink.png');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await selectBtn.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([p1, p2]);

    await expect(page.locator('.batch-queue-card, .queue-item').first()).toBeVisible({ timeout: 10000 });
    await assertNoHorizontalOverflow(page);
    await assertTouchTargets(page, '.token-chip, input[type="checkbox"]');
    await saveScreenshot(page, '21_batch_image_mobile_queue.png');
  });
});
