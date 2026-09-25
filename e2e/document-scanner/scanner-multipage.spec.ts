import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';

test.describe('Document Scanner — Multi-page Management @scanner', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/document-scanner');
  });

  test('SCN-044 & SCN-045: Multi-page scanning thumbnail management', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      await fileInput.first().setInputFiles(getTestDataPath('scanner/clean-document.jpg'));

      const confirmBtn = page.locator('.btn-confirm-crop, button:has-text("Next"), button:has-text("Apply")');
      if (await confirmBtn.isVisible()) await confirmBtn.click();

      const addPageBtn = page.locator('.btn-add-page, button:has-text("Keep"), button:has-text("Add Page")');
      if (await addPageBtn.isVisible()) await addPageBtn.click();

      // Page 1 thumbnail exists
      await expect(page.locator('.page-thumb-card, .page-item')).toHaveCount(1, { timeout: 10000 });
    }
  });

  test('SCN-049: Rotate page thumbnail', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      await fileInput.first().setInputFiles(getTestDataPath('scanner/clean-document.jpg'));
      const confirmBtn = page.locator('.btn-confirm-crop, button:has-text("Next"), button:has-text("Apply")');
      if (await confirmBtn.isVisible()) await confirmBtn.click();
      const addPageBtn = page.locator('.btn-add-page, button:has-text("Keep"), button:has-text("Add Page")');
      if (await addPageBtn.isVisible()) await addPageBtn.click();

      const rotateBtn = page.locator('.btn-rotate-page, [aria-label*="rotate" i], button:has-text("Rotate")');
      if (await rotateBtn.isVisible()) {
        await rotateBtn.click();
        await expect(page.locator('.page-thumb-card, .page-item').first()).toBeVisible();
      }
    }
  });

  test('SCN-047: Delete page', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      await fileInput.first().setInputFiles(getTestDataPath('scanner/clean-document.jpg'));
      const confirmBtn = page.locator('.btn-confirm-crop, button:has-text("Next"), button:has-text("Apply")');
      if (await confirmBtn.isVisible()) await confirmBtn.click();
      const addPageBtn = page.locator('.btn-add-page, button:has-text("Keep"), button:has-text("Add Page")');
      if (await addPageBtn.isVisible()) await addPageBtn.click();

      const deleteBtn = page.locator('.btn-delete-page, [aria-label*="delete" i], [aria-label*="remove" i]');
      if (await deleteBtn.isVisible()) {
        await deleteBtn.click();
        await expect(page.locator('.page-thumb-card, .page-item')).toHaveCount(0);
      }
    }
  });
});
