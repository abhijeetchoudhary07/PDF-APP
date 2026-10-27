import { test, expect, Page } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';

/**
 * Mobile audit of the Part H scanner (H1-H4) and the photo tools.
 *
 * The scanner's own spec drives the capture pipeline and asserts the pages it
 * produces. It says nothing about whether any of it is legible on a phone, and
 * that gap hid a whole class of bug: `--color-on-surface`,
 * `--color-on-surface-variant` and `--color-surface-container` were never
 * declared anywhere, so every `var(--color-on-surface, #1e293b)` took its light
 * literal -- which in dark mode is the same slate as the surface behind it.
 * The mode picker's labels were painted in the exact colour of their own
 * background and every existing assertion still passed.
 *
 * So this file checks the two things that block a Play Store release and that
 * a visibility assertion cannot see:
 *
 *  - the layout at 360px, the narrowest width worth supporting on Android,
 *    including touch targets and horizontal overflow;
 *  - dark mode contrast, composited rather than naive.
 *
 * It also pins the H1-H4 behaviour that the unit tests cannot reach, because
 * it only goes wrong once the page wires the service up: the ID-card sheet
 * being re-cropped by the document pipeline, and the blur score reaching the
 * UI as a percentage rather than a raw Laplacian variance in the tens of
 * thousands.
 */

const NARROW = { width: 360, height: 740 };

const PAGES = [
  { id: 'H1-H4', name: 'Document Scanner', url: '/features/document-scanner' },
  { id: 'I', name: 'Photo Tools hub', url: '/features/photo' },
  { id: 'I1', name: 'ID Photo Studio', url: '/features/photo/id-photo' },
  { id: 'I3', name: 'Blur & Redact', url: '/features/photo/blur' },
  { id: 'I4', name: 'Background Cutout', url: '/features/photo/cutout' },
  { id: 'I5', name: 'Upscale & Enhance', url: '/features/photo/enhance' },
  { id: 'I7', name: 'Image Metadata', url: '/features/photo/metadata' },
  { id: 'I8', name: 'Image Watermark', url: '/features/photo/watermark' },
  { id: 'I9', name: 'Photo Sheet', url: '/features/photo/sheet' },
  { id: 'I10', name: 'Batch Images', url: '/features/batch-images' }
];

async function dismissOnboarding(page: Page): Promise<void> {
  const skip = page.getByRole('button', { name: /^skip$/i }).first();
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) {
    await skip.click();
    await expect(skip).toBeHidden({ timeout: 5000 });
  }
}

/** Waits until no Ionic page is mid-transition, so only one route is painted. */
async function settled(page: Page): Promise<void> {
  await expect(page.locator('.ion-page-invisible')).toHaveCount(0, { timeout: 15000 });
}

/**
 * Waits for the feature component itself, not just the shell. A lazy route is
 * compiled on first request by the dev server, so `main` is visible for some
 * time before any of the page's own controls exist -- auditing that window
 * measures an empty page and passes for the wrong reason.
 */
async function routeRendered(page: Page): Promise<void> {
  await expect(page.locator('main, ion-content').first()).toBeVisible({ timeout: 30000 });
  await page.waitForFunction(
    () => document.querySelectorAll('main button, main a[href], main input').length > 2,
    undefined,
    { timeout: 30000 }
  );
  // Line height -- and so the height of a text control sized by its content --
  // changes when the webfont swaps in. Measuring before that lands reports a
  // 44px link as 41px, intermittently and on a different page each run.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await settled(page);
}

async function applyTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate(async t => {
    document.documentElement.setAttribute('data-theme', t);
    document.body.classList.toggle('theme-dark', t === 'dark');
    document.body.classList.toggle('theme-light', t === 'light');

    // Cards carry `transition: all 250ms`, so switching the theme cross-fades
    // their background. Sampling mid-fade reads a colour that is neither
    // theme's -- greys like rgb(225,226,229) behind correct dark-mode text --
    // and reports contrast failures that do not exist.
    //
    // The probe has to cover whatever this route actually renders: an earlier
    // version listed card classes that some pages do not have, so it sampled
    // an empty set, compared '' to '' and returned before the fade had begun.
    const probes = () => {
      const els = Array.from(document.querySelectorAll('body, main, section, div, header, button'))
        .filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 8 && r.height > 8;
        })
        .slice(0, 60);
      return els.map(el => getComputedStyle(el).backgroundColor).join('|');
    };

    let last = '';
    let stable = 0;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 50)));
      const now = probes();
      // Two consecutive identical readings, and never before the transition
      // has had time to start.
      stable = now === last ? stable + 1 : 0;
      last = now;
      if (stable >= 2 && i >= 6) return;
    }
  }, theme);
}

/**
 * Every visible text node's contrast against the background that is actually
 * painted behind it, which means compositing the translucent layers rather
 * than reading the nearest `background-color` and hoping it is opaque. The
 * design system's `-soft` tokens are 8% tints: treating rgba(79,70,229,0.08)
 * as solid indigo reports 1:1 against indigo text that reads perfectly well.
 */
async function lowContrastText(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(() => {
    const parse = (c: string): number[] | null => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(/[,\s/]+/).filter(Boolean).map(v => parseFloat(v));
      return [p[0], p[1], p[2], p.length >= 4 ? p[3] : 1];
    };
    const over = (fg: number[], bg: number[]) => {
      const a = fg[3];
      return [0, 1, 2].map(i => Math.round(fg[i] * a + bg[i] * (1 - a)));
    };
    const lum = (rgb: number[]) => {
      const f = (c: number) => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
    };
    const ratio = (fg: number[], bg: number[]) => {
      const hi = Math.max(lum(fg), lum(bg));
      const lo = Math.min(lum(fg), lum(bg));
      return (hi + 0.05) / (lo + 0.05);
    };
    const paintedBg = (el: Element): number[] => {
      const layers: number[][] = [];
      let node: Element | null = el;
      while (node) {
        const bg = parse(getComputedStyle(node).backgroundColor);
        if (bg && bg[3] > 0) {
          layers.push(bg);
          if (bg[3] >= 1) break;
        }
        node = node.parentElement;
      }
      let base = [255, 255, 255];
      const bodyBg = parse(getComputedStyle(document.body).backgroundColor);
      if (bodyBg && bodyBg[3] >= 1) base = [bodyBg[0], bodyBg[1], bodyBg[2]];
      for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
      return base;
    };

    const bad: Array<Record<string, unknown>> = [];
    document.querySelectorAll('*').forEach(el => {
      const text = Array.from(el.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => (n.textContent || '').trim())
        .join(' ')
        .trim();
      if (!text) return;

      // Ionic keeps the outgoing page in the DOM at opacity 0 during a route
      // transition, carrying the previous route's colours.
      if (el.closest('.ion-page-invisible') || el.closest('[aria-hidden="true"]')) return;
      if (typeof (el as any).checkVisibility === 'function' &&
          !(el as any).checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return;

      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;

      const fgRaw = parse(cs.color);
      if (!fgRaw) return;
      const bg = paintedBg(el);
      const c = ratio(over(fgRaw, bg), bg);
      // 3:1 is the large-text floor; under it nothing is readable at any size.
      if (c < 3) {
        bad.push({
          text: text.slice(0, 50),
          selector: el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ')[0],
          color: cs.color,
          background: `rgb(${bg.join(',')})`,
          ratio: Number(c.toFixed(2))
        });
      }
    });
    return bad;
  });
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** Interactive controls under the 44px Android/WCAG floor. */
async function smallTouchTargets(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(() => {
    const out: Array<Record<string, unknown>> = [];
    const sel = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button]';
    document.querySelectorAll(sel).forEach(el => {
      if (el.closest('.ion-page-invisible') || el.closest('[aria-hidden="true"]')) return;
      if (typeof (el as any).checkVisibility === 'function' &&
          !(el as any).checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      // A control wrapped in a label big enough to hit is fine.
      const label = el.closest('label');
      const hit = label ? label.getBoundingClientRect() : r;
      // Sub-pixel layout puts a nominally 44px control at 43.99, so compare
      // with a small tolerance rather than reporting rounding as a design miss.
      const EPS = 0.5;
      if (hit.height < 44 - EPS || hit.width < 24 - EPS) {
        out.push({
          cls: (el.className || '').toString().slice(0, 40),
          text: (el.textContent || '').trim().slice(0, 30),
          w: Math.round(hit.width),
          h: Math.round(hit.height)
        });
      }
    });
    return out;
  });
}

test.describe('H1-H4 scanner and photo tools — 360px layout and dark mode', () => {
  test.use({ viewport: NARROW, hasTouch: true, isMobile: true });

  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  for (const p of PAGES) {
    test(`${p.id} ${p.name}: no horizontal overflow and 44px touch targets at 360px`, async ({ page }) => {
      await page.goto(p.url);
      await page.waitForLoadState('domcontentloaded');
      await dismissOnboarding(page);
      await routeRendered(page);

      expect(await horizontalOverflow(page), `${p.name} overflows horizontally at 360px`)
        .toBeLessThanOrEqual(0);

      const small = await smallTouchTargets(page);
      expect(small, `${p.name} has controls under the 44px floor: ${JSON.stringify(small)}`).toEqual([]);
    });

    test(`${p.id} ${p.name}: readable in dark mode`, async ({ page }) => {
      await page.goto(p.url);
      await page.waitForLoadState('domcontentloaded');
      await dismissOnboarding(page);
      await routeRendered(page);
      await applyTheme(page, 'dark');

      const bad = await lowContrastText(page);
      expect(bad, `${p.name} has unreadable text in dark mode: ${JSON.stringify(bad, null, 1)}`)
        .toEqual([]);
    });
  }

  test('H1: every scan mode label stays readable in dark mode', async ({ page }) => {
    await page.goto('/features/document-scanner');
    await page.waitForLoadState('domcontentloaded');
    await dismissOnboarding(page);
    await routeRendered(page);
    await expect(page.locator('.mode-pill').first()).toBeVisible({ timeout: 30000 });
    await applyTheme(page, 'dark');

    const pills = page.locator('.mode-pill');
    expect(await pills.count(), 'scan mode picker did not render').toBeGreaterThan(1);

    // The labels on the unselected pills were the original symptom: painted in
    // the surface colour, they were invisible while the emoji beside them --
    // a colour glyph, immune to `color` -- still showed.
    const contrasts = await page.locator('.mode-pill:not(.active) .mode-label').evaluateAll(els =>
      els.map(el => {
        const cs = getComputedStyle(el);
        const pill = el.closest('.mode-pill')!;
        return { label: el.textContent?.trim(), fg: cs.color, bg: getComputedStyle(pill).backgroundColor };
      })
    );
    for (const c of contrasts) {
      expect(c.fg, `"${c.label}" is painted in its own background colour`).not.toBe(c.bg);
    }
  });

  test('H3: no capture toggle promises a shutter the page cannot fire', async ({ page }) => {
    await page.goto('/features/document-scanner');
    await page.waitForLoadState('domcontentloaded');
    await dismissOnboarding(page);
    await routeRendered(page);
    await expect(page.locator('.mode-pill').first()).toBeVisible({ timeout: 30000 });

    // Auto-capture needs a live in-app preview to score frames; this page hands
    // off to the OS camera, which returns a single still. A toggle labelled
    // auto-capture here flips a field nothing reads, so it must not come back
    // until the preview does.
    await expect(page.getByRole('button', { name: /auto.?capture/i })).toHaveCount(0);
  });

  test('H4: the blur gate renders through the shared modal, which escapes page containment', async ({ page }) => {
    await page.goto('/features/document-scanner');
    await page.waitForLoadState('domcontentloaded');
    await dismissOnboarding(page);
    await routeRendered(page);
    await expect(page.locator('.mode-pill').first()).toBeVisible({ timeout: 30000 });

    // Ionic sets `contain: size layout style` on .ion-page, which makes it the
    // containing block for position:fixed descendants. An overlay declared
    // inside the page therefore covered only the page box and scrolled with
    // it -- a dialog in name only. The shared modal reparents its backdrop to
    // <body>, which is why the gate has to go through it.
    await expect(page.locator('app-modal')).toHaveCount(1);

    const contained = await page.evaluate(() => {
      const el = document.querySelector('app-document-scanner.ion-page');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return cs.contain;
    });
    expect(contained, 'the page host no longer reports containment; re-check where the gate renders')
      .toContain('size');
  });
});
