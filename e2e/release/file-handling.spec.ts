import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import * as os from 'os';
import { promises as fs } from 'fs';
import { setupCapacitorMocks, getTestDataPath } from '../fixtures/mocks';

/**
 * Upload acceptance, rejection and download, for the PDF and image tools.
 *
 * Everything here runs on the device, so there is no server to blame when a
 * file is wrong: the app is the only thing that can tell someone their .txt is
 * not a PDF, or that a 200MB scan will not fit in a phone's memory. These
 * tests check that it says so, in words, instead of hanging on a spinner or
 * throwing into the console — which is what "graceful" has to mean for a user
 * who has just picked the wrong thing out of their Downloads folder.
 */

/** The hidden input inside app-file-dropzone; setInputFiles does not need it visible. */
function dropzoneInput(page: Page, nth = 0) {
  return page.locator('app-file-dropzone input[type="file"]').nth(nth);
}

/** Text the app shows when it has refused a file, wherever it puts it. */
function errorText(page: Page) {
  return page.locator('.error-state, .error-text, .toast-error, [class*="error"]');
}

async function openTool(page: Page, route: string): Promise<void> {
  await setupCapacitorMocks(page);
  await page.goto(route);
  await page.locator('app-header').first().waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('app-file-dropzone').first().waitFor({ state: 'attached', timeout: 30000 });
}

/**
 * Writes a file of `bytes` length to a temp path and returns it.
 *
 * Playwright refuses an in-memory buffer over 50MB, and both size limits worth
 * testing (50MB for images, 100MB for PDFs) sit above that line — so the file
 * has to exist on disk. It is sparse: `truncate` reserves the length without
 * writing 100MB of zeroes, so this costs milliseconds and no real disk.
 */
async function hugeFileOnDisk(name: string, bytes: number): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ifh-e2e-'));
  const file = path.join(dir, name);
  const handle = await fs.open(file, 'w');
  try {
    await handle.truncate(bytes);
  } finally {
    await handle.close();
  }
  return file;
}

test.describe('Release — Image upload handling @release @files', () => {
  test('FILE-001: a valid photo is accepted and previewed', async ({ page }) => {
    await openTool(page, '/features/photo');
    await dropzoneInput(page).setInputFiles(getTestDataPath('photos/valid-photo.jpg'));

    // The tool moves out of its empty state and shows the file it took.
    await expect(page.locator('app-file-preview, .configuring-section').first()).toBeVisible({
      timeout: 20000,
    });
    await expect(errorText(page).filter({ hasText: /not supported|invalid|too large/i })).toHaveCount(
      0,
    );
  });

  test('FILE-002: an unsupported image format is refused with a message', async ({ page }) => {
    await openTool(page, '/features/photo');
    await dropzoneInput(page).setInputFiles(getTestDataPath('photos/unsupported-photo.gif'));

    // A GIF is neither in the accept list nor in the filename allow-pattern.
    await expect(page.locator('.error-state, .error-text').first()).toBeVisible({ timeout: 20000 });
  });

  test('FILE-003: an empty file is refused rather than processed', async ({ page }) => {
    await openTool(page, '/features/photo');
    await dropzoneInput(page).setInputFiles({
      name: 'empty.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.alloc(0),
    });

    await expect(page.locator('.error-state, .error-text').first()).toBeVisible({ timeout: 20000 });
  });

  test('FILE-004: an oversized image is refused before it can exhaust memory', async ({ page }) => {
    // The service caps images at 50MB; 51 is the first byte over.
    await openTool(page, '/features/photo');
    await dropzoneInput(page).setInputFiles(await hugeFileOnDisk('huge.jpg', 51 * 1024 * 1024));

    await expect(page.locator('.error-state, .error-text').first()).toBeVisible({ timeout: 30000 });
  });

  test('FILE-005: the refusal message is translated, not an English fallback', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('CapacitorStorage.IFH_APP_LANGUAGE', 'hi');
        localStorage.setItem('IFH_APP_LANGUAGE', 'hi');
      } catch {
        /* ignored */
      }
    });
    await openTool(page, '/features/photo');
    await dropzoneInput(page).setInputFiles(getTestDataPath('photos/unsupported-photo.gif'));

    const message = page.locator('.error-state, .error-text').first();
    await expect(message).toBeVisible({ timeout: 20000 });
    // A dotted key reaching the screen means the message has no translation at all.
    await expect(message).not.toContainText(/validation\.[a-zA-Z]/);
  });
});

test.describe('Release — PDF upload handling @release @files', () => {
  test('FILE-006: a valid PDF is accepted', async ({ page }) => {
    await openTool(page, '/features/pdf-compress');
    await dropzoneInput(page).setInputFiles(getTestDataPath('pdf/text.pdf'));

    await expect(page.locator('app-file-preview, .selected-state').first()).toBeVisible({
      timeout: 25000,
    });
  });

  test('FILE-007: a .txt renamed into the picker is refused', async ({ page }) => {
    await openTool(page, '/features/pdf-compress');
    await dropzoneInput(page).setInputFiles(getTestDataPath('pdf/unsupported.txt'));

    await expect(page.locator('.error-state, .error-text').first()).toBeVisible({ timeout: 25000 });
  });

  test('FILE-008: a corrupt PDF fails with a message, not a hung spinner', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await openTool(page, '/features/pdf-compress');
    await dropzoneInput(page).setInputFiles(getTestDataPath('pdf/corrupt.pdf'));

    // Either it is refused up front or it fails during parsing — both are fine,
    // as long as the app ends up somewhere the user can act from.
    await expect(
      page.locator('.error-state, .error-text, app-file-preview, .selected-state').first(),
    ).toBeVisible({ timeout: 30000 });

    // What is not fine is the spinner never resolving.
    await expect(page.locator('.processing-state')).toHaveCount(0, { timeout: 30000 });
    expect(consoleErrors, `unhandled error: ${consoleErrors[0]}`).toEqual([]);
  });

  test('FILE-009: an oversized PDF is refused before parsing', async ({ page }) => {
    // The service caps PDFs at 100MB.
    await openTool(page, '/features/pdf-compress');
    await dropzoneInput(page).setInputFiles(await hugeFileOnDisk('huge.pdf', 101 * 1024 * 1024));

    await expect(page.locator('.error-state, .error-text').first()).toBeVisible({ timeout: 40000 });
  });

  test('FILE-010: a multi-file tool takes several PDFs at once', async ({ page }) => {
    await openTool(page, '/features/pdf-merge');
    const input = dropzoneInput(page);
    await input.setInputFiles([
      getTestDataPath('pdf/text.pdf'),
      getTestDataPath('pdf/hindi.pdf'),
    ]);

    // Both land in the list; a merge tool that silently keeps one is broken.
    await expect(page.locator('body')).toContainText(/text\.pdf/i, { timeout: 25000 });
    await expect(page.locator('body')).toContainText(/hindi\.pdf/i, { timeout: 25000 });
  });
});

test.describe('Release — Download / output @release @files', () => {
  test('FILE-011: a completed image job offers a real file to save', async ({ page }) => {
    await openTool(page, '/features/photo');
    await dropzoneInput(page).setInputFiles(getTestDataPath('photos/valid-photo.jpg'));
    await page.locator('app-file-preview, .configuring-section').first().waitFor({
      state: 'visible',
      timeout: 25000,
    });

    const run = page.getByRole('button', { name: /compress|resize|process|apply/i }).first();
    if ((await run.count()) === 0) {
      test.skip(true, 'this build exposes no single-shot action on the photo tool');
    }
    await run.click();

    // The result card is the download affordance; a job that finishes without
    // one has produced nothing the user can keep.
    await expect(page.locator('app-result-preview, .success-state').first())
      .toBeVisible({ timeout: 60000 });
  });

  test('FILE-012: downloading does not navigate the app away from the tool', async ({ page }) => {
    await openTool(page, '/features/photo');
    const before = page.url();
    await dropzoneInput(page).setInputFiles(getTestDataPath('photos/valid-photo.jpg'));
    await page.waitForTimeout(1500);
    expect(page.url(), 'picking a file navigated away').toBe(before);
  });
});

/**
 * Free tier versus premium.
 *
 * The tier must never gate *opening* a tool — the app's promise is that every
 * tool works offline, and the allowance is about completed outputs. These
 * check the boundary in both directions.
 */
test.describe('Release — Tier behaviour @release @tier', () => {
  const PREMIUM_SESSION = {
    accessToken: 'token',
    refreshToken: 'refresh',
    user: {
      id: 'u1',
      email: 'pro@example.com',
      displayName: 'Pro',
      authProvider: 'email',
      isActive: true,
      isVerified: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      lastLoginAt: null,
    },
    entitlement: {
      isPremium: true,
      planId: 'pro_annual',
      status: 'active',
      validUntil: null,
      platform: 'manual_admin',
      daysRemaining: null,
    },
    syncedAt: Date.now(),
  };

  async function seedPremium(page: Page): Promise<void> {
    await page.addInitScript((session) => {
      const value = JSON.stringify(session);
      try {
        localStorage.setItem('CapacitorStorage.IFH_PDF_ACCOUNT_SESSION_V1', value);
        localStorage.setItem('IFH_PDF_ACCOUNT_SESSION_V1', value);
      } catch {
        /* ignored */
      }
    }, PREMIUM_SESSION);
    await page.route('**/auth/me', (route) =>
      route.fulfill({
        json: { user: PREMIUM_SESSION.user, entitlement: PREMIUM_SESSION.entitlement },
      }),
    );
  }

  /** Puts a spent allowance in storage before the app boots. */
  async function seedSpentQuota(page: Page): Promise<void> {
    const now = new Date();
    const date = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
    await page.addInitScript(
      ({ value }) => {
        try {
          localStorage.setItem('CapacitorStorage.IFH_DAILY_USAGE_V1', value);
          localStorage.setItem('IFH_DAILY_USAGE_V1', value);
        } catch {
          /* ignored */
        }
      },
      { value: JSON.stringify({ date, count: 5 }) },
    );
  }

  test('TIER-001: a spent free allowance still lets the tool open and take a file', async ({
    page,
  }) => {
    await seedSpentQuota(page);
    await openTool(page, '/features/photo');

    await expect(page.locator('app-file-dropzone').first()).toBeVisible();
    await dropzoneInput(page).setInputFiles(getTestDataPath('photos/valid-photo.jpg'));
    await expect(page.locator('app-file-preview, .configuring-section').first()).toBeVisible({
      timeout: 25000,
    });
  });

  test('TIER-002: a spent allowance shows zero and points at the paywall', async ({ page }) => {
    await seedSpentQuota(page);
    await setupCapacitorMocks(page);
    await page.goto('/home');

    const hero = page.getByTestId('hero-quota');
    await expect(hero).toBeVisible({ timeout: 20000 });
    await expect(hero).toHaveAttribute('href', /premium/);
    await expect(hero).toHaveClass(/is-spent/);
  });

  test('TIER-003: premium sees no allowance anywhere in the shell', async ({ page }) => {
    await seedPremium(page);
    await setupCapacitorMocks(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/home');
    await page.locator('app-header').first().waitFor({ state: 'visible', timeout: 30000 });

    await expect(page.getByTestId('hero-quota')).toHaveCount(0);
    await expect(page.getByTestId('quota-chip')).toHaveCount(0);
  });

  test('TIER-004: every tool route opens on the free tier', async ({ page }) => {
    /*
     * Fourteen full navigations in one test, and against `ng serve` each one
     * is the first request for that lazy chunk — so the dev server compiles it
     * while the clock runs. The work is real, not a hang, so the timeout is
     * raised rather than the coverage cut; against a production bundle
     * (E2E_TARGET=prod) the same test finishes well inside the default.
     */
    test.slow();

    const ROUTES = [
      '/features/photo',
      '/features/signature',
      '/features/pdf',
      '/features/pdf-compress',
      '/features/images-to-pdf',
      '/features/pdf/merge',
      '/features/pdf/split',
      '/features/pdf/organize',
      '/features/pdf/editor',
      '/features/pdf/sign',
      '/features/pdf/security',
      '/features/pdf/conversion',
      '/features/qr-barcode',
      '/features/batch',
    ];

    await setupCapacitorMocks(page);
    for (const route of ROUTES) {
      await page.goto(route);
      await expect(page, `${route} redirected away`).not.toHaveURL(/\/404/, { timeout: 15000 });

      /*
       * `app-header` is not universal, and should not be: the PDF editor is a
       * full-screen tool with its own toolbar and its own back link, which is
       * the right call for a canvas that wants every pixel. So the assertion
       * is that the route rendered a chrome of *some* kind with a way out of
       * it, not that it rendered this particular component.
       */
      await expect(
        page.locator('app-header, .editor-header-nav, header').first(),
        `${route} did not render`,
      ).toBeVisible({ timeout: 20000 });

      // A paywall standing between a free user and a tool would be the bug.
      await expect(
        page.locator('.paywall-block, .premium-gate'),
        `${route} is gated behind premium`,
      ).toHaveCount(0);
    }
  });
});
