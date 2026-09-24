import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';
import {
  API_DOWN_MESSAGE,
  TARGETS_LOCAL_API,
  WRONG_TARGET_MESSAGE,
  PDF_API,
  TEST_PASSWORD,
  apiIsReachable,
  fillCredentials,
  openAccountPage,
  readStoredSession,
  registerThroughUi,
  selectMode,
  uniqueEmail,
  writeStoredSession,
} from './account-helpers';

/**
 * Account sign-in, session persistence and token renewal.
 *
 * Run against the real backend: see `account-helpers.ts`.
 */
test.describe('Account — authentication @account', () => {
  test.beforeEach(async ({ page, request }) => {
    test.skip(!TARGETS_LOCAL_API, WRONG_TARGET_MESSAGE);
    expect(await apiIsReachable(request), API_DOWN_MESSAGE).toBe(true);
    await setupCapacitorMocks(page);
  });

  test('ACC-001: the app makes no backend calls while signed out', async ({ page }) => {
    // The product's whole promise is local processing. An account is opt-in,
    // and a signed-out launch must not phone home at all.
    const calls: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/v1/pdf-app')) calls.push(`${req.method()} ${req.url()}`);
    });

    await page.goto('/home');
    await page.locator('app-header').first().waitFor({ state: 'visible' });
    await page.waitForTimeout(2500);

    expect(calls, `unexpected backend traffic: ${calls.join(', ')}`).toEqual([]);
  });

  test('ACC-002: the account screen states the privacy boundary', async ({ page }) => {
    await openAccountPage(page);

    const note = page.locator('.privacy-note');
    await expect(note).toBeVisible();
    await expect(note).toContainText('Your documents never leave this device');
    await expect(page.getByRole('tab', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Create account' })).toBeVisible();
  });

  test('ACC-003: a new account can be created and lands signed in on the free tier', async ({
    page,
  }) => {
    const email = uniqueEmail('create');
    await registerThroughUi(page, email);

    await expect(page.locator('.account-email')).toHaveText(email);
    await expect(page.locator('.plan-value')).toHaveText('Free');
    await expect(page.locator('.plan-chip')).toHaveText('FREE');
    await expect(page.getByRole('button', { name: 'See premium plans' })).toBeVisible();
  });

  test('ACC-004: the password hash never reaches the client', async ({ page }) => {
    const email = uniqueEmail('hash');
    await registerThroughUi(page, email);

    const session = await readStoredSession(page);
    expect(session).not.toBeNull();
    // Both the persisted blob and the rendered page are checked: a leak in
    // either one is a leak.
    expect(JSON.stringify(session)).not.toContain('scrypt$');
    expect(JSON.stringify(session?.['user'] ?? {})).not.toContain('password');
    expect(await page.locator('body').innerText()).not.toContain('scrypt$');
  });

  test('ACC-005: a short password is rejected before any request is sent', async ({ page }) => {
    const calls: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/auth/register')) calls.push(req.url());
    });

    await openAccountPage(page);
    await selectMode(page, 'Create account');
    await fillCredentials(page, uniqueEmail('short'), 'short');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.locator('.input-error, .error-message').first()).toBeVisible();
    expect(calls).toEqual([]);
  });

  test('ACC-006: registering a known address fails without confirming it exists', async ({
    page,
  }) => {
    const email = uniqueEmail('dupe');
    await registerThroughUi(page, email);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.getByRole('tab', { name: 'Create account' }).waitFor({ state: 'visible' });
    // Signing out returns the form to sign-in mode, so creating a second
    // account means switching back deliberately.
    await expect(page.getByRole('tab', { name: 'Sign in' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await selectMode(page, 'Create account');
    await fillCredentials(page, email, TEST_PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    const error = page.locator('.input-error, .error-message').first();
    await expect(error).toBeVisible();
    // Enumeration guard: the message must not confirm the address is taken.
    await expect(error).not.toContainText(/already|taken|exists/i);
  });

  test('ACC-007: the wrong password is reported on the password field', async ({ page }) => {
    const email = uniqueEmail('wrongpw');
    await registerThroughUi(page, email);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();

    await fillCredentials(page, email, 'DefinitelyWrong123');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(page.locator('.input-error, .error-message').first()).toBeVisible();
    await expect(page.locator('.account-identity')).toHaveCount(0);
  });

  test('ACC-008: an existing account can sign back in', async ({ page }) => {
    const email = uniqueEmail('signin');
    await registerThroughUi(page, email);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();

    await fillCredentials(page, email, TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(page.locator('.account-email')).toHaveText(email, { timeout: 20000 });
  });

  test('ACC-009: the session survives a reload', async ({ page }) => {
    const email = uniqueEmail('persist');
    await registerThroughUi(page, email);

    await page.reload();

    await expect(page.locator('.account-email')).toHaveText(email, { timeout: 20000 });
  });

  test('ACC-010: signing out clears the stored session', async ({ page }) => {
    const email = uniqueEmail('signout');
    await registerThroughUi(page, email);
    expect(await readStoredSession(page)).not.toBeNull();

    await page.getByRole('button', { name: 'Sign out' }).click();

    await expect(page.getByRole('tab', { name: 'Create account' })).toBeVisible();
    expect(await readStoredSession(page)).toBeNull();
  });

  test('ACC-011: an expired access token is renewed without the user noticing', async ({
    page,
  }) => {
    const email = uniqueEmail('refresh');
    await registerThroughUi(page, email);

    // Break only the signature, leaving a structurally valid JWT the server
    // will reject — the same shape as a genuinely expired token.
    await writeStoredSession(page, (session) => {
      const [header, payload] = String(session['accessToken']).split('.');
      return { ...session, accessToken: `${header}.${payload}.tampered` };
    });

    const refreshCalls: string[] = [];
    const meStatuses: number[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/auth/refresh')) refreshCalls.push(req.url());
    });
    page.on('response', (res) => {
      if (res.url().includes('/auth/me')) meStatuses.push(res.status());
    });

    await page.reload();

    // The user still sees their account: the retry happened underneath.
    await expect(page.locator('.account-email')).toHaveText(email, { timeout: 20000 });
    expect(refreshCalls.length, 'the interceptor did not rotate the token').toBeGreaterThan(0);
    expect(meStatuses, 'expected the first call to be rejected').toContain(401);
    // The cached session paints the email immediately, so the retry is still in
    // flight at this point -- poll for it rather than sampling once.
    await expect
      .poll(() => meStatuses, { timeout: 15000, message: 'the retried call never succeeded' })
      .toContain(200);

    const session = await readStoredSession(page);
    expect(String(session?.['accessToken'])).not.toContain('tampered');
  });

  test('ACC-012: a dead refresh token signs the user out instead of looping', async ({ page }) => {
    const email = uniqueEmail('deadrefresh');
    await registerThroughUi(page, email);

    await writeStoredSession(page, (session) => {
      const [header, payload] = String(session['accessToken']).split('.');
      return {
        ...session,
        accessToken: `${header}.${payload}.tampered`,
        refreshToken: 'this-token-was-never-issued',
      };
    });

    let refreshAttempts = 0;
    page.on('request', (req) => {
      if (req.url().includes('/auth/refresh')) refreshAttempts++;
    });

    await page.reload();

    await expect(page.getByRole('tab', { name: 'Create account' })).toBeVisible({ timeout: 20000 });
    expect(await readStoredSession(page)).toBeNull();
    // One attempt, not a retry storm from every open screen.
    expect(refreshAttempts).toBeLessThanOrEqual(2);
  });

  test('ACC-013: the bearer token goes only to the backend', async ({ page }) => {
    const email = uniqueEmail('bearer');
    await registerThroughUi(page, email);

    const authorized: string[] = [];
    const unauthorized: string[] = [];
    page.on('request', (req) => {
      const hasToken = Boolean(req.headers()['authorization']);
      if (req.url().startsWith(PDF_API)) {
        if (hasToken) authorized.push(req.url());
      } else if (hasToken) {
        unauthorized.push(req.url());
      }
    });

    await page.getByRole('button', { name: 'Refresh status' }).click();
    await page.waitForTimeout(2000);
    // Bundled assets are fetched over the same HttpClient and must stay clean.
    await page.goto('/features/presets');
    await page.waitForTimeout(2000);

    expect(authorized.length, 'no authenticated call was made').toBeGreaterThan(0);
    expect(unauthorized, `a token leaked to: ${unauthorized.join(', ')}`).toEqual([]);
  });
});
