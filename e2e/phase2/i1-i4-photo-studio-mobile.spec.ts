import { test, expect, Page } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';

/**
 * Mobile audit and functional cover for the Part I photo tools (I1-I4):
 * the ID photo studio (crop, background, print sheet), face/plate blur, and
 * the document cutout.
 *
 * The page specs next to these features assert on component state. That misses
 * the class of defect that actually ships broken to a phone, which is what this
 * file covers:
 *
 *  - the primary action being laid out off-screen, because the bars were
 *    `position: fixed` inside `.app-main-content`, whose `pageIn` transform
 *    animation makes it the containing block for fixed descendants;
 *  - pointer coordinates mapped through a stale scale factor rather than the
 *    canvas' live bounding rect, which put every blur region short of where it
 *    was drawn and left part of the face or plate visible;
 *  - a guide overlay that could be drawn but not moved, on devices where
 *    `FaceDetector` does not exist and the manual path is the only path;
 *  - touch targets under the 44px Android floor, and horizontal overflow.
 *
 * Widths: 320px is the narrowest Android worth supporting, 412px a common
 * modern handset.
 */

const WIDTHS = [320, 412];

const PAGES = [
  { id: 'I1/I2', name: 'ID Photo Studio', url: '/features/photo/id-photo', source: 'portrait' },
  // Landscape, so the preview is width-constrained: that is the orientation
  // that exposes a canvas sized past the room its padded card actually has.
  { id: 'I3', name: 'Blur & Redact', url: '/features/photo/blur', source: 'scene' },
  { id: 'I4', name: 'Document Cutout', url: '/features/photo/cutout', source: 'scene' }
] as const;

/** A plain-background portrait, built in the page so no binary fixture is needed. */
const PORTRAIT_SOURCE = `(() => {
  const W = 600, H = 800;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#eef1f5'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#1f2937';
  x.beginPath(); x.ellipse(W / 2, H * 1.02, W * 0.45, H * 0.30, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#e8b58f'; x.fillRect(W / 2 - 40, H * 0.55, 80, 110);
  x.fillStyle = '#f2c69f';
  x.beginPath(); x.ellipse(W / 2, H * 0.40, W * 0.18, H * 0.17, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#3b2a20';
  x.beginPath(); x.ellipse(W / 2, H * 0.32, W * 0.19, H * 0.11, 0, 0, Math.PI * 2); x.fill();
  return c;
})()`;

/**
 * A landscape scene — a car with a number plate.
 *
 * The orientation matters. A portrait source is height-constrained in the
 * preview, so the canvas never hits the width cap and the padding mistake that
 * CSS-downscaled the canvas never shows. A landscape photo — which is what a
 * plate or a street scene actually is — is width-constrained, and that is where
 * the drawn region drifted away from the finger.
 */
const SCENE_SOURCE = `(() => {
  const W = 1000, H = 700;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#9ec5ff'); g.addColorStop(1, '#d9d2c0');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = '#2b3a55'; x.fillRect(120, 380, 520, 180);
  x.fillStyle = '#ffffff'; x.fillRect(260, 480, 240, 70);
  x.fillStyle = '#000000';
  x.font = 'bold 46px monospace'; x.fillText('MH12AB', 268, 530);
  return c;
})()`;

/** A photo with no plain border: the cutout and background checks must refuse it. */
const CLUTTERED_SOURCE = `(() => {
  const W = 700, H = 600;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 400; i++) {
    x.fillStyle = 'hsl(' + Math.round(rnd() * 360) + ',70%,' + Math.round(15 + rnd() * 70) + '%)';
    x.fillRect(rnd() * W, rnd() * H, 20 + rnd() * 70, 20 + rnd() * 60);
  }
  return c;
})()`;

async function settled(page: Page): Promise<void> {
  await expect(page.locator('.ion-page-invisible')).toHaveCount(0, { timeout: 15000 });
}

/** Feeds a canvas-built image through the dropzone's file input. */
async function loadGeneratedImage(page: Page, source: string): Promise<void> {
  await page.locator('input[type="file"]').first().waitFor({ state: 'attached', timeout: 15000 });
  await page.evaluate(async (src) => {
    const canvas: HTMLCanvasElement = eval(src);
    const blob: Blob = await new Promise(resolve =>
      canvas.toBlob(b => resolve(b as Blob), 'image/png', 0.92)
    );
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'generated.png', { type: 'image/png' }));
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, source);
  await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(600);
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
}

/**
 * Controls under the 44px floor. A control wrapped in its own label is tapped
 * through the label, so the effective target is measured rather than the
 * input's own box.
 */
async function smallTouchTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const sel =
      '.tool-page-container button, .tool-page-container a[href], ' +
      '.tool-page-container input:not([type=hidden]), .tool-page-container select, ' +
      '.tool-page-container [role=button]';
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
    return out;
  });
}

test.describe('I1-I4 photo tools — mobile layout', () => {
  for (const width of WIDTHS) {
    for (const target of PAGES) {
      test(`${target.id} ${target.name} lays out at ${width}px`, async ({ page }) => {
        await setupCapacitorMocks(page);
        await page.setViewportSize({ width, height: 760 });
        await page.goto(target.url);
        await settled(page);
        await loadGeneratedImage(page, target.source === 'scene' ? SCENE_SOURCE : PORTRAIT_SOURCE);

        expect(await horizontalOverflow(page), 'horizontal overflow').toBeLessThanOrEqual(1);
        expect(await smallTouchTargets(page), 'controls under 44px').toEqual([]);

        /*
         * The primary action has to be reachable without hunting for it. A
         * `position: fixed` bar inside the animated main content resolved
         * against that element instead of the viewport and sat below the fold.
         */
        const cta = page.locator('.mobile-sticky-bottom-bar button').first();
        await expect(cta).toBeVisible();
        const box = await cta.boundingBox();
        expect(box, 'CTA has a box').not.toBeNull();
        expect(box!.y, 'CTA top is on screen').toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height, 'CTA bottom is on screen').toBeLessThanOrEqual(761);

        /*
         * A canvas whose backing store is wider than its on-screen box is
         * CSS-downscaled, and every pointer coordinate derived from it is
         * wrong by that ratio.
         */
        const canvasScaling = await page.evaluate(() => {
          const c = document.querySelector('canvas') as HTMLCanvasElement;
          return { backing: c.width, css: c.getBoundingClientRect().width };
        });
        expect(
          Math.abs(canvasScaling.backing - canvasScaling.css),
          `canvas is CSS-scaled: ${JSON.stringify(canvasScaling)}`
        ).toBeLessThan(1.5);
      });
    }
  }
});

/**
 * These drive the canvas through real pointer events and read the result off
 * the visible canvas, rather than through Angular's dev-mode debug API —
 * `window.ng` does not exist in the production bundle this suite runs against,
 * and the on-screen pixels are what the user is actually judging anyway.
 */
async function canvasPointerDrag(
  page: Page,
  selector: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  imageWidth: number,
  imageHeight: number
): Promise<void> {
  await page.evaluate(
    ({ selector, from, to, imageWidth, imageHeight }) => {
      const canvas = document.querySelector(selector) as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const toClient = (sx: number, sy: number) => ({
        x: rect.left + sx * (rect.width / imageWidth),
        y: rect.top + sy * (rect.height / imageHeight)
      });
      const send = (type: string, p: { x: number; y: number }) =>
        canvas.dispatchEvent(new PointerEvent(type, {
          clientX: p.x, clientY: p.y, bubbles: true,
          pointerId: 1, pointerType: 'touch', isPrimary: true
        }));
      const a = toClient(from.x, from.y);
      const b = toClient(to.x, to.y);
      send('pointerdown', a);
      send('pointermove', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      send('pointermove', b);
      send('pointerup', b);
    },
    { selector, from, to, imageWidth, imageHeight }
  );
}

/** Reads one pixel of a canvas, addressed in source-image coordinates. */
async function samplePixel(
  page: Page,
  selector: string,
  sourceX: number,
  sourceY: number,
  imageWidth: number,
  imageHeight: number
): Promise<number[]> {
  return page.evaluate(
    ({ selector, sourceX, sourceY, imageWidth, imageHeight }) => {
      const canvas = document.querySelector(selector) as HTMLCanvasElement;
      const px = Math.round((sourceX / imageWidth) * canvas.width);
      const py = Math.round((sourceY / imageHeight) * canvas.height);
      const d = canvas.getContext('2d')!.getImageData(px, py, 1, 1).data;
      return [d[0], d[1], d[2]];
    },
    { selector, sourceX, sourceY, imageWidth, imageHeight }
  );
}

test.describe('I3 — blur regions land where they are drawn', () => {
  test('the marked region covers the pixels under the finger, and nothing else', async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.setViewportSize({ width: 375, height: 760 });
    await page.goto('/features/photo/blur');
    await settled(page);
    await loadGeneratedImage(page, SCENE_SOURCE);

    const SRC_W = 1000;
    const SRC_H = 700;

    // Drag across the number plate, the way someone hiding one would.
    await canvasPointerDrag(
      page, 'canvas.interactive-canvas',
      { x: 250, y: 465 }, { x: 515, y: 565 },
      SRC_W, SRC_H
    );
    await page.waitForTimeout(300);

    // One region, listed for the user to remove.
    await expect(page.locator('.region-chip')).toHaveCount(1);

    /*
     * The overlay tints a marked region red. Mapping pointer positions through
     * a stale scale factor used to shift the tint up and to the left of the
     * drag, which is the visible form of a blur that misses the face.
     */
    const inside = await samplePixel(page, 'canvas.interactive-canvas', 380, 515, SRC_W, SRC_H);
    const nearTopLeftCorner = await samplePixel(page, 'canvas.interactive-canvas', 258, 472, SRC_W, SRC_H);
    /*
     * The far corner is the discriminating sample. The old mapping both
     * shifted the region toward the origin and shrank it by the canvas' CSS
     * scale, so it still covered the centre and the near corner while leaving
     * a band along the bottom and right of the drag unmarked — exactly the
     * strip of a face or a number plate that the user had included.
     */
    const nearBottomRightCorner = await samplePixel(page, 'canvas.interactive-canvas', 508, 558, SRC_W, SRC_H);
    const outside = await samplePixel(page, 'canvas.interactive-canvas', 850, 150, SRC_W, SRC_H);

    const isTinted = (p: number[]) => p[0] > p[1] + 25 && p[0] > p[2] + 25;
    expect(isTinted(inside), `centre of the drag should be tinted, got ${inside}`).toBe(true);
    expect(isTinted(nearTopLeftCorner), `just inside the drag's near corner should be tinted, got ${nearTopLeftCorner}`).toBe(true);
    expect(isTinted(nearBottomRightCorner), `just inside the drag's far corner should be tinted, got ${nearBottomRightCorner}`).toBe(true);
    expect(isTinted(outside), `far outside the drag should be untouched, got ${outside}`).toBe(false);
  });

  test('a tap marks a region centred on the tap', async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.setViewportSize({ width: 375, height: 760 });
    await page.goto('/features/photo/blur');
    await settled(page);
    await loadGeneratedImage(page, SCENE_SOURCE);

    const SRC_W = 1000;
    const SRC_H = 700;

    // A tap, not a drag: same down and up point.
    await canvasPointerDrag(
      page, 'canvas.interactive-canvas',
      { x: 380, y: 515 }, { x: 380, y: 515 },
      SRC_W, SRC_H
    );
    await page.waitForTimeout(300);

    await expect(page.locator('.region-chip')).toHaveCount(1);

    const atTap = await samplePixel(page, 'canvas.interactive-canvas', 380, 515, SRC_W, SRC_H);
    const isTinted = (p: number[]) => p[0] > p[1] + 25 && p[0] > p[2] + 25;
    expect(isTinted(atTap), `the tap point should be marked, got ${atTap}`).toBe(true);
  });
});

test.describe('I1 — the manual guide can be positioned', () => {
  test('the guide follows a drag and a reset puts it back', async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.setViewportSize({ width: 375, height: 760 });
    await page.goto('/features/photo/id-photo');
    await settled(page);
    await loadGeneratedImage(page, PORTRAIT_SOURCE);

    const SRC_W = 600;
    const SRC_H = 800;
    const snapshot = () =>
      page.evaluate(() => (document.querySelector('canvas.guide-canvas') as HTMLCanvasElement).toDataURL());

    const initial = await snapshot();

    /*
     * `FaceDetector` is absent from the browsers this app runs in, so the guide
     * starts on a generic centred box. If it cannot be moved onto the actual
     * face, the crop is a lottery — this is the interaction that makes I1 work
     * at all on a phone.
     */
    await canvasPointerDrag(
      page, 'canvas.guide-canvas',
      { x: 300, y: 320 }, { x: 360, y: 400 },
      SRC_W, SRC_H
    );
    await page.waitForTimeout(300);
    const afterDrag = await snapshot();
    expect(afterDrag, 'dragging the guide must change what is drawn').not.toBe(initial);

    // Dragging the guide hands control to the manual path.
    await expect(page.locator('.guide-mode-tag')).toHaveText(/manual/i);

    await page.getByRole('button', { name: /reset guide/i }).click();
    await page.waitForTimeout(300);
    const afterReset = await snapshot();
    expect(afterReset, 'resetting must restore the starting guide').toBe(initial);
  });

  test('a corner handle resizes the guide', async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.setViewportSize({ width: 375, height: 760 });
    await page.goto('/features/photo/id-photo');
    await settled(page);
    await loadGeneratedImage(page, PORTRAIT_SOURCE);

    const SRC_W = 600;
    const SRC_H = 800;
    const snapshot = () =>
      page.evaluate(() => (document.querySelector('canvas.guide-canvas') as HTMLCanvasElement).toDataURL());

    const initial = await snapshot();

    // The default guide is centred horizontally at 40% width, starting 18%
    // down; its bottom-right handle is therefore at (420, 444).
    await canvasPointerDrag(
      page, 'canvas.guide-canvas',
      { x: 420, y: 444 }, { x: 470, y: 494 },
      SRC_W, SRC_H
    );
    await page.waitForTimeout(300);

    expect(await snapshot(), 'dragging a handle must resize the guide').not.toBe(initial);
  });
});

test.describe('I4 — an unsuitable image is refused, not quietly mangled', () => {
  test('export stays disabled on a cluttered photo until it is accepted', async ({ page }) => {
    await setupCapacitorMocks(page);
    await page.setViewportSize({ width: 375, height: 760 });
    await page.goto('/features/photo/cutout');
    await settled(page);
    await loadGeneratedImage(page, CLUTTERED_SOURCE);

    await expect(page.locator('.warning-banner')).toBeVisible();

    const cta = page.locator('.mobile-sticky-bottom-bar button').first();
    await expect(cta).toBeDisabled();

    await page.locator('.override-btn').click();
    await expect(cta).toBeEnabled();
  });
});
