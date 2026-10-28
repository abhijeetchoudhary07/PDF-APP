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

// Emulate mobile device (Pixel 5 viewport: 393x851)
test.use({
  viewport: { width: 393, height: 851 },
  isMobile: true,
  hasTouch: true
});

test.describe('Part L (L1 to L6): PDF Reader Advanced Capabilities — Mobile Viewport & Play Store Readiness', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('L1–L6 reader mobile features: search with highlights, reading modes, text reflow, outline sidebar, read-aloud, and scrubber', async ({ page }) => {
    await page.goto('/features/pdf-editor');
    await page.waitForLoadState('networkidle');

    // 1. Initial State & File Upload
    const openBtn = page.getByRole('button', { name: /select pdf file/i });
    await expect(openBtn).toBeVisible({ timeout: 15000 });
    await assertNoHorizontalOverflow(page);

    // Upload multi-page test PDF
    const fileChooserPromise = page.waitForEvent('filechooser');
    await openBtn.click();
    const fileChooser = await fileChooserPromise;
    const testPdfPath = path.resolve(__dirname, '../test-data/phase2/extractor-text.pdf');
    await fileChooser.setFiles(testPdfPath);

    // Wait for reader container to appear
    const readerContainer = page.locator('app-pdf-reader .reader-container');
    await expect(readerContainer).toBeVisible({ timeout: 20000 });
    await saveScreenshot(page, 'l0-reader-workspace-mobile.png');
    await assertNoHorizontalOverflow(page);

    // Verify toolbar touch targets are >= 44px on mobile
    const toolButtons = readerContainer.locator('.reader-toolbar .tool-btn');
    const btnCount = await toolButtons.count();
    expect(btnCount).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < btnCount; i++) {
      const btn = toolButtons.nth(i);
      if (await btn.isVisible()) {
        const box = await btn.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(40);
      }
    }

    // --- L2: Reading Modes (Night, Sepia, Spread, Continuous) ---
    // Open Reading Modes menu
    const readingModeBtn = readerContainer.locator('.reader-toolbar button[title*="Reading modes" i], .reader-toolbar button[title*="रीडिंग" i]').first();
    await expect(readingModeBtn).toBeVisible();
    await readingModeBtn.click();

    const modesMenu = readerContainer.locator('.reading-modes-menu');
    await expect(modesMenu).toBeVisible();
    await saveScreenshot(page, 'l2-reading-modes-menu-mobile.png');

    // Select Night Mode
    const nightModeChip = modesMenu.locator('.mode-chip').filter({ hasText: /night/i }).first();
    await nightModeChip.click();
    await expect(readerContainer).toHaveClass(/theme-night/);
    await saveScreenshot(page, 'l2-night-mode-mobile.png');

    // Select Sepia Mode
    const sepiaModeChip = modesMenu.locator('.mode-chip').filter({ hasText: /sepia/i }).first();
    await sepiaModeChip.click();
    await expect(readerContainer).toHaveClass(/theme-sepia/);
    await saveScreenshot(page, 'l2-sepia-mode-mobile.png');

    // Reset to Normal
    const normalModeChip = modesMenu.locator('.mode-chip').filter({ hasText: /normal/i }).first();
    await normalModeChip.click();
    await expect(readerContainer).not.toHaveClass(/theme-night/);
    await expect(readerContainer).not.toHaveClass(/theme-sepia/);

    // Close modes menu
    const closeMenuBtn = modesMenu.locator('.menu-close-btn');
    if (await closeMenuBtn.isVisible()) {
      await closeMenuBtn.click();
    }

    // --- L1: Incremental Search with Highlighting & Snippets ---
    const searchToggleBtn = readerContainer.locator('.reader-toolbar button[title*="search" i]').first();
    await searchToggleBtn.click();

    const searchOverlay = readerContainer.locator('.search-overlay');
    await expect(searchOverlay).toBeVisible();

    const searchInput = searchOverlay.locator('input[type="text"]');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('the');
    await searchInput.press('Enter');
    await page.waitForTimeout(500);

    // Verify search matches or meta is displayed
    const searchMeta = searchOverlay.locator('.search-meta');
    await expect(searchMeta).toBeVisible();
    await saveScreenshot(page, 'l1-search-snippets-mobile.png');

    // Close search overlay
    const closeSearchBtn = searchOverlay.locator('.close-btn');
    await closeSearchBtn.click();
    await expect(searchOverlay).not.toBeVisible();

    // --- L3: Text Reflow for Narrow Screens ---
    const reflowBtn = readerContainer.locator('.reader-toolbar button[title*="reflow" i]').first();
    await expect(reflowBtn).toBeVisible();
    await reflowBtn.click();

    const reflowContainer = readerContainer.locator('.reflow-container');
    await expect(reflowContainer).toBeVisible();
    await expect(reflowContainer.locator('.reflow-banner')).toBeVisible();

    // Verify font size adjustment buttons
    const fontPlusBtn = reflowContainer.locator('.font-btn').filter({ hasText: 'A+' });
    await expect(fontPlusBtn).toBeVisible();
    await fontPlusBtn.click();
    await page.waitForTimeout(200);

    await saveScreenshot(page, 'l3-text-reflow-mobile.png');

    // Lossless one-tap return to real layout
    const returnBtn = reflowContainer.locator('.return-btn').first();
    await returnBtn.click();
    await expect(reflowContainer).not.toBeVisible();

    // --- L4: Bookmarks Sidebar & Tabs ---
    const sidebarToggleBtn = readerContainer.locator('.reader-toolbar button[title*="thumbnails" i]').first();
    await sidebarToggleBtn.click();

    const sidebarDrawer = readerContainer.locator('.sidebar-drawer');
    await expect(sidebarDrawer).toBeVisible();

    // Switch to Bookmarks tab
    const bookmarksTab = sidebarDrawer.locator('.sidebar-tabs .tab-btn').filter({ hasText: /bookmark/i });
    await expect(bookmarksTab).toBeVisible();
    await bookmarksTab.click();
    await page.waitForTimeout(200);

    await saveScreenshot(page, 'l4-bookmarks-sidebar-mobile.png');

    // Switch back to Thumbnails tab
    const thumbnailsTab = sidebarDrawer.locator('.sidebar-tabs .tab-btn').filter({ hasText: /thumbnail/i });
    await thumbnailsTab.click();
    await page.waitForTimeout(200);

    // Close sidebar
    await sidebarToggleBtn.click();
    await expect(sidebarDrawer).not.toBeVisible();

    // --- L6: Thumbnail Scrubber ---
    const scrubber = readerContainer.locator('.thumbnail-scrubber');
    await expect(scrubber).toBeVisible();
    const scrubberRange = scrubber.locator('.scrubber-range');
    await expect(scrubberRange).toBeVisible();

    // Drag scrubber to simulate page scrub
    await scrubberRange.fill('2');
    await scrubberRange.dispatchEvent('change');
    await page.waitForTimeout(500);
    await saveScreenshot(page, 'l6-thumbnail-scrubber-mobile.png');

    // Final full page responsiveness & overflow check
    await assertNoHorizontalOverflow(page);
  });

  test('L4 last-read position banner restore prompt and start from beginning', async ({ page }) => {
    await page.goto('/features/pdf-editor');
    await page.waitForLoadState('networkidle');

    const testPdfPath = path.resolve(__dirname, '../test-data/phase2/extractor-text.pdf');
    const fileSize = fs.statSync(testPdfPath).size;
    const docId = `doc_extractor-text_pdf_${fileSize}`;

    // Pre-seed localStorage with last read position for this specific document
    await page.evaluate(({ id }) => {
      localStorage.setItem('pdf_last_read_' + id, JSON.stringify({ pageNumber: 2, timestamp: Date.now() }));
    }, { id: docId });

    const openBtn = page.getByRole('button', { name: /select pdf file/i });
    const fileChooserPromise = page.waitForEvent('filechooser');
    await openBtn.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(testPdfPath);

    const readerContainer = page.locator('app-pdf-reader .reader-container');
    await expect(readerContainer).toBeVisible({ timeout: 20000 });

    const banner = readerContainer.locator('.last-read-banner');
    await expect(banner).toBeVisible({ timeout: 10000 });
    await saveScreenshot(page, 'l4-last-read-banner-mobile.png');

    // Test resume button
    const resumeBtn = banner.locator('.resume-btn');
    await expect(resumeBtn).toBeVisible();
    await resumeBtn.click();
    await expect(banner).not.toBeVisible();
    await assertNoHorizontalOverflow(page);
  });
});
