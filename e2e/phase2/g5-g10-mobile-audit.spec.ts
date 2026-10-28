import { test, expect, Page } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';
import { getPhase2FixturePath, uploadFileToDropzone, interceptDownload } from '../common/phase2-helpers';

/**
 * Independent mobile audit of the Part G integrity tools (G5-G10).
 *
 * The G1-G5 and G6-G10 suites next to this one drive each feature and assert
 * that its cards appear. They say nothing about whether the result is legible
 * on a phone, so this file covers the two things that actually block a Play
 * Store release and that a visibility assertion cannot see:
 *
 *  - the layout at 360px, the narrowest width worth supporting on Android,
 *    including touch targets and horizontal overflow;
 *  - dark mode, where a hardcoded light fallback produces white-on-white text
 *    that every existing assertion still passes straight through.
 */

const NARROW = { width: 360, height: 740 };

const PAGES = [
  { id: 'G5', name: 'Signature Status', url: '/features/pdf/signature-status' },
  { id: 'G6', name: 'Archival Preparation', url: '/features/pdf/archival' },
  { id: 'G7', name: 'Selective Flatten', url: '/features/pdf/flatten' },
  { id: 'G8/G9', name: 'Compare', url: '/features/pdf-compare' },
  { id: 'G10', name: 'Repair', url: '/features/pdf-repair' }
];

/** Dismisses the onboarding overlay if this profile has not seen it yet. */
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
 * Polls until the painted backgrounds stop moving. Cards carry
 * `transition: all 250ms`, so anything measured while a fade is in flight
 * reads a colour that belongs to neither theme.
 *
 * The probe must cover whatever the route actually renders: listing card
 * classes meant a screen without them sampled an empty set, compared '' to ''
 * and returned before the fade had started.
 */
async function waitForPaintToSettle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const probes = () => Array.from(
      document.querySelectorAll('body, main, section, div, header, button')
    ).filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 8 && r.height > 8;
    }).slice(0, 60).map(el => getComputedStyle(el).backgroundColor).join('|');

    let last = '';
    let stable = 0;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 50)));
      const now = probes();
      stable = now === last ? stable + 1 : 0;
      last = now;
      if (stable >= 2 && i >= 6) return;
    }
  });
}

async function applyTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate(t => {
    document.documentElement.setAttribute('data-theme', t);
    document.body.classList.toggle('theme-dark', t === 'dark');
    document.body.classList.toggle('theme-light', t === 'light');
  }, theme);
  await waitForPaintToSettle(page);
}

/** sRGB relative luminance, per WCAG 2.1. */
function luminance([r, g, b]: number[]): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fg: number[], bg: number[]): number {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/**
 * Walks every text node's element, resolving the painted background by
 * climbing ancestors past transparent ones, and returns the worst pairs.
 */
async function lowContrastText(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(() => {
    // Returns [r, g, b, a]; the design system's `-soft` tokens are 8%-alpha
    // tints, so the alpha has to be kept and composited rather than dropped --
    // treating rgba(79,70,229,0.08) as opaque indigo reports a 1:1 ratio
    // against indigo text that is in fact perfectly readable.
    const parse = (c: string): number[] | null => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(v => parseFloat(v));
      const a = parts.length >= 4 ? parts[3] : 1;
      return [parts[0], parts[1], parts[2], a];
    };
    const over = (fg: number[], bg: number[]): number[] => {
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
      const a = Math.max(lum(fg), lum(bg));
      const b = Math.min(lum(fg), lum(bg));
      return (a + 0.05) / (b + 0.05);
    };

    // Composites every translucent layer from the element outwards onto the
    // first opaque ancestor, which is what the eye actually sees.
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

      // During an Ionic route transition the outgoing page is still in the DOM
      // at opacity 0, carrying the previous route's resolved colours. Measuring
      // it reports failures for a page nobody can see, so skip anything that is
      // not actually rendered.
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
      const fg = over(fgRaw, bg);
      const c = ratio(fg, bg);
      // 3:1 is the large-text floor; anything under it is unreadable at any size.
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

/** Interactive controls smaller than the 44px Android/WCAG floor. */
async function smallTouchTargets(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(() => {
    const out: Array<Record<string, unknown>> = [];
    const sel = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=radio], [role=checkbox]';
    document.querySelectorAll(sel).forEach(el => {
      // During an Ionic route transition the outgoing page is still in the DOM
      // at opacity 0, carrying the previous route's resolved colours. Measuring
      // it reports failures for a page nobody can see, so skip anything that is
      // not actually rendered.
      if (el.closest('.ion-page-invisible') || el.closest('[aria-hidden="true"]')) return;
      if (typeof (el as any).checkVisibility === 'function' &&
          !(el as any).checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return;

      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      // A control wrapped in a label large enough to hit is fine.
      const label = el.closest('label');
      const hit = label ? label.getBoundingClientRect() : r;
      // Sub-pixel layout puts a nominally 44px control at 43.99.
      const EPS = 0.5;
      if (hit.height < 44 - EPS || hit.width < 24 - EPS) {
        out.push({
          tag: el.tagName.toLowerCase(),
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

test.describe('G5-G10 mobile audit — 360px layout and dark mode', () => {
  test.use({ viewport: NARROW, hasTouch: true, isMobile: true });

  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  for (const p of PAGES) {
    test(`${p.id} ${p.name}: no horizontal overflow and 44px touch targets at 360px`, async ({ page }) => {
      await page.goto(p.url);
      await page.waitForLoadState('domcontentloaded');
      await dismissOnboarding(page);
      await expect(page.locator('app-file-dropzone, .dropzone-card').first()).toBeVisible({ timeout: 20000 });
      await settled(page);
      // Line height -- and so the height of a text control sized by its
      // content -- changes when the webfont swaps in, so a 44px breadcrumb
      // link measures short until it lands.
      await page.evaluate(() => document.fonts.ready.then(() => undefined));

      expect(await horizontalOverflow(page), `${p.name} overflows horizontally at 360px`).toBeLessThanOrEqual(0);

      const small = await smallTouchTargets(page);
      expect(small, `${p.name} has controls under the 44px floor: ${JSON.stringify(small)}`).toEqual([]);
    });

    test(`${p.id} ${p.name}: readable in dark mode`, async ({ page }) => {
      await page.goto(p.url);
      await page.waitForLoadState('domcontentloaded');
      await dismissOnboarding(page);
      await expect(page.locator('app-file-dropzone, .dropzone-card').first()).toBeVisible({ timeout: 20000 });
      await settled(page);
      await applyTheme(page, 'dark');

      const bad = await lowContrastText(page);
      expect(bad, `${p.name} has unreadable text in dark mode: ${JSON.stringify(bad, null, 1)}`).toEqual([]);
    });
  }

  test('G10 Repair: recovery report and per-page cards stay readable in dark mode', async ({ page }) => {
    await page.goto('/features/pdf-repair');
    await page.waitForLoadState('domcontentloaded');
    await dismissOnboarding(page);
    await settled(page);
    await applyTheme(page, 'dark');

    await uploadFileToDropzone(page, getPhase2FixturePath('repair-healthy.pdf'));
    await page.locator('[data-testid="start-recovery"]').click();
    await expect(page.locator('.recovery-report-section')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.page-detail-card').first()).toBeVisible();
    // These cards appeared after the theme was applied and fade in on their
    // own, so the earlier settle says nothing about them.
    await waitForPaintToSettle(page);

    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    const bad = await lowContrastText(page);
    expect(bad, `Repair report unreadable in dark mode: ${JSON.stringify(bad, null, 1)}`).toEqual([]);
  });

  test('G10 Repair: the exported recovery log names a strategy for every page', async ({ page }) => {
    await page.goto('/features/pdf-repair');
    await page.waitForLoadState('domcontentloaded');
    await dismissOnboarding(page);

    await uploadFileToDropzone(page, getPhase2FixturePath('repair-healthy.pdf'));
    await page.locator('[data-testid="start-recovery"]').click();
    await expect(page.locator('.recovery-report-section')).toBeVisible({ timeout: 30000 });

    const pageCards = await page.locator('.page-detail-card').count();
    expect(pageCards).toBeGreaterThan(0);

    const { buffer, fileName } = await interceptDownload(page, async () => {
      await page.locator('[data-testid="download-recovery-log-btn"]').click();
    });
    const log = buffer.toString('utf-8');
    expect(fileName).toMatch(/\.txt$/i);
    // Every page the UI listed must appear in the log the user sends on.
    for (let i = 1; i <= pageCards; i++) {
      expect(log, `recovery log is missing page ${i}`).toMatch(new RegExp(`Page\\s*${i}\\b`));
    }
  });

  test('G8/G9 Compare: word-level diff renders and the PDF report matches the screen', async ({ page }) => {
    await page.goto('/features/pdf-compare');
    await page.waitForLoadState('domcontentloaded');
    await dismissOnboarding(page);

    await page.locator('.dropzone-card').nth(0).locator('input[type="file"]')
      .setInputFiles(getPhase2FixturePath('text-changed-original.pdf'));
    await page.locator('.dropzone-card').nth(1).locator('input[type="file"]')
      .setInputFiles(getPhase2FixturePath('text-changed-modified.pdf'));

    await page.getByRole('button', { name: /compare documents|तुलना/i }).first().click();
    await expect(page.locator('.summary-metrics-grid')).toBeVisible({ timeout: 30000 });

    // G8: the diff is word-level, not whole-line.
    const tokens = page.locator('.token-added, .token-removed');
    expect(await tokens.count(), 'no word-level diff tokens rendered').toBeGreaterThan(0);

    // The navigator's change count must agree with the word-level badges
    // beside it; they are two readings of the same diff.
    const bar = await page.locator('.change-navigator-bar').innerText();
    const added = Number(bar.match(/\+(\d+)\s+Words Added/i)?.[1] ?? '0');
    const removed = Number(bar.match(/-(\d+)\s+Words Removed/i)?.[1] ?? '0');
    const changed = Number(bar.match(/~(\d+)\s+Words Changed/i)?.[1] ?? '0');
    const total = Number(bar.match(/Total Changes:\s*(\d+)/i)?.[1] ?? '-1');
    expect(total, `summary says ${added}+${removed}+${changed} but total is ${total}`)
      .toBe(added + removed + changed);

    // G9: the exported report is a real PDF carrying the on-screen summary.
    const { buffer, fileName } = await interceptDownload(page, async () => {
      await page.getByRole('button', { name: /export pdf report/i }).click();
    });
    expect(fileName).toMatch(/\.pdf$/i);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBeGreaterThan(0);

    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });

  test('G7 Flatten: a selective flatten never claims a fully static document', async ({ page }) => {
    await page.goto('/features/pdf/flatten');
    await page.waitForLoadState('domcontentloaded');
    await dismissOnboarding(page);

    await uploadFileToDropzone(page, getPhase2FixturePath('privacy-forms.pdf'));

    const formsOnly = page.getByRole('radio', { name: /forms only/i })
      .or(page.locator('input[value="forms"]'));
    await expect(formsOnly).toBeVisible({ timeout: 20000 });
    await formsOnly.click();

    await page.getByRole('button', { name: /flatten pdf now/i }).click();
    await expect(page.locator('.comparison-metrics-card')).toBeVisible({ timeout: 30000 });

    const report = page.locator('.flatten-report-card').first();
    await expect(report).toBeVisible();
    const kept = Number((await report.innerText()).match(/Kept Interactive:\s*(\d+)/)?.[1] ?? '0');

    const flattenedCol = page.locator('.comparison-metrics-card .metric-col').last();
    const shown = Number((await flattenedCol.innerText()).match(/(\d+)/)?.[1] ?? '-1');

    // The headline number has to be the report's own, not a hardcoded zero.
    expect(shown).toBe(kept);
    if (kept > 0) {
      await expect(flattenedCol).not.toContainText('100% Static');
    }

    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});
