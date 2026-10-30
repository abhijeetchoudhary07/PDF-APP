import { test, expect, Page } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';

const WIDTHS = [320, 360, 390, 412, 768, 1180, 1440];
const MOBILE_WIDTHS = [320, 360, 390, 412, 768];
const MIN_TOUCH_TARGET = 44;

async function boxOf(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { width: r.width, height: r.height, top: r.top, left: r.left, right: r.right, bottom: r.bottom };
  }, selector);
}

test.describe('R1 — Fluid Control Scale: Responsive Buttons, Icons, Tap Targets @r1 @responsive', () => {
  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  // 1. Document horizontal overflow check across all 7 target widths
  for (const width of WIDTHS) {
    test(`R1-NO-OVERFLOW-${width}: document never scrolls horizontally at ${width}px`, async ({ page }) => {
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

  // 2. Touch targets in Header & Tool Grid measure at least 44x44 on mobile viewports (<960px)
  for (const width of MOBILE_WIDTHS) {
    test(`R1-TOUCH-TARGETS-${width}: header, tool grid and chips measure >= 44x44px at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/home');
      await expect(page.locator('app-header')).toBeVisible();

      // Header top bar controls
      const headerSelectors = [
        'app-header .search-trigger-btn',
        'app-header app-language-selector .lang-trigger-btn',
        'app-header .mobile-menu-btn'
      ];

      for (const sel of headerSelectors) {
        const box = await boxOf(page, sel);
        expect(box, `${sel} must be present`).not.toBeNull();
        expect(Math.round(box!.width), `${sel} width at ${width}px`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
        expect(Math.round(box!.height), `${sel} height at ${width}px`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      }

      // Tool grid star favorite buttons
      const favoriteBtn = page.locator('.favorite-star-btn').first();
      await expect(favoriteBtn).toBeVisible();
      const favBox = await favoriteBtn.boundingBox();
      expect(favBox, 'Favorite button must have a bounding box').not.toBeNull();
      expect(Math.round(favBox!.width), `favorite-star-btn width at ${width}px`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      expect(Math.round(favBox!.height), `favorite-star-btn height at ${width}px`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);

      // Category pills in filter marquee
      const catPill = page.locator('.cat-pill').first();
      await expect(catPill).toBeVisible();
      const catBox = await catPill.boundingBox();
      expect(catBox, 'Category pill must have a bounding box').not.toBeNull();
      expect(Math.round(catBox!.height), `cat-pill height at ${width}px`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    });
  }

  // 3. Organizer action bar buttons measure at least 44x44 below 960px
  for (const width of MOBILE_WIDTHS) {
    test(`R1-ORGANIZER-TOUCH-${width}: organizer buttons measure >= 44x44px at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/features/pdf-organizer');

      // The back button and header controls on organizer page
      const backBtn = page.locator('app-header .back-btn');
      await expect(backBtn).toBeVisible();
      const backBox = await backBtn.boundingBox();
      expect(backBox).not.toBeNull();
      expect(Math.round(backBox!.width), `Organizer back button width at ${width}px`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      expect(Math.round(backBox!.height), `Organizer back button height at ${width}px`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);

      // Verify page layout container has zero horizontal scroll
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      }));
      expect(scrollWidth, `Organizer page should not scroll horizontally at ${width}px`).toBeLessThanOrEqual(clientWidth + 1);
    });
  }

  // 4. 200% font/text zoom at 360px shows no horizontal overflow or clipping
  test('R1-FONT-SCALE-200: 200% font zoom at 360px shows no horizontal document scroll', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/home');
    await expect(page.locator('app-header')).toBeVisible();

    // Emulate 200% font scaling
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    await page.waitForTimeout(400);

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));

    expect(scrollWidth, '200% font zoom must not trigger horizontal scroll at 360px').toBeLessThanOrEqual(clientWidth + 1);
  });

  // 5. Button active/hover state transitions without layout shifts
  test('R1-BUTTON-VISUAL-FEEDBACK: buttons active feedback does not shift layout', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/home');
    await expect(page.locator('app-header')).toBeVisible();

    const starBtn = page.locator('.favorite-star-btn').first();
    const initialBox = await starBtn.boundingBox();
    expect(initialBox).not.toBeNull();

    // Hover
    await starBtn.hover();
    const hoverBox = await starBtn.boundingBox();
    expect(Math.round(hoverBox!.width)).toBe(Math.round(initialBox!.width));
    expect(Math.round(hoverBox!.height)).toBe(Math.round(initialBox!.height));
  });

  // 6. Button variants rendering and fluid tokens across all 4 key viewports
  for (const width of [320, 390, 768, 1440]) {
    test(`R1-VARIANTS-${width}: button variants render cleanly at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/features/pdf/organize');
      await expect(page.locator('app-header')).toBeVisible();

      const buttonVariants = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('app-button button.btn, button.btn'));
        return btns.map((b) => ({
          className: b.className,
          height: b.getBoundingClientRect().height,
          hasContent: (b.textContent || '').trim().length > 0 || b.querySelector('svg') !== null
        }));
      });

      expect(buttonVariants.length).toBeGreaterThan(0);
      for (const btn of buttonVariants) {
        expect(btn.hasContent).toBe(true);
        if (width <= 960) {
          expect(Math.round(btn.height)).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
        }
      }
    });
  }

  // 7. Responsive icon token scaling without hardcoded SVG width/height attributes
  test('R1-ICON-RESPONSIVE-SCALING: icons with responsive tokens scale via CSS without fixed SVG dimensions', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/home');
    await expect(page.locator('app-header')).toBeVisible();

    const iconAttributes = await page.evaluate(() => {
      const svgs = Array.from(document.querySelectorAll('app-icon svg.icon-sm, app-icon svg.icon-md, app-icon svg.icon-lg, app-icon svg.icon-inherit'));
      return svgs.map((s) => ({
        widthAttr: s.getAttribute('width'),
        heightAttr: s.getAttribute('height'),
        renderedWidth: s.getBoundingClientRect().width,
        renderedHeight: s.getBoundingClientRect().height
      }));
    });

    for (const icon of iconAttributes) {
      expect(icon.widthAttr, 'Responsive token icons should omit hardcoded width attribute').toBeNull();
      expect(icon.heightAttr, 'Responsive token icons should omit hardcoded height attribute').toBeNull();
      expect(icon.renderedWidth).toBeGreaterThan(0);
      expect(icon.renderedHeight).toBeGreaterThan(0);
    }
  });

  // 8. Cybersecurity: CSS injection prevention through icon registry and button variants
  test('R1-CYBERSECURITY-INJECTION: dynamic icon names and attributes cannot inject malicious CSS or markup', async ({ page }) => {
    await page.goto('/home');

    const injectionTest = await page.evaluate(() => {
      const testNames = [
        '<script>alert(1)</script>',
        '"><img src=x onerror=alert(1)>',
        '"><style>body{display:none}</style>',
        'url("javascript:alert(1)")',
        'expression(alert(1))'
      ];

      // Create an app-icon component host in page context and try setting malicious inputs
      const results: { name: string; hasInjectedElement: boolean; innerHTML: string }[] = [];
      for (const name of testNames) {
        const iconEl = document.createElement('app-icon');
        iconEl.setAttribute('name', name);
        document.body.appendChild(iconEl);

        const scripts = iconEl.querySelectorAll('script, img, style');
        const svg = iconEl.querySelector('svg');
        results.push({
          name,
          hasInjectedElement: scripts.length > 0,
          innerHTML: svg ? svg.innerHTML : ''
        });

        document.body.removeChild(iconEl);
      }
      return results;
    });

    for (const res of injectionTest) {
      expect(res.hasInjectedElement, `Injection payload "${res.name}" breached DOM containment`).toBe(false);
      expect(res.innerHTML, `Injection payload "${res.name}" rendered markup`).toBe('');
    }
  });

  // 9. Cybersecurity: Visual overlay occlusion test at 200% font zoom
  test('R1-CYBERSECURITY-OCCLUSION-200: scaled buttons at 200% zoom do not occlude underlying form inputs or checkboxes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/features/settings');
    await expect(page.locator('app-header')).toBeVisible();

    // Emulate 200% font zoom
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    await page.waitForTimeout(300);

    const occlusions = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, app-button'));
      const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
      const found: { button: string; input: string; overlapX: number; overlapY: number }[] = [];

      for (const b of btns) {
        const br = b.getBoundingClientRect();
        if (br.width === 0 || br.height === 0) continue;

        for (const inp of inputs) {
          const ir = inp.getBoundingClientRect();
          if (ir.width === 0 || ir.height === 0) continue;

          // Check if button overlaps input
          const xOverlap = Math.max(0, Math.min(br.right, ir.right) - Math.max(br.left, ir.left));
          const yOverlap = Math.max(0, Math.min(br.bottom, ir.bottom) - Math.max(br.top, ir.top));

          if (xOverlap > 4 && yOverlap > 4 && !b.contains(inp) && !inp.contains(b)) {
            found.push({
              button: b.className || b.tagName,
              input: inp.id || inp.name || inp.tagName,
              overlapX: xOverlap,
              overlapY: yOverlap
            });
          }
        }
      }
      return found;
    });

    expect(occlusions, 'Buttons must not occlude input fields or checkboxes at 200% zoom').toEqual([]);
  });
});
