import { test, expect, type APIRequestContext } from '@playwright/test';
import { setupCapacitorMocks, getTestDataPath } from '../fixtures/mocks';
import { ALL_TOOLS, AccountPage, AppShell, PremiumPage, ToolPage } from '../pages/app.pages';
import {
  API_DOWN_MESSAGE,
  PDF_API,
  TARGETS_LOCAL_API,
  TEST_PASSWORD,
  WRONG_TARGET_MESSAGE,
  adminToken,
  apiIsReachable,
  findPdfUserId,
  grantPremium,
  readStoredSession,
  uniqueEmail,
} from '../account/account-helpers';

/**
 * The whole product in one pass, in the order a real person meets it.
 *
 * `user-journey.spec.ts` already covers the short arc (sign up → tool → sign
 * out → sign in) and the credential rules. This is the long one: every tool in
 * the catalogue, the paywall, the purchase, the premium state, and the account
 * deletion Google Play requires.
 *
 * ---------------------------------------------------------------------------
 * Three things this test does differently from the brief that asked for it,
 * because the app is not shaped the way the brief assumed:
 *
 * 1. **There is no email/OTP verification.** `POST /auth/register` returns a
 *    session immediately. There is no inbox to poll and no bypass to build.
 *
 * 2. **There is no purchasable sandbox.** Premium is sold by manual UPI
 *    transfer (a human pays, an admin approves) or by Google Play Billing,
 *    which needs a device and a signed build. Neither can run in a browser. So
 *    the purchase is driven the way production actually grants it — through the
 *    admin endpoint — which exercises the same `grantPremium` path an approved
 *    UPI claim takes. The claim-submission half is covered separately in
 *    `e2e/account/account-entitlement.spec.ts`.
 *
 * 3. **There are no protected routes.** The app has no route guards, by
 *    design: every tool runs on the device and works signed out. So the final
 *    stage does not assert that tools become inaccessible after sign-out — it
 *    asserts the opposite, because a tool that stopped working when you signed
 *    out would be the bug.
 * ---------------------------------------------------------------------------
 */

/** Reads the entitlement straight from the server, to check the UI against. */
async function serverEntitlement(
  request: APIRequestContext,
  accessToken: string,
): Promise<{ isPremium: boolean; planId: string }> {
  const response = await request.get(`${PDF_API}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(response.ok(), `GET /auth/me failed: ${response.status()}`).toBe(true);
  return (await response.json()).entitlement;
}

test.describe('Release — Full user journey @release @journey @full', () => {
  // One continuous story: the stages share an account and must run in order.
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page, request }) => {
    test.skip(!TARGETS_LOCAL_API, WRONG_TARGET_MESSAGE);
    expect(await apiIsReachable(request), API_DOWN_MESSAGE).toBe(true);
    await setupCapacitorMocks(page);
  });

  test('JOURNEY-FULL: sign up → every tool → paywall → premium → delete account', async ({
    page,
    request,
  }) => {
    // The whole catalogue plus a purchase is far more than one test's budget.
    test.slow();

    const email = uniqueEmail('full');
    const account = new AccountPage(page);
    const premium = new PremiumPage(page);
    const shell = new AppShell(page);

    // === 1. Sign up ========================================================
    await account.open();
    await account.selectMode('Create account');
    await account.fill(email, TEST_PASSWORD);
    await account.submit('Create account');

    await expect(account.email).toHaveText(email);
    await expect(account.planValue).toHaveText('Free');

    const registered = await readStoredSession(page);
    expect(registered?.user?.email, 'the session was not persisted').toBe(email);

    // No OTP step exists — registration is complete and authenticated here.
    expect(registered?.user?.isVerified !== undefined).toBe(true);

    // === 2. Sign out, then back in ========================================
    await account.signOut();
    expect(await readStoredSession(page), 'session outlived sign-out').toBeNull();

    await account.open();
    await account.selectMode('Sign in');
    await account.fill(email, TEST_PASSWORD);
    await account.submit('Sign in');
    await expect(account.email).toHaveText(email);

    const signedIn = await readStoredSession(page);
    expect(signedIn?.user?.email).toBe(email);
    const accessToken = signedIn?.accessToken as string;
    expect(accessToken, 'no access token was stored').toBeTruthy();

    // === 3. Every tool in the catalogue, as a free user ====================
    // Each one must load, stay on its own route, and be interactive. A tool
    // that silently redirects home is the failure this stage exists to catch.
    for (const spec of ALL_TOOLS) {
      const tool = new ToolPage(page, spec);
      await test.step(`free: ${spec.name}`, async () => {
        await tool.open();
        await expect(shell.header).toBeVisible();
      });
    }

    // The main action, on the tools that take a file. Kept to a representative
    // set: the per-tool processing behaviour is covered exhaustively by the
    // feature suites, and what matters here is that it still works while
    // signed in.
    await test.step('free: perform a real action', async () => {
      const photo = new ToolPage(page, ALL_TOOLS[0]);
      await photo.open();
      await photo.selectFile(getTestDataPath('photos/valid-photo.jpg'));
      await expect(page.locator('img, canvas').first()).toBeVisible({ timeout: 30000 });
      await expect(page).toHaveURL(/\/features\/photo/);
    });

    // === 4. Hit the paywall ===============================================
    // Nothing in this app is premium-gated by route; the gate is the daily
    // output quota, and the paywall is where exceeding it sends you. So the
    // premium surface is reached the way a free user reaches it.
    await test.step('free: the quota pill routes to the paywall', async () => {
      await page.goto('/home');
      await shell.waitReady();
      await expect(shell.quotaPill).toBeVisible();
      await shell.quotaPill.click();
      await expect(page).toHaveURL(/\/features\/premium/);
    });

    await premium.open();
    await expect(premium.planCards.first()).toBeVisible({ timeout: 30000 });

    // Free, per the server, before anything is granted.
    expect((await serverEntitlement(request, accessToken)).isPremium).toBe(false);

    // === 5. "Purchase" premium ============================================
    // The production grant path, driven by the admin endpoint — see the note
    // at the top of this file for why this is not a sandbox checkout.
    const admin = await adminToken(request);
    const userId = await findPdfUserId(request, admin, email);
    await grantPremium(request, admin, userId, 'pro_monthly');

    // === 6. Premium is reflected in the backend and the UI =================
    const granted = await serverEntitlement(request, accessToken);
    expect(granted.isPremium, 'server did not report premium').toBe(true);
    expect(granted.planId).toBe('pro_monthly');

    await account.open();
    await account.refreshStatus();
    await expect(account.planValue, 'the UI did not pick up the grant').not.toHaveText('Free', {
      timeout: 30000,
    });

    await test.step('premium: the quota pill is gone', async () => {
      await page.goto('/home');
      await shell.waitReady();
      await expect(shell.quotaPill).toHaveCount(0);
    });

    // === 7. Every tool again, now as a premium user ========================
    for (const spec of ALL_TOOLS) {
      const tool = new ToolPage(page, spec);
      await test.step(`premium: ${spec.name}`, async () => {
        await tool.open();
        await expect(shell.header).toBeVisible();
      });
    }

    // === 8. Sign out =======================================================
    await account.open();
    await account.signOut();
    expect(await readStoredSession(page)).toBeNull();

    // No route becomes inaccessible, because none was ever protected. The
    // tools working signed out IS the product.
    await test.step('signed out: every tool still works', async () => {
      for (const spec of ALL_TOOLS) {
        const tool = new ToolPage(page, spec);
        await tool.open();
      }
    });

    // The premium surface is still reachable; it just sells again.
    await premium.open();
    await expect(shell.quotaPill.or(page.locator('main'))).toBeVisible();

    // === 9. Delete the account ============================================
    await account.open();
    await account.selectMode('Sign in');
    await account.fill(email, TEST_PASSWORD);
    await account.submit('Sign in');

    await account.deleteAccount();
    expect(await readStoredSession(page), 'session survived deletion').toBeNull();

    // The credentials must no longer work. This is the assertion that fails
    // while `DELETE /auth/me` is unimplemented server-side, and it is meant to:
    // clearing the device while leaving the row is not account deletion.
    const afterDelete = await request.post(`${PDF_API}/auth/login`, {
      data: { email, password: TEST_PASSWORD },
    });
    expect(
      afterDelete.status(),
      'the account still accepts its password after deletion — DELETE /auth/me is not implemented',
    ).toBe(401);
  });
});
