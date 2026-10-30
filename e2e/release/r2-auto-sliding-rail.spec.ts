import { test, expect, Page } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';

async function getHeaderAndContentBounds(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector('app-header');
    const mainContent = document.querySelector('main, .app-main-content, .home-content, ion-content') || document.body.firstElementChild;
    if (!header || !mainContent) return null;

    const headerRect = header.getBoundingClientRect();
    const contentRect = mainContent.getBoundingClientRect();
    return {
      headerBottom: headerRect.bottom,
      headerHeight: headerRect.height,
      contentTop: contentRect.top
    };
  });
}

test.describe('R2 — Auto-Sliding Header Option Rail (Animated Left-to-Right) @r2 @rail', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  // Acceptance Test 1: Options reachable without drawer & auto-sliding left-to-right at 360, 390 & 412
  for (const width of [360, 390, 412]) {
    test(`R2-RAIL-OPTIONS-${width}: all header options are in rail and auto-slide left to right`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/home');

      const rail = page.locator('.header-nav-rail');
      await expect(rail).toBeVisible();

      // Drawer is closed
      const drawer = page.locator('.mobile-drawer');
      await expect(drawer).toBeHidden();

      // Verify all 7+ options exist in the rail
      const toolsBtn = rail.locator('.tools-dropdown-btn');
      await expect(toolsBtn).toBeVisible();

      const expectedLinks = [
        '/features/pdf',
        '/features/photo',
        '/features/signature',
        '/features/presets',
        '/features/history',
        '/features/premium'
      ];

      for (const route of expectedLinks) {
        const link = rail.locator(`a.rail-item[href="${route}"], a.rail-item[routerLink="${route}"]`).first();
        await expect(link).toBeAttached();
      }

      // Initial scroll position
      const initialScroll = await rail.evaluate((el) => el.scrollLeft);

      // Unattended left-to-right sliding
      await page.waitForTimeout(1200);
      const advancedScroll = await rail.evaluate((el) => el.scrollLeft);
      expect(advancedScroll, 'scrollLeft should advance unattended left-to-right').toBeGreaterThanOrEqual(initialScroll);

      // Stops on touchstart
      await rail.dispatchEvent('touchstart');
      const touchScroll1 = await rail.evaluate((el) => el.scrollLeft);
      await page.waitForTimeout(600);
      const touchScroll2 = await rail.evaluate((el) => el.scrollLeft);
      expect(Math.abs(touchScroll2 - touchScroll1), 'sliding must pause immediately on touch').toBeLessThanOrEqual(1);

      // Resumes after touchend delay (~2500ms)
      await rail.dispatchEvent('touchend');
      await page.waitForTimeout(2800);
      const resumedScroll = await rail.evaluate((el) => el.scrollLeft);
      expect(resumedScroll, 'sliding must resume cleanly after delay').toBeGreaterThan(touchScroll2);
    });
  }

  // Acceptance Test 2: Honors prefers-reduced-motion
  test('R2-REDUCED-MOTION: scrollLeft never moves unattended with reduced-motion, but swipe works', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/home');

    const rail = page.locator('.header-nav-rail');
    await expect(rail).toBeVisible();

    const initial = await rail.evaluate((el) => el.scrollLeft);
    await page.waitForTimeout(1000);
    const afterWait = await rail.evaluate((el) => el.scrollLeft);

    // Should never auto-scroll
    expect(afterWait).toBe(initial);

    // Row still scrolls by programmatic / manual swipe
    await rail.evaluate((el) => {
      el.scrollLeft = 80;
    });
    const afterManualSwipe = await rail.evaluate((el) => el.scrollLeft);
    expect(afterManualSwipe).toBe(80);
  });

  // Acceptance Test 3: Content sits flush under header at 360, 768, and 1440
  for (const width of [360, 768, 1440]) {
    test(`R2-FLUSH-CONTENT-${width}: content sits flush under header with no gap or clipping at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/home');
      await expect(page.locator('app-header')).toBeVisible();

      // Wait for pageIn animation (320ms) to settle
      await page.waitForTimeout(400);

      const bounds = await getHeaderAndContentBounds(page);
      expect(bounds).not.toBeNull();

      // Header height must be > 0 and header bottom must align flush with content top (within 1px subpixel tolerance)
      expect(bounds!.headerHeight).toBeGreaterThan(40);
      expect(Math.abs(bounds!.headerBottom - bounds!.contentTop)).toBeLessThanOrEqual(2);
    });
  }

  // Acceptance Test 4: Route change scrolls active item into view and centres it with active underline
  test('R2-ACTIVE-ROUTE-CENTER: active route item centers in rail and receives underline', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/features/photo');

    const rail = page.locator('.header-nav-rail');
    await expect(rail).toBeVisible();

    const activeItem = rail.locator('a.rail-item[href="/features/photo"]');
    await expect(activeItem).toBeVisible();
    await expect(activeItem).toHaveClass(/active/);

    // Verify indicator line (.nav-item.active::after) is present
    const hasUnderline = await page.evaluate(() => {
      const el = document.querySelector('.header-nav-rail .nav-item.active');
      if (!el) return false;
      const afterStyle = window.getComputedStyle(el, '::after');
      return afterStyle.transform.includes('matrix') || afterStyle.transform.includes('scaleX');
    });
    expect(hasUnderline).toBe(true);
  });

  // Acceptance Test 5: Keyboard focus pauses the slide
  test('R2-KEYBOARD-FOCUS: focus pauses sliding on the rail', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/home');

    const rail = page.locator('.header-nav-rail');
    await expect(rail).toBeVisible();

    // Focus the first link in the rail
    const firstLink = rail.locator('a.rail-item, button.rail-item').first();
    await firstLink.focus();
    // Allow any native browser scrollIntoView from focus to settle
    await page.waitForTimeout(150);

    const focusScroll1 = await rail.evaluate((el) => el.scrollLeft);
    await page.waitForTimeout(600);
    const focusScroll2 = await rail.evaluate((el) => el.scrollLeft);

    expect(Math.abs(focusScroll2 - focusScroll1), 'sliding must pause when an item in the rail has focus').toBeLessThanOrEqual(1);
  });

  // Acceptance Test 6: Rail rendered with all navigation options at 768px
  test('R2-RAIL-OPTIONS-768: all header options are in rail at 768px', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/home');

    const rail = page.locator('.header-nav-rail');
    await expect(rail).toBeVisible();

    const toolsBtn = rail.locator('.tools-dropdown-btn');
    await expect(toolsBtn).toBeVisible();

    const expectedLinks = [
      '/features/pdf',
      '/features/photo',
      '/features/signature',
      '/features/presets',
      '/features/history',
      '/features/premium'
    ];

    for (const route of expectedLinks) {
      const link = rail.locator(`a.rail-item[href="${route}"], a.rail-item[routerLink="${route}"]`).first();
      await expect(link).toBeAttached();
    }
  });

  // Acceptance Test 7: Gradient fade masks on left and right edges
  test('R2-GRADIENT-MASKS: rail container applies gradient fade masks on left and right edges', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/home');

    const maskStyles = await page.evaluate(() => {
      const rail = document.querySelector('.header-nav-rail');
      if (!rail) return null;
      const s = window.getComputedStyle(rail);
      return {
        maskImage: s.maskImage || (s as any).webkitMaskImage || ''
      };
    });

    expect(maskStyles).not.toBeNull();
    expect(maskStyles!.maskImage, 'rail should have gradient fade mask').toContain('linear-gradient');
  });

  // Acceptance Test 8: Page Visibility API tab switching pause & resume
  test('R2-PAGE-VISIBILITY: pauses animation when tab is hidden and resumes when visible', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/home');

    const rail = page.locator('.header-nav-rail');
    await expect(rail).toBeVisible();

    // Allow auto-sliding to initiate
    await page.waitForTimeout(800);

    // Emulate tab backgrounding (hidden)
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await page.waitForTimeout(200);
    const scrollHidden1 = await rail.evaluate((el) => el.scrollLeft);
    await page.waitForTimeout(600);
    const scrollHidden2 = await rail.evaluate((el) => el.scrollLeft);

    // Animation must stay completely paused while hidden
    expect(Math.abs(scrollHidden2 - scrollHidden1), 'animation must pause while document is hidden').toBeLessThanOrEqual(1);

    // Emulate tab foregrounding (visible)
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Wait for resume
    await page.waitForTimeout(1400);
    const scrollResumed = await rail.evaluate((el) => el.scrollLeft);
    expect(scrollResumed, 'animation must resume after tab becomes visible again').toBeGreaterThan(scrollHidden2);
  });
});
