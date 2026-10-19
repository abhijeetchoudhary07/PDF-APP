import { test, expect } from '@playwright/test';
import * as path from 'path';
import { setupCapacitorMocks } from '../../fixtures/mocks';
import { getPhase2FixturePath, uploadFileToDropzone } from '../../common/phase2-helpers';

test.describe('Part E: Navigation & Numbering (E1-E3) Mobile E2E Suite', () => {
  test.use({
    viewport: { width: 390, height: 844 } // Standard mobile viewport
  });

  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  });

  test('E1: Bookmarks & Outline Editor mobile workflow and responsiveness', async ({ page }) => {
    await page.goto('/features/pdf/bookmarks');
    await page.waitForLoadState('domcontentloaded');

    // 1. Initial Selection View
    await expect(page.locator('.select-section')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('app-file-dropzone')).toBeVisible();
    await page.screenshot({ path: 'screenshots/e1-e3/01-bookmarks-select-mobile.png', fullPage: true });

    // 2. Upload sample PDF
    const pdfPath = getPhase2FixturePath('hf-multipage-portrait.pdf');
    await uploadFileToDropzone(page, pdfPath);

    // 3. Configure Studio View
    await expect(page.locator('.configure-section')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.studio-toolbar')).toBeVisible();
    await expect(page.locator('.outline-tree-container')).toBeVisible();

    // 4. Add Bookmark via Modal
    const addBtn = page.getByRole('button', { name: /add bookmark|बुकमार्क जोड़ें/i }).first();
    await addBtn.click();

    await expect(page.locator('.modal-dialog')).toBeVisible();
    await page.locator('.modal-body input[type="text"]').fill('1. Executive Summary');
    await page.locator('.modal-body input[type="number"]').fill('1');

    const modalSaveBtn = page.locator('.modal-footer').getByRole('button', { name: /save|सहेजें/i }).first();
    await modalSaveBtn.click();
    await expect(page.locator('.modal-dialog')).toBeHidden();

    // Verify row rendered in tree
    await expect(page.locator('.outline-tree-row').first()).toBeVisible();
    await expect(page.locator('.node-title').first()).toHaveText('1. Executive Summary');

    // Screenshot configured tree
    await page.screenshot({ path: 'screenshots/e1-e3/02-bookmarks-configured-mobile.png', fullPage: true });

    // 5. Save & Export Bookmarks
    await page.getByRole('button', { name: /save document with bookmarks|save.*bookmarks/i }).click();

    // 6. Result View
    await expect(page.locator('.result-section')).toBeVisible({ timeout: 25000 });
    await expect(page.locator('.success-banner')).toBeVisible();
    await page.screenshot({ path: 'screenshots/e1-e3/03-bookmarks-result-mobile.png', fullPage: true });
  });

  test('E2: Logical Page Labels mobile workflow and live preview', async ({ page }) => {
    await page.goto('/features/pdf/page-labels');
    await page.waitForLoadState('domcontentloaded');

    // 1. Initial Selection View
    await expect(page.locator('.select-section')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: 'screenshots/e1-e3/04-page-labels-select-mobile.png', fullPage: true });

    // 2. Upload sample PDF
    const pdfPath = getPhase2FixturePath('hf-multipage-portrait.pdf');
    await uploadFileToDropzone(page, pdfPath);

    // 3. Configure Labels View
    await expect(page.locator('.labels-layout-grid')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.range-card').first()).toBeVisible();
    await expect(page.locator('.preview-labels-list')).toBeVisible();

    // 4. Add a second range
    const addRangeBtn = page.getByRole('button', { name: /add numbering range|रेंज जोड़ें/i });
    await addRangeBtn.click();
    await expect(page.locator('.range-card')).toHaveCount(2);

    // Screenshot configured ranges & preview
    await page.screenshot({ path: 'screenshots/e1-e3/05-page-labels-configured-mobile.png', fullPage: true });

    // 5. Apply Page Labels
    await page.getByRole('button', { name: /save document with page labels|लेबल सहेजें/i }).click();

    // 6. Result View
    await expect(page.locator('.result-section')).toBeVisible({ timeout: 25000 });
    await expect(page.locator('.success-banner')).toBeVisible();
    await page.screenshot({ path: 'screenshots/e1-e3/06-page-labels-result-mobile.png', fullPage: true });
  });

  test('E3: Bates Numbering Studio multi-file batch workflow and continuous sequence', async ({ page }) => {
    await page.goto('/features/pdf-header-footer/bates');
    await page.waitForLoadState('domcontentloaded');

    // 1. Initial Selection View
    await expect(page.locator('.select-section')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.mode-btn.active')).toHaveText(/bates/i);
    await page.screenshot({ path: 'screenshots/e1-e3/07-bates-select-mobile.png', fullPage: true });

    // 2. Upload multiple PDF files into Bates batch
    const pdfPath1 = getPhase2FixturePath('hf-1page-portrait.pdf');
    const pdfPath2 = getPhase2FixturePath('hf-multipage-portrait.pdf');

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles([pdfPath1, pdfPath2]);

    // 3. Configure Bates Studio View
    await expect(page.locator('.configure-section')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.bates-plan-card')).toBeVisible();
    await expect(page.locator('.batch-file-row')).toHaveCount(2);

    // Configure prefix and position
    const prefixInput = page.locator('.bates-settings-box input[type="text"]').first();
    await prefixInput.fill('CONF-');

    // Select Bottom-Right position
    const bottomCenterOrRightBtn = page.locator('.position-grid .pos-btn').last();
    await bottomCenterOrRightBtn.click();

    // Reset scroll position on both window and the ion-page host element
    await page.evaluate(() => {
      document.querySelector('.ion-page')?.scrollTo(0, 0);
      window.scrollTo(0, 0);
    });
    await page.screenshot({ path: 'screenshots/e1-e3/08-bates-configured-mobile.png', fullPage: true });

    // 4. Apply Bates Numbering
    await page.getByRole('button', { name: /stamp batch|apply bates/i }).click();

    // 5. Result View
    await expect(page.locator('.result-section')).toBeVisible({ timeout: 25000 });
    await expect(page.locator('.batch-results-list')).toBeVisible();
    await page.locator('.result-section').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'screenshots/e1-e3/09-bates-result-mobile.png' });
  });
});
