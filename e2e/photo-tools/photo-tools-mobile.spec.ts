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

test.describe('Part I Image Tools — Mobile View & Production Responsiveness (I1 to I5)', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('I1 & I2: ID Photo Studio mobile workflow and responsiveness', async ({ page }) => {
    await page.goto('/features/photo/id-photo');
    await expect(page).toHaveURL(/.*features\/photo\/id-photo/);
    await assertNoHorizontalOverflow(page);

    // Verify empty state header and dropzone
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached();
    await saveScreenshot(page, '01_id_photo_mobile_empty.png');

    // Upload test portrait photo
    const photoPath = getTestDataPath('photos/portrait-person.png');
    await fileInput.setInputFiles(photoPath);

    // Wait for canvas to render in configuring state
    await expect(page.locator('.preview-stage-card').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('canvas').first()).toBeVisible();

    // Verify preset chips are present and click one
    const presetChip = page.locator('.preset-chip').first();
    await expect(presetChip).toBeVisible();
    await presetChip.click();

    // Verify tab navigation: Switch to Background tab
    const bgTab = page.getByRole('tab', { name: /background/i });
    if (await bgTab.isVisible()) {
      await bgTab.click();
      await page.waitForTimeout(300);
    }

    // Switch to Print Sheet tab
    const sheetTab = page.getByRole('tab', { name: /sheet|print/i });
    if (await sheetTab.isVisible()) {
      await sheetTab.click();
      await page.waitForTimeout(300);
    }

    // Return to crop tab
    const cropTab = page.getByRole('tab', { name: /crop/i });
    if (await cropTab.isVisible()) {
      await cropTab.click();
      await page.waitForTimeout(300);
    }

    await saveScreenshot(page, '02_id_photo_mobile_configuring.png');

    // Trigger Generation / Processing via sticky bottom CTA
    const processBtn = page.getByRole('button', { name: /Create ID Photo/i });
    await expect(processBtn).toBeVisible();
    await processBtn.click();

    // Verify Result Preview is rendered
    await expect(page.locator('app-result-preview').first()).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(500);
    await saveScreenshot(page, '03_id_photo_mobile_result.png');
  });

  test('I3: Face & Plate Blur mobile workflow and responsiveness', async ({ page }) => {
    await page.goto('/features/photo/blur');
    await expect(page).toHaveURL(/.*features\/photo\/blur/);
    await assertNoHorizontalOverflow(page);

    // Check empty state
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached();
    await saveScreenshot(page, '04_photo_blur_mobile_empty.png');

    // Upload photo
    await fileInput.setInputFiles(getTestDataPath('photos/portrait-person.png'));

    // Wait for configuring canvas stage and warning banner
    await expect(page.locator('.irreversible-warning-banner').first()).toBeVisible({ timeout: 15000 });
    const canvas = page.locator('.interactive-canvas').first();
    await expect(canvas).toBeVisible();
    await assertNoHorizontalOverflow(page);

    // Switch mode to Pixelate
    const pixelateBtn = page.getByRole('button', { name: /pixelate/i });
    if (await pixelateBtn.isVisible()) {
      await pixelateBtn.click();
      await page.waitForTimeout(200);
    }

    // Draw a redaction region on the canvas via PointerEvents
    await canvas.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const x1 = rect.left + 40;
      const y1 = rect.top + 40;
      const x2 = rect.left + 160;
      const y2 = rect.top + 160;

      node.dispatchEvent(new PointerEvent('pointerdown', { clientX: x1, clientY: y1, bubbles: true }));
      node.dispatchEvent(new PointerEvent('pointermove', { clientX: x2, clientY: y2, bubbles: true }));
      node.dispatchEvent(new PointerEvent('pointerup', { clientX: x2, clientY: y2, bubbles: true }));
    });
    await page.waitForTimeout(400);

    await assertNoHorizontalOverflow(page);
    await saveScreenshot(page, '05_photo_blur_mobile_configuring.png');

    // Apply Blur / Save using exact button text 'Export Redacted Image'
    const applyBtn = page.getByRole('button', { name: /Export Redacted Image/i });
    await expect(applyBtn).toBeVisible();
    await expect(applyBtn).toBeEnabled();
    await applyBtn.click();

    // Verify result state
    await expect(page.locator('app-result-preview').first()).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(500);
    await assertNoHorizontalOverflow(page);
    await saveScreenshot(page, '06_photo_blur_mobile_result.png');
  });

  test('I4: Document Background Cutout mobile workflow and responsiveness', async ({ page }) => {
    await page.goto('/features/photo/cutout');
    await expect(page).toHaveURL(/.*features\/photo\/cutout/);
    await assertNoHorizontalOverflow(page);

    // Check empty state
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached();
    await saveScreenshot(page, '07_photo_cutout_mobile_empty.png');

    // Upload signature document
    await fileInput.setInputFiles(getTestDataPath('signatures/signature-ink.png'));

    // Wait for configuring canvas with checkered preview
    await expect(page.locator('.cutout-canvas').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.status-banner').first()).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await saveScreenshot(page, '08_photo_cutout_mobile_configuring.png');

    // Process cutout using exact button text 'Export Transparent PNG'
    const cutoutBtn = page.getByRole('button', { name: /Export Transparent PNG/i });
    await expect(cutoutBtn).toBeVisible();
    await cutoutBtn.click();

    // Verify result state
    await expect(page.locator('app-result-preview').first()).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(500);
    await assertNoHorizontalOverflow(page);
    await saveScreenshot(page, '09_photo_cutout_mobile_result.png');
  });

  test('I5: Upscale & Enhance mobile workflow and responsiveness', async ({ page }) => {
    await page.goto('/features/photo/enhance');
    await expect(page).toHaveURL(/.*features\/photo\/enhance/);
    await assertNoHorizontalOverflow(page);

    // Check empty state
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached();
    await saveScreenshot(page, '10_photo_enhance_mobile_empty.png');

    // Upload test photo
    await fileInput.setInputFiles(getTestDataPath('scanner/document-scan.png'));

    // Wait for side-by-side comparison stage and disclosure card
    await expect(page.locator('.disclosure-card').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.side-by-side-card').first()).toBeVisible();
    await assertNoHorizontalOverflow(page);

    // Toggle 4x multiplier
    const btn4x = page.getByRole('button', { name: '4x' });
    if (await btn4x.isVisible()) {
      await btn4x.click();
      await page.waitForTimeout(300);
    }

    await saveScreenshot(page, '11_photo_enhance_mobile_configuring.png');

    // Process Enhance using exact button text 'Export Enhanced Image'
    const enhanceBtn = page.getByRole('button', { name: /Export Enhanced Image/i });
    await expect(enhanceBtn).toBeVisible();
    await enhanceBtn.click();

    // Verify result state
    await expect(page.locator('app-result-preview').first()).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(500);
    await assertNoHorizontalOverflow(page);
    await saveScreenshot(page, '12_photo_enhance_mobile_result.png');
  });
});
