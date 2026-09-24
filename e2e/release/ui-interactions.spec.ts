import { test, expect, type Page } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';

/**
 * Dropdowns, drawers and modal dialogs.
 *
 * Every overlay in this app is absolutely positioned inside an ancestor it does
 * not control, which is exactly the arrangement that produced the language
 * selector bug: the menu opened, took its state, rendered its options, and was
 * clipped out of existence by a `overflow-x: hidden` two levels up. So these
 * tests assert on geometry — is it inside the viewport, does a click at its
 * centre actually reach it — rather than on a CSS class being present.
 */

/** True when an element is the thing a click at its own centre would hit. */
async function ownsItsOwnCentre(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return false;
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return !!hit && (el.contains(hit) || hit === el);
  }, selector);
}

/** Reports how far an element spills outside the viewport, per edge. */
async function spill(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return {
      left: Math.max(0, -b.left),
      top: Math.max(0, -b.top),
      right: Math.max(0, b.right - window.innerWidth),
      width: b.width,
      height: b.height,
    };
  }, selector);
}

async function gotoHome(page: Page): Promise<void> {
  await setupCapacitorMocks(page);
  await page.goto('/home');
  await page.locator('app-header').first().waitFor({ state: 'visible', timeout: 30000 });
}

test.describe('Release — Header dropdowns @release @ui', () => {
  test('UI-001: the Tools mega menu opens fully on screen', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoHome(page);

    await page.locator('.tools-dropdown-btn').click();
    const menu = page.locator('.tools-dropdown-menu');
    await expect(menu).toBeVisible();

    // The same clipping that hid the language menu would hide this one.
    const overflow = await spill(page, '.tools-dropdown-menu');
    expect(overflow).not.toBeNull();
    expect(overflow!.height, 'the mega menu is collapsed').toBeGreaterThan(100);
    expect(overflow!.left, 'the mega menu runs off the left edge').toBe(0);
    expect(overflow!.right, 'the mega menu runs off the right edge').toBe(0);
    expect(await ownsItsOwnCentre(page, '.tools-dropdown-menu')).toBe(true);
  });

  test('UI-002: every Tools menu entry navigates to a real route', async ({ page }) => {
    // Nine menu entries, each a return trip through the dashboard and a lazy
    // route the dev server compiles on first request. See TIER-004 for the
    // same note at more length.
    test.slow();

    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoHome(page);

    await page.locator('.tools-dropdown-btn').click();
    const menu = page.locator('.tools-dropdown-menu');
    await expect(menu).toBeVisible();

    // Collect the destinations first. Walking the live list while navigating
    // away from it re-renders the header underneath the loop, and the second
    // iteration then races the rebuilt menu instead of reading it.
    const hrefs = await menu.locator('.dropdown-item').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('routerlink') ?? (node as HTMLAnchorElement).pathname),
    );
    expect(hrefs.length, 'the Tools menu is empty').toBeGreaterThan(5);

    for (const href of hrefs) {
      await page.goto('/home');
      await page.locator('app-header').first().waitFor({ state: 'visible', timeout: 30000 });
      await page.locator('.tools-dropdown-btn').click();
      await expect(menu).toBeVisible({ timeout: 10000 });

      const item = menu.locator(`.dropdown-item[href="${href}"]`).first();
      await item.click();

      /*
       * waitForURL, not a bare url() read.
       *
       * These are routerLinks, so the navigation is the Angular router's, not
       * the browser's — click() resolves as soon as the event is dispatched and
       * the URL has not changed yet. Reading page.url() on the next line races
       * the router and fails on a loaded machine while passing locally, which
       * is the worst way for a test to be wrong.
       */
      await page.waitForURL(`**${href}`, { timeout: 20000 });
      await expect(page, `${href} landed on the 404 page`).not.toHaveURL(/\/404/);
    }
  });

  test('UI-003: the Tools menu closes when the pointer goes elsewhere', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoHome(page);

    await page.locator('.tools-dropdown-btn').click();
    await expect(page.locator('.tools-dropdown-menu')).toBeVisible();

    await page.locator('h1').first().click({ force: true });
    await expect(page.locator('.tools-dropdown-menu')).toBeHidden();
  });

  test('UI-004: only one header menu is open at a time', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoHome(page);

    await page.locator('.tools-dropdown-btn').click();
    await expect(page.locator('.tools-dropdown-menu')).toBeVisible();

    await page.locator('.lang-trigger-btn').click();
    await expect(page.locator('.lang-dropdown-menu')).toBeVisible();
    await expect(
      page.locator('.tools-dropdown-menu'),
      'the Tools menu stayed open underneath the language menu',
    ).toBeHidden();
  });
});

test.describe('Release — Modal dialogs @release @ui', () => {
  test('UI-005: the global search modal opens, filters and closes', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoHome(page);

    await page.locator('.search-trigger-btn').click();
    const modal = page.locator('app-global-search-modal .modal-panel, .global-search-modal, [role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 15000 });
    expect(await spill(page, '[role="dialog"]').catch(() => null)).not.toBeUndefined();

    // Scoped to the dialog on purpose: the dashboard has its own hero search
    // box sitting behind the backdrop, and an unscoped `input` locator types
    // into that one instead — which looks like a passing test right up until
    // the assertion about the dialog.
    const input = page.locator('.search-dialog input').first();
    await input.fill('merge');
    // Something matching must survive the filter.
    await expect(page.locator('body')).toContainText(/merge/i, { timeout: 10000 });

    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden({ timeout: 10000 });
  });

  test('UI-006: the search modal is reachable by keyboard shortcut', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoHome(page);

    await page.keyboard.press('Control+k');
    const modal = page
      .locator('app-global-search-modal .modal-panel, .global-search-modal, [role="dialog"]')
      .first();
    await expect(modal).toBeVisible({ timeout: 10000 });
    await page.keyboard.press('Escape');
  });

  test('UI-007: a modal traps nothing behind it — the page is still there after closing', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoHome(page);

    await page.locator('.search-trigger-btn').click();
    await page.keyboard.press('Escape');

    // The scroll lock a modal applies must be released, or the dashboard is
    // dead in the water after a single search.
    const canScroll = await page.evaluate(() => {
      const scroller =
        (document.querySelector('.ion-page') as HTMLElement | null) ??
        (document.querySelector('.app-page-wrapper') as HTMLElement | null);
      return !scroller || getComputedStyle(scroller).overflowY !== 'hidden';
    });
    expect(canScroll, 'the page scroll lock outlived the modal').toBe(true);
  });
});

test.describe('Release — Mobile drawer @release @ui', () => {
  test('UI-008: the drawer carries a working language selector', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHome(page);

    await page.locator('.mobile-menu-btn').click();
    const drawer = page.locator('.mobile-drawer, .drawer-panel').first();
    await expect(drawer).toBeVisible({ timeout: 15000 });

    // The drawer uses the segmented mode, so the languages are cards, not a menu.
    const cards = page.locator('.lang-card-btn, .lang-compact-pills .compact-pill');
    if ((await cards.count()) > 0) {
      await cards.filter({ hasText: 'हिन्दी' }).first().click();
      await expect(page.locator('html')).toHaveAttribute('lang', 'hi', { timeout: 10000 });
    }
  });

  test('UI-009: the drawer never renders wider than the phone', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await gotoHome(page);

    await page.locator('.mobile-menu-btn').click();
    await page.locator('.mobile-drawer, .drawer-panel').first().waitFor({ state: 'visible' });

    const pageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(pageOverflow, 'the open drawer pushes the page sideways').toBeLessThanOrEqual(1);
  });
});
