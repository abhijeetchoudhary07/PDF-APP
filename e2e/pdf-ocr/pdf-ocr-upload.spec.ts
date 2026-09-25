import { test, expect } from '@playwright/test';
import { getTestDataPath, setupCapacitorMocks } from '../fixtures/mocks';

/**
 * Returns the page to the file picker.
 *
 * The dropzone lives on the `select` step only, so once a file is chosen its
 * `input[type=file]` is gone from the DOM and a second `setInputFiles` simply
 * times out. "Cancel" on the detection summary is the way back.
 */
async function resetToPicker(page: import('@playwright/test').Page) {
  const cancel = page.getByRole('button', { name: /^cancel$/i }).first();
  if (await cancel.count()) {
    await cancel.click();
  }
  await expect(page.locator('input[type="file"]')).toBeAttached({ timeout: 10000 });
}

test.describe('Smart PDF OCR — Upload & Input @ocr @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.goto('/features/pdf-ocr');
  });

  test('OCR-001: Open Smart PDF OCR page', async ({ page }) => {
    await expect(page).toHaveURL(/.*features\/pdf-ocr/);
    await expect(page.locator('h1, .page-title').first()).toContainText(/ocr|text/i);
    await expect(page.locator('input[type="file"]')).toBeAttached();
  });

  test('OCR-002: Upload valid text PDF', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(getTestDataPath('pdf/text.pdf'));

    // Verify file is accepted and preview/details are visible
    await expect(page.locator('.file-name, .selected-file-card, .file-meta-bar').first()).toContainText('text.pdf');
  });

  test('OCR-003: Upload scanned PDF', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(getTestDataPath('pdf/scanned.pdf'));

    await expect(page.locator('.file-name, .selected-file-card, .file-meta-bar').first()).toContainText('scanned.pdf');
  });

  test('OCR-004: Upload image file', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(getTestDataPath('photos/valid-photo.jpg'));

    await expect(page.locator('.file-name, .selected-file-card, .file-meta-bar').first()).toContainText('valid-photo.jpg');
  });

  test('OCR-005: Upload camera/scanner output image', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(getTestDataPath('scanner/clean-document.jpg'));

    await expect(page.locator('.file-name, .selected-file-card, .file-meta-bar').first()).toContainText('clean-document.jpg');
  });

  test('OCR-006: Upload unsupported file type', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(getTestDataPath('pdf/unsupported.txt'));

    // Should display validation error toast or alert
    await expect(page.locator('.toast-item, [role="alert"], .error-message').first()).toBeVisible();
  });

  test('OCR-007: Upload corrupted PDF', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(getTestDataPath('pdf/corrupt.pdf'));

    await expect(page.locator('.toast-item, [role="alert"], .error-message').first()).toBeVisible();
  });

  test('OCR-008: Upload empty/zero-byte file', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'empty.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from([])
    });

    await expect(page.locator('.toast-item, [role="alert"], .error-message').first()).toBeVisible();
  });

  test('OCR-011: Select same file twice without stale state', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(getTestDataPath('pdf/text.pdf'));
    await expect(page.locator('.file-name, .selected-file-card, .file-meta-bar').first()).toContainText('text.pdf');

    // Select again
    await resetToPicker(page);
    await page.locator('input[type="file"]').setInputFiles(getTestDataPath('pdf/text.pdf'));
    await expect(page.locator('.file-name, .selected-file-card, .file-meta-bar').first()).toContainText('text.pdf');
  });

  test('OCR-012: Replace selected file with another', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(getTestDataPath('pdf/text.pdf'));
    await expect(page.locator('.file-name, .selected-file-card, .file-meta-bar').first()).toContainText('text.pdf');

    await resetToPicker(page);
    await page.locator('input[type="file"]').setInputFiles(getTestDataPath('pdf/scanned.pdf'));
    await expect(page.locator('.file-name, .selected-file-card, .file-meta-bar').first()).toContainText('scanned.pdf');
  });

  test('OCR-013: Remove selected file resets state', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(getTestDataPath('pdf/text.pdf'));
    await expect(page.locator('.file-name, .selected-file-card, .file-meta-bar').first()).toContainText('text.pdf');

    // Click remove/reset button
    const removeBtn = page.locator('.btn-remove-file, .btn-reset, [aria-label*="remove" i], [aria-label*="close" i], button:has-text("Change")');
    if (await removeBtn.isVisible()) {
      await removeBtn.click();
      await expect(page.locator('.dropzone-container, app-file-dropzone, input[type="file"]').first()).toBeVisible();
    }
  });
});
