import { test, expect, Page } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';

/** The Android widths that matter: 360 is the floor, 430 the common ceiling. */
const ANDROID_WIDTHS = [360, 390, 412, 430];

/** Google's accessibility guidance, and what Play's pre-launch report measures. */
const MIN_TOUCH_TARGET = 44;

async function boxOf(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { width: r.width, height: r.height, right: r.right, left: r.left };
  }, selector);
}

test.describe('Release — Mobile navbar @release @navbar', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  for (const width of ANDROID_WIDTHS) {
    test(`NAV-${width}: header controls are at least ${MIN_TOUCH_TARGET}px and the page never scrolls sideways`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      // Not the dashboard, so the back affordance is in the bar too -- that is
      // the tightest the header ever gets.
      await page.goto('/features/photo');
      await expect(page.locator('app-header')).toBeVisible();

      const controls = [
        'app-header .back-btn',
        'app-header .search-trigger-btn',
        'app-header app-language-selector .lang-trigger-btn',
        'app-header .mobile-menu-btn'
      ];

      for (const selector of controls) {
        const box = await boxOf(page, selector);
        expect(box, `${selector} should be present at ${width}px`).not.toBeNull();
        expect(
          Math.round(box!.width),
          `${selector} width at ${width}px`
        ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
        expect(
          Math.round(box!.height),
          `${selector} height at ${width}px`
        ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      }

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      }));
      expect(scrollWidth, `no horizontal overflow at ${width}px`).toBeLessThanOrEqual(clientWidth + 1);
    });

    test(`NAV-${width}-fit: nothing in the header bleeds past the viewport`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/features/photo');
      await expect(page.locator('app-header')).toBeVisible();

      const overflowing = await page.evaluate((vw) => {
        const inner = document.querySelector('.header-inner');
        if (!inner) return ['missing .header-inner'];
        return [...inner.querySelectorAll('*')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && (r.right > vw + 1 || r.left < -1);
          })
          .map((el) => el.className.toString() || el.tagName)
          .slice(0, 5);
      }, width);

      expect(overflowing, `elements outside the viewport at ${width}px`).toEqual([]);
    });
  }

  test('NAV-DRAWER: the hamburger opens the drawer, lists the tools and navigates', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/home');

    const drawer = page.locator('.mobile-drawer-content');
    await expect(drawer).toBeHidden();

    await page.getByRole('button', { name: 'Toggle Navigation Menu' }).click();
    await expect(drawer).toBeVisible();

    // The drawer is driven from a data list; every entry should render.
    const links = drawer.locator('.drawer-link');
    expect(await links.count()).toBeGreaterThanOrEqual(10);
    await expect(links.filter({ hasText: 'Photo Tools' })).toBeVisible();
    await expect(links.filter({ hasText: 'Premium' })).toBeVisible();

    // Every row is a comfortable touch target.
    const shortest = await drawer.evaluate((el) =>
      Math.min(...[...el.querySelectorAll('.drawer-link')].map((a) => a.getBoundingClientRect().height))
    );
    expect(Math.round(shortest)).toBeGreaterThanOrEqual(44);

    await links.filter({ hasText: 'Photo Tools' }).first().click();

    await expect(page).toHaveURL(/\/features\/photo$/);
    // A route change must close the drawer behind it.
    await expect(drawer).toBeHidden();
  });

  test('NAV-DRAWER-FIT: the drawer contents stay inside the drawer at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/home');

    await page.getByRole('button', { name: 'Toggle Navigation Menu' }).click();
    const drawer = page.locator('.mobile-drawer-content');
    await expect(drawer).toBeVisible();

    const result = await drawer.evaluate((el) => {
      const right = el.getBoundingClientRect().right;
      const seg = el.querySelector('.theme-segmented');
      return {
        overflows: el.scrollWidth > el.clientWidth,
        segRight: seg ? seg.getBoundingClientRect().right : 0,
        drawerRight: right,
        // A missing translation renders the raw key; catch that here too.
        rawKeys: (el as HTMLElement).innerText.match(/\b(common|settings|header|tools)\.[A-Za-z.]+/g) || []
      };
    });

    expect(result.overflows).toBe(false);
    expect(result.segRight).toBeLessThanOrEqual(result.drawerRight + 1);
    expect(result.rawKeys).toEqual([]);
  });

  test('NAV-CLOSE: the drawer closes from its own close button', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/home');

    await page.getByRole('button', { name: 'Toggle Navigation Menu' }).click();
    const drawer = page.locator('.mobile-drawer-content');
    await expect(drawer).toBeVisible();

    const closeBox = await boxOf(page, '.mobile-drawer-content .drawer-close');
    expect(Math.round(closeBox!.width)).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    expect(Math.round(closeBox!.height)).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);

    await page.getByRole('button', { name: 'Close menu' }).click();
    await expect(drawer).toBeHidden();
  });

  test('NAV-BACK: the back affordance is hidden on the dashboard and shown elsewhere', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    // Scoped to the header: routed pages render their own .back-btn inside
    // app-page-header, which would make a bare selector ambiguous.
    const headerBack = page.locator('app-header .back-btn');

    await page.goto('/home');
    await expect(headerBack).toBeHidden();

    await page.goto('/features/settings');
    await expect(headerBack).toBeVisible();
  });

  test('NAV-DESKTOP: the desktop nav returns above the mobile breakpoint', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/home');

    await expect(page.locator('.desktop-nav')).toBeVisible();
    await expect(page.locator('.mobile-menu-btn')).toBeHidden();
  });
});
