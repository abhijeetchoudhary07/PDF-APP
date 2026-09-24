import { test, expect, Page } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';

/**
 * The free tier's daily allowance: five completed outputs, reset at local
 * midnight, unlimited on premium.
 *
 * The thing worth protecting is that the number is *visible before it runs
 * out*. A limit a user only discovers when a save is refused reads as a bug;
 * one they can see counting down reads as a tier.
 */

const STORAGE_KEY = 'CapacitorStorage.IFH_DAILY_USAGE_V1';

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
}

/** Puts a used-up (or partly used) counter in storage before the app boots. */
async function seedUsage(page: Page, count: number, date = today()): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      try {
        localStorage.setItem(key, value);
        // The e2e Capacitor mock reads the unprefixed spelling.
        localStorage.setItem(key.replace('CapacitorStorage.', ''), value);
      } catch {
        /* ignored */
      }
    },
    { key: STORAGE_KEY, value: JSON.stringify({ date, count }) },
  );
}

/** A signed-in account the server reports as premium. */
async function signInPremium(page: Page): Promise<void> {
  const user = {
    id: 'user-premium',
    email: 'pro@example.com',
    displayName: 'Pro',
    authProvider: 'email',
    isActive: true,
    isVerified: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastLoginAt: null,
  };
  const entitlement = {
    isPremium: true,
    planId: 'pro_annual',
    status: 'active',
    validUntil: null,
    platform: 'manual_admin',
    daysRemaining: null,
  };

  await page.addInitScript(
    ({ user: u, entitlement: e }) => {
      const value = JSON.stringify({
        accessToken: 'token',
        refreshToken: 'refresh',
        user: u,
        entitlement: e,
        syncedAt: Date.now(),
      });
      try {
        localStorage.setItem('CapacitorStorage.IFH_PDF_ACCOUNT_SESSION_V1', value);
        localStorage.setItem('IFH_PDF_ACCOUNT_SESSION_V1', value);
      } catch {
        /* ignored */
      }
    },
    { user, entitlement },
  );

  await page.route('**/auth/me', (route) => route.fulfill({ json: { user, entitlement } }));
}

test.describe('Release — Free tier daily quota @release @quota', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('QUOTA-001: a fresh free account sees the full allowance on the dashboard', async ({ page }) => {
    await page.goto('/home');

    const hero = page.locator('[data-testid="hero-quota"]');
    await expect(hero).toBeVisible();
    await expect(hero).toContainText('5 of 5');
    await expect(hero).toContainText(/free operations left today/i);
  });

  test('QUOTA-002: the count reflects what has been used today', async ({ page }) => {
    await seedUsage(page, 3);
    await page.goto('/home');

    await expect(page.locator('[data-testid="hero-quota"]')).toContainText('2 of 5');
  });

  test('QUOTA-003: an exhausted allowance shows zero rather than disappearing', async ({ page }) => {
    await seedUsage(page, 5);
    await page.goto('/home');

    const hero = page.locator('[data-testid="hero-quota"]');
    await expect(hero).toBeVisible();
    // Zero is falsy: an *ngIf-as binding would hide this at the one moment it
    // has something to say.
    await expect(hero).toContainText('0 of 5');
    await expect(hero).toHaveClass(/is-spent/);
    await expect(hero).toContainText(/unlimited/i);
  });

  test('QUOTA-004: yesterday\'s usage does not count against today', async ({ page }) => {
    await seedUsage(page, 5, '2020-01-01');
    await page.goto('/home');

    await expect(page.locator('[data-testid="hero-quota"]')).toContainText('5 of 5');
  });

  test('QUOTA-005: the allowance links to the paywall', async ({ page }) => {
    await seedUsage(page, 5);
    await page.goto('/home');

    await page.locator('[data-testid="hero-quota"]').click();

    await expect(page).toHaveURL(/\/features\/premium$/);
  });

  test('QUOTA-006: the mobile drawer carries the same number', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedUsage(page, 2);
    await page.goto('/home');

    await page.getByRole('button', { name: 'Toggle Navigation Menu' }).click();

    const drawerQuota = page.locator('[data-testid="drawer-quota"]');
    await expect(drawerQuota).toBeVisible();
    await expect(drawerQuota).toContainText('3 of 5');
  });

  test('QUOTA-007: the desktop header carries it too', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await seedUsage(page, 1);
    await page.goto('/home');

    const chip = page.locator('[data-testid="quota-chip"]');
    await expect(chip).toBeVisible();
    await expect(chip).toContainText('4');
    await expect(chip).toHaveAttribute('title', /4 of 5 free operations left today/);
  });

  test('QUOTA-008: premium sees no allowance anywhere', async ({ page }) => {
    await signInPremium(page);
    await seedUsage(page, 5);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/home');

    // Give the stored session time to restore and publish premium.
    await expect(page.locator('[data-testid="hero-quota"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="quota-chip"]')).toHaveCount(0);
  });

  test('QUOTA-009: the dashboard has no horizontal overflow at 360px with the pill', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await seedUsage(page, 5);
    await page.goto('/home');

    await expect(page.locator('[data-testid="hero-quota"]')).toBeVisible();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
