/**
 * Part J (J6-J10) end-to-end verification on a phone viewport.
 *
 * Like the J1-J5 suite, this checks the bytes that come out rather than that a
 * success card appeared: the compression a TIFF claims against the size it
 * actually is, an SVG's groups and transforms landing in the right place, the
 * vector paths a PDF-to-SVG page should contain, and the JSON schema's own
 * promises. It also runs in the browser's real canvas, which is the one thing
 * the unit tests cannot do — the rasterizing fallback only exists there.
 */
import { test, expect, Page, Download } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';
import { PDFDocument } from 'pdf-lib';
import * as path from 'path';
import * as fs from 'fs';

const PDF_FIXTURE = path.resolve(__dirname, '../test-data/pdf/structured-doc.pdf');
const CONV_DIR = path.resolve(__dirname, '../test-data/conversion');
const PHOTO = path.resolve(__dirname, '../test-data/photos/valid-photo.jpg');

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    offenders: [...document.querySelectorAll('body *')]
      .filter(el => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        let p: HTMLElement | null = el.parentElement;
        while (p) {
          const ov = getComputedStyle(p).overflowX;
          if (ov === 'auto' || ov === 'scroll') return false;
          p = p.parentElement;
        }
        return r.right > window.innerWidth + 1;
      })
      .slice(0, 5)
      .map(el => `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`)
  }));

  expect(
    overflow.scrollWidth,
    `page scrolls horizontally; widest offenders: ${overflow.offenders.join(', ')}`
  ).toBeLessThanOrEqual(overflow.innerWidth);
}

async function expectTouchTargets(page: Page) {
  const small = await page.evaluate(() => {
    const selectors = [
      'select.field-select',
      '.checkbox-row',
      'button.btn-text',
      '.remove-btn',
      '.page-chip',
      'app-button button',
      '.fidelity-report-header'
    ];
    const bad: string[] = [];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        // Half a pixel of tolerance for sub-pixel rounding.
        if (r.height < 43.5) bad.push(`${sel} -> ${r.height.toFixed(2)}px`);
      });
    }
    return bad;
  });

  expect(small, `controls under the 44px touch target: ${small.join(', ')}`).toEqual([]);
}

async function openConverter(page: Page, converterId: string) {
  await page.goto(`/features/pdf/conversion/${converterId}`);
  await expect(page.locator('app-page-header')).toBeVisible();
}

async function upload(page: Page, filePath: string) {
  await page.locator('input[type="file"]').setInputFiles(filePath);
  await expect(page.locator('.selected-file-card')).toBeVisible();
}

async function selectOption(page: Page, fieldLabel: RegExp, value: string) {
  const field = page.locator('.field-group', { has: page.locator('.field-label', { hasText: fieldLabel }) });
  await field.locator('select').selectOption(value);
}

/**
 * The DPI select binds numbers with [ngValue], so its option values are
 * Angular's own ids rather than "150"; a person picks it by its label and so
 * does this.
 */
async function selectDpi(page: Page, label: string) {
  const field = page.locator('.field-group', { has: page.locator('.field-label', { hasText: /resolution/i }) });
  await field.locator('select').selectOption({ label });
}

async function convert(page: Page) {
  await page.getByRole('button', { name: /start conversion/i }).click();
  await expect(page.locator('.result-card')).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('Conversion Successful!')).toBeVisible();
}

async function saveAndRead(page: Page): Promise<{ name: string; buffer: Buffer }> {
  const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
  await page.getByRole('button', { name: /^save /i }).click();
  const download: Download = await downloadPromise;
  const tmp = await download.path();
  expect(tmp, 'the browser produced no file for the Save button').toBeTruthy();
  return { name: download.suggestedFilename(), buffer: fs.readFileSync(tmp as string) };
}

/** Enough of a TIFF reader to check what the file says about itself. */
function readTiffDirectories(buffer: Buffer): {
  width: number;
  height: number;
  compression: number;
  xResolution: number;
  bitsPerSample: number;
}[] {
  const littleEndian = buffer.toString('latin1', 0, 2) === 'II';
  const u16 = (at: number) => (littleEndian ? buffer.readUInt16LE(at) : buffer.readUInt16BE(at));
  const u32 = (at: number) => (littleEndian ? buffer.readUInt32LE(at) : buffer.readUInt32BE(at));

  expect(u16(2), 'TIFF magic').toBe(42);

  const pages: { width: number; height: number; compression: number; xResolution: number; bitsPerSample: number }[] = [];
  let ifd = u32(4);

  while (ifd > 0 && ifd + 2 <= buffer.length) {
    const count = u16(ifd);
    const page = { width: 0, height: 0, compression: 1, xResolution: 0, bitsPerSample: 0 };

    for (let e = 0; e < count; e++) {
      const at = ifd + 2 + e * 12;
      const tag = u16(at);
      const type = u16(at + 2);
      const valueCount = u32(at + 4);
      const value = type === 3 ? u16(at + 8) : u32(at + 8);
      if (tag === 256) page.width = value;
      else if (tag === 257) page.height = value;
      else if (tag === 258 && type === 3) {
        // Four SHORTs do not fit in the 4-byte value field, so an RGBA page
        // stores BitsPerSample out of line and the field holds its offset.
        page.bitsPerSample = valueCount > 2 ? u16(u32(at + 8)) : value;
      }
      else if (tag === 259) page.compression = value;
      else if (tag === 282) {
        const numerator = u32(value);
        const denominator = u32(value + 4);
        page.xResolution = denominator ? numerator / denominator : 0;
      }
    }

    pages.push(page);
    ifd = u32(ifd + 2 + count * 12);
  }

  return pages;
}

test.beforeEach(async ({ page }) => {
  await setupCapacitorMocks(page);
});

test.describe('Part J (J6-J10) — output correctness on a phone', () => {
  test('J6: the OCR language and column controls are reachable and sized for a thumb', async ({ page }) => {
    for (const converterId of ['images-to-word', 'images-to-excel']) {
      await openConverter(page, converterId);
      await expectNoHorizontalOverflow(page);
      await upload(page, PHOTO);
      await expectNoHorizontalOverflow(page);
      await expectTouchTargets(page);

      // The five OCR languages the app ships, not just English.
      const language = page.locator('#opt-ocr-language');
      await expect(language).toBeVisible();
      const codes = await language.locator('option').evaluateAll(options =>
        options.map(o => (o as HTMLOptionElement).value)
      );
      expect(codes).toEqual(['eng', 'hin', 'mar', 'ben', 'pan']);
      await language.selectOption('hin');
      await expect(language).toHaveValue('hin');
    }

    // Layout-based column detection is the Excel converter's own control.
    await expect(page.getByText('Detect Columns From Layout')).toBeVisible();
  });

  test('J7: PDF to TIFF writes the compression it claims, at the requested DPI', async ({ page }) => {
    // Three full rasterizations at 150 DPI, one of which saves ~17MB of
    // uncompressed pixels, so the default per-test budget is not enough.
    test.setTimeout(150000);
    const sizes: Record<string, number> = {};

    for (const [compression, expectedTag] of [['none', 1], ['lzw', 5], ['g4', 4]] as const) {
      await openConverter(page, 'pdf-to-tiff');
      await upload(page, PDF_FIXTURE);
      await expectTouchTargets(page);
      await selectDpi(page, 'High Quality (150 DPI)');
      await selectOption(page, /compression/i, compression);
      await convert(page);

      const { name, buffer } = await saveAndRead(page);
      expect(name).toMatch(/\.tiff$/);

      const pages = readTiffDirectories(buffer);
      expect(pages.length, `${compression}: every PDF page needs an IFD`).toBeGreaterThanOrEqual(2);
      expect(pages[0].compression, `${compression} compression tag`).toBe(expectedTag);
      expect(pages[0].xResolution, `${compression} resolution tag`).toBe(150);
      expect(pages[0].bitsPerSample).toBe(compression === 'g4' ? 1 : 8);
      // 150 DPI over a 612pt-wide page is 1275px, not 612px.
      expect(pages[0].width).toBeGreaterThan(1000);

      sizes[compression] = buffer.byteLength;
    }

    // The point of the compression setting: a tag with raw bytes behind it is
    // both unreadable elsewhere and exactly as large as no compression.
    expect(sizes['lzw'], 'LZW must actually compress').toBeLessThan(sizes['none'] / 2);
    expect(sizes['g4'], 'G4 must actually compress').toBeLessThan(sizes['none'] / 10);
  });

  test('J7: TIFF to PDF keeps every page and sizes them from the scan resolution', async ({ page }) => {
    test.setTimeout(120000);
    // Make the TIFF with the app itself, so the round trip is end to end.
    await openConverter(page, 'pdf-to-tiff');
    await upload(page, PDF_FIXTURE);
    await selectDpi(page, 'High Quality (150 DPI)');
    await selectOption(page, /compression/i, 'lzw');
    await convert(page);
    const tiff = await saveAndRead(page);

    const tiffPath = path.join(CONV_DIR, '.tmp-roundtrip.tiff');
    fs.writeFileSync(tiffPath, tiff.buffer);

    try {
      await openConverter(page, 'tiff-to-pdf');
      await upload(page, tiffPath);
      await expectNoHorizontalOverflow(page);
      await expectTouchTargets(page);

      // Original sizing is the default for a scan.
      await expect(page.locator('#opt-page-size')).toHaveValue('Original');
      await convert(page);

      const { name, buffer } = await saveAndRead(page);
      expect(name).toMatch(/\.pdf$/);

      const doc = await PDFDocument.load(buffer);
      expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);

      // 1275px at 150 DPI is 8.5in, so the page comes back the size it started.
      const first = doc.getPage(0);
      expect(first.getWidth()).toBeGreaterThan(560);
      expect(first.getWidth()).toBeLessThan(640);
      expect(first.getHeight()).toBeGreaterThan(740);
    } finally {
      fs.rmSync(tiffPath, { force: true });
    }
  });

  test('J7: a sheet size rescales the scan instead of ignoring the control', async ({ page }) => {
    test.setTimeout(120000);
    await openConverter(page, 'pdf-to-tiff');
    await upload(page, PDF_FIXTURE);
    await selectOption(page, /compression/i, 'g4');
    await convert(page);
    const tiff = await saveAndRead(page);
    const tiffPath = path.join(CONV_DIR, '.tmp-a4.tiff');
    fs.writeFileSync(tiffPath, tiff.buffer);

    try {
      await openConverter(page, 'tiff-to-pdf');
      await upload(page, tiffPath);
      await page.locator('#opt-page-size').selectOption('A4');
      await page.locator('#opt-orientation').selectOption('Portrait');
      await convert(page);

      const { buffer } = await saveAndRead(page);
      const doc = await PDFDocument.load(buffer);
      const first = doc.getPage(0);
      expect(Math.round(first.getWidth())).toBe(595);
      expect(Math.round(first.getHeight())).toBe(842);
    } finally {
      fs.rmSync(tiffPath, { force: true });
    }
  });

  test('J8: SVG to PDF keeps shapes as vectors and places transformed groups correctly', async ({ page }) => {
    await openConverter(page, 'svg-to-pdf');
    await upload(page, path.join(CONV_DIR, 'vector-logo.svg'));
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await expect(page.locator('#opt-page-size')).toHaveValue('Original');
    await convert(page);

    const { name, buffer } = await saveAndRead(page);
    expect(name).toMatch(/\.pdf$/);

    const raw = buffer.toString('latin1');
    // A vector page has no image XObject at all.
    expect(raw).not.toContain('/Subtype /Image');
    expect(raw).not.toContain('/Subtype/Image');

    const doc = await PDFDocument.load(buffer);
    // 320 CSS px at 0.75pt/px.
    expect(Math.round(doc.getPage(0).getWidth())).toBe(240);
    expect(Math.round(doc.getPage(0).getHeight())).toBe(150);

    // The fidelity report is on the page and opens.
    const reportHeader = page.locator('.fidelity-report-header');
    await expect(reportHeader).toBeVisible();
    await reportHeader.click();
    await expect(page.locator('.fidelity-report-body')).toBeVisible();
    // Georgia is not a built-in PDF font, so the substitution is named.
    await expect(page.locator('.fidelity-report-body')).toContainText(/Georgia/i);
    await expectNoHorizontalOverflow(page);
  });

  test('J8: a gradient is rasterized in the browser and the report says so', async ({ page }) => {
    await openConverter(page, 'svg-to-pdf');
    await upload(page, path.join(CONV_DIR, 'gradient-poster.svg'));
    await convert(page);

    // The warning is shown before the person saves anything.
    await expect(page.locator('.result-card')).toContainText(/gradient/i);

    const reportHeader = page.locator('.fidelity-report-header');
    await reportHeader.click();
    const body = page.locator('.fidelity-report-body');
    await expect(body).toContainText(/Pages Rasterized/i);
    await expect(body).toContainText(/rasterized/i);

    const { buffer } = await saveAndRead(page);
    // A rasterized page does carry an image, which is the honest outcome here.
    expect(buffer.toString('latin1')).toMatch(/\/Subtype\s*\/Image/);
  });

  test('J8: PDF to SVG emits vector paths and selectable text, not text alone', async ({ page }) => {
    await openConverter(page, 'pdf-to-svg');
    await upload(page, PDF_FIXTURE);
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);

    // Page picking is offered, and one page means a plain .svg.
    const chips = page.locator('.page-chip');
    await expect(chips.first()).toBeVisible();
    await page.getByRole('button', { name: /^none$/i }).click();
    await chips.first().click();
    await convert(page);

    const { name, buffer } = await saveAndRead(page);
    expect(name).toMatch(/\.svg$/);
    const svg = buffer.toString('utf8');

    expect(svg).toContain('<svg');
    expect(svg).toMatch(/<text[^>]*>/);
    // The hardcoded slate every run used to get.
    expect(svg).not.toContain('#111827');
    // Well-formed enough for a parser.
    const parsed = await page.evaluate((markup: string) => {
      const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
      return {
        error: !!doc.querySelector('parsererror'),
        paths: doc.querySelectorAll('path').length,
        texts: doc.querySelectorAll('text').length,
        viewBox: doc.documentElement.getAttribute('viewBox')
      };
    }, svg);
    expect(parsed.error).toBe(false);
    expect(parsed.texts).toBeGreaterThan(0);
    expect(parsed.viewBox).toMatch(/^0 0 \d+ \d+$/);
  });

  test('J9: the JSON states its schema, coordinate space and mode', async ({ page }) => {
    await openConverter(page, 'pdf-to-json');
    await upload(page, PDF_FIXTURE);
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await expect(page.locator('#opt-json-mode')).toHaveValue('reflowable');
    await convert(page);

    const { name, buffer } = await saveAndRead(page);
    expect(name).toMatch(/\.json$/);
    const json = JSON.parse(buffer.toString('utf8'));

    expect(json.schemaVersion).toBe('1.1.0');
    expect(json.coordinateSpace).toBe('pdf-points-top-left');
    expect(json.mode).toBe('reflowable');
    expect(json.metadata.pageCount).toBe(json.totalPages);
    expect(Array.isArray(json.pages)).toBe(true);

    const first = json.pages[0];
    expect(first.pageNumber).toBe(1);
    expect(first.width).toBeGreaterThan(0);
    expect(first.textItems.length).toBeGreaterThan(0);
    for (const item of first.textItems.slice(0, 20)) {
      expect(typeof item.text).toBe('string');
      expect(item.x).toBeGreaterThanOrEqual(0);
      expect(item.y).toBeGreaterThanOrEqual(0);
      expect(item.x).toBeLessThanOrEqual(first.width + 1);
      expect(item.fontSize).toBeGreaterThan(0);
    }
  });

  test('J9: switching off metadata and tables changes the file', async ({ page }) => {
    await openConverter(page, 'pdf-to-json');
    await upload(page, PDF_FIXTURE);

    for (const label of ['Detect Tables', 'Include Annotations', 'Include Document Metadata']) {
      await page.locator('.checkbox-row', { hasText: label }).click();
    }
    await convert(page);

    const { buffer } = await saveAndRead(page);
    const json = JSON.parse(buffer.toString('utf8'));

    expect(json.metadata.author).toBeUndefined();
    expect(json.metadata.title).toBeUndefined();
    expect(json.metadata.pageCount).toBeGreaterThan(0);
    expect(json.pages.every((p: any) => p.tables.length === 0)).toBe(true);
  });

  test('J10: the fidelity report is on every result and fits a 320px screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });

    await openConverter(page, 'pdf-to-json');
    await upload(page, PDF_FIXTURE);
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await convert(page);

    const header = page.locator('.fidelity-report-header');
    await expect(header).toBeVisible();
    await expect(header).toContainText(/Fidelity/i);
    await header.click();

    const body = page.locator('.fidelity-report-body');
    await expect(body).toBeVisible();
    await expect(body).toContainText(/Tables Detected/i);
    await expect(body).toContainText(/Pages Rasterized/i);
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);

    // And it collapses again, so it is a disclosure and not a wall of text.
    await header.click();
    await expect(body).toBeHidden();
  });

  test('the converter hub names the format each tool really produces', async ({ page }) => {
    await page.goto('/features/pdf/conversion');
    await expect(page.locator('.converter-card').first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const cards = await page.locator('.converter-card').evaluateAll(nodes =>
      nodes.map(node => ({
        title: node.querySelector('.card-title')?.textContent?.trim() || '',
        dest: node.querySelector('.badge-dest')?.textContent?.trim() || ''
      }))
    );

    const byTitle = (title: string) => cards.find(c => c.title === title);
    // These two produce Office files; labelling them "PDF" is the kind of
    // claim that gets a listing rejected.
    expect(byTitle('Images to Word')?.dest).toBe('DOCX');
    expect(byTitle('Images to Excel')?.dest).toBe('XLSX');
    expect(byTitle('PDF to TIFF')?.dest).toBe('TIFF');
    expect(byTitle('PDF to SVG')?.dest).toBe('SVG');
    expect(byTitle('PDF to JSON')?.dest).toBe('JSON');
    expect(byTitle('TIFF to PDF')?.dest).toBe('PDF');
    expect(byTitle('SVG to PDF')?.dest).toBe('PDF');
  });
});
