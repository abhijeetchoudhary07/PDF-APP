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

  /*
   * This used to click the camera button and expect a crop view, guarded by
   * `if (await cameraBtn.isVisible())` -- a one-shot check with no assertion
   * behind it, so whenever the button was not yet on screen the whole body was
   * skipped and the test passed having verified nothing. Run on its own, where
   * the button *is* up in time, it failed every time.
   *
   * It was asking for something the web build does not do. `captureFromCamera`
   * only calls `Camera.getPhoto` when `Capacitor.isNativePlatform()`; on the
   * web it falls back to `FileService.pickImageFile`, which opens a real OS
   * file dialog that no headless run can answer. Mocking the Camera plugin
   * cannot drive that path. There is no "Retake" control in the crop view
   * either -- cancelling is what goes back.
   *
   * So this now drives the import the web build actually supports and asserts
   * unconditionally, which is what makes it able to fail.
   */
  test('SCN-005 & SCN-006: Import a document and back out of cropping', async ({ page }) => {
    /*
     * `FileService` builds its <input type="file"> in JS and clicks it, so
     * there is never one in the DOM to `setInputFiles` on -- which is also why
     * SCN-010's `if (await fileInput.count() > 0)` never ran. Catching the
     * file chooser is the only way to answer that dialog from a test.
     */
    const chooser = page.waitForEvent('filechooser');
    await page.locator('app-button[data-testid="import-gallery"] button').click();
    await (await chooser).setFiles(getTestDataPath('scanner/clean-document.jpg'));

    // The crop step, with the canvas whose corners can be dragged.
    await expect(page.locator('.crop-card')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('canvas.interactive-crop-canvas')).toBeVisible();

    // Backing out of the crop returns to the captured-pages list, with the
    // page kept rather than discarded.
    await page.locator('app-button[data-testid="cancel-crop"] button').click();
    await expect(page.locator('.crop-card')).toBeHidden();
  });

  // Same hole as above: there is no <input type="file"> in the DOM, so
  // `count() > 0` was false and this asserted nothing.
  test('SCN-010 & SCN-011: Gallery fallback and file import', async ({ page }) => {
    const chooser = page.waitForEvent('filechooser');
    await page.locator('app-button[data-testid="import-gallery"] button').click();

    // The gallery accepts more than one page in a single go.
    expect((await chooser).isMultiple()).toBe(true);
    await (await chooser).setFiles(getTestDataPath('scanner/clean-document.jpg'));

    await expect(page.locator('.crop-card canvas.interactive-crop-canvas')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('app-button[data-testid="apply-crop"] button')).toBeVisible();
  });
});
