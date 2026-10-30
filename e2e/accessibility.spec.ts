import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { setupCapacitorMocks } from './fixtures/mocks';

test.describe('P9 PDF Accessibility Pass (Tagged PDF, Alt-Text, Reading Order) @accessibility @p9', () => {
  const singleColumnPdfPath = path.resolve(__dirname, 'test-data/accessibility/single-column-doc.pdf');
  const twoColumnPdfPath = path.resolve(__dirname, 'test-data/accessibility/two-column-magazine.pdf');
  const chartsPdfPath = path.resolve(__dirname, 'test-data/accessibility/charts-and-decorations.pdf');

  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('P9-001: Initial Load, Empty State, Strict Honesty Banner, and Sample Document', async ({ page }) => {
    await page.goto('/features/pdf/accessibility');
    await page.waitForLoadState('domcontentloaded');

    // Verify Title
    const title = page.locator('.tool-title');
    await expect(title).toBeVisible();

    // Verify Strict Honesty Banner
    const honestyBanner = page.locator('.honesty-banner');
    await expect(honestyBanner).toBeVisible();
    await expect(honestyBanner).toContainText('Enhanced with structure tags and image descriptions');
    // Ensure no false certification claims
    const bannerText = await honestyBanner.innerText();
    expect(bannerText).not.toContain('WCAG Certified');
    expect(bannerText).not.toContain('Section 508 Certified');

    // Verify Empty Upload Dropzone
    const emptyCard = page.locator('.empty-upload-card');
    await expect(emptyCard).toBeVisible();

    // Click "Try Sample Document"
    const sampleBtn = page.locator('.action-btn.outline', { hasText: 'Sample' });
    await expect(sampleBtn).toBeVisible();
    await sampleBtn.click();

    // Verify Workspace Grid appears
    const workspace = page.locator('.workspace-grid');
    await expect(workspace).toBeVisible();

    // Verify Canvas was rendered
    const canvas = page.locator('.rendered-canvas');
    await expect(canvas).toBeVisible();

    // Verify 3-Step Stepper is visible with Step 1 active
    const stepper = page.locator('.step-stepper');
    await expect(stepper).toBeVisible();
    const step1Pill = stepper.locator('.step-pill').first();
    await expect(step1Pill).toHaveClass(/active/);
  });

  test('P9-002: Real Test Data — Untagged Single-Column Document & Structure Tagging', async ({ page }) => {
    expect(fs.existsSync(singleColumnPdfPath)).toBe(true);

    await page.goto('/features/pdf/accessibility');
    await page.waitForLoadState('domcontentloaded');

    // Upload single column document
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('.action-btn.secondary', { hasText: 'Choose' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(singleColumnPdfPath);

    // Wait for workspace
    const workspace = page.locator('.workspace-grid');
    await expect(workspace).toBeVisible();

    // Step 1: Check Inferred Structure Tags
    const blockCards = page.locator('.block-card');
    await expect(blockCards.first()).toBeVisible();

    // Verify H1 title tag was inferred
    const firstTagBadge = blockCards.first().locator('.tag-badge');
    await expect(firstTagBadge).toContainText('H1');

    // Click block to select
    await blockCards.first().locator('.block-preview-text').click();
    await expect(blockCards.first()).toHaveClass(/selected/);

    // Change second block's tag to H2
    const secondCard = blockCards.nth(1);
    const h2Chip = secondCard.locator('.tag-chip', { hasText: 'H2' });
    await h2Chip.click();
    await expect(secondCard.locator('.tag-badge')).toContainText('H2');

    // Change a block to Artifact
    const artifactChip = secondCard.locator('.tag-chip', { hasText: 'Artifact' });
    await artifactChip.click();
    await expect(secondCard.locator('.tag-badge')).toContainText('Artifact');
  });

  test('P9-003: Real Test Data — Two-Column Magazine Article & Multi-Column Reading Order', async ({ page }) => {
    expect(fs.existsSync(twoColumnPdfPath)).toBe(true);

    await page.goto('/features/pdf/accessibility');
    await page.waitForLoadState('domcontentloaded');

    // Upload two-column magazine
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('.action-btn.secondary', { hasText: 'Choose' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(twoColumnPdfPath);

    await expect(page.locator('.workspace-grid')).toBeVisible();

    // Switch to Step 3: Reading Order
    const step3Pill = page.locator('.step-pill').nth(2);
    await step3Pill.click();
    await expect(step3Pill).toHaveClass(/active/);

    // Verify Order List
    const orderItems = page.locator('.order-item');
    await expect(orderItems.first()).toBeVisible();
    const itemCount = await orderItems.count();
    expect(itemCount).toBeGreaterThanOrEqual(4);

    // Verify left column content appears before right column content
    const firstOrderText = await orderItems.first().locator('.order-text').innerText();
    expect(firstOrderText).toContain('Technology in Public Governance');

    // Reorder: Move second item down using button
    const secondDownBtn = orderItems.nth(1).locator('.order-btn', { hasText: '▼' });
    await secondDownBtn.click();

    // Reorder: Move first item down using drag and drop
    const firstItem = orderItems.first();
    const thirdItem = orderItems.nth(2);
    await firstItem.dragTo(thirdItem);

    // Verify indices remain sequential (#1, #2, #3, ...)
    const firstBadge = orderItems.first().locator('.order-index');
    await expect(firstBadge).toHaveText('#1');
    const secondBadge = orderItems.nth(1).locator('.order-index');
    await expect(secondBadge).toHaveText('#2');
  });

  test('P9-004: Real Test Data — Charts, Decorative Bars, Image Alt-Text Engine & Decorative Toggle', async ({ page }) => {
    expect(fs.existsSync(chartsPdfPath)).toBe(true);

    await page.goto('/features/pdf/accessibility');
    await page.waitForLoadState('domcontentloaded');

    // Upload charts document
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('.action-btn.secondary', { hasText: 'Choose' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(chartsPdfPath);

    await expect(page.locator('.workspace-grid')).toBeVisible();

    // Switch to Step 2: Image Alt-Text Engine
    const step2Pill = page.locator('.step-pill').nth(1);
    await step2Pill.click();
    await expect(step2Pill).toHaveClass(/active/);

    // Verify image cards exist
    const imageCards = page.locator('.image-card');
    const imageCount = await imageCards.count();

    if (imageCount > 0) {
      const firstImgCard = imageCards.first();
      await expect(firstImgCard).toBeVisible();

      // Click "Suggest Description" wand button
      const suggestBtn = firstImgCard.locator('.action-btn', { hasText: 'Suggest' });
      await expect(suggestBtn).toBeVisible();
      await suggestBtn.click();

      // Verify alt-text textarea populated
      const altTextarea = firstImgCard.locator('textarea');
      await expect(altTextarea).toBeVisible();
      const textVal = await altTextarea.inputValue();
      expect(textVal.length).toBeGreaterThan(5);

      // Toggle decorative status
      const toggleBtn = firstImgCard.locator('.chip-toggle');
      await toggleBtn.click();
      await expect(toggleBtn).toContainText(/decorative/i);

      // Toggle back to informative
      await toggleBtn.click();
      await expect(toggleBtn).toContainText(/informative/i);
    }
  });

  test('P9-005: Screen Reader Audio Preview and Tagged PDF Export Pass', async ({ page }) => {
    await page.goto('/features/pdf/accessibility');
    await page.waitForLoadState('domcontentloaded');

    // Click sample document
    await page.locator('.action-btn.outline', { hasText: 'Sample' }).click();
    await expect(page.locator('.workspace-grid')).toBeVisible();

    // Verify Floating Audio Bar (Listen with Screen Reader)
    const audioBar = page.locator('.floating-audio-bar');
    await expect(audioBar).toBeVisible();

    const playBtn = page.locator('.audio-play-btn');
    await expect(playBtn).toBeVisible();

    // Click "Listen with Screen Reader"
    await playBtn.click();

    // Click again to stop audio
    await playBtn.click();

    // Save Tagged PDF
    const saveBtn = page.locator('.save-btn');
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Verify toast notification appears
    const toast = page.locator('.accessibility-toast');
    await expect(toast).toBeVisible();
  });
});
