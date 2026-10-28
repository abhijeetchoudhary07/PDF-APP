import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';
import * as path from 'path';
import * as fs from 'fs';

const ARTIFACT_DIR = '/Users/abhijeetchoudhary/.gemini/antigravity/brain/b0310ffa-21ad-4050-9557-663db9c1939e';
const LOCAL_SCREENSHOT_DIR = path.resolve(__dirname, '../../screenshots/mobile');

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

// Emulate modern mobile device (Pixel 5 / iPhone 14 viewport: 390x844)
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true
});

test.describe('Part J (J6 to J11): Advanced Converters & Batch Suite — Mobile Viewport & Play Store Readiness', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('J6: Images to Word mobile workflow with embed photo option', async ({ page }) => {
    await page.goto('/features/pdf/conversion/images-to-word');
    await expect(page).toHaveURL(/.*features\/pdf\/conversion\/images-to-word/);
    await assertNoHorizontalOverflow(page);

    // Verify touch target for dropzone browse button
    const selectBtn = page.getByRole('button', { name: /browse file/i });
    await expect(selectBtn).toBeVisible();
    const btnBox = await selectBtn.boundingBox();
    expect(btnBox?.height).toBeGreaterThanOrEqual(40);

    // Upload image
    const fileInput = page.locator('input[type="file"]');
    const photoPath = path.resolve(__dirname, '../test-data/photos/valid-photo.jpg');
    await fileInput.setInputFiles(photoPath);

    // Verify config card appeared
    await expect(page.locator('.config-card')).toBeVisible();
    await assertNoHorizontalOverflow(page);

    // Check embed photo checkbox via touch row
    const embedRow = page.locator('.checkbox-row').first();
    await expect(embedRow).toBeVisible();
    await embedRow.click();

    await saveScreenshot(page, 'j6-images-to-word-mobile.png');
  });

  test('J6: Images to Excel mobile workflow', async ({ page }) => {
    await page.goto('/features/pdf/conversion/images-to-excel');
    await expect(page).toHaveURL(/.*features\/pdf\/conversion\/images-to-excel/);
    await assertNoHorizontalOverflow(page);

    const fileInput = page.locator('input[type="file"]');
    const photoPath = path.resolve(__dirname, '../test-data/photos/valid-photo.jpg');
    await fileInput.setInputFiles(photoPath);

    await expect(page.locator('.config-card')).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await saveScreenshot(page, 'j6-images-to-excel-mobile.png');
  });

  test('J7: PDF to Multi-Page TIFF mobile workflow with DPI & compression options', async ({ page }) => {
    await page.goto('/features/pdf/conversion/pdf-to-tiff');
    await expect(page).toHaveURL(/.*features\/pdf\/conversion\/pdf-to-tiff/);
    await assertNoHorizontalOverflow(page);

    const fileInput = page.locator('input[type="file"]');
    const pdfPath = path.resolve(__dirname, '../test-data/pdf/text.pdf');
    await fileInput.setInputFiles(pdfPath);

    await expect(page.locator('.config-card')).toBeVisible();

    // Verify DPI select. The options bind numbers with [ngValue], so their
    // values are Angular's own ids; pick it the way a person does, by label.
    const dpiSelect = page.locator('select.field-select').first();
    await expect(dpiSelect).toBeVisible();
    await dpiSelect.selectOption({ label: 'High Quality (150 DPI)' });

    // Verify Compression select (G4 bilevel, LZW, none)
    const compSelect = page.locator('select.field-select').nth(1);
    await expect(compSelect).toBeVisible();
    await compSelect.selectOption('g4');

    await assertNoHorizontalOverflow(page);
    await saveScreenshot(page, 'j7-pdf-to-tiff-mobile.png');
  });

  test('J7: TIFF to PDF mobile workflow', async ({ page }) => {
    await page.goto('/features/pdf/conversion/tiff-to-pdf');
    await expect(page).toHaveURL(/.*features\/pdf\/conversion\/tiff-to-pdf/);
    await assertNoHorizontalOverflow(page);

    const selectBtn = page.getByRole('button', { name: /browse file/i });
    await expect(selectBtn).toBeVisible();

    await saveScreenshot(page, 'j7-tiff-to-pdf-mobile.png');
  });

  test('J8: SVG to PDF vector conversion mobile workflow', async ({ page }) => {
    await page.goto('/features/pdf/conversion/svg-to-pdf');
    await expect(page).toHaveURL(/.*features\/pdf\/conversion\/svg-to-pdf/);
    await assertNoHorizontalOverflow(page);

    const fileInput = page.locator('input[type="file"]');
    const svgPath = path.resolve(__dirname, '../test-data/conversion/sample.svg');
    await fileInput.setInputFiles(svgPath);

    await expect(page.locator('.config-card')).toBeVisible();

    // Start conversion
    const convertBtn = page.getByRole('button', { name: /start conversion/i });
    await convertBtn.click();

    // Wait for result card
    await expect(page.locator('.result-card')).toBeVisible({ timeout: 10000 });
    await assertNoHorizontalOverflow(page);

    await saveScreenshot(page, 'j8-svg-to-pdf-mobile.png');
  });

  test('J8: PDF to SVG mobile workflow', async ({ page }) => {
    await page.goto('/features/pdf/conversion/pdf-to-svg');
    await expect(page).toHaveURL(/.*features\/pdf\/conversion\/pdf-to-svg/);
    await assertNoHorizontalOverflow(page);

    const fileInput = page.locator('input[type="file"]');
    const pdfPath = path.resolve(__dirname, '../test-data/pdf/text.pdf');
    await fileInput.setInputFiles(pdfPath);

    await expect(page.locator('.config-card')).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await saveScreenshot(page, 'j8-pdf-to-svg-mobile.png');
  });

  test('J9: PDF to Structured JSON with compact mode', async ({ page }) => {
    await page.goto('/features/pdf/conversion/pdf-to-json');
    await expect(page).toHaveURL(/.*features\/pdf\/conversion\/pdf-to-json/);
    await assertNoHorizontalOverflow(page);

    const fileInput = page.locator('input[type="file"]');
    const pdfPath = path.resolve(__dirname, '../test-data/pdf/text.pdf');
    await fileInput.setInputFiles(pdfPath);

    await expect(page.locator('.config-card')).toBeVisible();

    // Toggle compact mode
    const compactRow = page.locator('.checkbox-row').first();
    await expect(compactRow).toBeVisible();
    await compactRow.click();

    // Start conversion
    const convertBtn = page.getByRole('button', { name: /start conversion/i });
    await convertBtn.click();

    await expect(page.locator('.result-card')).toBeVisible({ timeout: 10000 });
    await assertNoHorizontalOverflow(page);

    await saveScreenshot(page, 'j9-pdf-to-json-mobile.png');
  });

  test('J10: Conversion Fidelity Controls & Expandable Audit Report', async ({ page }) => {
    await page.goto('/features/pdf/conversion/pdf-to-json');
    const fileInput = page.locator('input[type="file"]');
    const pdfPath = path.resolve(__dirname, '../test-data/pdf/text.pdf');
    await fileInput.setInputFiles(pdfPath);

    const convertBtn = page.getByRole('button', { name: /start conversion/i });
    await convertBtn.click();

    await expect(page.locator('.result-card')).toBeVisible({ timeout: 10000 });

    // Locate and click the expandable Fidelity Report toggle
    const fidelityToggle = page.locator('.fidelity-report-header');
    await expect(fidelityToggle).toBeVisible();

    const toggleBox = await fidelityToggle.boundingBox();
    expect(toggleBox?.height).toBeGreaterThanOrEqual(44);

    await fidelityToggle.click();
    await page.waitForTimeout(300);

    // Verify report body expanded
    const reportBody = page.locator('.fidelity-report-body');
    await expect(reportBody).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await saveScreenshot(page, 'j10-fidelity-report-mobile.png');
  });

  test('J11: Batch PDF Processing mobile suite with multi-operations & pre-run quota banner', async ({ page }) => {
    await page.goto('/features/batch-pdf');
    await expect(page).toHaveURL(/.*features\/batch-pdf$/);
    await assertNoHorizontalOverflow(page);

    // Verify header and badge
    await expect(page.locator('app-page-header')).toBeVisible();

    // Verify operation chips (7 operations)
    const chips = page.locator('.op-chip');
    expect(await chips.count()).toBe(7);

    // Verify pre-run quota banner
    const quotaBanner = page.locator('.quota-preview-banner');
    await expect(quotaBanner).toBeVisible();

    // Test switching operations: click "Protect (Encrypt)" chip specifically
    const protectChip = chips.filter({ hasText: /^Protect/ });
    await protectChip.click();
    await page.waitForTimeout(200);

    // Verify password field appears with toggle button
    const passInput = page.locator('#protectPasswordInput');
    await expect(passInput).toBeVisible();
    const toggleBtn = page.locator('.affix-btn').first();
    await expect(toggleBtn).toBeVisible();

    const toggleBox = await toggleBtn.boundingBox();
    expect(toggleBox?.height).toBeGreaterThanOrEqual(44);

    // Switch to "Rename from Content"
    const renameChip = chips.filter({ hasText: /^Rename from Content/ });
    await renameChip.click();
    await page.waitForTimeout(200);

    // Switch to "OCR Searchable PDF"
    const ocrChip = chips.filter({ hasText: /^OCR/ });
    await ocrChip.click();
    await page.waitForTimeout(200);
    const langSelect = page.locator('#ocrLangSelect');
    await expect(langSelect).toBeVisible();

    // Switch back to "Compress"
    const compressChip = chips.filter({ hasText: /^Compress/ });
    await compressChip.click();

    await assertNoHorizontalOverflow(page);
    await saveScreenshot(page, 'j11-batch-pdf-mobile.png');
  });
});
