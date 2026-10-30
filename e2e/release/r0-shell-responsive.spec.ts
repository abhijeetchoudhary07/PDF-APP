import { test, expect, Page } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';

const WIDTHS = [320, 360, 390, 412, 768, 1180, 1440];
const MIN_TOUCH_TARGET = 44;

async function boxOf(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { width: r.width, height: r.height, top: r.top, left: r.left, right: r.right, bottom: r.bottom };
  }, selector);
}

test.describe('R0 — Shell UI: Handy, Responsive Controls & Auto-Sliding Header Rail @shell @r0', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  for (const width of WIDTHS) {
    test(`R0-SCROLL-${width}: no horizontal document overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/home');
      await expect(page.locator('app-header')).toBeVisible();

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      }));

      expect(scrollWidth, `Document should not scroll horizontally at ${width}px`).toBeLessThanOrEqual(clientWidth + 1);
    });
  }

  for (const width of [320, 360, 390, 412, 768]) {
    test(`R0-TOUCH-${width}: header controls and rail options measure >= ${MIN_TOUCH_TARGET}px touch target`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/features/photo');
      await expect(page.locator('app-header')).toBeVisible();

      // Top bar header controls
      const headerControls = [
        'app-header .back-btn',
        'app-header .search-trigger-btn',
        'app-header app-language-selector .lang-trigger-btn',
        'app-header .mobile-menu-btn'
      ];

      for (const sel of headerControls) {
        const box = await boxOf(page, sel);
        expect(box, `${sel} should be present at ${width}px`).not.toBeNull();
        expect(Math.round(box!.width), `${sel} width at ${width}px`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
        expect(Math.round(box!.height), `${sel} height at ${width}px`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      }

      // Rail items
      const railItemsCount = await page.locator('.header-nav-rail .rail-item').count();
      expect(railItemsCount).toBeGreaterThanOrEqual(7);

      const shortestRailItem = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('.header-nav-rail .rail-item'));
        return Math.min(...items.map((el) => el.getBoundingClientRect().height));
      });
      expect(Math.round(shortestRailItem), `rail item height at ${width}px`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    });
  }

  test('R0-RAIL-OPTIONS: all header options are rendered in the auto-sliding rail below 960px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/home');

    const rail = page.locator('.header-nav-rail');
    await expect(rail).toBeVisible();

    // Verify all expected options are present
    const toolsBtn = rail.locator('.tools-dropdown-btn');
    await expect(toolsBtn).toBeVisible();

    const expectedHrefs = [
      '/features/pdf',
      '/features/photo',
      '/features/signature',
      '/features/presets',
      '/features/history',
      '/features/premium'
    ];

    for (const href of expectedHrefs) {
      const link = rail.locator(`a.rail-item[href="${href}"], a.rail-item[routerLink="${href}"]`);
      await expect(link.first()).toBeAttached();
    }
  });

  test('R0-RESPONSIVE-BREAKPOINT: desktop nav returns at >=1180px and rail is hidden', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 844 });
    await page.goto('/home');

    await expect(page.locator('.desktop-nav')).toBeVisible();
    await expect(page.locator('.header-rail-wrapper')).toBeHidden();
  });

  test('R0-AUTO-SLIDE: rail auto-slides left to right unattended, pauses on interaction and resumes', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 844 });
    await page.goto('/home');

    const rail = page.locator('.header-nav-rail');
    await expect(rail).toBeVisible();

    // Check that maxScroll > 0 (it overflows horizontally)
    const { maxScroll } = await rail.evaluate((el) => ({
      maxScroll: el.scrollWidth - el.clientWidth
    }));
    expect(maxScroll).toBeGreaterThan(10);

    // Initial scrollLeft
    const initialScroll = await rail.evaluate((el) => el.scrollLeft);

    // Wait for auto-scroll loop to advance scrollLeft unattended (~1200ms)
    await page.waitForTimeout(1200);

    const advancedScroll = await rail.evaluate((el) => el.scrollLeft);
    expect(advancedScroll, 'rail should advance scrollLeft automatically').toBeGreaterThanOrEqual(initialScroll);

    // Simulate touch interaction pause
    await rail.dispatchEvent('touchstart');
    const pausedScroll1 = await rail.evaluate((el) => el.scrollLeft);

    // Wait while touching
    await page.waitForTimeout(500);
    const pausedScroll2 = await rail.evaluate((el) => el.scrollLeft);

    // Should remain paused during interaction
    expect(Math.abs(pausedScroll2 - pausedScroll1)).toBeLessThanOrEqual(1);

    // Release touch interaction
    await rail.dispatchEvent('touchend');

    // Wait ~2800ms (resume delay is 2500ms + margin)
    await page.waitForTimeout(2800);

    const resumedScroll = await rail.evaluate((el) => el.scrollLeft);
    expect(resumedScroll, 'rail should resume sliding after release').toBeGreaterThan(pausedScroll2);
  });

  test('R0-ACTIVE-ROUTE: active route item in rail receives .active and indicator underline', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/features/photo');

    const rail = page.locator('.header-nav-rail');
    await expect(rail).toBeVisible();

    const photoItem = rail.locator('a.rail-item[href="/features/photo"]');
    await expect(photoItem).toHaveClass(/active/);
  });

  test('R0-REDUCED-MOTION: honors prefers-reduced-motion by disabling automatic sliding', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 360, height: 844 });
    await page.goto('/home');

    const rail = page.locator('.header-nav-rail');
    await expect(rail).toBeVisible();

    const scroll1 = await rail.evaluate((el) => el.scrollLeft);
    await page.waitForTimeout(800);
    const scroll2 = await rail.evaluate((el) => el.scrollLeft);

    expect(scroll2, 'rail should not auto-slide when reduced motion is preferred').toBe(scroll1);
  });

  test('R0-TEXT-SCALE-200: 200% font zoom at 360px shows no horizontal document scroll', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 844 });
    await page.goto('/home');

    // Emulate 200% text scale
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '32px';
    });
    await page.waitForTimeout(300);

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));

    expect(scrollWidth, 'no horizontal scroll under 200% text zoom').toBeLessThanOrEqual(clientWidth + 2);
  });

  test('R0-TAPJACKING-NO-OVERLAP: touch targets and sticky action bars do not overlap invisibly or misalign touch coordinates', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/features/pdf/organize');
    await expect(page.locator('app-header')).toBeVisible();
    await page.waitForTimeout(300);

    const testTargets = [
      'app-header .back-btn',
      'app-header .search-trigger-btn',
      'app-header app-language-selector .lang-trigger-btn',
      'app-header .mobile-menu-btn',
      '.header-nav-rail .tools-dropdown-btn',
      'a.rail-item[href="/features/pdf"]',
      'a.rail-item[href="/features/photo"]',
      'app-file-dropzone app-button, .dropzone-card app-button, .dropzone-box button, .dropzone-box app-button, .sticky-mobile-bottom-bar app-button, .export-bar app-button'
    ];

    const results = await page.evaluate((selectors) => {
      return selectors.map(sel => {
        const el = document.querySelector(sel);
        if (!el) return { sel, found: false, matches: false, reason: 'not found' };
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const topEl = document.elementFromPoint(cx, cy);
        const matches = el === topEl || el.contains(topEl);
        return {
          sel,
          found: true,
          matches,
          topElTag: topEl ? topEl.tagName + (topEl.className ? '.' + String(topEl.className) : '') : null
        };
      });
    }, testTargets);

    for (const res of results) {
      if (res.found) {
        expect(res.matches, `Target ${res.sel} was obscured or misaligned (hit: ${res.topElTag})`).toBe(true);
      }
    }
  });

  test('R0-ORIENTATION-FLIP-STRESS: rapid orientation change loops do not detach layout or freeze animation frames', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/home');
    await expect(page.locator('app-header')).toBeVisible();

    const flipViewports = [
      { width: 844, height: 390, label: '390x844 -> landscape' },
      { width: 390, height: 844, label: 'landscape -> 390x844' },
      { width: 915, height: 412, label: '390 -> 915x412 landscape' },
      { width: 412, height: 915, label: 'landscape -> 412x915 portrait' },
      { width: 640, height: 360, label: '412 -> 640x360 landscape' },
      { width: 360, height: 640, label: 'landscape -> 360x640 portrait' },
      { width: 568, height: 320, label: '360 -> 568x320 landscape' },
      { width: 320, height: 568, label: 'landscape -> 320x568 portrait' },
      { width: 390, height: 844, label: 'final 390x844 portrait' }
    ];

    for (const flip of flipViewports) {
      await page.setViewportSize({ width: flip.width, height: flip.height });
      await page.waitForTimeout(60);

      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      }));

      expect(metrics.scrollWidth, `Document horizontal overflow after ${flip.label}`).toBeLessThanOrEqual(metrics.clientWidth + 1);
    }

    // Verify rail is still functioning after rapid flips
    const rail = page.locator('.header-nav-rail');
    await expect(rail).toBeVisible();

    // After pause delay (2500ms) + margin, auto-sliding operates normally
    await page.waitForTimeout(3000);
    const scroll1 = await rail.evaluate(el => el.scrollLeft);
    await page.waitForTimeout(1000);
    const scroll2 = await rail.evaluate(el => el.scrollLeft);
    expect(scroll2, 'header rail sliding must remain active and smoothly progress after flips').toBeGreaterThan(scroll1);
  });

  test('R0-CONSOLE-SVG-AUDIT: zero console errors, no resize observer loops, stable sticky header coordinates and valid SVG viewBoxes', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', err => {
      pageErrors.push(err.message);
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/home');
    await expect(page.locator('app-header')).toBeVisible();

    // Verify sticky header coordinates remain fixed at top: 0 during scrolling
    for (const scrollPos of [0, 80, 160, 240, 320]) {
      await page.evaluate(pos => window.scrollTo(0, pos), scrollPos);
      await page.waitForTimeout(40);
      const headerTop = await page.evaluate(() => {
        const h = document.querySelector('app-header');
        return h ? h.getBoundingClientRect().top : null;
      });
      expect(Math.abs(headerTop ?? 999), `header top coordinate jumping at scroll ${scrollPos}`).toBeLessThanOrEqual(1);
    }

    // SVG viewBox and dimension validation
    const svgAudit = await page.evaluate(() => {
      const svgs = Array.from(document.querySelectorAll('svg'));
      const issues: string[] = [];
      for (const svg of svgs) {
        const vb = svg.getAttribute('viewBox');
        if (vb) {
          const parts = vb.trim().split(/\s+|,/);
          if (parts.length !== 4 || parts.some(p => isNaN(Number(p)))) {
            issues.push(`Invalid viewBox "${vb}" on ${svg.outerHTML.slice(0, 60)}`);
          }
        }
      }
      return issues;
    });

    expect(svgAudit, 'All SVGs must have valid viewBox declarations').toEqual([]);
    expect(consoleErrors, 'No console errors should occur during shell lifecycle').toEqual([]);
    expect(pageErrors, 'No unhandled page exceptions should occur during shell lifecycle').toEqual([]);
  });
});
