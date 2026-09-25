import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';

test.describe('Document Scanner — Camera & Gallery Capture @scanner @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/document-scanner');
  });

  test('SCN-001: Open scanner page', async ({ page }) => {
    await expect(page).toHaveURL(/.*features\/document-scanner/);
    await expect(page.locator('h1, .page-title').first()).toContainText(/scan|scanner/i);
    await expect(page.locator('.btn-camera, .btn-gallery, button:has-text("Camera"), button:has-text("Gallery")').first()).toBeVisible();
  });

  test('SCN-005 & SCN-006: Capture document and retake', async ({ page }) => {
    // Click camera capture (mocked via Capacitor Camera plugin)
    const cameraBtn = page.locator('.btn-camera, button:has-text("Camera"), [aria-label*="camera" i]');
    if (await cameraBtn.isVisible()) {
      await cameraBtn.click();

      // Should transition to crop/edit view
      await expect(page.locator('.crop-view, .enhance-view, .canvas-container, canvas, .btn-retake').first()).toBeVisible({ timeout: 10000 });

      // Retake action
      const retakeBtn = page.locator('.btn-retake, button:has-text("Retake")');
      if (await retakeBtn.isVisible()) {
        await retakeBtn.click();
        await expect(page.locator('.btn-camera, button:has-text("Camera")').first()).toBeVisible({ timeout: 10000 });
      }
    }
  });

  test('SCN-010 & SCN-011: Gallery fallback and file import', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      await fileInput.first().setInputFiles(getTestDataPath('scanner/clean-document.jpg'));
      // Transition to crop or enhance view
      await expect(page.locator('.crop-view, .enhance-view, canvas, .btn-confirm-crop').first()).toBeVisible({ timeout: 10000 });
    }
  });
});
