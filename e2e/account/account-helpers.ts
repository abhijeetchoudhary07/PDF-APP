import { expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Helpers for the account / premium end-to-end suite.
 *
 * These tests talk to the real backend (`server/dev-server.ts` in the
 * `linkedin AUTO` repository) rather than a mock, because the thing under test
 * is precisely the contract between the two — a mock that agrees with the
 * client would pass even when the server disagrees.
 */

export const API_BASE = process.env['PDF_APP_API_BASE'] ?? 'http://localhost:3001/api';
export const PDF_API = `${API_BASE}/v1/pdf-app`;

/** Seeded by the repo's local setup; see PDF_APP_INTEGRATION.md. */
const ADMIN_EMAIL = process.env['PDF_APP_ADMIN_EMAIL'] ?? 'pdfadmin@local.test';
const ADMIN_PASSWORD = process.env['PDF_APP_ADMIN_PASSWORD'] ?? 'AdminPassword123';

export const TEST_PASSWORD = 'PlaywrightPass123';

/** A fresh address per test, so parallel workers cannot collide on one account. */
export function uniqueEmail(tag: string): string {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  return `pw-${tag}-${stamp}@example.test`;
}

export async function apiIsReachable(request: APIRequestContext): Promise<boolean> {
  try {
    const response = await request.get(`${PDF_API}/subscription/plans`, { timeout: 5000 });
    return response.ok();
  } catch {
    return false;
  }
}

/** Message shown when the suite is run without the backend up. */
export const API_DOWN_MESSAGE =
  `The PDF App backend is not answering at ${API_BASE}. ` +
  'Start it with `DATABASE_URL= npm run dev:api` in the linkedin AUTO repository.';

export async function adminToken(request: APIRequestContext): Promise<string> {
  const response = await request.post(`${API_BASE}/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });

  if (!response.ok()) {
    throw new Error(
      `Could not sign in as the platform admin (${ADMIN_EMAIL}). ` +
        'Seed one, or set PDF_APP_ADMIN_EMAIL / PDF_APP_ADMIN_PASSWORD.',
    );
  }

  return (await response.json()).token as string;
}

export async function findPdfUserId(
  request: APIRequestContext,
  token: string,
  email: string,
): Promise<string> {
  const response = await request.get(`${PDF_API}/admin/users`, {
    params: { search: email },
    headers: { Authorization: `Bearer ${token}` },
  });

  const body = await response.json();
  const match = body.users?.find((user: { email: string }) => user.email === email);
  if (!match) {
    throw new Error(`No PDF App user found for ${email}`);
  }
  return match.id as string;
}

export async function grantPremium(
  request: APIRequestContext,
  token: string,
  userId: string,
  planId: string,
): Promise<Record<string, unknown>> {
  const response = await request.post(`${PDF_API}/admin/users/${userId}/grant-premium`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { planId, note: 'Granted by the Playwright suite' },
  });
  if (!response.ok()) {
    throw new Error(`grant-premium failed: ${response.status()} ${await response.text()}`);
  }
  return (await response.json()).entitlement;
}

export async function revokePremium(
  request: APIRequestContext,
  token: string,
  userId: string,
): Promise<void> {
  const response = await request.post(`${PDF_API}/admin/users/${userId}/revoke-premium`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { note: 'Revoked by the Playwright suite' },
  });
  if (!response.ok()) {
    throw new Error(`revoke-premium failed: ${response.status()}`);
  }
}

export async function setUserActive(
  request: APIRequestContext,
  token: string,
  userId: string,
  isActive: boolean,
): Promise<void> {
  const response = await request.patch(`${PDF_API}/admin/users/${userId}/status`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { isActive, note: 'Playwright suite' },
  });
  if (!response.ok()) {
    throw new Error(`status change failed: ${response.status()}`);
  }
}

// --- Page-side helpers -----------------------------------------------------

/**
 * Reads the persisted session.
 *
 * Capacitor Preferences prefixes its localStorage keys on web, and the e2e
 * Capacitor mock does not, so the key is matched rather than assumed.
 */
export async function readStoredSession(page: Page): Promise<Record<string, any> | null> {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.includes('IFH_PDF_ACCOUNT_SESSION'));
    if (!key) return null;
    try {
      return JSON.parse(localStorage.getItem(key) as string);
    } catch {
      return null;
    }
  });
}

export async function writeStoredSession(
  page: Page,
  mutate: (session: Record<string, any>) => Record<string, any>,
): Promise<void> {
  const current = await readStoredSession(page);
  if (!current) {
    throw new Error('No stored session to modify');
  }
  const next = mutate(current);
  await page.evaluate((value) => {
    const key = Object.keys(localStorage).find((k) => k.includes('IFH_PDF_ACCOUNT_SESSION'));
    if (key) localStorage.setItem(key, JSON.stringify(value));
  }, next);
}

/**
 * Opens the account screen and waits for it to settle.
 *
 * The explicit wait is not ceremony: when the whole suite runs in parallel the
 * machine is saturated, Ionic is still laying the page out, and Playwright
 * refuses to click an element that is still moving. Waiting for the form's own
 * fields means the layout has finished before anything is clicked.
 */
export async function openAccountPage(page: Page): Promise<void> {
  await page.goto('/account');
  await page.locator('.account-card').waitFor({ state: 'visible', timeout: 30000 });
  await page
    .locator('.account-identity, .mode-switch')
    .first()
    .waitFor({ state: 'visible', timeout: 30000 });
}

/** Switches the signed-out form between its two modes. */
export async function selectMode(page: Page, mode: 'Sign in' | 'Create account'): Promise<void> {
  const tab = page.getByRole('tab', { name: mode });
  await tab.waitFor({ state: 'visible', timeout: 30000 });
  await tab.click({ timeout: 30000 });
  await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 10000 });
}

/** Fills the account form. The inputs are inside `app-input`, not bare fields. */
export async function fillCredentials(page: Page, email: string, password: string): Promise<void> {
  const emailField = page.locator('input[type="email"]');
  await emailField.waitFor({ state: 'visible', timeout: 30000 });
  await emailField.fill(email);
  await page.locator('input[type="password"]').fill(password);
}

/** Creates an account through the UI and waits for the signed-in view. */
export async function registerThroughUi(page: Page, email: string): Promise<void> {
  await openAccountPage(page);
  await selectMode(page, 'Create account');
  await fillCredentials(page, email, TEST_PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click({ timeout: 30000 });
  await page.locator('.account-identity').waitFor({ state: 'visible', timeout: 30000 });
}
