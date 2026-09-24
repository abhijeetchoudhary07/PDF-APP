import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';
import {
  API_DOWN_MESSAGE,
  TARGETS_LOCAL_API,
  WRONG_TARGET_MESSAGE,
  adminToken,
  apiIsReachable,
  fillCredentials,
  findPdfUserId,
  grantPremium,
  readStoredSession,
  registerThroughUi,
  revokePremium,
  setUserActive,
  TEST_PASSWORD,
  uniqueEmail,
} from './account-helpers';

/**
 * Entitlements, end to end.
 *
 * The claim these tests exist to check is the one the admin portal was built
 * for: an administrator changes a subscription, and the change reaches a
 * running app. Every grant and revoke below goes through the real admin API,
 * not a stub.
 */
test.describe('Account — entitlements @account @premium', () => {
  test.beforeEach(async ({ page, request }) => {
    test.skip(!TARGETS_LOCAL_API, WRONG_TARGET_MESSAGE);
    expect(await apiIsReachable(request), API_DOWN_MESSAGE).toBe(true);
    await setupCapacitorMocks(page);
  });

  test('ENT-001: the paywall lists plans served by the backend', async ({ page, request }) => {
    const plans = await (await request.get(`${process.env['PDF_APP_API_BASE'] ?? 'http://localhost:3001/api'}/v1/pdf-app/subscription/plans`)).json();
    const paid = plans.plans.filter((plan: { planId: string }) => plan.planId !== 'free');

    await page.goto('/features/premium');
    const cards = page.locator('.pricing-card');
    await expect(cards).toHaveCount(paid.length, { timeout: 20000 });

    // Every paid plan the server advertises is on the page, by its own name.
    for (const plan of paid) {
      await expect(page.locator('.package-title', { hasText: plan.name })).toBeVisible();
    }
    // 'free' is a tier, not something to sell.
    await expect(page.locator('.package-title', { hasText: /^Free$/ })).toHaveCount(0);
  });

  test('ENT-002: plan pricing and features come from the server, not the bundle', async ({
    page,
  }) => {
    await page.goto('/features/premium');
    await page.locator('.pricing-card').first().waitFor({ state: 'visible', timeout: 20000 });

    // The bundled fallback is only used when the server cannot be reached; if
    // it were showing, this note would be on the page.
    await expect(page.locator('.pricing-offline-note')).toHaveCount(0);

    // Filter on the title, not the whole card: the Lifetime card's feature
    // list mentions "Everything in Pro Annual" and would match too.
    const annual = page
      .locator('.pricing-card')
      .filter({ has: page.locator('.package-title', { hasText: 'Pro Annual' }) });
    await expect(annual.locator('.package-price')).toContainText('₹');
    await expect(annual.locator('.popular-badge')).toBeVisible();
    await expect(annual.locator('.package-features li').first()).toBeVisible();
  });

  test('ENT-003: an admin grant reaches a running app on refresh', async ({ page, request }) => {
    const email = uniqueEmail('grant');
    await registerThroughUi(page, email);
    await expect(page.locator('.plan-chip')).toHaveText('FREE');

    const token = await adminToken(request);
    const userId = await findPdfUserId(request, token, email);
    await grantPremium(request, token, userId, 'pro_annual');

    // Nothing was purchased on this device; the entitlement exists only on the
    // account, which is exactly what a support grant is.
    await page.getByRole('button', { name: 'Refresh status' }).click();

    await expect(page.locator('.plan-chip')).toHaveText('PRO', { timeout: 20000 });
    await expect(page.locator('.plan-value')).toHaveText('Pro Annual');
    await expect(page.locator('.plan-details')).toContainText('Granted by support');
  });

  test('ENT-004: a lifetime grant shows as never expiring', async ({ page, request }) => {
    const email = uniqueEmail('lifetime');
    await registerThroughUi(page, email);

    const token = await adminToken(request);
    const userId = await findPdfUserId(request, token, email);
    await grantPremium(request, token, userId, 'lifetime');

    await page.getByRole('button', { name: 'Refresh status' }).click();

    await expect(page.locator('.plan-value')).toHaveText('Lifetime', { timeout: 20000 });
    await expect(page.locator('.plan-details')).toContainText('Never expires');
    // A lifetime plan has no countdown to show.
    await expect(page.locator('.plan-details')).not.toContainText('Days left');
  });

  test('ENT-005: a revocation reaches the app too', async ({ page, request }) => {
    const email = uniqueEmail('revoke');
    await registerThroughUi(page, email);

    const token = await adminToken(request);
    const userId = await findPdfUserId(request, token, email);
    await grantPremium(request, token, userId, 'pro_monthly');
    await page.getByRole('button', { name: 'Refresh status' }).click();
    await expect(page.locator('.plan-chip')).toHaveText('PRO', { timeout: 20000 });

    await revokePremium(request, token, userId);
    await page.getByRole('button', { name: 'Refresh status' }).click();

    await expect(page.locator('.plan-chip')).toHaveText('FREE', { timeout: 20000 });
    await expect(page.getByRole('button', { name: 'See premium plans' })).toBeVisible();
  });

  test('ENT-006: an account grant unlocks premium across the app', async ({ page, request }) => {
    const email = uniqueEmail('unlock');
    await registerThroughUi(page, email);

    const token = await adminToken(request);
    const userId = await findPdfUserId(request, token, email);
    await grantPremium(request, token, userId, 'pro_annual');

    // Reload rather than pressing Refresh: this is the launch path, and it
    // proves the entitlement is read before any screen renders.
    await page.reload();
    await expect(page.locator('.plan-chip')).toHaveText('PRO', { timeout: 20000 });

    // The paywall must now say so, which means `isPremium$` reached the rest
    // of the app and not just this screen.
    await page.goto('/features/premium');
    await expect(page.locator('.already-premium')).toBeVisible({ timeout: 20000 });

    // And the profile row, which reads the same subject.
    await page.goto('/profile');
    await expect(page.locator('.account-row-card')).toContainText(email);
    await expect(page.locator('.account-row-card')).toContainText('Premium on this account');
  });

  test('ENT-007: the cached entitlement is shown before the server answers', async ({
    page,
    request,
  }) => {
    const email = uniqueEmail('offline');
    await registerThroughUi(page, email);

    const token = await adminToken(request);
    const userId = await findPdfUserId(request, token, email);
    await grantPremium(request, token, userId, 'lifetime');
    await page.reload();
    await expect(page.locator('.plan-chip')).toHaveText('PRO', { timeout: 20000 });

    // Now cut the network to the backend and relaunch. A paying customer on a
    // train must see premium, not the paywall.
    await page.route('**/api/v1/pdf-app/**', (route) => route.abort('failed'));
    await page.reload();

    await expect(page.locator('.plan-chip')).toHaveText('PRO', { timeout: 20000 });
    await expect(page.locator('.plan-value')).toHaveText('Lifetime');
    // Still signed in: an unreachable server is not a revocation.
    await expect(page.locator('.account-email')).toHaveText(email);
  });

  test('ENT-008: a suspended account is signed out of the app', async ({ page, request }) => {
    const email = uniqueEmail('suspend');
    await registerThroughUi(page, email);

    const token = await adminToken(request);
    const userId = await findPdfUserId(request, token, email);
    await setUserActive(request, token, userId, false);

    await page.getByRole('button', { name: 'Refresh status' }).click();

    await expect(page.getByRole('tab', { name: 'Create account' })).toBeVisible({ timeout: 20000 });
    expect(await readStoredSession(page)).toBeNull();

    // And the credentials no longer work while the suspension stands.
    await fillCredentials(page, email, TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.locator('.toast, .toast-container, .input-error').first()).toBeVisible({
      timeout: 20000,
    });
    await expect(page.locator('.account-identity')).toHaveCount(0);

    // Reactivating restores access, so the test leaves nothing suspended behind.
    await setUserActive(request, token, userId, true);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.locator('.account-email')).toHaveText(email, { timeout: 20000 });
  });

  test('ENT-009: tools stay available on the free tier', async ({ page }) => {
    const email = uniqueEmail('freetools');
    await registerThroughUi(page, email);
    await expect(page.locator('.plan-chip')).toHaveText('FREE');

    // Being on the free tier gates premium features, not the product.
    await page.goto('/features/pdf');
    await expect(page.locator('app-header').first()).toBeVisible();
    await expect(page.locator('body')).toContainText('PDF');
  });
});
