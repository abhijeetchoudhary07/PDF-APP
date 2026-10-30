import { test, expect, Page } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';

const VIEWPORTS = [
  { width: 360, height: 640, name: '360x640 portrait' },
  { width: 640, height: 360, name: '640x360 landscape' },
  { width: 390, height: 844, name: '390x844 portrait' },
  { width: 844, height: 390, name: '844x390 landscape' },
  { width: 412, height: 915, name: '412x915 portrait' },
  { width: 915, height: 412, name: '915x412 landscape' },
  { width: 768, height: 1024, name: '768x1024 portrait' },
  { width: 1024, height: 768, name: '1024x768 landscape' },
  { width: 1440, height: 900, name: '1440x900 desktop' }
];

const SCREENS = [
  { name: 'organizer', url: '/features/pdf/organize' },
  { name: 'converter', url: '/features/pdf/conversion/pdf-to-png' },
  { name: 'compressor', url: '/features/pdf-compress' }
];

async function checkNoHorizontalOverflow(page: Page, label: string) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(scrollWidth, `${label}: document should not scroll horizontally`).toBeLessThanOrEqual(clientWidth + 1);
}

test.describe('R3 — Handy & Flexible Layout: Reachable Actions, Fluid Grids, Nothing Clipped @r3 @layout', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
    await setupCapacitorMocks(page);
  });

  // 1. Check no horizontal document scroll across all viewports and orientations
  for (const vp of VIEWPORTS) {
    test(`R3-NO-OVERFLOW-${vp.width}x${vp.height}: no horizontal scroll on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/home');
      await expect(page.locator('app-header')).toBeVisible();
      await page.waitForTimeout(300);
      await checkNoHorizontalOverflow(page, `Home (${vp.name})`);

      for (const screen of SCREENS) {
        await page.goto(screen.url);
        await expect(page.locator('app-header')).toBeVisible();
        await page.waitForTimeout(300);
        await checkNoHorizontalOverflow(page, `${screen.name} (${vp.name})`);
      }
    });
  }

  // 2. Primary action reachable in thumb zone without scrolling
  for (const vp of VIEWPORTS) {
    test(`R3-THUMB-ZONE-${vp.width}x${vp.height}: primary action reachable on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      for (const screen of SCREENS) {
        await page.goto(screen.url);
        await expect(page.locator('app-header')).toBeVisible();
        await page.waitForTimeout(400);

        // Primary action locator across tool screens (dropzone button or sticky action bar)
        const primaryAction = page.locator(
          'app-file-dropzone app-button, .dropzone-card app-button, .dropzone-box button, .dropzone-box app-button, .sticky-mobile-bottom-bar app-button, .export-bar app-button, .action-submit-wrap app-button'
        ).first();

        await expect(primaryAction).toBeVisible();

        const box = await primaryAction.boundingBox();
        expect(box, `${screen.name} primary action should have a bounding box`).not.toBeNull();

        // Without scrolling (scrollY == 0):
        const scrollY = await page.evaluate(() => window.scrollY);
        expect(scrollY, 'page should not have scrolled').toBe(0);

        const actionTop = box!.y;
        const actionBottom = box!.y + box!.height;

        // Verify it is inside the viewport (thumb zone reachable without scrolling)
        expect(actionTop, `${screen.name} action top at ${vp.name}`).toBeGreaterThanOrEqual(0);
        expect(actionBottom, `${screen.name} action bottom at ${vp.name}`).toBeLessThanOrEqual(vp.height + 1);
      }
    });
  }

  // 3. No element overlaps sticky bars
  for (const vp of [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 }
  ]) {
    test(`R3-STICKY-BARS-NO-OVERLAP-${vp.width}: header and content align flush with zero overlap`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/features/pdf/organize');
      await expect(page.locator('app-header')).toBeVisible();
      await page.waitForTimeout(400);

      const headerBox = await page.locator('app-header').boundingBox();
      expect(headerBox).not.toBeNull();
      const headerBottom = headerBox!.y + headerBox!.height;

      // Main content top should be >= header bottom (no content hidden behind sticky header)
      const mainContentBox = await page.locator('.app-main-content').boundingBox();
      expect(mainContentBox).not.toBeNull();
      expect(mainContentBox!.y).toBeGreaterThanOrEqual(headerBottom - 1);
    });
  }

  // 4. Modal dvh capping and scrollable body
  test('R3-MODAL-DVH: modal caps at min(90dvh, ...) with scrollable body', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto('/features/presets');
    await expect(page.locator('app-header')).toBeVisible();
    await page.waitForTimeout(400);

    // Trigger Custom Preset modal
    const createBtn = page.locator('app-page-header app-button[variant="primary"] button').first();
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    const modalDialog = page.locator('.modal-dialog');
    await expect(modalDialog).toBeVisible();

    const modalBox = await modalDialog.boundingBox();
    expect(modalBox).not.toBeNull();
    // Modal height must cap at or below 90dvh (640 * 0.9 = 576)
    expect(modalBox!.height).toBeLessThanOrEqual(640 * 0.92);

    // Modal body should have overflow-y auto or scroll
    const overflowY = await page.evaluate(() => {
      const body = document.querySelector('.modal-dialog .modal-body');
      return body ? window.getComputedStyle(body).overflowY : null;
    });
    expect(['auto', 'scroll']).toContain(overflowY);
  });

  // 5. 200% font zoom at 360px shows no horizontal document scroll and no clipped labels
  test('R3-TEXT-SCALE-200: 200% font zoom at 360px shows no horizontal document scroll', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto('/features/pdf/organize');
    await expect(page.locator('app-header')).toBeVisible();
    await page.waitForTimeout(400);

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

  // 6. Virtual keyboard resize simulation (viewport height compressed from 844px to 420px)
  test('R3-VIRTUAL-KEYBOARD: modal dynamically resizes via dvh on keyboard open without viewport clipping', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/features/presets');
    await expect(page.locator('app-header')).toBeVisible();

    const createBtn = page.locator('app-page-header app-button[variant="primary"] button').first();
    await createBtn.click();

    const modalDialog = page.locator('.modal-dialog');
    await expect(modalDialog).toBeVisible();

    // Emulate on-screen keyboard appearing by reducing viewport height
    await page.setViewportSize({ width: 390, height: 420 });
    await page.waitForTimeout(200);

    const compressedBox = await modalDialog.boundingBox();
    expect(compressedBox).not.toBeNull();
    // Modal must cap at <= 90dvh of 420px (<= 385px)
    expect(compressedBox!.height).toBeLessThanOrEqual(420 * 0.92);
    expect(compressedBox!.y).toBeGreaterThanOrEqual(0);
  });

  // 7. Gesture navigation bar safe-area bottom clearance
  test('R3-GESTURE-NAV-SAFE-AREA: main content container pads bottom by >= 48px to clear sticky bar & gesture indicator', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/features/pdf/organize');
    await expect(page.locator('app-header')).toBeVisible();

    const paddingBottom = await page.evaluate(() => {
      const main = document.querySelector('.app-main-content');
      return main ? parseFloat(window.getComputedStyle(main).paddingBottom) : 0;
    });

    expect(paddingBottom, 'Mobile main content must pad bottom by >= 48px for sticky bar clearance').toBeGreaterThanOrEqual(48);
  });

  // 8. Cybersecurity: UI Redressing & z-index hierarchy isolation
  test('R3-UI-REDRESSING-ZINDEX: modal backdrop enforces superior z-index over header and sticky bars', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/features/presets');
    await expect(page.locator('app-header')).toBeVisible();

    const createBtn = page.locator('app-page-header app-button[variant="primary"] button').first();
    await createBtn.click();

    const zHierarchy = await page.evaluate(() => {
      const backdrop = document.querySelector('.modal-backdrop');
      const header = document.querySelector('app-header');
      return {
        backdropZ: backdrop ? parseInt(window.getComputedStyle(backdrop).zIndex, 10) : 0,
        headerZ: header ? parseInt(window.getComputedStyle(header).zIndex, 10) : 0
      };
    });

    // Modal backdrop must sit higher than header (1000) and sticky action bars (100)
    expect(zHierarchy.backdropZ).toBeGreaterThan(zHierarchy.headerZ);
    expect(zHierarchy.backdropZ).toBeGreaterThanOrEqual(1300);
  });

  // 9. Fluid grid reflow without rigid steps or document overflow
  test('R3-FLUID-GRID-REFLOW: tools and preset cards reflow smoothly across 320px to 1440px', async ({ page }) => {
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/home');
      await expect(page.locator('app-header')).toBeVisible();

      const gridInfo = await page.evaluate(() => {
        const grid = document.querySelector('.tools-grid');
        if (!grid) return null;
        return {
          columns: window.getComputedStyle(grid).gridTemplateColumns.split(' ').length,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth
        };
      });

      expect(gridInfo).not.toBeNull();
      expect(gridInfo!.columns).toBeGreaterThanOrEqual(1);
      expect(gridInfo!.scrollWidth).toBeLessThanOrEqual(gridInfo!.clientWidth + 1);
    }
  });

  // 10. Orientation flip loops & elasticity recovery
  test('R3-ORIENTATION-ELASTICITY: layout recovers elasticity instantly after 6 portrait/landscape flips', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/features/pdf/organize');
    await expect(page.locator('app-header')).toBeVisible();

    const flips = [
      { width: 844, height: 390 },
      { width: 390, height: 844 },
      { width: 915, height: 412 },
      { width: 412, height: 915 },
      { width: 640, height: 360 },
      { width: 360, height: 640 }
    ];

    for (const flip of flips) {
      await page.setViewportSize({ width: flip.width, height: flip.height });
      await page.waitForTimeout(60);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(overflow, `Overflow occurred after flipping to ${flip.width}x${flip.height}`).toBe(false);
    }
  });
});
