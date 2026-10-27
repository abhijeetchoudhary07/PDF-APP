/**
 * Part L second pass — the reader gaps the first implementation left.
 *
 * Separate from reader-l1-l6-mobile.spec.ts, which covers the features as
 * they originally shipped. These cover what was missing or broken: the
 * two-page and continuous modes that were dead toggles, the images the
 * reflow view dropped, the third outline level the old template could not
 * render, the scrub preview, the lazy thumbnail strip, the highlight that
 * lit a whole line for a one-word hit, and a phone toolbar that fits 360px
 * with every icon actually painted.
 *
 * Runs at 360x780 — narrower than the Pixel 5 profile the other specs use,
 * because 360px is where a toolbar either fits or does not.
 *
 * The fixture is generated: node tools/make-reader-fixtures.mjs
 */
import { test, expect } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';
import * as path from 'path';

const FIXTURE = path.resolve(__dirname, '../test-data/reader/reader-outline-columns-images.pdf');

test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

async function noOverflow(page: any, label: string) {
  const r = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth
  }));
  expect(r.doc, `horizontal overflow at ${label}: ${r.doc} > ${r.win}`).toBeLessThanOrEqual(r.win);
}

async function open(page: any) {
  await setupCapacitorMocks(page);
  await page.goto('/features/pdf-editor');
  await page.waitForLoadState('networkidle');
  const btn = page.getByRole('button', { name: /select pdf file/i });
  const fc = page.waitForEvent('filechooser');
  await btn.click();
  (await fc).setFiles(FIXTURE);
  await expect(page.locator('app-pdf-reader .reader-container')).toBeVisible({ timeout: 30000 });
  return page.locator('app-pdf-reader .reader-container');
}

test('toolbar fits 360px with every icon painted and every target 44px', async ({ page }) => {
  const reader = await open(page);
  await noOverflow(page, 'load');

  // The toolbar row must not be scrollable: everything fits.
  const bar = reader.locator('.reader-toolbar');
  const m = await bar.evaluate((el: HTMLElement) => ({
    scroll: el.scrollWidth, client: el.clientWidth
  }));
  expect(m.scroll, 'toolbar overflows its row').toBeLessThanOrEqual(m.client + 1);

  const btns = bar.locator('.tool-btn');
  const n = await btns.count();
  let visible = 0;
  for (let i = 0; i < n; i++) {
    const b = btns.nth(i);
    if (!(await b.isVisible())) continue;
    visible++;
    const box = await b.boundingBox();
    expect(box!.height, `button ${i} height`).toBeGreaterThanOrEqual(44);
    expect(box!.width, `button ${i} width`).toBeGreaterThanOrEqual(44);
    // Every icon must actually draw: an unregistered name renders an empty svg.
    const paths = await b.locator('app-icon svg').evaluate(
      (svg: SVGElement) => svg.innerHTML.trim().length
    );
    expect(paths, `button ${i} icon is blank`).toBeGreaterThan(0);
  }
  expect(visible, 'visible toolbar buttons').toBeGreaterThanOrEqual(4);

  // The zoom cluster is in the sheet on a phone; confirm it is reachable.
  await reader.locator('.view-sheet-btn').click();
  const sheet = reader.locator('.reading-modes-menu');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.mode-chip').filter({ hasText: /two/i })).toBeVisible();

  // Appearance controls are adjusted in a run, so they keep the sheet open.
  await sheet.locator('.mode-chip').filter({ hasText: /night/i }).click();
  await expect(reader).toHaveClass(/theme-night/);
  await expect(sheet, 'a theme change must not close the sheet').toBeVisible();
  await sheet.locator('.mode-chip').filter({ hasText: /normal/i }).click();

  // Fit Width must actually change the zoom -- it used to do nothing.
  const zoomBefore = await sheet.locator('.stepper .step-val').first().innerText();
  await sheet.locator('.mode-chip').filter({ hasText: /fit width/i }).click();
  await page.waitForTimeout(600);
  const zoomAfter = await sheet.locator('.stepper .step-val').first().innerText();
  expect(zoomAfter, 'Fit Width must change the zoom').not.toBe(zoomBefore);
  expect(parseInt(zoomAfter), 'fitted zoom should shrink a 595pt page to 360px')
    .toBeLessThan(100);

  await noOverflow(page, 'sheet open');
});

test('L2 two-page spread and continuous scroll actually render pages', async ({ page }) => {
  const reader = await open(page);
  await reader.locator('.view-sheet-btn').click();
  const sheet = reader.locator('.reading-modes-menu');

  // Two-page spread. The sheet closes on a phone so the result is visible.
  await sheet.locator('.mode-chip').filter({ hasText: /two/i }).click();
  await expect(sheet, 'a layout change must reveal the page').not.toBeVisible();
  await expect(reader).toHaveClass(/spread-two-page/);
  const surface = reader.locator('.reader-surface');
  await expect(surface).toBeVisible({ timeout: 15000 });
  await expect(surface.locator('.surface-page')).toHaveCount(2, { timeout: 15000 });

  // Both canvases must have real pixels, not be empty elements.
  const sizes = await surface.locator('.surface-canvas').evaluateAll(
    (els: HTMLCanvasElement[]) => els.map(c => ({ w: c.width, h: c.height }))
  );
  expect(sizes.length).toBe(2);
  for (const s of sizes) {
    expect(s.w, 'spread canvas width').toBeGreaterThan(10);
    expect(s.h, 'spread canvas height').toBeGreaterThan(10);
  }
  await noOverflow(page, 'spread');

  // Continuous scroll
  await reader.locator('.view-sheet-btn').click();
  await expect(sheet).toBeVisible();
  await sheet.locator('.mode-chip').filter({ hasText: /continuous/i }).click();
  await expect(reader).toHaveClass(/scroll-continuous/);
  await page.waitForTimeout(1500);
  const count = await surface.locator('.surface-page').count();
  expect(count, 'continuous mounts a window of pages').toBeGreaterThan(0);
  // 24 pages must NOT all be mounted at once.
  expect(count, 'continuous must virtualise').toBeLessThan(24);
  await noOverflow(page, 'continuous');

  // Back to single + paged restores the editor canvas.
  await reader.locator('.view-sheet-btn').click();
  await sheet.locator('.mode-chip').filter({ hasText: /single/i }).click();
  await reader.locator('.view-sheet-btn').click();
  await sheet.locator('.mode-chip').filter({ hasText: /paged/i }).click();
  await expect(reader.locator('app-pdf-canvas')).toBeVisible({ timeout: 15000 });
});

test('L3 reflow places the page images inline', async ({ page }) => {
  const reader = await open(page);
  await reader.locator('button[title*="Reflow" i]').first().click();

  const reflow = reader.locator('.reflow-container');
  await expect(reflow).toBeVisible({ timeout: 20000 });
  await expect(reflow.locator('.reflow-paragraph').first()).toBeVisible({ timeout: 20000 });

  // The figure the fixture draws on every page must appear in the column.
  const figs = reflow.locator('.reflow-figure img');
  await expect(figs.first()).toBeVisible({ timeout: 20000 });
  expect(await figs.count(), 'reflow figures').toBeGreaterThan(0);

  // Reading order: the left column's text precedes the right column's.
  const text = await reflow.locator('.reflow-content').innerText();
  expect(text.indexOf('Nothing in this column')).toBeLessThan(
    text.indexOf('Where a figure could not be verified')
  );
  // The view must say plainly that it is not the real layout.
  expect(text.toLowerCase()).toContain('not the page');
  await noOverflow(page, 'reflow');

  // One tap back to the true rendering.
  await reflow.locator('.return-btn').first().click();
  await expect(reflow).not.toBeVisible();
  await expect(reader.locator('app-pdf-canvas')).toBeVisible();
});

test('L4 outline renders three levels deep and jumps', async ({ page }) => {
  const reader = await open(page);
  await reader.locator('button[title*="thumbnail" i]').first().click();
  const drawer = reader.locator('.sidebar-drawer');
  await expect(drawer).toBeVisible();

  await drawer.locator('.tab-btn').filter({ hasText: /bookmark/i }).click();
  const rows = drawer.locator('.node-label');
  await expect(rows.first()).toBeVisible({ timeout: 15000 });

  /*
   * The reader pre-expands the first level on open -- a collapsed outline
   * reads as an empty one -- so 4 chapters and their 8 sections are showing,
   * with the sub-sections still closed.
   */
  expect(await rows.count(), 'chapters plus their sections').toBe(12);
  await expect(drawer.locator('.node-label').filter({ hasText: 'Section 1.1' })).toBeVisible();
  await expect(
    drawer.locator('.node-label').filter({ hasText: 'Sub-section 1.1.1' })
  ).toHaveCount(0);

  // Open a section: the third level must appear.
  await drawer.locator('.node-label').filter({ hasText: 'Section 1.1' })
    .locator('.expand-btn').click();
  const sub = drawer.locator('.node-label').filter({ hasText: 'Sub-section 1.1.1' });
  await expect(sub, 'third outline level must render').toBeVisible();

  // Indentation increases with depth.
  const pads = await drawer.locator('.node-label').evaluateAll(
    (els: HTMLElement[]) => els.slice(0, 3).map(e => parseInt(getComputedStyle(e).paddingLeft))
  );
  expect(pads[0]).toBeLessThan(pads[1]);
  expect(pads[1]).toBeLessThan(pads[2]);

  // Jumping goes to the right page and closes the drawer on a phone.
  await sub.click();
  await expect(drawer).not.toBeVisible();
  const pageNo = await reader.locator('.page-input-wrapper input').inputValue();
  expect(Number(pageNo)).toBe(2);
  await noOverflow(page, 'outline jump');
});

test('L6 scrubbing shows a thumbnail preview and virtualises the strip', async ({ page }) => {
  const reader = await open(page);
  const range = reader.locator('.scrubber-range');
  await expect(range).toBeVisible();
  const box = (await range.boundingBox())!;
  expect(box.height, 'scrubber target').toBeGreaterThanOrEqual(44);

  /*
   * The event sequence a real drag produces: `input` while the thumb moves,
   * `change` when it is released. Dispatched rather than mouse-dragged
   * because Chromium's touch emulation does not drag a range input with
   * synthetic mouse events, so a mouse drag here proves nothing.
   */
  await range.evaluate((el: HTMLInputElement) => {
    el.value = '13';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const card = reader.locator('.scrub-preview-card');
  await expect(card, 'a preview card must appear while dragging').toBeVisible();
  await expect(card, 'the card must name the page under the thumb').toContainText('13');
  await expect(card.locator('img'), 'the preview must be a page image').toBeVisible({ timeout: 15000 });
  // A rendered page, not an empty element.
  const natural = await card.locator('img').evaluate(
    (img: HTMLImageElement) => ({ w: img.naturalWidth, h: img.naturalHeight })
  );
  expect(natural.w, 'preview image width').toBeGreaterThan(10);
  expect(natural.h, 'preview image height').toBeGreaterThan(10);

  await range.evaluate((el: HTMLInputElement) => {
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(card).not.toBeVisible();
  // Releasing commits the page.
  expect(await reader.locator('.page-input-wrapper input').inputValue()).toBe('13');

  // The sidebar strip mounts only what is on screen.
  await reader.locator('button[title*="thumbnail" i]').first().click();
  const list = reader.locator('.thumbnails-list');
  await expect(list).toBeVisible();
  await expect(list.locator('.thumbnail-item').first()).toBeVisible({ timeout: 15000 });
  const mounted = await list.locator('.thumbnail-item').count();
  expect(mounted, 'mounts some rows').toBeGreaterThan(0);
  expect(mounted, '24 pages must not all mount').toBeLessThan(24);

  // Scrolling mounts the rows that come into view and keeps the height honest.
  const before = await list.locator('.thumbnail-item').first().innerText();
  await list.evaluate((el: HTMLElement) => { el.scrollTop = 1200; });
  await page.waitForTimeout(900);
  const after = await list.locator('.thumbnail-item').first().innerText();
  expect(after, 'the window must follow the scroll').not.toBe(before);
  await expect(list.locator('.thumbnail-item img').first()).toBeVisible({ timeout: 15000 });
  await noOverflow(page, 'thumb strip');
});

test('L1 highlights sit on the matched word only', async ({ page }) => {
  const reader = await open(page);
  await reader.locator('button[title*="search" i]').first().click();
  const overlay = reader.locator('.search-overlay');
  await overlay.locator('input[type="text"]').fill('application');
  await overlay.locator('input[type="text"]').press('Enter');

  await expect(overlay.locator('.snippet-item').first()).toBeVisible({ timeout: 25000 });
  await expect(overlay.locator('.search-meta')).toBeVisible();

  const boxes = reader.locator('.search-highlight-box');
  await expect(boxes.first()).toBeVisible({ timeout: 20000 });

  // A highlight for an 11-character word must be far narrower than the
  // text line it sits in -- the bug was lighting up the whole item.
  const widths = await boxes.evaluateAll(
    (els: HTMLElement[]) => els.map(e => e.getBoundingClientRect().width)
  );
  expect(widths.length).toBeGreaterThan(0);
  for (const w of widths) {
    expect(w, 'highlight width').toBeGreaterThan(2);
    expect(w, 'highlight must not span the whole line').toBeLessThan(140);
  }
  await noOverflow(page, 'search');
});
