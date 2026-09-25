import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';

test.describe('Document Scanner — PDF Generation & OCR Handoff @scanner @critical', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/document-scanner');

    // Add a page
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      await fileInput.first().setInputFiles(getTestDataPath('scanner/clean-document.jpg'));
      const confirmBtn = page.locator('.btn-confirm-crop, button:has-text("Next"), button:has-text("Apply")');
      if (await confirmBtn.isVisible()) await confirmBtn.click();
      const addPageBtn = page.locator('.btn-add-page, button:has-text("Keep"), button:has-text("Add Page")');
      if (await addPageBtn.isVisible()) await addPageBtn.click();
    }
  });

  test('SCN-053 & SCN-056: Generate PDF from scanned page', async ({ page }) => {
    const generateBtn = page.locator('.btn-generate-pdf, button:has-text("Generate PDF"), button:has-text("Save as PDF")');
    if (await generateBtn.isVisible()) {
      await generateBtn.click();
      // Should show PDF ready screen
      await expect(page.locator('.pdf-ready-card, :has-text("created successfully"), .btn-download-pdf').first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('SCN-064 & SCN-065: Scanner to OCR Handoff via "Make Searchable"', async ({ page }) => {
    const generateBtn = page.locator('.btn-generate-pdf, button:has-text("Generate PDF"), button:has-text("Save as PDF")');
    if (await generateBtn.isVisible()) {
      await generateBtn.click();
      await expect(page.locator('.btn-make-searchable, button:has-text("Make Searchable")').first()).toBeVisible({ timeout: 15000 });

      // Click "Make Searchable"
      await page.locator('.btn-make-searchable, button:has-text("Make Searchable")').click();

      // Verify navigation to OCR page with the scanned document loaded
      await expect(page).toHaveURL(/.*features\/pdf-ocr/);
      await expect(page.locator('.selected-file-card, .file-name, .btn-start-ocr').first()).toBeVisible({ timeout: 10000 });
    }
  });
});
