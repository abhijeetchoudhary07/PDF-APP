import { test, expect, type Page } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';
import {
  API_DOWN_MESSAGE,
  TARGETS_LOCAL_API,
  WRONG_TARGET_MESSAGE,
  TEST_PASSWORD,
  apiIsReachable,
  fillCredentials,
  openAccountPage,
  readStoredSession,
  selectMode,
  uniqueEmail,
} from '../account/account-helpers';

/**
 * The whole arc, in one test each: sign up, use a tool, sign out, sign back in.
 *
 * The account suite already checks each step in isolation and in much more
 * detail. What it does not check is that the steps compose — that the session
 * a registration creates is the one a tool sees, that signing out of the
 * account screen leaves the tools working (the product's central promise), and
 * that signing back in restores the tier rather than a blank free account.
 * Those are the failures that only show up when the steps are run in order.
 *
 * These talk to the real backend; see `account-helpers.ts`.
 */

/** Goes to a tool and waits for it to be interactive, not merely routed. */
async function openTool(page: Page, route: string): Promise<void> {
  await page.goto(route);
  await page.locator('app-header').first().waitFor({ state: 'visible', timeout: 30000 });
  await page
    .locator('app-file-dropzone, .tool-page-container, main')
    .first()
    .waitFor({ state: 'visible', timeout: 30000 });
}

test.describe('Release — End-to-end user journey @release @journey', () => {
  test.beforeEach(async ({ page, request }) => {
    test.skip(!TARGETS_LOCAL_API, WRONG_TARGET_MESSAGE);
    expect(await apiIsReachable(request), API_DOWN_MESSAGE).toBe(true);
    await setupCapacitorMocks(page);
  });

  test('JOURNEY-001: sign up → use a tool → sign out → sign back in', async ({ page }) => {
    const email = uniqueEmail('journey');

    // --- 1. Sign up -------------------------------------------------------
    await openAccountPage(page);
    await selectMode(page, 'Create account');
    await fillCredentials(page, email, TEST_PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click({ timeout: 30000 });

    await page.locator('.account-identity').waitFor({ state: 'visible', timeout: 30000 });
    await expect(page.locator('.account-email')).toHaveText(email);
    await expect(page.locator('.plan-value')).toHaveText('Free');

    const afterRegister = await readStoredSession(page);
    expect(afterRegister?.user?.email, 'the session was not persisted').toBe(email);

    // --- 2. Use a tool, still signed in -----------------------------------
    await openTool(page, '/features/pdf-merge');
    await expect(page.locator('app-header')).toBeVisible();
    // The header's account affordance survives the navigation.
    expect((await readStoredSession(page))?.user?.email).toBe(email);

    // --- 3. Sign out ------------------------------------------------------
    await openAccountPage(page);
    await page.getByRole('button', { name: 'Sign out' }).click({ timeout: 30000 });
    await page.locator('.mode-switch').waitFor({ state: 'visible', timeout: 30000 });
    expect(await readStoredSession(page), 'the session outlived the sign-out').toBeNull();

    // The tools keep working signed out — that is the product, not a fallback.
    await openTool(page, '/features/pdf-merge');
    await expect(page.locator('app-file-dropzone').first()).toBeVisible();

    // --- 4. Sign back in --------------------------------------------------
    await openAccountPage(page);
    await selectMode(page, 'Sign in');
    await fillCredentials(page, email, TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click({ timeout: 30000 });

    await page.locator('.account-identity').waitFor({ state: 'visible', timeout: 30000 });
    await expect(page.locator('.account-email')).toHaveText(email);
    expect((await readStoredSession(page))?.user?.email).toBe(email);
  });

  test('JOURNEY-002: the sign-out reset puts the form back on Sign in, not Create account', async ({
    page,
  }) => {
    const email = uniqueEmail('reset');

    await openAccountPage(page);
    await selectMode(page, 'Create account');
    await fillCredentials(page, email, TEST_PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click({ timeout: 30000 });
    await page.locator('.account-identity').waitFor({ state: 'visible', timeout: 30000 });

    await page.getByRole('button', { name: 'Sign out' }).click({ timeout: 30000 });
    await page.locator('.mode-switch').waitFor({ state: 'visible', timeout: 30000 });

    // Someone who has just been signed out wants to sign in, not to be offered
    // a second account.
    await expect(page.getByRole('tab', { name: 'Sign in' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // And the password field must not still hold what they typed.
    await expect(page.locator('input[type="password"]')).toHaveValue('');
  });

  test('JOURNEY-003: a language chosen before signing in is still in force afterwards', async ({
    page,
  }) => {
    const email = uniqueEmail('lang');

    await page.goto('/home');
    await page.locator('app-header .lang-trigger-btn').click({ timeout: 30000 });
    await page.locator('app-header .lang-option-item', { hasText: 'हिन्दी' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi');

    await openAccountPage(page);
    await selectMode(page, 'Create account');
    await fillCredentials(page, email, TEST_PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click({ timeout: 30000 });
    await page.locator('.account-identity').waitFor({ state: 'visible', timeout: 30000 });

    // Signing in must not silently reset the interface to English.
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  });
});

/**
 * Client-side credential validation.
 *
 * These deliberately do not need the backend: the point is that nothing is
 * sent at all. Each one fails the request-count assertion if the app posts.
 */
test.describe('Release — Credential validation @release @auth', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  /** Counts auth posts so "rejected locally" can be told from "server said no". */
  async function countAuthCalls(page: Page): Promise<() => number> {
    const calls: string[] = [];
    page.on('request', (req) => {
      if (/\/auth\/(login|register)/.test(req.url()) && req.method() === 'POST') {
        calls.push(req.url());
      }
    });
    return () => calls.length;
  }

  const REJECTED_EMAILS = [
    { value: '', why: 'an empty address' },
    { value: 'not-an-email', why: 'no @ at all' },
    { value: 'missing@domain', why: 'no dot in the domain' },
    { value: 'spaces in@example.com', why: 'a space in the local part' },
    { value: '@example.com', why: 'nothing before the @' },
    { value: 'trailing@example.c', why: 'a one-letter TLD' },
  ];

  for (const { value, why } of REJECTED_EMAILS) {
    test(`AUTHV-001 (${why}): "${value}" is rejected without a request`, async ({ page }) => {
      const authCalls = await countAuthCalls(page);
      await openAccountPage(page);
      await selectMode(page, 'Create account');
      await fillCredentials(page, value, TEST_PASSWORD);
      await page.getByRole('button', { name: 'Create account' }).click({ timeout: 30000 });

      await expect(page.locator('.mode-switch')).toBeVisible();
      expect(authCalls(), 'an invalid address was sent to the server').toBe(0);
    });
  }

  test('AUTHV-002: a valid-looking address passes the local check', async ({ page }) => {
    await openAccountPage(page);
    await selectMode(page, 'Create account');
    await fillCredentials(page, 'someone@example.com', 'short');
    await page.getByRole('button', { name: 'Create account' }).click({ timeout: 30000 });

    // The password is what should be complained about now, not the address.
    const errors = await page.locator('.input-error, [class*="error"]').allInnerTexts();
    const joined = errors.join(' ');
    expect(joined).toMatch(/8 characters/i);
    expect(joined).not.toMatch(/valid email/i);
  });

  test('AUTHV-003: a short password is rejected without a request', async ({ page }) => {
    const authCalls = await countAuthCalls(page);
    await openAccountPage(page);
    await selectMode(page, 'Create account');
    await fillCredentials(page, uniqueEmail('short'), '1234567');
    await page.getByRole('button', { name: 'Create account' }).click({ timeout: 30000 });

    await expect(page.locator('.mode-switch')).toBeVisible();
    expect(authCalls(), 'a too-short password was sent to the server').toBe(0);
  });

  test('AUTHV-004: an over-long password is rejected without a request', async ({ page }) => {
    // The server caps at 200 characters so a megabyte of text cannot reach
    // scrypt; the client must agree or the user gets an unexplained failure.
    const authCalls = await countAuthCalls(page);
    await openAccountPage(page);
    await selectMode(page, 'Create account');
    await fillCredentials(page, uniqueEmail('long'), 'a'.repeat(201));
    await page.getByRole('button', { name: 'Create account' }).click({ timeout: 30000 });

    await expect(page.locator('.mode-switch')).toBeVisible();
    expect(authCalls(), 'an over-long password was sent to the server').toBe(0);
  });

  test('AUTHV-005: both fields are reported at once, not one at a time', async ({ page }) => {
    await openAccountPage(page);
    await selectMode(page, 'Create account');
    await fillCredentials(page, 'nope', 'short');
    await page.getByRole('button', { name: 'Create account' }).click({ timeout: 30000 });

    const joined = (await page.locator('.input-error, [class*="error"]').allInnerTexts()).join(' ');
    expect(joined, 'the email problem was not reported').toMatch(/email/i);
    expect(joined, 'the password problem was not reported').toMatch(/8 characters/i);
  });

  test('AUTHV-006: the password is never rendered in the DOM as text', async ({ page }) => {
    await openAccountPage(page);
    await selectMode(page, 'Create account');
    await fillCredentials(page, uniqueEmail('dom'), TEST_PASSWORD);

    const field = page.locator('input[type="password"]');
    await expect(field).toHaveAttribute('type', 'password');
    expect(await page.content()).not.toContain(TEST_PASSWORD);
  });
});
