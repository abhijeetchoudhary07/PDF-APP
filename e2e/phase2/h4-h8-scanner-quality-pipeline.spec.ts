import { test, expect, Page } from '@playwright/test';
import { setupCapacitorMocks, getTestDataPath } from '../fixtures/mocks';

/**
 * H4-H8 driven end to end, at phone width, through the real canvas.
 *
 * The unit suite covers these five features against the service's own headless
 * canvas shim, which is hand-written: it proves the arithmetic, not that the
 * feature works in a browser or that a user can reach it. Both of those failed
 * while every unit test was green --
 *
 *  - H7 measured the page's curvature at capture and threw the answer away, so
 *    the straighten toggle was only ever offered on a book-mode page. A curved
 *    page captured in document mode had no way to reach the feature at all.
 *  - the curvature measurement itself read the mean height of the ink in each
 *    column. Lines of text end at different places, so that number swung by
 *    more than any real curve: it reported a flat page as curved and missed a
 *    curved one, while passing a unit fixture made of full-width bars.
 *  - H8's OCR branch was unreachable: nothing ever passed text to
 *    `suggestDocumentTitle`, so the "name it from the heading" half of the
 *    feature was dead code behind a timestamp.
 *
 * So these tests import real images, read what the pipeline produced back off
 * the page, and measure it. The fixtures are generated pages on a desk surface
 * -- a sharp one, a blurred copy, one lit by a gradient, one with a thumb over
 * the margin, one with curved baselines and one with a plain heading.
 */

const PHONE = { width: 375, height: 812 };
const SCANNER = '/features/document-scanner';

/** Measured off the page's own thumbnail, which is what the user will export. */
interface PageStats {
  width: number;
  height: number;
  /** Spread of the paper brightness across the page: high means uneven light. */
  backgroundStdDev: number;
  /** Sampled pixels that fall inside the skin-tone box H6 detects on. */
  skinPixels: number;
}

async function dismissOnboarding(page: Page): Promise<void> {
  const skip = page.getByRole('button', { name: /^skip$/i }).first();
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) {
    await skip.click();
    await expect(skip).toBeHidden({ timeout: 5000 });
  }
}

async function openScanner(page: Page): Promise<void> {
  await page.goto(SCANNER);
  await page.waitForLoadState('domcontentloaded');
  await dismissOnboarding(page);
  await expect(page.locator('.mode-pill').first()).toBeVisible({ timeout: 30000 });
}

/**
 * Imports one fixture and returns on the pages dashboard.
 *
 * `FileService` builds its file input in JavaScript and throws it away, so
 * answering the chooser is the only way in. Everything after the chooser is
 * conditional: the blur gate opens only for a blurred capture, so the caller
 * says which it expects and the helper asserts it either way. Every fixture
 * here photographs a page against a contrasting surface, so edge detection is
 * confident and the import lands on the dashboard without a crop detour -- if
 * that ever stops being true the dashboard assertion fails, which is the
 * answer a test should give rather than quietly clicking through.
 */
async function importFixture(
  page: Page,
  fixture: string,
  blurGate: 'none' | 'keep' | 'leave' = 'none'
): Promise<void> {
  const entry = page
    .locator('app-button[data-testid="import-gallery"] button, app-button[data-testid="add-page-gallery"] button')
    .first();
  await expect(entry).toBeVisible({ timeout: 20000 });

  const chooser = page.waitForEvent('filechooser');
  await entry.click();
  await (await chooser).setFiles(getTestDataPath(`scanner/${fixture}`));

  // A capture runs edge detection, a warp, enhancement, the blur score, the
  // finger probe and the curvature probe before anything is on screen.
  await expect(page.locator('.processing-overlay')).toHaveCount(0, { timeout: 90000 });

  const keep = page.locator('app-button[data-testid="blur-keep"] button');
  if (blurGate === 'none') {
    await expect(keep, `${fixture} should pass the blur gate`).toBeHidden();
  } else if (blurGate === 'keep') {
    await expect(keep, `${fixture} should be stopped by the blur gate`).toBeVisible({ timeout: 20000 });
    await keep.click();
    await expect(keep).toBeHidden({ timeout: 10000 });
  }

  if (blurGate !== 'leave') {
    await expect(page.locator('.pages-dashboard-card')).toBeVisible({ timeout: 30000 });
  }
}

function card(page: Page, index = 0) {
  return page.locator('.page-card').nth(index);
}

function chip(page: Page, index: number, glyph: string) {
  return card(page, index).locator('.feature-chip', { hasText: glyph }).first();
}

/** Reads the processed thumbnail back out of the DOM and measures it. */
async function pageStats(page: Page, index = 0): Promise<PageStats> {
  return page.evaluate(async (i: number) => {
    const img = document.querySelectorAll<HTMLImageElement>('.page-card .page-thumb')[i];
    if (!img) throw new Error(`no page thumbnail at index ${i}`);
    if (!img.complete) await img.decode();

    const canvas = document.createElement('canvas');
    const w = (canvas.width = img.naturalWidth);
    const h = (canvas.height = img.naturalHeight);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, w, h).data;

    // Paper brightness per cell of an 8x8 grid, taken as the 90th percentile so
    // the text in a cell does not drag its reading down.
    const cellW = Math.floor(w / 8);
    const cellH = Math.floor(h / 8);
    const paper: number[] = [];
    for (let gy = 0; gy < 8; gy++) {
      for (let gx = 0; gx < 8; gx++) {
        const lums: number[] = [];
        for (let y = gy * cellH; y < (gy + 1) * cellH; y += 3) {
          for (let x = gx * cellW; x < (gx + 1) * cellW; x += 3) {
            const o = (y * w + x) * 4;
            lums.push(0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2]);
          }
        }
        lums.sort((a, b) => a - b);
        paper.push(lums[Math.floor(lums.length * 0.9)]);
      }
    }
    const mean = paper.reduce((a, b) => a + b, 0) / paper.length;
    const sd = Math.sqrt(paper.reduce((a, b) => a + (b - mean) ** 2, 0) / paper.length);

    let skin = 0;
    for (let o = 0; o < d.length; o += 4 * 7) {
      const r = d[o];
      const g = d[o + 1];
      const b = d[o + 2];
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      if (r > 80 && r > g && g > b && r - g >= 15 && cr >= 133 && cr <= 173 && cb >= 77 && cb <= 127 && y > 60) {
        skin++;
      }
    }

    return { width: w, height: h, backgroundStdDev: +sd.toFixed(2), skinPixels: skin };
  }, index);
}

/** Every visible control under the 44px floor, with enough detail to fix it. */
async function smallTouchTargets(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(() => {
    const EPS = 0.5;
    const out: Array<Record<string, unknown>> = [];
    document
      .querySelectorAll<HTMLElement>(
        'main button, main a[href], main input:not([type="range"]), main select, main .feature-chip, main .chip-toggle-btn'
      )
      .forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return;
        // A toast animates in from scale(0.96); it is chrome, not this page.
        if (el.closest('.toast, app-toast-container')) return;
        if (r.height < 44 - EPS) {
          out.push({
            cls: el.className?.toString().slice(0, 40) || el.tagName,
            text: (el.textContent || '').trim().slice(0, 30),
            w: Math.round(r.width),
            h: Math.round(r.height)
          });
        }
      });
    return out;
  });
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe('H4-H8 scan quality pipeline at 375px', () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });
  test.slow();

  test.beforeEach(async ({ page }) => {
    await setupCapacitorMocks(page);
  });

  test('H4: a sharp page passes the gate, a blurred one is stopped and can be kept', async ({ page }) => {
    await openScanner(page);

    await importFixture(page, 'sharp-text-document.png');
    await expect(
      page.locator('app-button[data-testid="blur-keep"] button'),
      'a sharp capture must not be gated'
    ).toBeHidden();

    const sharpPill = card(page, 0).locator('.sharpness-pill');
    await expect(sharpPill).toHaveClass(/sharp/);
    await expect(sharpPill).not.toHaveClass(/blurry/);

    // The gate opens for the blurred copy of the same page, and keeping it
    // leaves the page in place rather than discarding it.
    await importFixture(page, 'blurred-text-document.png', 'leave');
    const keep = page.locator('app-button[data-testid="blur-keep"] button');
    await expect(keep, 'a blurred capture must be gated').toBeVisible({ timeout: 20000 });
    await expect(page.locator('app-button[data-testid="blur-retake"] button')).toBeVisible();
    await keep.click();
    await expect(keep).toBeHidden({ timeout: 10000 });

    await expect(page.locator('.page-card')).toHaveCount(2);
    await expect(card(page, 1).locator('.sharpness-pill')).toHaveClass(/blurry/);

    // The score the user sees is a percentage, not the raw Laplacian variance,
    // and the blurred page has to read lower than the sharp one.
    const scores = await page.locator('.page-card').evaluateAll(els =>
      els.map(el => Number(el.getAttribute('data-blur-percent')))
    );
    expect(scores[0]).toBeGreaterThan(scores[1]);
    expect(scores.every(s => s >= 0 && s <= 100)).toBe(true);

    // Only the weak page offers a retake.
    await expect(card(page, 0).locator('.retake-chip')).toHaveCount(0);
    await expect(card(page, 1).locator('.retake-chip')).toHaveCount(1);

    // Retaking drops the weak page and reopens the picker, rather than leaving
    // a second copy of the same bad capture behind.
    const reopened = page.waitForEvent('filechooser');
    await card(page, 1).locator('.retake-chip').click();
    await (await reopened).setFiles(getTestDataPath('scanner/sharp-text-document.png'));
    await expect(page.locator('.processing-overlay')).toHaveCount(0, { timeout: 90000 });
    await expect(page.locator('.page-card')).toHaveCount(2);
    await expect(page.locator('.page-card .sharpness-pill.blurry')).toHaveCount(0);
  });

  test('H5: shadow removal flattens uneven lighting and is reversible', async ({ page }) => {
    await openScanner(page);
    await importFixture(page, 'shadow-gradient-document.png');

    const before = await pageStats(page, 0);
    expect(before.backgroundStdDev, 'fixture should arrive unevenly lit').toBeGreaterThan(10);

    const shadowChip = chip(page, 0, '☀️');
    await expect(shadowChip).toBeVisible();
    await shadowChip.click();
    await expect(shadowChip).toHaveClass(/active/, { timeout: 30000 });
    await page.waitForTimeout(500);

    const after = await pageStats(page, 0);
    expect(after.backgroundStdDev, 'lighting gradient should be flattened').toBeLessThan(6);
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);

    // Off again restores the uneven original: this is a toggle, not a one-way door.
    await shadowChip.click();
    await expect(shadowChip).not.toHaveClass(/active/, { timeout: 30000 });
    await page.waitForTimeout(500);
    const reverted = await pageStats(page, 0);
    expect(reverted.backgroundStdDev).toBeGreaterThan(after.backgroundStdDev);
  });

  test('H6: a thumb over the margin is detected and removed, a clean page is left alone', async ({ page }) => {
    await openScanner(page);
    await importFixture(page, 'finger-document.png');

    await expect(card(page, 0)).toHaveAttribute('data-finger-detected', 'true');
    const fingerChip = chip(page, 0, '👆');
    await expect(fingerChip, 'the fix has to be offered where the thumb is').toBeVisible();

    const before = await pageStats(page, 0);
    expect(before.skinPixels).toBeGreaterThan(100);

    await fingerChip.click();
    await expect(fingerChip).toHaveClass(/active/, { timeout: 30000 });
    await page.waitForTimeout(500);

    const after = await pageStats(page, 0);
    expect(after.skinPixels, 'the thumb should be painted out').toBeLessThan(before.skinPixels * 0.1);

    // Declining has to put the thumb back: an inpaint the user does not like
    // must not be the only version of their page that still exists.
    await fingerChip.click();
    await expect(fingerChip).not.toHaveClass(/active/, { timeout: 30000 });
    await page.waitForTimeout(500);
    const declined = await pageStats(page, 0);
    expect(declined.skinPixels).toBeGreaterThan(after.skinPixels);

    // A clean page must neither claim a detection nor offer the fix: a bad
    // inpaint is worse than a visible thumb, so it is never the default.
    await importFixture(page, 'sharp-text-document.png');
    await expect(card(page, 1)).toHaveAttribute('data-finger-detected', 'false');
    await expect(card(page, 1).locator('.feature-chip', { hasText: '👆' })).toHaveCount(0);
  });

  test('H7: a curved page offers straightening and a flat one does not', async ({ page }) => {
    await openScanner(page);

    // Captured in document mode, not book mode: curvature has to be measured
    // from the page itself, or the feature is unreachable for anyone who does
    // not know to switch modes first.
    await importFixture(page, 'curved-book-document.png');
    const curved = Number(await card(page, 0).getAttribute('data-curvature'));
    expect(curved, 'baseline curve should be measured on the page').toBeGreaterThan(2.5);

    const dewarpChip = chip(page, 0, '📖');
    await expect(dewarpChip).toBeVisible();
    await dewarpChip.click();
    await expect(dewarpChip).toHaveClass(/active/, { timeout: 30000 });
    await page.waitForTimeout(500);

    await importFixture(page, 'sharp-text-document.png');
    const flat = Number(await card(page, 1).getAttribute('data-curvature'));
    expect(flat, 'a flat page must not be called curved').toBeLessThan(2.5);
    await expect(
      card(page, 1).locator('.feature-chip', { hasText: '📖' }),
      'straightening must not be offered on a flat page'
    ).toHaveCount(0);
  });

  test('H8: the name is a proposal the user can type over, and it reaches the PDF', async ({ page }) => {
    await openScanner(page);
    await importFixture(page, 'sharp-text-document.png');

    const nameInput = page.locator('#doc-filename-input');
    await expect(nameInput).toBeVisible();
    const proposed = await nameInput.inputValue();
    expect(proposed, 'a name should be proposed without being asked for').not.toBe('');
    expect(proposed).not.toMatch(/[\\/:*?"<>|]/);

    // Typing is left alone while the field has focus. Sanitizing every
    // keystroke ate the space in "My Tax Receipt" the moment it was typed.
    await nameInput.fill('');
    await nameInput.type('My Tax Receipt', { delay: 25 });
    expect(await nameInput.inputValue()).toBe('My Tax Receipt');

    await nameInput.blur();
    await expect(nameInput).toHaveValue('My_Tax_Receipt');

    await page.locator('app-button[data-testid="generate-pdf"] button').click();
    await expect(page.locator('.pdf-ready-card')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('.pdf-ready-card .subtitle')).toContainText('My_Tax_Receipt.pdf');
  });

  test('H8 @network: the heading on page 1 can be read into the name field', async ({ page }) => {
    // Reads the top strip with Tesseract, whose language data is fetched once
    // and then cached by the browser. Needs the network on a cold profile,
    // which is why it is the only test here that does.
    test.setTimeout(240000);

    await openScanner(page);
    await importFixture(page, 'titled-document.png');

    const nameInput = page.locator('#doc-filename-input');
    await nameInput.fill('');
    await nameInput.blur();

    const suggest = page.locator('button[data-testid="suggest-name"]');
    await expect(suggest).toBeVisible();
    await suggest.click();
    await expect(suggest).toBeDisabled();
    await expect(suggest).toBeEnabled({ timeout: 180000 });

    // The fixture's heading is "Electricity Bill"; OCR may differ in case or
    // drop a letter, so assert on the shape of what came back rather than an
    // exact string.
    const proposal = await nameInput.inputValue();
    expect(proposal, 'the heading should have reached the field').toMatch(/electricity/i);
    expect(proposal, 'the proposal must be filesystem-safe').not.toMatch(/[\\/:*?"<>|\s]/);
  });

  test('the scanner stays usable at 375px once it holds pages', async ({ page }) => {
    await openScanner(page);
    await importFixture(page, 'finger-document.png');

    // The dashboard: page cards, per-page chips and the six-button action row.
    expect(await horizontalOverflow(page), 'pages dashboard overflows at 375px').toBeLessThanOrEqual(0);
    expect(
      await smallTouchTargets(page),
      'pages dashboard has controls under the 44px floor'
    ).toEqual([]);

    // The enhance editor, which the audit of the empty page can never reach.
    await card(page, 0).locator('button[data-testid="page-enhance"]').click();
    await expect(page.locator('.enhance-card')).toBeVisible({ timeout: 30000 });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    expect(await horizontalOverflow(page), 'enhance editor overflows at 375px').toBeLessThanOrEqual(0);
    expect(await smallTouchTargets(page), 'enhance editor has controls under the 44px floor').toEqual([]);

    // The crop editor, including the canvas the corners are dragged on.
    await page.locator('app-button[data-testid="done-enhancing"] button').click();
    await expect(page.locator('.pages-dashboard-card')).toBeVisible({ timeout: 30000 });
    await card(page, 0).locator('button[data-testid="page-crop"]').click();
    await expect(page.locator('.crop-card canvas.interactive-crop-canvas')).toBeVisible({ timeout: 30000 });
    expect(await horizontalOverflow(page), 'crop editor overflows at 375px').toBeLessThanOrEqual(0);
    expect(await smallTouchTargets(page), 'crop editor has controls under the 44px floor').toEqual([]);

    const canvasFits = await page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('canvas.interactive-crop-canvas')!;
      const r = c.getBoundingClientRect();
      return { right: r.right, bottom: r.bottom, docW: document.documentElement.clientWidth, vh: window.innerHeight };
    });
    expect(canvasFits.right, 'crop canvas runs off the side of the phone').toBeLessThanOrEqual(canvasFits.docW + 1);
    expect(canvasFits.bottom - canvasFits.vh, 'crop canvas is taller than the viewport').toBeLessThan(canvasFits.vh);
  });
});
