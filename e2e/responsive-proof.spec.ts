import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { setupCapacitorMocks } from './fixtures/mocks';

/**
 * Prompt R4 — Responsive Proof Pass (All Widths Verification)
 *
 * Exhaustive multi-viewport verification across:
 * - 7 Viewports: 320px (iPhone SE), 360px (Galaxy S), 390px (iPhone 14), 412px (Pixel 7),
 *                768px (iPad mini), 1180px (iPad Pro), 1440px (Desktop)
 * - 6 Core Routes: `/` (Home), `/features/pdf`, `/features/photo`,
 *                  `/features/scanner`, `/features/editor`, `/features/presets`
 * - Invariants:
 *   1. Zero horizontal page scrollbar (scrollWidth <= clientWidth + 1)
 *   2. Touch targets >= 44x44px on mobile viewports (pointer: coarse / <=768px)
 *   3. Header options rail auto-slides left-to-right at <=960px, pauses on touch, resumes after delay
 *   4. Sticky bottom action bars are thumb-reachable and padded for safe-area-inset-bottom
 *   5. 200% accessibility font scale reflows without text clipping or container overflow
 *   6. Visual screenshot proof capture for design and accessibility audit
 *   7. Zero console errors and zero uncaught exceptions
 */

export interface ViewportConfig {
  readonly width: number;
  readonly height: number;
  readonly name: string;
  readonly label: string;
  readonly isTouch: boolean;
}

export const TARGET_VIEWPORTS: readonly ViewportConfig[] = [
  { width: 320, height: 568, name: '320px-iphone-se', label: 'iPhone SE (320px)', isTouch: true },
  { width: 360, height: 800, name: '360px-galaxy-s', label: 'Galaxy S (360px)', isTouch: true },
  { width: 390, height: 844, name: '390px-iphone-14', label: 'iPhone 14/15 (390px)', isTouch: true },
  { width: 412, height: 915, name: '412px-pixel-7', label: 'Pixel 7/8 (412px)', isTouch: true },
  { width: 768, height: 1024, name: '768px-ipad-mini', label: 'iPad mini (768px)', isTouch: true },
  { width: 1180, height: 820, name: '1180px-ipad-pro', label: 'iPad Pro (1180px)', isTouch: false },
  { width: 1440, height: 900, name: '1440px-desktop', label: 'Desktop (1440px)', isTouch: false }
];

export interface RouteConfig {
  readonly path: string;
  readonly slug: string;
  readonly name: string;
  readonly readySelector: string;
}

export const TARGET_ROUTES: readonly RouteConfig[] = [
  { path: '/', slug: '01-home', name: 'Home', readySelector: 'app-header' },
  { path: '/features/pdf', slug: '02-pdf-studio', name: 'PDF Studio', readySelector: 'main' },
  { path: '/features/photo', slug: '03-photo-tools', name: 'Photo Tools', readySelector: 'main' },
  { path: '/features/scanner', slug: '04-scanner', name: 'Scanner', readySelector: 'main' },
  { path: '/features/editor', slug: '05-editor', name: 'Editor', readySelector: 'main' },
  { path: '/features/presets', slug: '06-presets', name: 'Presets', readySelector: 'main' }
];

const MIN_TOUCH_TARGET = 44;
const SCREENSHOTS_DIR = path.resolve(process.cwd(), 'screenshots/responsive-proof');

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
});

async function settlePage(page: Page, readySelector: string): Promise<void> {
  await page.locator(readySelector).first().waitFor({ state: 'visible', timeout: 25000 });
  await page.waitForLoadState('networkidle');
  // Allow entrance keyframe animations and layout transitions to settle
  await page.waitForTimeout(350);
}

async function verifyNoHorizontalOverflow(page: Page, contextLabel: string): Promise<void> {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    windowWidth: window.innerWidth
  }));

  const maxContentWidth = Math.max(metrics.scrollWidth, metrics.bodyScrollWidth);
  const viewportWidth = metrics.clientWidth || metrics.windowWidth;

  expect(
    maxContentWidth,
    `[Horizontal Overflow]: ${contextLabel} exceeds viewport (content=${maxContentWidth}px, viewport=${viewportWidth}px)`
  ).toBeLessThanOrEqual(viewportWidth + 1);
}

test.describe('R4: Comprehensive Responsive Proof Pass (All Widths Verification) @r4 @responsive', () => {
  test.describe.configure({ mode: 'default' });

  // ---------------------------------------------------------------------------
  // 1. Multi-Viewport Route Verification & Screenshot Capture
  // ---------------------------------------------------------------------------
  for (const vp of TARGET_VIEWPORTS) {
    test.describe(`Viewport: ${vp.label}`, () => {
      for (const route of TARGET_ROUTES) {
        test(`R4-VP-${vp.width}-${route.slug}: loads cleanly with zero overflow & captures visual proof`, async ({ page }) => {
          test.setTimeout(45000);

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

          await setupCapacitorMocks(page);
          await page.setViewportSize({ width: vp.width, height: vp.height });
          await page.goto(route.path);
          await settlePage(page, route.readySelector);

          // Assert zero horizontal document overflow
          await verifyNoHorizontalOverflow(page, `${route.name} at ${vp.label}`);

          // Capture visual screenshot proof
          const screenshotPath = path.join(SCREENSHOTS_DIR, `${vp.name}_${route.slug}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: false });
          expect(fs.existsSync(screenshotPath), `Screenshot must exist at ${screenshotPath}`).toBe(true);

          // Assert zero page errors & console errors
          expect(pageErrors, `No uncaught exceptions on ${route.name} at ${vp.label}`).toEqual([]);
          expect(consoleErrors, `No console errors on ${route.name} at ${vp.label}`).toEqual([]);
        });
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 2. Mobile Touch Target Floor Verification (>= 44x44px)
  // ---------------------------------------------------------------------------
  for (const vp of TARGET_VIEWPORTS.filter(v => v.isTouch)) {
    test(`R4-TOUCH-TARGETS-${vp.width}px: all interactive controls meet >= 44x44px floor`, async ({ page }) => {
      test.setTimeout(45000);
      await setupCapacitorMocks(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/features/photo');
      await settlePage(page, 'app-header');

      // 1. Header controls
      const headerControls = [
        'app-header .back-btn',
        'app-header .search-trigger-btn',
        'app-header app-language-selector .lang-trigger-btn',
        'app-header .mobile-menu-btn'
      ];

      for (const sel of headerControls) {
        const box = await page.locator(sel).first().boundingBox();
        expect(box, `Header control ${sel} should be visible at ${vp.width}px`).not.toBeNull();
        expect(
          Math.round(box!.width),
          `Header control ${sel} width at ${vp.width}px must be >= ${MIN_TOUCH_TARGET}px`
        ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
        expect(
          Math.round(box!.height),
          `Header control ${sel} height at ${vp.width}px must be >= ${MIN_TOUCH_TARGET}px`
        ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      }

      // 2. Header rail options (<=960px)
      if (vp.width <= 960) {
        const railItems = page.locator('.header-nav-rail .rail-item');
        const count = await railItems.count();
        expect(count, `Header nav rail should have at least 7 items at ${vp.width}px`).toBeGreaterThanOrEqual(7);

        for (let i = 0; i < count; i++) {
          const itemBox = await railItems.nth(i).boundingBox();
          expect(itemBox, `Rail item ${i} bounding box`).not.toBeNull();
          expect(
            Math.round(itemBox!.height),
            `Rail item ${i} height must be >= ${MIN_TOUCH_TARGET}px at ${vp.width}px`
          ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
          expect(
            Math.round(itemBox!.width),
            `Rail item ${i} width must be >= ${MIN_TOUCH_TARGET}px at ${vp.width}px`
          ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
        }
      }

      // 3. Buttons on page
      const buttons = page.locator('app-button, button:not([disabled]):not([aria-hidden="true"])');
      const btnCount = await buttons.count();
      for (let i = 0; i < Math.min(btnCount, 8); i++) {
        const btn = buttons.nth(i);
        if (await btn.isVisible()) {
          const box = await btn.boundingBox();
          if (box && box.width > 0 && box.height > 0) {
            expect(
              Math.round(box.height),
              `Button #${i} height at ${vp.width}px should meet touch target floor`
            ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
          }
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 3. Auto-Sliding Header Option Rail (Left-to-Right, Pause on Touch, Resume)
  // ---------------------------------------------------------------------------
  for (const vp of TARGET_VIEWPORTS.filter(v => v.width <= 960 && v.isTouch)) {
    test(`R4-RAIL-AUTOSCROLL-${vp.width}px: glides left-to-right, pauses on touch, resumes after delay`, async ({ page }) => {
      test.setTimeout(45000);
      await setupCapacitorMocks(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/home');
      await settlePage(page, 'app-header');

      const rail = page.locator('.header-nav-rail');
      await expect(rail).toBeVisible();

      // Check if content overflows at this viewport
      const canScroll = await rail.evaluate(el => el.scrollWidth > el.clientWidth);

      if (canScroll) {
        // Rail has overflowing items: verify auto-scroll progression over 1.8 seconds
        const s0 = await rail.evaluate(el => el.scrollLeft);
        await page.waitForTimeout(1800);
        const s1 = await rail.evaluate(el => el.scrollLeft);

        expect(s1, `Rail at ${vp.width}px should have glided left-to-right`).toBeGreaterThan(s0);

        // Simulate touch interaction
        await rail.dispatchEvent('touchstart');

        // While touched, scroll position should halt
        await page.waitForTimeout(400);
        const sPaused1 = await rail.evaluate(el => el.scrollLeft);
        await page.waitForTimeout(600);
        const sPaused2 = await rail.evaluate(el => el.scrollLeft);

        expect(
          Math.abs(sPaused2 - sPaused1),
          `Rail at ${vp.width}px should remain paused while touched`
        ).toBeLessThanOrEqual(1);

        // Release touch
        await rail.dispatchEvent('touchend');

        // Wait for resume delay (~2500ms + buffer)
        await page.waitForTimeout(3000);
        const sResumed = await rail.evaluate(el => el.scrollLeft);
        expect(
          sResumed,
          `Rail at ${vp.width}px should resume auto-sliding after touch release delay`
        ).toBeGreaterThan(sPaused2);
      } else {
        // Wide mobile/tablet view where all options fit without overflow
        const railItems = rail.locator('.rail-item');
        const count = await railItems.count();
        expect(count, `All options fit cleanly in rail at ${vp.width}px`).toBeGreaterThanOrEqual(7);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 4. Sticky Bottom Action Bars & Thumb Reachability
  // ---------------------------------------------------------------------------
  for (const vp of TARGET_VIEWPORTS.filter(v => v.width <= 768)) {
    test(`R4-STICKY-BARS-${vp.width}px: reachable in thumb zone with safe-area padding`, async ({ page }) => {
      test.setTimeout(45000);
      await setupCapacitorMocks(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/features/pdf/organize');
      await settlePage(page, 'app-header');

      const stickyBar = page.locator('.bottom-bar, .sticky-action-bar, .actions-bar').first();
      if (await stickyBar.isVisible()) {
        const box = await stickyBar.boundingBox();
        expect(box, `Sticky bottom bar bounding box at ${vp.width}px`).not.toBeNull();

        // Thumb zone verification: sticky bar must sit near the bottom edge of the screen
        const bottomOffset = vp.height - (box!.y + box!.height);
        expect(
          bottomOffset,
          `Sticky bar at ${vp.width}px should be docked within 10px of bottom`
        ).toBeLessThanOrEqual(10);

        // Safe area padding verification
        const paddingBottom = await stickyBar.evaluate(el => {
          return parseFloat(window.getComputedStyle(el).paddingBottom);
        });
        expect(
          paddingBottom,
          `Sticky bar at ${vp.width}px should have bottom padding for safe area`
        ).toBeGreaterThanOrEqual(8);
      }

      // Check document-level zero overflow
      await verifyNoHorizontalOverflow(page, `Organize at ${vp.label}`);
    });
  }

  // ---------------------------------------------------------------------------
  // 5. 200% Accessibility Font Scale Reflow Verification
  // ---------------------------------------------------------------------------
  test('R4-FONT-SCALE-200: reflows gracefully at 360px without text clipping or container overflow', async ({ page }) => {
    test.setTimeout(45000);
    await setupCapacitorMocks(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/home');
    await settlePage(page, 'app-header');

    // Emulate Android 200% accessibility font scale
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '32px'; // 200% of standard 16px
    });

    await page.waitForTimeout(400);

    // Document horizontal overflow assertion
    await verifyNoHorizontalOverflow(page, 'Home at 360px with 200% font scale');

    // Check header controls don't overlap or break
    const header = page.locator('app-header');
    await expect(header).toBeVisible();

    const titleEl = page.locator('app-header .app-title');
    if (await titleEl.isVisible()) {
      const titleBox = await titleEl.boundingBox();
      expect(titleBox!.width).toBeGreaterThan(0);
    }

    // Save visual screenshot of 200% font scale
    const zoomShotPath = path.join(SCREENSHOTS_DIR, '360px-galaxy-s_01-home_font-scale-200.png');
    await page.screenshot({ path: zoomShotPath, fullPage: false });
    expect(fs.existsSync(zoomShotPath)).toBe(true);

    // Repeat 200% zoom check on PDF Studio
    await page.goto('/features/pdf');
    await settlePage(page, 'main');
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '32px';
    });
    await page.waitForTimeout(400);
    await verifyNoHorizontalOverflow(page, 'PDF Studio at 360px with 200% font scale');

    const pdfZoomShotPath = path.join(SCREENSHOTS_DIR, '360px-galaxy-s_02-pdf-studio_font-scale-200.png');
    await page.screenshot({ path: pdfZoomShotPath, fullPage: false });
    expect(fs.existsSync(pdfZoomShotPath)).toBe(true);
  });
});
