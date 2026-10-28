import { test, expect, Page } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';
import * as path from 'path';

/**
 * Mobile audit and functional cover for the Part I image suite (I5-I10):
 * upscale & enhance, format reach, the metadata viewer and date repair,
 * watermarking, photo sheets, and the batch additions.
 *
 * The service specs next to these features already cover the maths. What they
 * cannot see is the page layer, which is where every defect in this group
 * actually was:
 *
 *  - the watermark and photo-sheet previews painted before Angular had
 *    rendered the block holding their canvas, so the ViewChild was undefined,
 *    the paint was dropped and nothing retried — upload a photo, get an empty
 *    box until you happened to touch a control;
 *  - the enhance comparison promised 100% while drawing its two panes at
 *    different magnifications and letting the browser resample both, which
 *    hides the sharpening the preview exists to judge;
 *  - five legacy CSS tokens these pages use were never defined, so their card
 *    surfaces kept light-mode literals while the text followed the dark theme:
 *    white on white across three screens;
 *  - 6px slider hit areas and colour swatches that shrink under the 44px floor.
 */

const FIX = (f: string) => path.resolve(__dirname, '../test-data/photos', f);

const WIDTHS = [320, 412];

const PAGES = [
  { id: 'I5', name: 'Upscale & Enhance', url: '/features/photo/enhance', files: ['exif-dated-2019.jpg'] },
  { id: 'I7', name: 'Image Metadata', url: '/features/photo/metadata', files: ['exif-dated-2019.jpg', 'exif-wrong-clock.jpg'] },
  { id: 'I8', name: 'Watermark', url: '/features/photo/watermark', files: ['exif-dated-2019.jpg'] },
  { id: 'I9', name: 'Photo Sheet', url: '/features/photo/sheet', files: ['exif-dated-2019.jpg', 'exif-wrong-clock.jpg'] }
] as const;

async function settled(page: Page): Promise<void> {
  await expect(page.locator('.ion-page-invisible')).toHaveCount(0, { timeout: 15000 });
}

async function upload(page: Page, files: readonly string[]): Promise<void> {
  await page.locator('input[type=file]').first().waitFor({ state: 'attached', timeout: 15000 });
  await page.locator('input[type=file]').first().setInputFiles(files.map(FIX));
  await page.waitForTimeout(1500);
}

/** The batch page opens a transient picker rather than rendering an input. */
async function uploadViaPicker(page: Page, files: readonly string[]): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(b => /add|select|choose|pick|upload|browse/i.test(b.textContent || ''));
    if (!btn) throw new Error('no add-files control on the batch page');
    (btn as HTMLButtonElement).click();
  });
  await (await chooser).setFiles(files.map(FIX));
  await page.waitForTimeout(1800);
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
}

/** Controls under the 44px floor, measured on the effective tap target. */
async function smallTouchTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const sel =
      '.app-main-content button, .app-main-content a[href], ' +
      '.app-main-content input:not([type=hidden]), .app-main-content select, ' +
      '.app-main-content [role=button]';
    document.querySelectorAll(sel).forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return;
      let rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const label = el.closest('label');
      if (label && label !== el) {
        const lr = label.getBoundingClientRect();
        if (lr.height >= rect.height) rect = lr;
      }
      if (rect.height < 44 || rect.width < 44) {
        out.push(
          `${el.tagName}.${String(el.className).split(' ')[0]} ` +
          `"${(el.textContent || '').trim().slice(0, 20)}" ` +
          `${Math.round(rect.width)}x${Math.round(rect.height)}`
        );
      }
    });
    return [...new Set(out)];
  });
}

/**
 * Text whose painted contrast is below the 3:1 large-text floor.
 * Translucent layers are composited onto the first opaque ancestor, because
 * the design system's `-soft` tokens are 8% tints and treating one as opaque
 * reports a failure for text that is perfectly readable.
 */
async function lowContrastText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const parse = (c: string): number[] | null => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p.length >= 4 ? p[3] : 1];
    };
    const over = (f: number[], b: number[]) => [0, 1, 2].map(i => Math.round(f[i] * f[3] + b[i] * (1 - f[3])));
    const lum = (r: number[]) => {
      const f = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r[0]) + 0.7152 * f(r[1]) + 0.0722 * f(r[2]);
    };
    const ratio = (f: number[], b: number[]) => {
      const a = Math.max(lum(f), lum(b)), c = Math.min(lum(f), lum(b));
      return (a + 0.05) / (c + 0.05);
    };
    const painted = (el: Element): number[] => {
      const layers: number[][] = [];
      let n: Element | null = el;
      while (n) {
        const bg = parse(getComputedStyle(n).backgroundColor);
        if (bg && bg[3] > 0) { layers.push(bg); if (bg[3] >= 1) break; }
        n = n.parentElement;
      }
      let base = [255, 255, 255];
      const bb = parse(getComputedStyle(document.body).backgroundColor);
      if (bb && bb[3] >= 1) base = [bb[0], bb[1], bb[2]];
      for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
      return base;
    };

    const bad: string[] = [];
    document.querySelectorAll('.app-main-content *').forEach(el => {
      const txt = [...el.childNodes].filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => (n.textContent || '').trim()).join(' ').trim();
      if (!txt) return;
      // An outgoing Ionic page is still in the DOM at opacity 0 carrying the
      // previous route's colours; measuring it reports phantom failures.
      if (el.closest('.ion-page-invisible') || el.closest('[aria-hidden="true"]')) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      const fgRaw = parse(cs.color);
      if (!fgRaw) return;
      const bg = painted(el);
      const c = ratio(over(fgRaw, bg), bg);
      if (c < 3) bad.push(`"${txt.slice(0, 30)}" ${c.toFixed(2)} ${cs.color} on rgb(${bg.join(',')})`);
    });
    return [...new Set(bad)];
  });
}

test.describe('I5-I10 image suite — mobile layout', () => {
  for (const width of WIDTHS) {
    for (const target of PAGES) {
      test(`${target.id} ${target.name} lays out at ${width}px`, async ({ page }) => {
        await setupCapacitorMocks(page);
        await page.setViewportSize({ width, height: 760 });
        await page.goto(target.url);
        await settled(page);
        await upload(page, target.files);

        expect(await horizontalOverflow(page), 'horizontal overflow').toBeLessThanOrEqual(1);
        expect(await smallTouchTargets(page), 'controls under 44px').toEqual([]);
      });
    }
  }

  test('I10 Batch lays out at 320px', async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.setViewportSize({ width: 320, height: 760 });
    await page.goto('/features/batch');
    await settled(page);
    await uploadViaPicker(page, ['exif-dated-2019.jpg', 'exif-rotated-90cw.jpg']);

    expect(await horizontalOverflow(page), 'horizontal overflow').toBeLessThanOrEqual(1);
    expect(await smallTouchTargets(page), 'controls under 44px').toEqual([]);
  });
});

test.describe('I5-I10 image suite — dark mode is readable', () => {
  for (const target of PAGES) {
    test(`${target.id} ${target.name} has no white-on-white in dark mode`, async ({ page }) => {
      await setupCapacitorMocks(page);
      await page.setViewportSize({ width: 390, height: 800 });
      await page.goto(target.url);
      await settled(page);
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.body.classList.add('theme-dark');
        document.body.classList.remove('theme-light');
      });
      await upload(page, target.files);

      expect(await lowContrastText(page), 'text below 3:1 in dark mode').toEqual([]);
    });
  }
});

test.describe('I8/I9 — the preview is there as soon as a photo is', () => {
  test('I8 the watermark preview paints on upload, before any control is touched', async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/features/photo/watermark');
    await settled(page);
    await upload(page, ['exif-dated-2019.jpg']);

    const state = await page.evaluate(() => {
      const c = document.querySelector('canvas.preview-canvas') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let painted = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) painted++;
      return { width: c.width, height: c.height, painted };
    });

    // 300x150 is the untouched HTML default: the canvas was never sized.
    expect(state.width, 'canvas was sized from the image').not.toBe(300);
    expect(state.painted, 'canvas has pixels on it').toBeGreaterThan(0);
  });

  test('I9 the sheet preview paints on upload, before any control is touched', async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/features/photo/sheet');
    await settled(page);
    await upload(page, ['exif-dated-2019.jpg', 'exif-wrong-clock.jpg']);

    const state = await page.evaluate(() => {
      const c = document.querySelector('canvas.sheet-preview-canvas') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let painted = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) painted++;
      return { width: c.width, painted };
    });

    expect(state.width, 'canvas was sized from the sheet').not.toBe(300);
    expect(state.painted, 'canvas has pixels on it').toBeGreaterThan(0);
  });
});

test.describe('I5 — the comparison really is at 100%', () => {
  for (const scale of [2, 4]) {
    test(`both panes are 1:1 and the same size at ${scale}x`, async ({ page }) => {
      await setupCapacitorMocks(page);
      await page.setViewportSize({ width: 390, height: 800 });
      await page.goto('/features/photo/enhance');
      await settled(page);
      await upload(page, ['exif-dated-2019.jpg']);

      await page.getByRole('button', { name: new RegExp(`^${scale}\\s*[x×]`, 'i') }).first().click();
      await page.waitForTimeout(700);

      const m = await page.evaluate(() => {
        const [o, e] = [...document.querySelectorAll('canvas.sample-canvas')] as HTMLCanvasElement[];
        const or = o.getBoundingClientRect(), er = e.getBoundingClientRect();
        const energy = (cv: HTMLCanvasElement) => {
          const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data;
          let s = 0;
          for (let y = 1; y < cv.height - 1; y++)
            for (let x = 1; x < cv.width - 1; x++) {
              const i = (y * cv.width + x) * 4, r = (y * cv.width + x + 1) * 4;
              s += Math.abs(d[i] - d[r]);
            }
          return s / (cv.width * cv.height);
        };
        return {
          origOneToOne: Math.abs(o.width - or.width) < 1.5,
          enhOneToOne: Math.abs(e.width - er.width) < 1.5,
          sameSize: Math.abs(or.width - er.width) < 1.5,
          withinViewport: er.right <= window.innerWidth + 1,
          origEnergy: energy(o),
          enhEnergy: energy(e)
        };
      });

      expect(m.origOneToOne, 'before pane is 1:1').toBe(true);
      expect(m.enhOneToOne, 'after pane is 1:1').toBe(true);
      expect(m.sameSize, 'both panes are the same size on screen').toBe(true);
      expect(m.withinViewport, 'the comparison fits the screen').toBe(true);
      // The sampled region must carry detail, or the comparison shows nothing:
      // a centre crop of a scanned form is blank paper.
      expect(m.origEnergy, 'the sampled region has detail in it').toBeGreaterThan(1);
      expect(m.enhEnergy, 'the enhanced pane is sharper').toBeGreaterThan(m.origEnergy);
    });
  }
});

test.describe('I7 — real EXIF is read and shown', () => {
  test('shows camera, capture date and GPS from a file that carries them', async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/features/photo/metadata');
    await settled(page);
    await upload(page, ['exif-dated-2019.jpg']);

    const body = await page.evaluate(() => document.body.innerText);
    expect(body, 'camera make').toMatch(/canon/i);
    expect(body, 'camera model').toMatch(/EOS 200D/i);
    expect(body, 'capture year').toMatch(/2019/);
    expect(body, 'GPS latitude').toMatch(/28\.61/);
  });
});
