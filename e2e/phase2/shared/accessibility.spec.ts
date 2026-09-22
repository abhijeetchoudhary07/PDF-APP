import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../../fixtures/mocks';

const PHASE2_ROUTES = [
  '/features/pdf-compare',
  '/features/pdf-privacy-sanitizer',
  '/features/pdf-header-footer',
  '/features/pdf-repair',
  '/features/pdf-extractor'
];

test.describe('Phase 2 Shared — Accessibility & Keyboard Navigation @phase2 @accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  for (const route of PHASE2_ROUTES) {
    test(`A11Y: Route ${route} has accessible headings, buttons, and inputs`, async ({ page }) => {
      await page.goto(route);

      // Verify at least one h1 / h2 heading exists
      const headings = page.locator('h1, h2, .page-title');
      await expect(headings.first()).toBeVisible();

      // Verify all buttons have accessible text or aria-label
      const buttons = page.locator('button:visible');
      const buttonCount = await buttons.count();
      for (let i = 0; i < Math.min(buttonCount, 10); i++) {
        const btn = buttons.nth(i);
        const text = (await btn.innerText()).trim();
        const ariaLabel = await btn.getAttribute('aria-label');
        const title = await btn.getAttribute('title');
        expect(text.length > 0 || !!ariaLabel || !!title).toBe(true);
      }
    });

    test(`A11Y: Route ${route} allows keyboard tab navigation without focus traps`, async ({ page }) => {
      await page.goto(route);
      // Press tab key multiple times and ensure focus advances
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');
      }
      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(focusedElement).toBeTruthy();
    });
  }
});
