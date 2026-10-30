import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { setupCapacitorMocks } from './fixtures/mocks';

test.describe('P8 Side-by-Side Translation Reader & Summary Export @translation-reader @p8', () => {
  const englishContractPath = path.resolve(__dirname, 'test-data/translation-reader/english-contract.pdf');
  const spanishManualPath = path.resolve(__dirname, 'test-data/translation-reader/spanish-manual.pdf');
  const technicalReport10pPath = path.resolve(__dirname, 'test-data/translation-reader/technical-report-10p.pdf');

  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('P8-001: Initial Load, Empty State, Try Sample Document, and Layout Fidelity Banner', async ({ page }) => {
    await page.goto('/features/pdf/intelligence/translation-reader');
    await page.waitForLoadState('domcontentloaded');

    // Verify Title & Header
    const title = page.locator('.header-title');
    await expect(title).toBeVisible();

    // Verify Empty State
    const emptyCard = page.locator('.empty-card');
    await expect(emptyCard).toBeVisible();
    await expect(page.locator('.btn-primary-upload')).toBeVisible();

    const sampleBtn = page.locator('.btn-sample-load');
    await expect(sampleBtn).toBeVisible();

    // Verify features checklist
    const checklist = page.locator('.features-checklist');
    await expect(checklist).toBeVisible();
    await expect(checklist).toContainText('Synchronized Scroll-Lock');
    await expect(checklist).toContainText(/layout fidelity/i);

    // Click "Load Sample Document"
    await sampleBtn.click();

    // Verify Dual Pane Reader is loaded
    const readerWorkspace = page.locator('.reader-workspace');
    await expect(readerWorkspace).toBeVisible();

    // Verify Layout Fidelity Contract Banner and expansion pill
    const fidelityBanner = page.locator('.layout-fidelity-banner');
    await expect(fidelityBanner).toBeVisible();
    const expansionPill = fidelityBanner.locator('.expansion-pill');
    await expect(expansionPill).toBeVisible();

    // Verify Original and Translated panes are rendered
    const originalPane = page.locator('.original-pane');
    const translatedPane = page.locator('.translated-pane');
    await expect(originalPane).toBeVisible();
    await expect(translatedPane).toBeVisible();

    // Verify Canvas was rendered in original pane
    const canvas = originalPane.locator('canvas').first();
    await expect(canvas).toBeVisible();

    // Verify Translated paragraphs are populated
    const translatedPara = translatedPane.locator('.translated-paragraph').first();
    await expect(translatedPara).toBeVisible();
  });

  test('P8-002: English Contract Translation to Hindi and Layout Fidelity Verification', async ({ page }) => {
    expect(fs.existsSync(englishContractPath)).toBe(true);

    await page.goto('/features/pdf/intelligence/translation-reader');
    await page.waitForLoadState('domcontentloaded');

    // Upload English contract
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('.btn-primary-upload').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(englishContractPath);

    // Verify workspace loaded
    const readerWorkspace = page.locator('.reader-workspace');
    await expect(readerWorkspace).toBeVisible();

    // Verify Page Count (2 pages)
    const pageIndicator = page.locator('.page-indicator');
    await expect(pageIndicator).toContainText('Page 1 of 2');

    // Check Original Pane has 2 page cards
    const origCards = page.locator('.original-pane .page-card');
    await expect(origCards).toHaveCount(2);

    // Check Translated Pane has 2 page cards
    const transCards = page.locator('.translated-pane .page-card');
    await expect(transCards).toHaveCount(2);

    // Verify Hindi translation rendered
    const firstHindiPara = transCards.first().locator('.translated-paragraph').first();
    await expect(firstHindiPara).toBeVisible();
    const hindiText = await firstHindiPara.innerText();
    expect(hindiText.length).toBeGreaterThan(10);

    // Check expansion tag
    const expansionTag = transCards.first().locator('.expansion-tag');
    await expect(expansionTag).toBeVisible();
  });

  test('P8-003: Spanish Manual Translation to English and Language Quick-Switching', async ({ page }) => {
    expect(fs.existsSync(spanishManualPath)).toBe(true);

    await page.goto('/features/pdf/intelligence/translation-reader');
    await page.waitForLoadState('domcontentloaded');

    // Upload Spanish manual
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('.btn-primary-upload').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(spanishManualPath);

    await expect(page.locator('.reader-workspace')).toBeVisible();

    // Switch Target Language to Marathi (mr)
    const marathiChip = page.locator('.lang-pill-chip', { hasText: 'Marathi' });
    await expect(marathiChip).toBeVisible();
    await marathiChip.click();

    // Verify target badge updated to MR
    const targetBadge = page.locator('.translated-pane .target-badge');
    await expect(targetBadge).toHaveText('MR');

    // Switch Target Language to Bengali (bn)
    const bengaliChip = page.locator('.lang-pill-chip', { hasText: 'Bengali' });
    await expect(bengaliChip).toBeVisible();
    await bengaliChip.click();
    await expect(targetBadge).toHaveText('BN');

    // Switch Target Language to Punjabi (pa)
    const punjabiChip = page.locator('.lang-pill-chip', { hasText: 'Punjabi' });
    await expect(punjabiChip).toBeVisible();
    await punjabiChip.click();
    await expect(targetBadge).toHaveText('PA');

    // Switch Target Language to English (en)
    const englishChip = page.locator('.lang-pill-chip', { hasText: 'English' });
    await expect(englishChip).toBeVisible();
    await englishChip.click();
    await expect(targetBadge).toHaveText('EN');
  });

  test('P8-004: 10-Page Synchronized Scroll-Lock Stress Test across Unequal Heights', async ({ page }) => {
    expect(fs.existsSync(technicalReport10pPath)).toBe(true);

    await page.goto('/features/pdf/intelligence/translation-reader');
    await page.waitForLoadState('domcontentloaded');

    // Upload 10-page technical report
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('.btn-primary-upload').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(technicalReport10pPath);

    await expect(page.locator('.reader-workspace')).toBeVisible();

    // Verify 10 pages loaded
    const pageIndicator = page.locator('.page-indicator');
    await expect(pageIndicator).toContainText('Page 1 of 10');

    const origCards = page.locator('.original-pane .page-card');
    await expect(origCards).toHaveCount(10);

    const transCards = page.locator('.translated-pane .page-card');
    await expect(transCards).toHaveCount(10);

    // Verify Scroll-Lock is ON
    const scrollLockBtn = page.locator('.scroll-lock-pill');
    await expect(scrollLockBtn).toBeVisible();
    await expect(scrollLockBtn).toHaveClass(/locked/);

    // 1. Test Navigation Stepper: Click Next Page from Page 1
    const nextBtn = page.locator('.stepper-btn').last();
    await nextBtn.click();
    await expect(pageIndicator).toContainText('Page 2 of 10');

    // 2. Test Synchronized Scroll-Lock: Scroll original pane to Page 3 (index 2)
    // Ensure page cards have computed layout offsets
    await expect.poll(async () => {
      return await page.evaluate(() => {
        const origPane = document.querySelector('.original-pane') as HTMLElement;
        const cards = origPane?.querySelectorAll('.page-card');
        return cards && cards[2] ? (cards[2] as HTMLElement).offsetTop : 0;
      });
    }).toBeGreaterThan(100);

    await page.evaluate(() => {
      const origPane = document.querySelector('.original-pane') as HTMLElement;
      const cards = origPane?.querySelectorAll('.page-card');
      if (origPane && cards && cards[2]) {
        origPane.scrollTop = (cards[2] as HTMLElement).offsetTop + 50;
        origPane.dispatchEvent(new Event('scroll'));
      }
    });

    // Verify translated pane synced smoothly to page 3
    await expect.poll(async () => {
      return await page.evaluate(() => {
        const transPane = document.querySelector('.translated-pane');
        return transPane ? transPane.scrollTop : 0;
      });
    }).toBeGreaterThan(0);

    // Toggle Scroll-Lock OFF and verify toggle state
    await scrollLockBtn.click();
    await expect(scrollLockBtn).not.toHaveClass(/locked/);
  });

  test('P8-005: Draggable Divider Resize in Portrait and Executive Summary Modal', async ({ page, viewport }) => {
    // Set portrait viewport
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('/features/pdf/intelligence/translation-reader');
    await page.waitForLoadState('domcontentloaded');

    // Click sample document
    await page.locator('.btn-sample-load').click();
    await expect(page.locator('.reader-workspace')).toBeVisible();

    // Verify container has portrait class
    const container = page.locator('.translation-reader-container');
    await expect(container).toHaveClass(/portrait/);

    // Test Draggable Divider handle
    const divider = page.locator('.touch-divider');
    await expect(divider).toBeVisible();

    const initialRatio = await page.evaluate(() => {
      const wrapper = document.querySelector('.split-panes-wrapper') as HTMLElement;
      return wrapper?.style.getPropertyValue('--split-ratio');
    });
    expect(initialRatio).toBe('50%');

    // Drag divider handle downwards
    const box = await divider.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 100);
      await page.mouse.up();
    }

    // Verify split ratio updated
    const newRatio = await page.evaluate(() => {
      const wrapper = document.querySelector('.split-panes-wrapper') as HTMLElement;
      return wrapper?.style.getPropertyValue('--split-ratio');
    });
    expect(newRatio).not.toBe('50%');

    // Test Executive Summary Modal
    const summaryBtn = page.locator('.btn-summary');
    await expect(summaryBtn).toBeVisible();
    await summaryBtn.click();

    const summaryModal = page.locator('.summary-modal-card');
    await expect(summaryModal).toBeVisible();

    const summaryText = summaryModal.locator('.summary-text');
    await expect(summaryText).toBeVisible();
    expect((await summaryText.innerText()).length).toBeGreaterThan(10);

    // Close modal
    const closeBtn = summaryModal.locator('.btn-close-modal');
    await closeBtn.click();
    await expect(summaryModal).not.toBeVisible();
  });

  test('P8-006: Multi-Format Export (Formatted PDF and Word .docx)', async ({ page }) => {
    await page.goto('/features/pdf/intelligence/translation-reader');
    await page.waitForLoadState('domcontentloaded');

    await page.locator('.btn-sample-load').click();
    await expect(page.locator('.reader-workspace')).toBeVisible();

    // Verify Sticky Action Bar with export buttons
    const actionBar = page.locator('.sticky-action-bar');
    await expect(actionBar).toBeVisible();

    const pdfBtn = actionBar.locator('.btn-export-pdf');
    const docxBtn = actionBar.locator('.btn-export-docx');
    await expect(pdfBtn).toBeVisible();
    await expect(docxBtn).toBeVisible();

    // Click Export PDF
    await pdfBtn.click();

    // Verify toast notification appears
    const toast = page.locator('.toast-toast');
    await expect(toast).toBeVisible();

    // Click Export Word (.docx)
    await docxBtn.click();
    await expect(toast).toBeVisible();
  });
});
