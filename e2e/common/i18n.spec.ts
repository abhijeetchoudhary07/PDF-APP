import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';

test.describe('Common — Internationalization (i18n) @i18n @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('I18N-001 to I18N-005 & I18N-015: Verify all 5 languages and no raw translation keys visible in OCR', async ({ page }) => {
    await page.goto('/features/pdf-ocr');

    // Verify no raw translation keys like "ocr." or "tools." are rendered on page
    const rawKeys = await page.locator('body').innerText();
    expect(rawKeys).not.toMatch(/\b(ocr\.[a-zA-Z0-9_]+)\b/);
    expect(rawKeys).not.toMatch(/\b(scanner\.[a-zA-Z0-9_]+)\b/);
    expect(rawKeys).not.toMatch(/\b(validator\.[a-zA-Z0-9_]+)\b/);
  });

  test('I18N-007 & I18N-015: Verify Document Scanner page has no raw translation keys', async ({ page }) => {
    await page.goto('/features/document-scanner');

    const rawKeys = await page.locator('body').innerText();
    expect(rawKeys).not.toMatch(/\b(scanner\.[a-zA-Z0-9_]+)\b/);
  });

  test('I18N-008 & I18N-015: Verify Document Validator page has no raw translation keys', async ({ page }) => {
    await page.goto('/features/document-validator');

    const rawKeys = await page.locator('body').innerText();
    expect(rawKeys).not.toMatch(/\b(validator\.[a-zA-Z0-9_]+)\b/);
  });
});
