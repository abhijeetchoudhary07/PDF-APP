import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import {
  getPhase2FixturePath,
  uploadFileToDropzone,
  waitForProcessingToFinish
} from '../../common/phase2-helpers';

test.describe('PDF Compare — Visual Diff & Stable UI States @phase2 @compare @visual', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-compare');
  });

  test('CMP-060: Visual diff mode renders canvas diff for changed documents', async ({ page }) => {
    const origPath = getPhase2FixturePath('text-changed-original.pdf');
    const modPath = getPhase2FixturePath('text-changed-modified.pdf');

    await uploadFileToDropzone(page, origPath, 0);
    await uploadFileToDropzone(page, modPath, 1);
    await page.locator('.action-bar-center button').first().click();
    await waitForProcessingToFinish(page);

    await expect(page.locator('.result-section')).toBeVisible({ timeout: 15000 });

    // Switch to visual mode
    const visualTab = page.locator('app-tabs button:has-text("Visual Diff"), app-tabs button:has-text("दृश्य अंतर")');
    await visualTab.click();

    // Verify visual diff display container is rendered
    await expect(page.locator('.diff-view-visual')).toBeVisible();
    await expect(page.locator('.visual-diff-img')).toBeVisible({ timeout: 15000 });

    /*
     * The container being on screen is not evidence the diff worked.
     *
     * `PdfRenderService` keeps one active document and `loadPdf` destroys the
     * previous one, so the page used to load both files and only then render
     * the two canvases -- both of which therefore came from the *modified*
     * document. The comparison was a document against itself and the image was
     * always unmarked, while this spec passed on the container alone.
     *
     * `generateVisualDiff` paints every differing pixel rgb(239,68,68), so
     * counting those pixels is what actually says the two documents were
     * compared.
     */
    const changedPixels = await page.locator('.visual-diff-img').evaluate((img: HTMLImageElement) => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
      let marked = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] === 239 && data[i + 1] === 68 && data[i + 2] === 68) marked++;
      }
      return marked;
    });

    expect(changedPixels, 'the visual diff highlighted nothing, so the two documents were not compared').toBeGreaterThan(0);
  });

  test('CMP-061: Stable UI states for empty and populated compare page', async ({ page }) => {
    // Empty state
    await expect(page.locator('.select-step-section')).toBeVisible();
    await expect(page.locator('.dropzones-container')).toBeVisible();
  });
});
