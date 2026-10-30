import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';

test.describe('O3 Handwriting OCR Pipeline & Split-View Verification @ocr', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-ocr');
    await page.waitForLoadState('domcontentloaded');
  });

  test('O3-E2E-01: switches from printed OCR to handwriting mode and verifies banner', async ({ page }) => {
    // 1. On printed OCR page, locate the segmented control handwriting mode pill
    const handwritingTab = page.locator('app-pdf-ocr').getByTestId('mode-tab-handwriting');
    await expect(handwritingTab).toBeVisible({ timeout: 15000 });

    // 2. Click mode pill to navigate to handwriting OCR
    await handwritingTab.click();
    await expect(page).toHaveURL(/\/features\/ocr\/handwriting/);

    // 3. Verify handwriting tab is active on the handwriting page
    const activeHwTab = page.locator('app-ocr-handwriting').getByTestId('mode-tab-handwriting');
    await expect(activeHwTab).toBeVisible({ timeout: 10000 });
    await expect(activeHwTab).toHaveClass(/active/);
    await expect(activeHwTab).toHaveAttribute('aria-selected', 'true');

    // 4. Verify upfront expectation management banner is rendered
    const expectationBanner = page.locator('app-ocr-handwriting').getByTestId('expectation-banner');
    await expect(expectationBanner).toBeVisible();
    await expect(expectationBanner).toContainText(/penmanship|legibility|best results/i);

    // 5. Acknowledge via the banner button
    const bannerAckBtn = page.locator('app-ocr-handwriting').getByTestId('btn-acknowledge-banner');
    await expect(bannerAckBtn).toBeVisible();
    await bannerAckBtn.click();

    // 6. Expectation banner dismisses once acknowledged
    await expect(expectationBanner).not.toBeVisible();
  });

  test('O3-E2E-02: enforces upfront expectation modal on start OCR when unacknowledged', async ({ page }) => {
    // Navigate directly to handwriting OCR route
    await page.goto('/features/ocr/handwriting');
    await expect(page.locator('app-ocr-handwriting')).toBeVisible({ timeout: 15000 });

    // 1. Upload a handwriting test photo
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(getTestDataPath('photos/valid-photo.jpg'));

    // 2. Click "Start Handwriting Recognition"
    const startBtn = page.getByRole('button', { name: /start handwriting recognition/i });
    await expect(startBtn).toBeEnabled({ timeout: 10000 });
    await startBtn.click();

    // 3. Verify expectation modal opens
    const modalGotItBtn = page.getByTestId('btn-modal-got-it').getByRole('button', { name: /got it, continue/i });
    await expect(modalGotItBtn).toBeVisible({ timeout: 10000 });

    // 4. Click "Got It, Continue"
    await modalGotItBtn.click();

    // 5. Modal closes and processing begins
    await expect(modalGotItBtn).not.toBeVisible();
    await expect(page.locator('.processing-stages-list, .stage-step').first()).toBeVisible();
  });

  test('O3-E2E-03: split-view verification screen provides zoom controls, filter switch, scroll sync, and clipboard copy', async ({ page }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    // Navigate to handwriting route with acknowledgement preset
    await page.addInitScript(() => {
      localStorage.setItem('ocr_handwriting_acknowledged', 'true');
    });

    await page.goto('/features/ocr/handwriting');
    await expect(page.locator('app-ocr-handwriting')).toBeVisible({ timeout: 15000 });

    // Ensure Angular runtime is ready before injecting state
    await page.waitForFunction(() => {
      const el = document.querySelector('app-ocr-handwriting');
      return el && typeof (window as any).ng !== 'undefined' && !!(window as any).ng.getComponent(el);
    }, { timeout: 15000 });

    // Populate realistic mock handwriting result into the component to thoroughly test split-view review UI
    await page.evaluate(() => {
      const el = document.querySelector('app-ocr-handwriting');
      if (!el || !(window as any).ng) return;
      const comp = (window as any).ng.getComponent(el);
      if (!comp) return;

      comp.ocrResult = {
        fullText: 'Dr. Jane Smith, MD\nRx: Amoxicillin 500mg tid x 10 days\nSig: Take with meals\nRefill: 0',
        averageConfidence: 89,
        lines: [
          {
            id: 'line_1',
            text: 'Dr. Jane Smith, MD',
            confidence: 93,
            bbox: { x0: 30, y0: 20, x1: 280, y1: 55 },
            cropDataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="250" height="35"><rect width="250" height="35" fill="%23f0f0f0"/><text x="10" y="25" font-family="sans-serif" font-size="16">Dr. Jane Smith, MD</text></svg>',
            wordCount: 4
          },
          {
            id: 'line_2',
            text: 'Rx: Amoxicillin 500mg tid x 10 days',
            confidence: 88,
            bbox: { x0: 30, y0: 70, x1: 340, y1: 105 },
            cropDataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="310" height="35"><rect width="310" height="35" fill="%23f0f0f0"/><text x="10" y="25" font-family="sans-serif" font-size="16">Rx: Amoxicillin 500mg</text></svg>',
            wordCount: 7
          },
          {
            id: 'line_3',
            text: 'Sig: Take with meals',
            confidence: 91,
            bbox: { x0: 30, y0: 120, x1: 230, y1: 155 },
            cropDataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="35"><rect width="200" height="35" fill="%23f0f0f0"/><text x="10" y="25" font-family="sans-serif" font-size="16">Sig: Take with meals</text></svg>',
            wordCount: 4
          },
          {
            id: 'line_4',
            text: 'Refill: 0',
            confidence: 85,
            bbox: { x0: 30, y0: 170, x1: 130, y1: 205 },
            cropDataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="35"><rect width="100" height="35" fill="%23f0f0f0"/><text x="10" y="25" font-family="sans-serif" font-size="16">Refill: 0</text></svg>',
            wordCount: 2
          }
        ],
        originalImageUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="%23fafafa"/><text x="30" y="50" font-size="18">Dr. Jane Smith, MD</text><text x="30" y="100" font-size="18">Rx: Amoxicillin 500mg</text><text x="30" y="150" font-size="18">Sig: Take with meals</text><text x="30" y="200" font-size="18">Refill: 0</text></svg>',
        processedImageUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="%23ffffff"/><text x="30" y="50" font-size="18">Dr. Jane Smith, MD</text></svg>',
        sourceFileName: 'prescription_sample.jpg',
        pageCount: 1,
        lineCount: 4,
        wordCount: 17,
        acknowledgedExpectations: true,
        isHandwritingPipeline: true,
        imageWidth: 400,
        imageHeight: 300
      };
      comp.editableFullText = comp.ocrResult.fullText;
      comp.currentStep = 'result';
      comp.activeLineId = 'line_1';
      comp.cdr.detectChanges();
      (window as any).ng.applyChanges(comp);
    });

    // 1. Verify split-view layout is displayed
    const textarea = page.getByTestId('recognized-textarea');
    await expect(textarea).toBeVisible({ timeout: 10000 });
    await expect(textarea).toHaveValue(/Dr\. Jane Smith/);

    // 2. Test Image Viewer Zoom Controls
    const zoomIndicator = page.locator('.zoom-indicator');
    await expect(zoomIndicator).toHaveText('100%');

    const zoomInBtn = page.getByLabel('Zoom In');
    await zoomInBtn.click();
    await expect(zoomIndicator).toHaveText('125%');

    const zoomOutBtn = page.getByLabel('Zoom Out');
    await zoomOutBtn.click();
    await expect(zoomIndicator).toHaveText('100%');

    // 3. Test Filter Switch (Original vs Sauvola Filter)
    const sauvolaFilterBtn = page.getByRole('button', { name: /sauvola filter/i });
    await sauvolaFilterBtn.click();
    await expect(sauvolaFilterBtn).toHaveClass(/active/);

    const originalFilterBtn = page.getByRole('button', { name: /original/i });
    await originalFilterBtn.click();
    await expect(originalFilterBtn).toHaveClass(/active/);

    // 4. Test Line-by-Line Inspection Tab & Scroll Sync
    const linesTab = page.getByRole('tab', { name: /line-by-line/i });
    await linesTab.click();

    const lineCards = page.getByTestId('line-card');
    await expect(lineCards).toHaveCount(4);

    // Click 3rd line card ("Sig: Take with meals") to trigger scroll sync
    await lineCards.nth(2).click();
    await expect(lineCards.nth(2)).toHaveClass(/active/);

    // 5. Test Copy Text to Clipboard
    const copyBtn = page.getByTestId('btn-copy-text');
    await copyBtn.click();
    await expect(page.locator('.toast-item').first()).toContainText(/copied/i, { timeout: 10000 });

    // 6. Navigate back to printed OCR mode
    const printedTab = page.locator('app-ocr-handwriting').getByTestId('mode-tab-printed');
    await printedTab.click();
    await expect(page).toHaveURL(/\/features\/pdf-ocr/);
    await expect(page.locator('app-pdf-ocr').getByTestId('mode-tab-printed')).toHaveClass(/active/);
  });
});
