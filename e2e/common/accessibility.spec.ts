import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';

test.describe('Common — Accessibility & Responsive UI @a11y @mobile', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('A11Y-004 & A11Y-005: Interactive buttons have accessible names and labels', async ({ page }) => {
    await page.goto('/features/pdf-ocr');

    // All primary buttons must have accessible name or label
    const buttons = page.locator('button:visible');
    const count = await buttons.count();
    for (let i = 0; i < Math.min(count, 5); i++) {
      const btn = buttons.nth(i);
      const name = await btn.getAttribute('aria-label') || await btn.innerText();
      expect(name.trim().length).toBeGreaterThan(0);
    }
  });

  test('RES-001 & RES-004: Responsive layouts on mobile (375x667) and desktop (1280x800)', async ({ page }) => {
    // Mobile Viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/features/document-validator');
    await expect(page.locator('.page-title, h1')).toBeVisible();

    // Desktop Viewport
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/features/document-validator');
    await expect(page.locator('.page-title, h1')).toBeVisible();
  });
});
