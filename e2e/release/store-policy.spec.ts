import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';

/**
 * Play's "Government apps" policy needs the disclaimer to be findable, and the
 * Data Safety label needs the on-device processing claim written down somewhere
 * a reviewer can read it.
 */
const DISCLAIMER = /NOT affiliated with, authorized, endorsed by/i;

test.describe('Release — Store policy surfaces @release @policy', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('POL-001: the disclaimer is in the footer of an ordinary page', async ({ page }) => {
    await page.goto('/home');

    await expect(page.locator('app-footer .footer-disclaimer')).toContainText(DISCLAIMER);
  });

  test('POL-002: the disclaimer is on the Settings screen', async ({ page }) => {
    await page.goto('/features/settings');

    const notice = page.locator('app-gov-disclaimer [data-testid="gov-disclaimer"]');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(DISCLAIMER);
  });

  test('POL-003: the disclaimer is on the About screen', async ({ page }) => {
    await page.goto('/features/about-engine');

    const notice = page.locator('app-gov-disclaimer [data-testid="gov-disclaimer"]');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(DISCLAIMER);
  });

  test('POL-004: the Privacy Policy opens with readable content', async ({ page }) => {
    await page.goto('/features/privacy-policy');

    await expect(page.locator('h1, .page-title').first()).toBeVisible();
    const sections = page.locator('.policy-section');
    expect(await sections.count()).toBeGreaterThanOrEqual(5);
  });

  test('POL-005: the Privacy Policy carries the Data Safety disclosure', async ({ page }) => {
    await page.goto('/features/privacy-policy');

    const section = page.locator('#data-safety');
    await expect(section).toBeVisible();
    await expect(section).toContainText(/Data Safety/i);
    await expect(section).toContainText(/processed entirely on your device/i);
    await expect(section).toContainText(/never uploaded/i);

    // Each declared row must actually be there for the label to be checkable.
    const rows = section.locator('.data-safety-table tbody tr');
    expect(await rows.count()).toBeGreaterThanOrEqual(6);
    await expect(section).toContainText(/Files & documents/i);
    await expect(section).toContainText(/Email address and display name/i);
  });

  test('POL-006: the Data Safety table scrolls itself rather than the page', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/features/privacy-policy');

    await expect(page.locator('#data-safety')).toBeVisible();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('POL-007: the Terms of Use open with the government exam disclaimer', async ({ page }) => {
    await page.goto('/features/terms-of-use');

    await expect(page.locator('h1, .page-title').first()).toBeVisible();
    await expect(page.getByText(/not affiliated with, endorsed by/i)).toBeVisible();
  });

  test('POL-008: both legal routes are reachable from their short aliases', async ({ page }) => {
    await page.goto('/privacy-policy');
    await expect(page).toHaveURL(/\/features\/privacy-policy$/);

    await page.goto('/terms-of-use');
    await expect(page).toHaveURL(/\/features\/terms-of-use$/);
  });
});
