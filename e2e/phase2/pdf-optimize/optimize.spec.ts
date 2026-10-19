import { test, expect } from '@playwright/test';
import * as path from 'path';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import { getPhase2FixturePath, uploadFileToDropzone } from '../../common/phase2-helpers';

test.describe('Part F: Size & Output Control (F1-F6) Mobile E2E & Responsiveness Suite', () => {
  test.use({
    viewport: { width: 390, height: 844 }, // Mobile device viewport (iPhone 14 / Pixel 7 equivalent)
    deviceScaleFactor: 2
  });

  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('PAGE ERROR LOG:', msg.text());
      }
    });
  });

  test('F1-F6: Full optimization flow, tab switching, mobile layout & zero-overflow responsiveness', async ({ page }) => {
    // 1. Visit the Optimizer tool
    await page.goto('/features/pdf/optimize');
    await page.waitForLoadState('domcontentloaded');

    // Verify initial file selection view
    await expect(page.locator('.select-section')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('app-file-dropzone')).toBeVisible();

    // Verify no horizontal overflow on mobile viewport
    const initialOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(initialOverflow).toBeFalsy();

    // Take screenshot of Initial Select Screen
    await page.screenshot({ path: 'screenshots/mobile-optimize/01-optimize-select-mobile.png', fullPage: true });

    // 2. Upload test document
    const pdfPath = getPhase2FixturePath('hf-multipage-portrait.pdf');
    await uploadFileToDropzone(page, pdfPath);

    // 3. Verify Configure Screen is active
    await expect(page.locator('.configure-section')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.doc-summary-card')).toBeVisible();
    await expect(page.locator('.studio-mode-selector')).toBeVisible();

    // Assert zero horizontal overflow on configuration screen
    const configOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(configOverflow).toBeFalsy();

    // 4. Test F1 (Images & DPI ceiling)
    const imagesTab = page.getByRole('tab', { name: /DPI Ceiling|छवियां|प्रतिमा|ছবি|ਚਿੱਤਰ/i }).first();
    await imagesTab.click();
    await expect(page.locator('.studio-card h3').first()).toBeVisible();

    // Select 150 DPI chip
    const dpi150Chip = page.locator('.chip-btn').filter({ hasText: /150/i }).first();
    if (await dpi150Chip.isVisible()) {
      await dpi150Chip.click();
      await expect(dpi150Chip).toHaveClass(/active/);
    }
    await page.screenshot({ path: 'screenshots/mobile-optimize/02-optimize-images-f1-mobile.png', fullPage: true });

    // 5. Test F2 (Colour & Mono Scan paths)
    const colourTab = page.getByRole('tab', { name: /Scan Tone|रंग|रंगीत|রং|ਰੰਗ/i }).first();
    await colourTab.click();
    await expect(page.locator('.studio-card h3').first()).toBeVisible();

    // Toggle 1-Bit Mono chip
    const monoChip = page.locator('.chip-btn').filter({ hasText: /mono|मोनो|1-bit/i }).first();
    if (await monoChip.isVisible()) {
      await monoChip.click();
      await expect(monoChip).toHaveClass(/active/);
    }
    await page.screenshot({ path: 'screenshots/mobile-optimize/03-optimize-colour-f2-mobile.png', fullPage: true });

    // 6. Test F3 (Identical image dedupe)
    const dedupeTab = page.getByRole('tab', { name: /Dedupe|प्रतिलिपियां|डुप्लिकेट|প্রতিলিপি|ਡੁਪਲੀਕੇਟ/i }).first();
    await dedupeTab.click();
    await expect(page.locator('.studio-card h3').first()).toBeVisible();
    await page.screenshot({ path: 'screenshots/mobile-optimize/04-optimize-duplicates-f3-mobile.png', fullPage: true });

    // 7. Test F4 (Proof View)
    const proofTab = page.getByRole('tab', { name: /Proof View|प्रूफ|প্রুফ|ਪ੍ਰੂਫ਼/i }).first();
    await proofTab.click();
    await expect(page.locator('.studio-card h3').first()).toBeVisible();
    await page.screenshot({ path: 'screenshots/mobile-optimize/05-optimize-proof-f4-mobile.png', fullPage: true });

    // 8. Test F5 (Fit Upload Limit)
    const fitTab = page.getByRole('tab', { name: /Fit Limit|सीमा|मर्यादा|সীমা|ਸੀਮਾ/i }).first();
    await fitTab.click();
    await expect(page.locator('.studio-card h3').first()).toBeVisible();

    // Select 500 KB limit preset chip
    const kb500Chip = page.locator('.chip-btn').filter({ hasText: /500 KB/i }).first();
    if (await kb500Chip.isVisible()) {
      await kb500Chip.click();
      await expect(kb500Chip).toHaveClass(/active/);
    }
    await page.screenshot({ path: 'screenshots/mobile-optimize/06-optimize-fit-f5-mobile.png', fullPage: true });

    // 9. Test F6 (Structure Optimizer)
    const structureTab = page.getByRole('tab', { name: /Structure|संरचना|গঠন|ਸੰਰਚਨਾ/i }).first();
    await structureTab.click();
    await expect(page.locator('.studio-card h3').first()).toBeVisible();
    await page.screenshot({ path: 'screenshots/mobile-optimize/07-optimize-structure-f6-mobile.png', fullPage: true });

    // 10. Start Optimization pass (F6 Structure pass)
    const actionBtn = page.locator('.action-dock app-button').first();
    await expect(actionBtn).toBeVisible();
    await actionBtn.click();

    // 11. Verify Result Screen
    await expect(page.locator('.result-section')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.size-comparison-banner')).toBeVisible();
    await expect(page.locator('.saving-chip')).toBeVisible();

    // Assert zero horizontal overflow in result view
    const resultOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(resultOverflow).toBeFalsy();

    // Verify presence of download/save button and split hand-off button
    await expect(page.locator('.result-actions app-button').first()).toBeVisible();

    // Take screenshot of Result Screen on mobile
    await page.screenshot({ path: 'screenshots/mobile-optimize/08-optimize-result-mobile.png', fullPage: true });
  });

  test('Small Android screen (360x800) responsiveness verification', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });

    await page.goto('/features/pdf/optimize');
    await page.waitForLoadState('domcontentloaded');

    // Verify no horizontal overflow on tight 360px viewport
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBeFalsy();

    // Upload document
    const pdfPath = getPhase2FixturePath('hf-1page-portrait.pdf');
    await uploadFileToDropzone(page, pdfPath);

    await expect(page.locator('.configure-section')).toBeVisible({ timeout: 15000 });

    // Check again for zero overflow
    const configOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(configOverflow).toBeFalsy();

    // Screenshot on tight Android screen
    await page.screenshot({ path: 'screenshots/mobile-optimize/09-optimize-360px-android.png', fullPage: true });
  });
});
