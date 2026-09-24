import { test, expect, Page } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';

/**
 * The paywall, which sells premium through **manual UPI payment** rather than
 * Google Play Billing: the person transfers the amount in their own bank app
 * and submits the reference, and an admin confirms it.
 *
 * The property these guard is that a submitted reference is a *claim*, never an
 * unlock — the UI has to show a pending state, not premium.
 *
 * The account backend lives in a separate repository and is not running during
 * e2e, so the payee settings and the submit call are stubbed here. That also
 * makes the tests deterministic, which hitting a real UPI backend never would be.
 */

const PAYMENT_SETTINGS = {
  settings: {
    upiId: 'indianformhelper@okicici',
    upiName: 'Indian Form Helper',
    qrCodeData: null,
    bankName: 'HDFC Bank',
    bankAccountNumber: '50200012345678',
    bankAccountName: 'Indian Form Helper',
    bankIfsc: 'HDFC0001234',
    bankBranch: null,
    instructions: 'Pay the exact amount, then enter the 12-digit UTR number.',
    reviewHours: 24,
    isActive: true,
  },
};

const FREE_ENTITLEMENT = {
  isPremium: false,
  planId: 'free',
  status: 'active',
  validUntil: null,
  platform: null,
  daysRemaining: null,
};

const TEST_USER = {
  id: 'user-1',
  email: 'payer@example.com',
  displayName: 'Payer',
  authProvider: 'email',
  isActive: true,
  isVerified: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  lastLoginAt: null,
};

/** Puts a signed-in session in storage, the way a real sign-in would. */
async function signIn(page: Page): Promise<void> {
  await page.addInitScript(
    ({ entitlement, user }) => {
    const session = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      user,
      entitlement,
      syncedAt: Date.now(),
    };
    try {
      const value = JSON.stringify(session);
      // Both spellings: Capacitor's own web Preferences prefixes its keys,
      // while the harness mock in e2e/fixtures reads them unprefixed.
      localStorage.setItem('CapacitorStorage.IFH_PDF_ACCOUNT_SESSION_V1', value);
      localStorage.setItem('IFH_PDF_ACCOUNT_SESSION_V1', value);
    } catch {
      /* private mode: the test that needs this will fail loudly anyway */
    }
    },
    { entitlement: FREE_ENTITLEMENT, user: TEST_USER },
  );
}

/** Stubs the account backend. `claims` is what GET manual-payment returns. */
async function stubBackend(
  page: Page,
  options: { settings?: unknown; claims?: unknown[]; submitStatus?: number; submitBody?: unknown } = {},
): Promise<void> {
  const claims = options.claims ?? [];

  await page.route('**/subscription/payment-settings', (route) =>
    route.fulfill({ json: options.settings ?? PAYMENT_SETTINGS }),
  );

  await page.route('**/auth/me', (route) =>
    route.fulfill({ json: { user: TEST_USER, entitlement: FREE_ENTITLEMENT } }),
  );

  await page.route('**/subscription/manual-payment', async (route) => {
    if (route.request().method() === 'POST') {
      const body = JSON.parse(route.request().postData() ?? '{}');
      await route.fulfill({
        status: options.submitStatus ?? 201,
        json:
          options.submitBody ?? {
            request: {
              id: 'claim-1',
              userId: 'user-1',
              planId: body.planId,
              amount: 365,
              currency: 'INR',
              durationDays: 365,
              paymentMethod: 'UPI',
              utrNumber: body.utrNumber,
              senderName: body.senderName ?? null,
              senderUpiId: null,
              contactNote: body.contactNote ?? null,
              status: 'pending',
              adminNotes: null,
              rejectionReason: null,
              reviewedAt: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
      });
      return;
    }

    await route.fulfill({
      json: {
        requests: claims,
        pending: claims.find((claim: any) => claim.status === 'pending') ?? null,
        entitlement: FREE_ENTITLEMENT,
      },
    });
  });
}

test.describe('Release — Premium & manual payment @release @premium', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('PREM-001: plans render immediately, with no empty or loading state', async ({ page }) => {
    await page.goto('/features/premium');

    const cards = page.locator('.pricing-card');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(3);

    // Never the placeholder the page used to show while the server answered.
    await expect(page.getByText('Loading plans…')).toHaveCount(0);

    const titles = await cards.locator('.package-title').allTextContents();
    expect(titles).toEqual(expect.arrayContaining(['Pro Monthly', 'Pro Annual', 'Lifetime']));
  });

  test('PREM-002: every plan shows a price, a billing note and its features', async ({ page }) => {
    await page.goto('/features/premium');

    const cards = page.locator('.pricing-card');
    const count = await cards.count();

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      await expect(card.locator('.package-price')).not.toBeEmpty();
      await expect(card.locator('.package-desc')).not.toBeEmpty();
      await expect(card.locator('.package-features li').first()).toBeVisible();
      await expect(card.locator('app-button button')).toBeVisible();
    }
  });

  test('PREM-003: the benefits list renders', async ({ page }) => {
    await page.goto('/features/premium');

    await expect(page.getByRole('heading', { name: 'Premium Benefits' })).toBeVisible();

    const benefits = page.locator('.benefits-grid .benefit-item h4');
    expect(await benefits.allTextContents()).toEqual(
      expect.arrayContaining(['100% Ad-Free', 'Batch Processing']),
    );
  });

  test('PREM-004: the CTA names the amount, so nothing is hidden behind a tap', async ({ page }) => {
    await stubBackend(page);
    await page.goto('/features/premium');

    const cta = page.locator('.pricing-card app-button button').first();
    await expect(cta).toContainText(/Pay\s/);
    await expect(cta).toContainText(/\d/);
  });

  test('PREM-005: with no backend, the page says payments are unavailable', async ({ page }) => {
    // Aborted rather than simply unstubbed: a developer running the account
    // server locally would otherwise make this pass for the wrong reason.
    await page.route('**/subscription/payment-settings', (route) => route.abort());
    await page.goto('/features/premium');

    const notice = page.locator('[data-testid="store-notice"]');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(/unavailable/i);
    // Pricing is still shown: an empty paywall is worse than a caveated one.
    await expect(page.locator('.pricing-card').first()).toBeVisible();
  });

  test('PREM-006: choosing a plan while signed out routes to the account screen', async ({ page }) => {
    await stubBackend(page);
    await page.goto('/features/premium');

    await page.locator('.pricing-card app-button button').first().click();

    // The claim has to attach to an account or there is nobody to grant.
    await expect(page).toHaveURL(/\/account/);
  });

  test('PREM-007: choosing a plan opens the UPI panel with payee details and a QR', async ({ page }) => {
    await signIn(page);
    await stubBackend(page);
    await page.goto('/features/premium');

    await page.locator('.pricing-card app-button button').first().click();

    const panel = page.locator('[data-testid="pay-panel"]');
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-testid="upi-id"]')).toHaveText('indianformhelper@okicici');
    await expect(panel.locator('[data-testid="open-upi"]')).toBeVisible();
    await expect(panel.locator('[data-testid="copy-upi"]')).toBeVisible();

    // The QR is generated on device from the UPI intent, so it works even
    // when no image has been uploaded by an admin.
    const qr = panel.locator('.qr-img');
    await expect(qr).toBeVisible();
    expect(await qr.getAttribute('src')).toMatch(/^data:image\/png;base64,/);

    // Bank details appear when they are configured.
    await expect(panel.locator('.bank-box')).toContainText('HDFC0001234');
  });

  test('PREM-008: submit is blocked until a plausible reference is entered', async ({ page }) => {
    await signIn(page);
    await stubBackend(page);
    await page.goto('/features/premium');
    await page.locator('.pricing-card app-button button').first().click();

    const submit = page.locator('[data-testid="submit-payment"] button');
    await expect(submit).toBeDisabled();

    await page.locator('[data-testid="utr-input"]').fill('abc');
    await expect(submit).toBeDisabled();

    await page.locator('[data-testid="utr-input"]').fill('412345678901');
    await expect(submit).toBeEnabled();
  });

  test('PREM-009: submitting shows a pending state, not an unlock', async ({ page }) => {
    await signIn(page);
    await stubBackend(page);
    await page.goto('/features/premium');
    await page.locator('.pricing-card app-button button').nth(1).click();

    await page.locator('[data-testid="utr-input"]').fill('419988776655');
    await page.locator('[data-testid="submit-payment"] button').click();

    const pending = page.locator('[data-testid="pending-claim"]');
    await expect(pending).toBeVisible();
    // The reference is echoed back so nobody submits the same transfer twice.
    await expect(pending).toContainText('419988776655');
    await expect(pending).toContainText(/under review/i);
    await expect(pending).toContainText(/do not pay again/i);

    // The panel closes, and every plan button locks while a claim is open.
    await expect(page.locator('[data-testid="pay-panel"]')).toBeHidden();
    const buttons = page.locator('.pricing-card app-button button');
    for (let i = 0; i < (await buttons.count()); i++) {
      await expect(buttons.nth(i)).toBeDisabled();
    }
  });

  test('PREM-010: an existing pending claim is shown on load', async ({ page }) => {
    await signIn(page);
    await stubBackend(page, {
      claims: [
        {
          id: 'claim-1',
          userId: 'user-1',
          planId: 'pro_annual',
          amount: 365,
          currency: 'INR',
          durationDays: 365,
          paymentMethod: 'UPI',
          utrNumber: '400011112222',
          senderName: null,
          senderUpiId: null,
          contactNote: null,
          status: 'pending',
          adminNotes: null,
          rejectionReason: null,
          reviewedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });
    await page.goto('/features/premium');

    const pending = page.locator('[data-testid="pending-claim"]');
    await expect(pending).toBeVisible();
    await expect(pending).toContainText('400011112222');
    // The plan's name and a formatted amount, not the raw id and a bare number.
    await expect(pending).toContainText('Pro Annual');
    await expect(pending).not.toContainText('pro_annual');
    await expect(pending).toContainText('₹');
    await expect(page.locator('[data-testid="check-status"]')).toBeVisible();
  });

  test('PREM-011: a rejected claim explains itself and allows another attempt', async ({ page }) => {
    await signIn(page);
    await stubBackend(page, {
      claims: [
        {
          id: 'claim-2',
          userId: 'user-1',
          planId: 'pro_monthly',
          amount: 49,
          currency: 'INR',
          durationDays: 30,
          paymentMethod: 'UPI',
          utrNumber: '400033334444',
          senderName: null,
          senderUpiId: null,
          contactNote: null,
          status: 'rejected',
          adminNotes: null,
          rejectionReason: 'No transfer found for that reference.',
          reviewedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });
    await page.goto('/features/premium');

    const rejected = page.locator('[data-testid="rejected-claim"]');
    await expect(rejected).toBeVisible();
    await expect(rejected).toContainText('No transfer found');

    // Not locked out: the plan buttons stay live so a new payment can be made.
    await expect(page.locator('.pricing-card app-button button').first()).toBeEnabled();
  });

  test('PREM-012: a duplicate submission is reported, not swallowed', async ({ page }) => {
    await signIn(page);
    await stubBackend(page, {
      submitStatus: 409,
      submitBody: { error: 'You already have a payment awaiting review.' },
    });
    await page.goto('/features/premium');
    await page.locator('.pricing-card app-button button').first().click();

    await page.locator('[data-testid="utr-input"]').fill('412345678901');
    await page.locator('[data-testid="submit-payment"] button').click();

    await expect(page.locator('app-toast-container')).toContainText(/awaiting review|could not submit/i, {
      timeout: 10000,
    });
    // And the panel stays open so the reference is not lost.
    await expect(page.locator('[data-testid="pay-panel"]')).toBeVisible();
  });

  test('PREM-013: Restore Premium is present and always resolves', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await stubBackend(page);
    await page.goto('/features/premium');

    const restore = page.locator('[data-testid="restore-purchases"] button');
    await expect(restore).toBeVisible();

    await restore.click();

    await expect(page.locator('app-toast-container')).toContainText(
      /no active premium|sign in|restored|could not reach/i,
      { timeout: 10000 },
    );
    // Never left spinning.
    await expect(restore).toBeEnabled({ timeout: 10000 });
    expect(errors).toEqual([]);
  });

  test('PREM-014: manual-payment terms are disclosed on the paywall', async ({ page }) => {
    await stubBackend(page);
    await page.goto('/features/premium');

    const terms = page.locator('.billing-terms');
    await expect(terms).toBeVisible();

    await expect(terms).toContainText(/billing period/i);
    // The critical difference from store billing: nothing renews by itself.
    await expect(terms).toContainText(/no automatic renewal/i);
    await expect(terms).toContainText(/activation/i);
    await expect(terms).toContainText(/refund/i);
  });

  test('PREM-015: the paywall links to the legal pages', async ({ page }) => {
    await stubBackend(page);
    await page.goto('/features/premium');

    await page.locator('.terms-links a', { hasText: 'Terms of Use' }).click();
    await expect(page).toHaveURL(/\/features\/terms-of-use$/);

    await page.goto('/features/premium');
    await page.locator('.terms-links a', { hasText: 'Privacy Policy' }).click();
    await expect(page).toHaveURL(/\/features\/privacy-policy$/);
  });

  test('PREM-016: offline pricing is labelled as last known when the server is unreachable', async ({ page }) => {
    await page.route('**/subscription/plans', (route) => route.abort());

    await page.goto('/features/premium');

    await expect(page.locator('.pricing-offline-note')).toBeVisible();
    await expect(page.locator('.pricing-card').first()).toBeVisible();
  });

  test('PREM-017: the paywall and pay panel fit a phone without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await signIn(page);
    await stubBackend(page);
    await page.goto('/features/premium');

    await expect(page.locator('.pricing-card').first()).toBeVisible();
    await page.locator('.pricing-card app-button button').first().click();
    await expect(page.locator('[data-testid="pay-panel"]')).toBeVisible();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
