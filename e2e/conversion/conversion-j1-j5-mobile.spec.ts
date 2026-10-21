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

// Emulate modern mobile device (Pixel 5 / iPhone 14 mobile viewport: 390x844)
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true
});

test.describe('Part J: Advanced Document Converters (J1 to J5) — Mobile Viewport & Play Store Readiness', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('J Hub: Conversion Hub mobile view & format navigation', async ({ page }) => {
    await page.goto('/features/pdf/conversion');
    await expect(page).toHaveURL(/.*features\/pdf\/conversion$/);
    await assertNoHorizontalOverflow(page);

    // Verify header and 24+ formats badge
    const header = page.locator('app-page-header');
    await expect(header).toBeVisible();

    // Verify search input has touch target >= 44px
    const searchInput = page.locator('.search-input');
    await expect(searchInput).toBeVisible();
    const searchBox = await searchInput.boundingBox();
    expect(searchBox?.height).toBeGreaterThanOrEqual(40);

    // Verify converter cards are present
    const cards = page.locator('.converter-card');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(20);

    // Test search filtering on mobile
    await searchInput.fill('Markdown');
    await page.waitForTimeout(300);
    const filteredCount = await cards.count();
    expect(filteredCount).toBeGreaterThanOrEqual(1);

    // Clear search
    await searchInput.fill('');
    await page.waitForTimeout(300);

    await saveScreenshot(page, 'j-conversion-hub-mobile.png');
  });

  test('J1: PDF to Markdown mobile workflow & image options', async ({ page }) => {
    await page.goto('/features/pdf/conversion/pdf-to-markdown');
    await expect(page).toHaveURL(/.*features\/pdf\/conversion\/pdf-to-markdown/);
    await assertNoHorizontalOverflow(page);

    // Upload text.pdf
    const fileInput = page.locator('input[type="file"]');
    const testPdfPath = path.resolve(__dirname, '../test-data/pdf/text.pdf');
    await fileInput.setInputFiles(testPdfPath);

    // Config options should be displayed
    await expect(page.locator('.config-card')).toBeVisible();
    await assertNoHorizontalOverflow(page);

    // Check Image Extraction Mode dropdown
    const imageSelect = page.locator('select.field-select').first();
    await expect(imageSelect).toBeVisible();
    await imageSelect.selectOption('inline');
    await saveScreenshot(page, 'j1-pdf-to-markdown-options-mobile.png');

    // Start conversion
    const convertBtn = page.getByRole('button', { name: /start conversion/i });
    await expect(convertBtn).toBeVisible();
    await convertBtn.click();

    // Result card verification
    await expect(page.locator('.result-card')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Conversion Successful!')).toBeVisible();
    await expect(page.getByRole('button', { name: /save (md|markdown)/i })).toBeVisible();

    await saveScreenshot(page, 'j1-pdf-to-markdown-mobile.png');
  });

  test('J2: PDF to HTML mobile workflow & reflowable mode', async ({ page }) => {
    await page.goto('/features/pdf/conversion/pdf-to-html');
    await expect(page).toHaveURL(/.*features\/pdf\/conversion\/pdf-to-html/);
    await assertNoHorizontalOverflow(page);

    // Upload text.pdf
    const fileInput = page.locator('input[type="file"]');
    const testPdfPath = path.resolve(__dirname, '../test-data/pdf/text.pdf');
    await fileInput.setInputFiles(testPdfPath);

    // Verify HTML Rendering Mode select
    const htmlModeSelect = page.locator('select.field-select').first();
    await expect(htmlModeSelect).toBeVisible();
    await htmlModeSelect.selectOption('reflowable');
    await saveScreenshot(page, 'j2-pdf-to-html-options-mobile.png');

    // Start conversion
    const convertBtn = page.getByRole('button', { name: /start conversion/i });
    await convertBtn.click();

    // Result card verification
    await expect(page.locator('.result-card')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Conversion Successful!')).toBeVisible();
    await expect(page.getByRole('button', { name: /save html/i })).toBeVisible();

    await saveScreenshot(page, 'j2-pdf-to-html-mobile.png');
  });

  test('J3: PDF to EPUB mobile workflow & packaging', async ({ page }) => {
    await page.goto('/features/pdf/conversion/pdf-to-epub');
    await expect(page).toHaveURL(/.*features\/pdf\/conversion\/pdf-to-epub/);
    await assertNoHorizontalOverflow(page);

    // Upload text.pdf
    const fileInput = page.locator('input[type="file"]');
    const testPdfPath = path.resolve(__dirname, '../test-data/pdf/text.pdf');
    await fileInput.setInputFiles(testPdfPath);
    await saveScreenshot(page, 'j3-pdf-to-epub-options-mobile.png');

    // Start conversion
    const convertBtn = page.getByRole('button', { name: /start conversion/i });
    await convertBtn.click();

    // Result card verification
    await expect(page.locator('.result-card')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Conversion Successful!')).toBeVisible();
    await expect(page.getByRole('button', { name: /save epub/i })).toBeVisible();

    await saveScreenshot(page, 'j3-pdf-to-epub-mobile.png');
  });

  test('J4: JSON to PDF mobile workflow & code layout options', async ({ page }) => {
    await page.goto('/features/pdf/conversion/json-to-pdf');
    await expect(page).toHaveURL(/.*features\/pdf\/conversion\/json-to-pdf/);
    await assertNoHorizontalOverflow(page);

    // Upload sample.json
    const fileInput = page.locator('input[type="file"]');
    const testJsonPath = path.resolve(__dirname, '../test-data/conversion/sample.json');
    await fileInput.setInputFiles(testJsonPath);

    // Options inspection
    await expect(page.locator('.config-card')).toBeVisible();
    const orientationSelect = page.locator('select.field-select').nth(1);
    await expect(orientationSelect).toBeVisible();
    await saveScreenshot(page, 'j4-json-to-pdf-options-mobile.png');

    // Start conversion
    const convertBtn = page.getByRole('button', { name: /start conversion/i });
    await convertBtn.click();

    // Result card verification
    await expect(page.locator('.result-card')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Conversion Successful!')).toBeVisible();
    await expect(page.getByRole('button', { name: /save pdf/i })).toBeVisible();

    await saveScreenshot(page, 'j4-json-to-pdf-mobile.png');
  });

  test('J5: EML to PDF mobile workflow & attachment processing', async ({ page }) => {
    await page.goto('/features/pdf/conversion/eml-to-pdf');
    await expect(page).toHaveURL(/.*features\/pdf\/conversion\/eml-to-pdf/);
    await assertNoHorizontalOverflow(page);

    // Upload sample.eml
    const fileInput = page.locator('input[type="file"]');
    const testEmlPath = path.resolve(__dirname, '../test-data/conversion/sample.eml');
    await fileInput.setInputFiles(testEmlPath);

    // Check options
    await expect(page.locator('.config-card')).toBeVisible();
    await expect(page.getByText('Process Attachments')).toBeVisible();
    await saveScreenshot(page, 'j5-eml-to-pdf-options-mobile.png');

    // Start conversion
    const convertBtn = page.getByRole('button', { name: /start conversion/i });
    await convertBtn.click();

    // Result card verification
    await expect(page.locator('.result-card')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Conversion Successful!')).toBeVisible();
    await expect(page.getByRole('button', { name: /save pdf/i })).toBeVisible();

    await saveScreenshot(page, 'j5-eml-to-pdf-mobile.png');
  });
});
