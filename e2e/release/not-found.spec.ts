import { test, expect, Page } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';

/**
 * The wildcard route used to bounce every unmatched URL to the dashboard, which
 * made a stale bookmark look like the app had reset itself. These cover the
 * dedicated 404 page that replaced it.
 */
/**
 * Waits until the wildcard redirect has actually finished.
 *
 * `/invalid-test-path` redirects to `/404` and then lazy-loads the component.
 * Clicking a routerLink while that is still in flight registers the click and
 * navigates nowhere — which is what made these tests flaky on the slower mobile
 * profile, and only under load.
 */
async function settleOn404(page: Page): Promise<void> {
  await page.waitForURL(/\/404$/);
  await expect(page.getByRole('heading', { name: 'Page Not Found' })).toBeVisible();
}

test.describe('Release — 404 / Not Found @release @not-found', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('404-001: an unknown path renders the Not Found page and rewrites the URL', async ({ page }) => {
    await page.goto('/invalid-test-path');

    await expect(page).toHaveURL(/\/404$/);
    await expect(page.getByRole('heading', { name: 'Page Not Found' })).toBeVisible();
    await expect(page.getByText(/does not exist/i)).toBeVisible();
  });

  test('404-002: a deep unknown path resolves to the same page, not the dashboard', async ({ page }) => {
    await page.goto('/features/pdf/definitely-not-a-tool');

    await expect(page).toHaveURL(/\/404$/);
    await expect(page.getByRole('heading', { name: 'Page Not Found' })).toBeVisible();
  });

  test('404-003: /404 is reachable directly', async ({ page }) => {
    await page.goto('/404');

    await expect(page).toHaveURL(/\/404$/);
    await expect(page.getByRole('heading', { name: 'Page Not Found' })).toBeVisible();
  });

  test('404-004: "Back to Home" navigates to the dashboard', async ({ page }) => {
    await page.goto('/invalid-test-path');
    await settleOn404(page);

    await Promise.all([page.waitForURL(/\/home$/), page.locator('.nf-btn-primary').click()]);

    await expect(page).toHaveURL(/\/home$/);
  });

  test('404-005: "Browse All Tools" navigates to the PDF tools hub', async ({ page }) => {
    await page.goto('/invalid-test-path');
    await settleOn404(page);

    await Promise.all([
      page.waitForURL(/\/features\/pdf$/),
      page.locator('.nf-btn-secondary').click(),
    ]);

    await expect(page).toHaveURL(/\/features\/pdf$/);
  });

  test('404-006: the shortcut chips reach real tool routes', async ({ page }) => {
    await page.goto('/invalid-test-path');

    await settleOn404(page);

    // Scoped to the chips: 'Photo Tools' also appears in the drawer and footer.
    const chip = page.locator('.nf-chip', { hasText: 'Photo Tools' });
    await expect(chip).toBeVisible();
    await Promise.all([page.waitForURL(/\/features\/photo$/), chip.click()]);

    await expect(page).toHaveURL(/\/features\/photo$/);
    await expect(page.locator('h1, .page-title').first()).toBeVisible();
  });

  test('404-007: the page renders without horizontal overflow on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/invalid-test-path');

    await expect(page.getByRole('heading', { name: 'Page Not Found' })).toBeVisible();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('404-008: the shell stays available, so the page is not a dead end', async ({ page }) => {
    await page.goto('/invalid-test-path');

    await expect(page.locator('app-header')).toBeVisible();
    await expect(page.locator('app-footer')).toBeVisible();
  });
});
