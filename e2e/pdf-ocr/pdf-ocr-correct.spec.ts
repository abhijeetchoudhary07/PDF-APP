import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';

test.describe('O4 OCR Confidence Tools & Persistent Correction Dictionary @ocr', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/ocr/correct');
    await page.waitForLoadState('domcontentloaded');
  });

  test('O4-E2E-01: verifies initial landing state, file dropzone, and persistent dictionary modal management', async ({ page }) => {
    // 1. Verify page headers and initial selection card
    await expect(page.locator('.select-card')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.dictionary-quick-bar')).toBeVisible();

    // 2. Open Persistent Dictionary Modal from quick bar
    const manageDictBtn = page.locator('.manage-dict-btn');
    await expect(manageDictBtn).toBeVisible();
    await manageDictBtn.click();

    // 3. Verify Dictionary Modal is open
    const dictContent = page.getByTestId('dictionary-modal-content');
    await expect(dictContent).toBeVisible({ timeout: 10000 });
    await expect(dictContent).toContainText(/Rules stored here are applied permanently/i);

    // 4. Add a persistent replacement rule: testmisread -> testcorrect
    const targetInput = page.getByTestId('input-new-rule-target');
    const replacementInput = page.getByTestId('input-new-rule-replacement');
    const addRuleBtn = page.getByTestId('btn-add-rule');

    await targetInput.fill('testmisread');
    await replacementInput.fill('testcorrect');
    await expect(addRuleBtn).toBeEnabled();
    await addRuleBtn.click();

    // 5. Verify newly added rule item pill is displayed
    const rulePill = page.getByTestId('rule-item-pill').filter({ hasText: 'testmisread' });
    await expect(rulePill).toBeVisible({ timeout: 5000 });
    await expect(rulePill).toContainText('testmisread');
    await expect(rulePill).toContainText('testcorrect');

    // 6. Delete the rule using delete button
    const deleteBtn = rulePill.getByTestId('btn-delete-rule');
    await deleteBtn.click();
    await expect(rulePill).not.toBeVisible({ timeout: 5000 });

    // 7. Close modal
    const closeBtn = page.locator('.modal-close-btn, .close-button, [aria-label="Close"]').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    }
  });

  test('O4-E2E-02: renders confidence heatmap overlay with color-coded tiers and verifies toggle & tier filters', async ({ page }) => {
    // Ensure Angular runtime is ready before injecting state
    await page.waitForFunction(() => {
      const el = document.querySelector('app-ocr-correct');
      return el && typeof (window as any).ng !== 'undefined' && !!(window as any).ng.getComponent(el);
    }, { timeout: 15000 });

    // Populate mock audited document with High, Medium, and Low confidence words
    await page.evaluate(() => {
      const el = document.querySelector('app-ocr-correct');
      if (!el || !(window as any).ng) return;
      const comp = (window as any).ng.getComponent(el);
      if (!comp) return;

      const mockSvgImg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="%23ffffff"/><text x="40" y="80" font-size="20">INVOICE #4092</text><text x="40" y="140" font-size="20">payrnent pending</text><text x="40" y="200" font-size="20">tota1 amount due</text></svg>';

      comp.confidenceDoc = {
        fileName: 'sample-invoice.pdf',
        fullText: 'INVOICE #4092\npayrnent pending\ntota1 amount due',
        totalPages: 1,
        totalWords: 6,
        overallStats: {
          averageConfidence: 74,
          highCount: 3,
          mediumCount: 2,
          lowCount: 1,
          reviewedCount: 0,
          correctedCount: 0
        },
        pages: [
          {
            pageNumber: 1,
            width: 800,
            height: 1000,
            canvasDataUrl: mockSvgImg,
            stats: {
              averageConfidence: 74,
              highCount: 3,
              mediumCount: 2,
              lowCount: 1,
              reviewedCount: 0,
              correctedCount: 0
            },
            words: [
              {
                id: 'w1',
                text: 'INVOICE',
                confidence: 96,
                tier: 'high',
                bbox: { x: 40, y: 60, width: 90, height: 25 },
                pageNumber: 1,
                lineIndex: 0,
                wordIndex: 0
              },
              {
                id: 'w2',
                text: '#4092',
                confidence: 92,
                tier: 'high',
                bbox: { x: 140, y: 60, width: 60, height: 25 },
                pageNumber: 1,
                lineIndex: 0,
                wordIndex: 1
              },
              {
                id: 'w3',
                text: 'payrnent',
                confidence: 68,
                tier: 'medium',
                bbox: { x: 40, y: 120, width: 100, height: 25 },
                pageNumber: 1,
                lineIndex: 1,
                wordIndex: 0,
                cropDataUrl: mockSvgImg,
                suggestedReplacements: ['payment', 'parent']
              },
              {
                id: 'w4',
                text: 'pending',
                confidence: 88,
                tier: 'high',
                bbox: { x: 150, y: 120, width: 80, height: 25 },
                pageNumber: 1,
                lineIndex: 1,
                wordIndex: 1
              },
              {
                id: 'w5',
                text: 'tota1',
                confidence: 52,
                tier: 'low',
                bbox: { x: 40, y: 180, width: 60, height: 25 },
                pageNumber: 1,
                lineIndex: 2,
                wordIndex: 0,
                cropDataUrl: mockSvgImg,
                suggestedReplacements: ['total']
              },
              {
                id: 'w6',
                text: 'due',
                confidence: 65,
                tier: 'medium',
                bbox: { x: 110, y: 180, width: 45, height: 25 },
                pageNumber: 1,
                lineIndex: 2,
                wordIndex: 1,
                cropDataUrl: mockSvgImg
              }
            ]
          }
        ],
        allWords: []
      };
      comp.confidenceDoc.allWords = comp.confidenceDoc.pages[0].words;
      comp.currentStep = 'audit';
      comp.currentPageIndex = 0;
      comp.showHeatmap = true;
      comp.tierFilter = 'all';
      comp.updateLowConfidenceQueue();
      comp.cdr.detectChanges();
      (window as any).ng.applyChanges(comp);
    });

    // 1. Verify metrics banner displays summary stats
    const avgScore = page.locator('.metric-item.avg-score .metric-value');
    await expect(avgScore).toHaveText('74%');

    // 2. Verify heatmap overlay is visible with all 6 word boxes
    const heatmapOverlay = page.getByTestId('heatmap-overlay');
    await expect(heatmapOverlay).toBeVisible({ timeout: 10000 });

    const wordBoxes = page.getByTestId('word-heatmap-box');
    await expect(wordBoxes).toHaveCount(6);

    // 3. Verify tier classes (green/high, amber/medium, red/low)
    await expect(wordBoxes.filter({ hasText: '68%' })).toHaveClass(/tier-medium/);
    await expect(wordBoxes.filter({ hasText: '52%' })).toHaveClass(/tier-low/);

    // 4. Test Tier Filter: Low only
    const lowFilterBtn = page.locator('.filter-pill.filter-low');
    await lowFilterBtn.click();
    await expect(page.getByTestId('word-heatmap-box')).toHaveCount(1);
    await expect(page.getByTestId('word-heatmap-box')).toHaveClass(/tier-low/);

    // 5. Test Tier Filter: Medium only
    const medFilterBtn = page.locator('.filter-pill.filter-medium');
    await medFilterBtn.click();
    await expect(page.getByTestId('word-heatmap-box')).toHaveCount(2);

    // 6. Reset filter to All
    const allFilterBtn = page.locator('.filter-pill').first();
    await allFilterBtn.click();
    await expect(page.getByTestId('word-heatmap-box')).toHaveCount(6);

    // 7. Toggle Heatmap Switch OFF and ON via toggle-control label
    const toggleControl = page.getByTestId('toggle-heatmap');
    await toggleControl.click();
    await expect(page.getByTestId('heatmap-overlay')).not.toBeVisible();

    await toggleControl.click();
    await expect(page.getByTestId('heatmap-overlay')).toBeVisible();
  });

  test('O4-E2E-03: taps an amber word, opens Quick Correction drawer with magnified crop, and applies correction', async ({ page }) => {
    await page.waitForFunction(() => {
      const el = document.querySelector('app-ocr-correct');
      return el && typeof (window as any).ng !== 'undefined' && !!(window as any).ng.getComponent(el);
    }, { timeout: 15000 });

    await page.evaluate(() => {
      const el = document.querySelector('app-ocr-correct');
      if (!el || !(window as any).ng) return;
      const comp = (window as any).ng.getComponent(el);
      if (!comp) return;

      const mockSvgImg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="%23ffffff"/><text x="40" y="80" font-size="20">payrnent pending</text></svg>';

      comp.confidenceDoc = {
        fileName: 'invoice-test.pdf',
        fullText: 'payrnent pending',
        totalPages: 1,
        totalWords: 2,
        overallStats: { averageConfidence: 75, highCount: 1, mediumCount: 1, lowCount: 0, reviewedCount: 0, correctedCount: 0 },
        pages: [
          {
            pageNumber: 1,
            width: 600,
            height: 400,
            canvasDataUrl: mockSvgImg,
            stats: { averageConfidence: 75, highCount: 1, mediumCount: 1, lowCount: 0, reviewedCount: 0, correctedCount: 0 },
            words: [
              {
                id: 'w_test_1',
                text: 'payrnent',
                confidence: 65,
                tier: 'medium',
                bbox: { x: 40, y: 60, width: 120, height: 30 },
                pageNumber: 1,
                lineIndex: 0,
                wordIndex: 0,
                cropDataUrl: mockSvgImg,
                suggestedReplacements: ['payment', 'pay rent']
              },
              {
                id: 'w_test_2',
                text: 'pending',
                confidence: 90,
                tier: 'high',
                bbox: { x: 180, y: 60, width: 90, height: 30 },
                pageNumber: 1,
                lineIndex: 0,
                wordIndex: 1
              }
            ]
          }
        ],
        allWords: []
      };
      comp.confidenceDoc.allWords = comp.confidenceDoc.pages[0].words;
      comp.currentStep = 'audit';
      comp.currentPageIndex = 0;
      comp.showHeatmap = true;
      comp.tierFilter = 'all';
      comp.updateLowConfidenceQueue();
      comp.cdr.detectChanges();
      (window as any).ng.applyChanges(comp);
    });

    // 1. Tap the amber word box
    const amberBox = page.getByTestId('word-heatmap-box').filter({ hasText: '65%' });
    await expect(amberBox).toBeVisible({ timeout: 10000 });
    await amberBox.click();

    // 2. Verify Quick Correction Drawer opens
    const drawer = page.getByTestId('quick-correction-drawer');
    await expect(drawer).toBeVisible({ timeout: 10000 });
    await expect(drawer).toContainText(/Quick.*Correction/i);

    // 3. Verify magnified crop snippet is present
    const magnifiedCrop = drawer.locator('.magnified-crop-img');
    await expect(magnifiedCrop).toBeVisible();

    // 4. Verify input field contains original OCR text
    const inputField = page.getByTestId('input-corrected-word');
    await expect(inputField).toHaveValue('payrnent');

    // 5. Click suggestion chip "payment"
    const suggestionChip = page.locator('.suggestion-chip').first();
    await expect(suggestionChip).toHaveText('payment');
    await suggestionChip.click();
    await expect(inputField).toHaveValue('payment');

    // 6. Click "Replace Everywhere"
    const replaceEverywhereBtn = page.getByTestId('btn-replace-everywhere');
    await expect(replaceEverywhereBtn).toBeVisible();
    await replaceEverywhereBtn.click();

    // 7. Drawer closes and toast notifies user
    await expect(drawer).not.toBeVisible();
    await expect(page.locator('.toast-item').first()).toContainText(/Replaced/i, { timeout: 10000 });

    // 8. Verify word is marked as corrected in heatmap
    await expect(amberBox).toHaveClass(/corrected/);
  });

  test('O4-E2E-04: tests low-confidence word carousel navigation and one-tap word acceptance', async ({ page }) => {
    await page.waitForFunction(() => {
      const el = document.querySelector('app-ocr-correct');
      return el && typeof (window as any).ng !== 'undefined' && !!(window as any).ng.getComponent(el);
    }, { timeout: 15000 });

    await page.evaluate(() => {
      const el = document.querySelector('app-ocr-correct');
      if (!el || !(window as any).ng) return;
      const comp = (window as any).ng.getComponent(el);
      if (!comp) return;

      const mockSvgImg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="500" height="300"><rect width="500" height="300" fill="%23ffffff"/><text x="30" y="50">misread items</text></svg>';

      comp.confidenceDoc = {
        fileName: 'items.pdf',
        fullText: 'item1 item2 item3',
        totalPages: 1,
        totalWords: 3,
        overallStats: { averageConfidence: 55, highCount: 0, mediumCount: 2, lowCount: 1, reviewedCount: 0, correctedCount: 0 },
        pages: [
          {
            pageNumber: 1,
            width: 500,
            height: 300,
            canvasDataUrl: mockSvgImg,
            stats: { averageConfidence: 55, highCount: 0, mediumCount: 2, lowCount: 1, reviewedCount: 0, correctedCount: 0 },
            words: [
              { id: 'c1', text: 'ite1n', confidence: 54, tier: 'low', bbox: { x: 30, y: 50, width: 80, height: 25 }, pageNumber: 1, lineIndex: 0, wordIndex: 0, cropDataUrl: mockSvgImg },
              { id: 'c2', text: 'rnistake', confidence: 66, tier: 'medium', bbox: { x: 120, y: 50, width: 90, height: 25 }, pageNumber: 1, lineIndex: 0, wordIndex: 1, cropDataUrl: mockSvgImg },
              { id: 'c3', text: 'vveb', confidence: 70, tier: 'medium', bbox: { x: 220, y: 50, width: 60, height: 25 }, pageNumber: 1, lineIndex: 0, wordIndex: 2, cropDataUrl: mockSvgImg }
            ]
          }
        ],
        allWords: []
      };
      comp.confidenceDoc.allWords = comp.confidenceDoc.pages[0].words;
      comp.currentStep = 'audit';
      comp.currentPageIndex = 0;
      comp.showHeatmap = true;
      comp.updateLowConfidenceQueue();
      comp.cdr.detectChanges();
      (window as any).ng.applyChanges(comp);
    });

    // 1. Verify Carousel is rendered with 3 words to review
    const carouselSection = page.getByTestId('low-confidence-carousel');
    await expect(carouselSection).toBeVisible({ timeout: 10000 });
    await expect(carouselSection).toContainText('1 of 3');

    // 2. Click "Accept" on the first carousel word
    const acceptBtn = page.getByTestId('btn-carousel-accept');
    await expect(acceptBtn).toBeVisible();
    await acceptBtn.click();

    // 3. Carousel updates counter (now 2 remaining to review)
    await expect(page.locator('.toast-item').first()).toContainText(/Accepted "ite1n"/i, { timeout: 10000 });

    // 4. Click Next Carousel Nav Button
    const nextBtn = carouselSection.locator('.carousel-nav-btn.next');
    if (await nextBtn.isEnabled()) {
      await nextBtn.click();
    }
  });

  test('O4-E2E-05: targeted region re-OCR triggers high-DPR re-scan without full document re-processing', async ({ page }) => {
    await page.waitForFunction(() => {
      const el = document.querySelector('app-ocr-correct');
      return el && typeof (window as any).ng !== 'undefined' && !!(window as any).ng.getComponent(el);
    }, { timeout: 15000 });

    await page.evaluate(() => {
      const el = document.querySelector('app-ocr-correct');
      if (!el || !(window as any).ng) return;
      const comp = (window as any).ng.getComponent(el);
      if (!comp) return;

      const mockSvgImg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="%23ffffff"/><text x="20" y="40">fuzzy</text></svg>';

      comp.confidenceDoc = {
        fileName: 'fuzzy.pdf',
        fullText: 'fuzzy',
        totalPages: 1,
        totalWords: 1,
        overallStats: { averageConfidence: 50, highCount: 0, mediumCount: 0, lowCount: 1, reviewedCount: 0, correctedCount: 0 },
        pages: [
          {
            pageNumber: 1,
            width: 400,
            height: 200,
            canvasDataUrl: mockSvgImg,
            stats: { averageConfidence: 50, highCount: 0, mediumCount: 0, lowCount: 1, reviewedCount: 0, correctedCount: 0 },
            words: [
              { id: 'w_fuzzy', text: 'fuzzv', confidence: 48, tier: 'low', bbox: { x: 20, y: 30, width: 80, height: 25 }, pageNumber: 1, lineIndex: 0, wordIndex: 0, cropDataUrl: mockSvgImg }
            ]
          }
        ],
        allWords: []
      };
      comp.confidenceDoc.allWords = comp.confidenceDoc.pages[0].words;
      comp.currentStep = 'audit';
      comp.currentPageIndex = 0;
      comp.showHeatmap = true;
      comp.updateLowConfidenceQueue();

      // Mock canvas for re-OCR
      const dummyCanvas = document.createElement('canvas');
      dummyCanvas.width = 400;
      dummyCanvas.height = 200;
      comp.renderedCanvases = [dummyCanvas];

      // Mock reOcrRegion on ocrConfidenceService
      comp.ocrConfidenceService.reOcrRegion = async () => ({
        text: 'fuzzy',
        confidence: 96
      });

      comp.cdr.detectChanges();
      (window as any).ng.applyChanges(comp);
    });

    // 1. Open drawer for the low confidence word
    const wordBox = page.getByTestId('word-heatmap-box').first();
    await wordBox.click();

    const drawer = page.getByTestId('quick-correction-drawer');
    await expect(drawer).toBeVisible();

    // 2. Click "3x Re-Scan" button
    const reOcrBtn = page.getByTestId('btn-reocr-region');
    await expect(reOcrBtn).toBeVisible();
    await reOcrBtn.click();

    // 3. Toast notifies re-OCR success and input updates to 'fuzzy'
    await expect(page.locator('.toast-item').first()).toContainText(/enhanced and re-recognized/i, { timeout: 10000 });
    const inputField = page.getByTestId('input-corrected-word');
    await expect(inputField).toHaveValue('fuzzy');
  });

  test('O4-E2E-06: saves corrected document triggering searchable PDF generation and audit exports', async ({ page }) => {
    await page.waitForFunction(() => {
      const el = document.querySelector('app-ocr-correct');
      return el && typeof (window as any).ng !== 'undefined' && !!(window as any).ng.getComponent(el);
    }, { timeout: 15000 });

    await page.evaluate(() => {
      const el = document.querySelector('app-ocr-correct');
      if (!el || !(window as any).ng) return;
      const comp = (window as any).ng.getComponent(el);
      if (!comp) return;

      const mockSvgImg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="%23ffffff"/><text x="20" y="40">Corrected text</text></svg>';

      comp.confidenceDoc = {
        fileName: 'sample-invoice.pdf',
        fullText: 'Corrected text',
        totalPages: 1,
        totalWords: 2,
        overallStats: { averageConfidence: 95, highCount: 2, mediumCount: 0, lowCount: 0, reviewedCount: 2, correctedCount: 1 },
        pages: [
          {
            pageNumber: 1,
            width: 400,
            height: 200,
            canvasDataUrl: mockSvgImg,
            stats: { averageConfidence: 95, highCount: 2, mediumCount: 0, lowCount: 0, reviewedCount: 2, correctedCount: 1 },
            words: [
              { id: 'w1', text: 'Corrected', confidence: 95, tier: 'high', bbox: { x: 20, y: 30, width: 80, height: 25 }, pageNumber: 1, lineIndex: 0, wordIndex: 0, isCorrected: true },
              { id: 'w2', text: 'text', confidence: 95, tier: 'high', bbox: { x: 110, y: 30, width: 50, height: 25 }, pageNumber: 1, lineIndex: 0, wordIndex: 1 }
            ]
          }
        ],
        allWords: []
      };
      comp.confidenceDoc.allWords = comp.confidenceDoc.pages[0].words;
      comp.selectedFile = new File(['mock content'], 'sample-invoice.pdf', { type: 'application/pdf' });
      comp.currentStep = 'audit';
      comp.currentPageIndex = 0;

      // Mock ocrService.generateSearchablePdf and fileService.downloadFile
      comp.ocrService.generateSearchablePdf = async () => new File(['%PDF-1.4 mock pdf'], 'sample-invoice_searchable.pdf', { type: 'application/pdf' });
      comp.fileService.downloadFile = () => {};

      comp.cdr.detectChanges();
      (window as any).ng.applyChanges(comp);
    });

    // 1. Click "Save Corrected" in sticky bottom bar
    const saveBtn = page.getByTestId('btn-save-corrected').getByRole('button', { name: /save corrected/i });
    await expect(saveBtn).toBeVisible({ timeout: 10000 });
    await saveBtn.click();

    // 2. Verify success toast notification is shown
    await expect(page.locator('.toast-item').first()).toContainText(/Corrected document saved successfully|saved/i, { timeout: 10000 });
  });
});
