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

// Emulate modern mobile device (Pixel 5 viewport: 393x851)
test.use({
  viewport: { width: 393, height: 851 },
  isMobile: true,
  hasTouch: true
});

test.describe('Part K (K1 to K7): PDF Editor Advanced Capabilities — Mobile Viewport & Play Store Readiness', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('K1–K7 comprehensive mobile workflow, modals, touch targets, and responsiveness', async ({ page }) => {
    await page.goto('/features/pdf-editor');
    await page.waitForLoadState('networkidle');

    // 1. Initial Empty State & File Upload
    const openBtn = page.getByRole('button', { name: /select pdf file/i });
    await expect(openBtn).toBeVisible({ timeout: 15000 });
    await assertNoHorizontalOverflow(page);

    // Set up file chooser and upload sample PDF
    const fileChooserPromise = page.waitForEvent('filechooser');
    await openBtn.click();
    const fileChooser = await fileChooserPromise;
    const testPdfPath = path.resolve(__dirname, '../test-data/phase2/extractor-text.pdf');
    await fileChooser.setFiles(testPdfPath);

    // Wait for document to load and editor workspace to appear
    await expect(page.locator('.editor-workspace')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.mobile-footer')).toBeVisible();
    await saveScreenshot(page, 'editor-mobile-workspace.png');
    await assertNoHorizontalOverflow(page);

    // Verify touch targets of bottom main navigation tabs >= 44px
    const tabs = page.locator('.mobile-tabs-container .m-tab');
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < tabCount; i++) {
      const box = await tabs.nth(i).boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }

    // --- K1: Find & Replace Modal ---
    const toolsTab = page.locator('.mobile-tabs-container .m-tab').filter({ hasText: /tools/i });
    await toolsTab.click();
    await page.waitForTimeout(300);

    const findReplaceSubBtn = page.locator('.mobile-submenu .m-sub-btn').filter({ hasText: /find/i }).first();
    await expect(findReplaceSubBtn).toBeVisible();
    await findReplaceSubBtn.click();

    const findReplaceModal = page.locator('app-pdf-find-replace-modal');
    await expect(findReplaceModal).toBeVisible({ timeout: 10000 });
    await expect(findReplaceModal.locator('input[placeholder*="Search"]')).toBeVisible();
    await expect(findReplaceModal.locator('input[placeholder*="Replacement"]')).toBeVisible();
    await expect(findReplaceModal.locator('.scope-notice')).toBeVisible();
    await page.waitForTimeout(300);
    await saveScreenshot(page, 'k1-find-replace-mobile.png');
    await findReplaceModal.locator('.close-btn').click();
    await expect(findReplaceModal).not.toBeVisible();

    // --- K2: Hyperlink Manager Modal ---
    const linksSubBtn = page.locator('.mobile-submenu .m-sub-btn').filter({ hasText: /link/i }).first();
    await expect(linksSubBtn).toBeVisible();
    await linksSubBtn.click();

    const linkModal = page.locator('app-pdf-link-modal');
    await expect(linkModal).toBeVisible({ timeout: 10000 });
    await expect(linkModal.locator('.type-toggle')).toBeVisible();
    await expect(linkModal.locator('input[placeholder*="example.com"]')).toBeVisible();

    await page.waitForTimeout(300);
    await saveScreenshot(page, 'k2-link-editor-mobile.png');
    await linkModal.locator('.close-btn').click();
    await expect(linkModal).not.toBeVisible();

    // --- K3: Comment & Review Threads Modal ---
    const commentsSubBtn = page.locator('.mobile-submenu .m-sub-btn').filter({ hasText: /comment/i }).first();
    await expect(commentsSubBtn).toBeVisible();
    await commentsSubBtn.click();

    const commentModal = page.locator('app-pdf-comment-review-modal');
    await expect(commentModal).toBeVisible({ timeout: 10000 });
    await expect(commentModal.locator('.author-row input').first()).toBeVisible();
    await expect(commentModal.locator('textarea')).toBeVisible();
    await expect(commentModal.locator('.export-strip button').first()).toBeVisible();

    await page.waitForTimeout(300);
    await saveScreenshot(page, 'k3-comment-review-mobile.png');
    await commentModal.locator('.close-btn').click();
    await expect(commentModal).not.toBeVisible();

    // --- K4: Whiteout Tool & Privacy Disclaimer Dialog ---
    const whiteoutSubBtn = page.locator('.mobile-submenu .m-sub-btn').filter({ hasText: /whiteout/i }).first();
    await expect(whiteoutSubBtn).toBeVisible();
    await whiteoutSubBtn.click();

    // Ionic alert disclaimer dialog
    const alertOverlay = page.locator('ion-alert');
    await expect(alertOverlay).toBeVisible({ timeout: 10000 });
    await expect(alertOverlay.locator('.alert-title')).toContainText(/Whiteout Tool Notice/i);
    await expect(alertOverlay.locator('.alert-message')).toContainText(/visually covers content rather than permanently removing/i);

    await page.waitForTimeout(300);
    await saveScreenshot(page, 'k4-whiteout-disclaimer-mobile.png');

    // Confirm disclaimer to apply whiteout
    const applyWhiteoutBtn = alertOverlay.getByRole('button', { name: /apply whiteout/i });
    await applyWhiteoutBtn.click();
    await expect(alertOverlay).not.toBeVisible();

    // --- K5: Shape Recognition & Measurement Modal ---
    const measureSubBtn = page.locator('.mobile-submenu .m-sub-btn').filter({ hasText: /measure/i }).first();
    await expect(measureSubBtn).toBeVisible();
    await measureSubBtn.click();

    const measureModal = page.locator('app-pdf-shape-measurement-modal');
    await expect(measureModal).toBeVisible({ timeout: 10000 });
    await expect(measureModal.locator('.scale-row')).toBeVisible();
    await expect(measureModal.locator('select.select-input')).toBeVisible();

    await page.waitForTimeout(300);
    await saveScreenshot(page, 'k5-shape-measurement-mobile.png');
    await measureModal.locator('.close-btn').click();
    await expect(measureModal).not.toBeVisible();

    // --- K6: Edit Existing Text Modal ---
    const editTextSubBtn = page.locator('.mobile-submenu .m-sub-btn').filter({ hasText: /edit text/i }).first();
    await expect(editTextSubBtn).toBeVisible();
    await editTextSubBtn.click();

    const editTextModal = page.locator('app-pdf-text-edit-modal');
    await expect(editTextModal).toBeVisible({ timeout: 10000 });
    await expect(editTextModal.locator('.scope-card')).toContainText(/same-font, same-size, single-line text edits/i);
    await expect(editTextModal.locator('.scope-card')).toContainText(/whiteout-and-retype/i);

    await page.waitForTimeout(300);
    await saveScreenshot(page, 'k6-text-editor-mobile.png');
    await editTextModal.locator('.close-btn').click();
    await expect(editTextModal).not.toBeVisible();

    // --- K7: Annotation Flatten & Overlay Export Modal ---
    const flattenSubBtn = page.locator('.mobile-submenu .m-sub-btn').filter({ hasText: /flatten/i }).first();
    await expect(flattenSubBtn).toBeVisible();
    await flattenSubBtn.click();

    const flattenModal = page.locator('app-pdf-flatten-overlay-modal');
    await expect(flattenModal).toBeVisible({ timeout: 10000 });
    await expect(flattenModal.locator('.card-title', { hasText: /Flatten Annotations Only/i })).toBeVisible();
    await expect(flattenModal.locator('.card-title', { hasText: /Export Transparent Overlay PDF/i })).toBeVisible();

    await page.waitForTimeout(300);
    await saveScreenshot(page, 'k7-flatten-overlay-mobile.png');
    await flattenModal.locator('.close-btn').click();
    await expect(flattenModal).not.toBeVisible();

    // Final overflow and layout check
    await assertNoHorizontalOverflow(page);
  });
});
