import { test, expect, type Page } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';

/**
 * The navbar language selector.
 *
 * This file exists because of a bug that every "is the class applied?" test
 * would have passed: the menu opened, the button took its `is-open` state, the
 * five options were in the DOM with the right text — and not one pixel of it
 * was on the screen. `.app-header` carried `overflow-x: hidden` to stop a long
 * brand name scrolling the page sideways, and CSS computes the *other* axis to
 * `auto` the moment one axis is `hidden`, which quietly turned the bar into a
 * scroll container 60px tall and clipped the 259px menu hanging out of it.
 *
 * So the assertions here are deliberately about what a person can see and
 * click, not about state: every option must be inside the viewport, and the
 * click must land on the option rather than on whatever is painted over it.
 */

const LANGUAGE_KEY = 'CapacitorStorage.IFH_APP_LANGUAGE';

/** Every language the app ships, with a string that only appears in that one. */
const LANGUAGES = [
  { code: 'en', native: 'English', label: 'English' },
  { code: 'hi', native: 'हिन्दी', label: 'Hindi' },
  { code: 'mr', native: 'मराठी', label: 'Marathi' },
  { code: 'bn', native: 'বাংলা', label: 'Bengali' },
  { code: 'pa', native: 'ਪੰਜਾਬੀ', label: 'Punjabi' },
] as const;

/** Widths that matter: the Android phone range, tablets, and laptop screens. */
const WIDTHS = [360, 390, 412, 480, 768, 1024, 1180, 1280, 1440];

async function gotoHome(page: Page): Promise<void> {
  await setupCapacitorMocks(page);
  await page.goto('/home');
  await page.locator('app-header .lang-trigger-btn').waitFor({ state: 'visible', timeout: 30000 });
}

function trigger(page: Page) {
  return page.locator('app-header .lang-trigger-btn');
}

function menu(page: Page) {
  return page.locator('app-header .lang-dropdown-menu');
}

/** Reads the persisted choice through whichever key spelling the mock wrote. */
async function storedLanguage(page: Page): Promise<string | null> {
  return page.evaluate((key) => {
    return localStorage.getItem(key) ?? localStorage.getItem(key.replace('CapacitorStorage.', ''));
  }, LANGUAGE_KEY);
}

async function seedLanguage(page: Page, code: string): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      try {
        localStorage.setItem(key, value);
        localStorage.setItem(key.replace('CapacitorStorage.', ''), value);
      } catch {
        /* ignored */
      }
    },
    { key: LANGUAGE_KEY, value: code },
  );
}

test.describe('Release — Navbar language selector @release @i18n', () => {
  test('LANG-001: the trigger is visible and names the current language', async ({ page }) => {
    await gotoHome(page);
    await expect(trigger(page)).toBeVisible();
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('LANG-002: clicking the trigger opens the menu', async ({ page }) => {
    await gotoHome(page);
    await trigger(page).click();

    await expect(menu(page)).toBeVisible();
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('app-header .lang-option-item')).toHaveCount(LANGUAGES.length);
  });

  /**
   * The regression test for the clipping bug.
   *
   * `toBeVisible()` alone would not have caught it — an element clipped by an
   * ancestor's overflow still reports a box and still passes that check.
   * `toBeInViewport` measures against the actual viewport, and the explicit
   * box comparison below catches the case where the menu is pushed sideways
   * off the screen instead of being cut off vertically.
   */
  test('LANG-003: every option is actually on screen, not clipped by the header', async ({
    page,
  }) => {
    await gotoHome(page);
    await trigger(page).click();
    await expect(menu(page)).toBeVisible();

    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();

    const box = await menu(page).boundingBox();
    expect(box, 'the open menu has no box at all').not.toBeNull();
    expect(box!.height, 'the menu is collapsed to nothing').toBeGreaterThan(100);
    expect(box!.x, 'the menu starts off the left edge').toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, 'the menu runs past the right edge').toBeLessThanOrEqual(
      viewport!.width + 1,
    );

    for (const language of LANGUAGES) {
      const option = page.locator('app-header .lang-option-item', { hasText: language.native });
      await expect(option, `${language.label} is not on screen`).toBeInViewport({ ratio: 0.9 });
    }
  });

  test('LANG-004: the menu is not painted under the page content', async ({ page }) => {
    await gotoHome(page);
    await trigger(page).click();

    const option = page.locator('app-header .lang-option-item').first();
    const box = await option.boundingBox();
    expect(box).not.toBeNull();

    // Whatever the browser would hand a click at the option's centre must be
    // the option itself (or something inside it) — not a hero heading or a
    // card that happens to sit above it in the stacking order.
    const ownsTheClick = await page.evaluate(
      ({ x, y }) => {
        const hit = document.elementFromPoint(x, y);
        return !!hit?.closest('.lang-option-item');
      },
      { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
    );
    expect(ownsTheClick, 'something else is painted over the language menu').toBe(true);
  });

  for (const language of LANGUAGES.filter((l) => l.code !== 'en')) {
    test(`LANG-005-${language.code}: choosing ${language.label} translates the app and is remembered`, async ({
      page,
    }) => {
      await gotoHome(page);
      await trigger(page).click();
      await page.locator('app-header .lang-option-item', { hasText: language.native }).click();

      // The menu closes on choosing, and the trigger renames itself.
      await expect(menu(page)).toBeHidden();
      await expect(trigger(page)).toContainText(language.native);

      // The document language is what assistive tech and the OS read.
      await expect(page.locator('html')).toHaveAttribute('lang', language.code);
      expect(await storedLanguage(page)).toBe(language.code);

      // The page body actually changed, rather than only the selector.
      const heading = page.locator('h1').first();
      await expect(heading).not.toContainText('The Simple Document');

      // And it survives a reload — the preference is read back before paint.
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('lang', language.code, {
        timeout: 15000,
      });
      await expect(trigger(page)).toContainText(language.native);
    });
  }

  test('LANG-006: the choice is still in force on a different route', async ({ page }) => {
    await gotoHome(page);
    await trigger(page).click();
    await page.locator('app-header .lang-option-item', { hasText: 'हिन्दी' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi');

    await page.goto('/features/pdf');
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi', { timeout: 15000 });
    await expect(trigger(page)).toContainText('हिन्दी');
  });

  test('LANG-007: the menu closes on an outside click and on Escape', async ({ page }) => {
    await gotoHome(page);

    await trigger(page).click();
    await expect(menu(page)).toBeVisible();
    await page.locator('h1').first().click({ force: true });
    await expect(menu(page)).toBeHidden();

    await trigger(page).click();
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
  });

  test('LANG-008: the current language is marked for assistive tech', async ({ page }) => {
    await seedLanguage(page, 'bn');
    await gotoHome(page);
    await trigger(page).click();

    const selected = page.locator('app-header .lang-option-item[aria-selected="true"]');
    await expect(selected).toHaveCount(1);
    await expect(selected).toContainText('বাংলা');
  });

  /**
   * The other half of the same bug.
   *
   * The clipping was hiding real overflow: at every width between the 960px
   * mobile breakpoint and roughly 1220px the bar was ~200px wider than the
   * screen, so the language selector itself sat off the right edge — reachable
   * only by scrolling a container nobody could tell was scrollable. Indian
   * language labels are longer than the English ones, which makes it worse, so
   * each width is checked in the longest-labelled locale too.
   */
  for (const width of WIDTHS) {
    test(`LANG-009-${width}: the header fits at ${width}px and the selector is reachable`, async ({
      page,
    }) => {
      await seedLanguage(page, 'hi');
      await page.setViewportSize({ width, height: 800 });
      await gotoHome(page);

      /*
       * Measured from the children's own boxes, not from `scrollWidth`.
       *
       * That distinction is the whole point: `overflow-x: hidden` makes a
       * container's scrollWidth equal its clientWidth, so the scrollWidth
       * reading reports zero overflow for exactly the broken configuration
       * this test exists to catch. Where the controls actually are is not
       * something the overflow property can hide.
       */
      const overflow = await page.evaluate(() => {
        const header = document.querySelector('.app-header') as HTMLElement | null;
        const inner = document.querySelector('.header-inner') as HTMLElement | null;
        if (!header || !inner) return null;

        const bar = header.getBoundingClientRect();
        let rightmost = bar.left;
        let leftmost = bar.right;
        for (const child of Array.from(inner.children)) {
          const box = child.getBoundingClientRect();
          if (box.width === 0) continue;
          rightmost = Math.max(rightmost, box.right);
          leftmost = Math.min(leftmost, box.left);
        }

        return {
          pastRightEdge: Math.round(rightmost - bar.right),
          pastLeftEdge: Math.round(bar.left - leftmost),
          pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });

      expect(overflow).not.toBeNull();
      expect(
        overflow!.pastRightEdge,
        'header content sits past the right edge of the bar',
      ).toBeLessThanOrEqual(1);
      expect(
        overflow!.pastLeftEdge,
        'header content sits past the left edge of the bar',
      ).toBeLessThanOrEqual(1);
      expect(overflow!.pageOverflow, 'the page scrolls sideways').toBeLessThanOrEqual(1);

      // On a phone the selector lives in the bar next to the burger; either way
      // it must be on screen without scrolling anything.
      await expect(trigger(page)).toBeInViewport({ ratio: 0.9 });
    });
  }

  test('LANG-010: the selector opens and is usable on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await gotoHome(page);

    await trigger(page).click();
    await expect(menu(page)).toBeVisible();

    const box = await menu(page).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(361);

    await page.locator('app-header .lang-option-item', { hasText: 'मराठी' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'mr');
  });

  test('LANG-011: the trigger keeps a 44px touch target on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await gotoHome(page);

    const box = await trigger(page).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  /**
   * Switching language must not leave a key on the screen.
   *
   * A missing key falls back to English rather than rendering `header.tools`,
   * so this catches the other failure: a key that exists in no dictionary at
   * all, which the service returns verbatim.
   */
  for (const language of LANGUAGES) {
    test(`LANG-012-${language.code}: no raw translation key is rendered in ${language.label}`, async ({
      page,
    }) => {
      await seedLanguage(page, language.code);
      await gotoHome(page);

      const text = await page.locator('body').innerText();
      expect(text, 'a dotted translation key reached the screen').not.toMatch(
        /\b(common|header|home|tools|quota|settings|premium)\.[a-zA-Z][a-zA-Z0-9_]+\b/,
      );
    });
  }

  test('LANG-013: the free-tier allowance is translated, not left in English', async ({ page }) => {
    await seedLanguage(page, 'hi');
    await gotoHome(page);

    const hero = page.getByTestId('hero-quota');
    await expect(hero).toBeVisible();
    await expect(hero, 'the quota banner is still English').not.toContainText(
      'free operations left today',
    );
  });
});
