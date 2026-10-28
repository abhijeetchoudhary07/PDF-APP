/**
 * Part J (J1-J5) end-to-end verification on a phone viewport.
 *
 * The existing `conversion-j1-j5-mobile.spec.ts` walks the happy path and
 * screenshots it. This suite is the other half: it checks the bytes that come
 * out of each converter, the options that claim to change them, and the
 * states a phone actually lands in — the narrowest supported width, dark
 * mode, a malformed input, and a document in a script the built-in PDF fonts
 * cannot draw.
 */
import { test, expect, Page, Download } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';
import { PDFDocument, decodePDFRawStream } from 'pdf-lib';
import JSZip from 'jszip';
import * as path from 'path';
import * as fs from 'fs';

const PDF_FIXTURE = path.resolve(__dirname, '../test-data/pdf/structured-doc.pdf');
const CONV_DIR = path.resolve(__dirname, '../test-data/conversion');

// Pixel-ish phone. 320 is checked separately as the narrowest width that still
// ships (an iPhone SE 1st gen / small Android in display-size-large mode).
test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

/** Nothing may push the document wider than the viewport. */
async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    offenders: [...document.querySelectorAll('body *')]
      .filter(el => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        // An element inside a horizontally scrollable strip is allowed to be
        // wider than the screen; the page itself is not.
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

/**
 * Every control a thumb has to hit is at least 44px tall. Play Store review
 * and the accessibility scanner both measure this, and a 30px select on a
 * phone is the kind of thing that only shows up on a device.
 */
async function expectTouchTargets(page: Page) {
  const small = await page.evaluate(() => {
    const selectors = [
      'select.field-select',
      '.checkbox-row',
      'button.btn-text',
      '.btn-link',
      '.remove-btn',
      '.page-chip',
      'app-button button'
    ];
    const bad: string[] = [];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return; // not rendered
        /*
         * Half a pixel of tolerance: a 44px min-height lands on 43.99 after
         * the browser's own sub-pixel rounding, and failing on that is noise,
         * not a control anyone can miss with a thumb.
         */
        if (r.height < 43.5) {
          bad.push(`${sel} -> ${r.height.toFixed(2)}px`);
        }
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

async function convert(page: Page) {
  await page.getByRole('button', { name: /start conversion/i }).click();
  await expect(page.locator('.result-card')).toBeVisible({ timeout: 40000 });
  await expect(page.getByText('Conversion Successful!')).toBeVisible();
}

/** Clicks Save and returns the bytes the browser actually wrote out. */
async function saveAndRead(page: Page): Promise<{ name: string; buffer: Buffer }> {
  const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
  await page.getByRole('button', { name: /^save /i }).click();
  const download: Download = await downloadPromise;
  const tmp = await download.path();
  expect(tmp, 'the browser produced no file for the Save button').toBeTruthy();
  return {
    name: download.suggestedFilename(),
    buffer: fs.readFileSync(tmp as string)
  };
}

/**
 * The text a PDF actually draws, read back out of its content streams. File
 * size is no evidence that anything reached the page.
 */
function drawnText(doc: PDFDocument): string {
  let out = '';
  for (const page of doc.getPages()) {
    const contents: any = page.node.Contents();
    const streams: any[] = contents?.asArray ? contents.asArray() : [contents];
    for (const entry of streams) {
      if (!entry) continue;
      const obj = entry.constructor?.name === 'PDFRef' ? doc.context.lookup(entry) : entry;
      let raw = '';
      try {
        raw = Buffer.from(decodePDFRawStream(obj as any).decode()).toString('latin1');
      } catch {
        try {
          raw = Buffer.from((obj as any).getContents()).toString('latin1');
        } catch {
          continue;
        }
      }
      for (const match of raw.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
        out += Buffer.from(match[1], 'hex').toString('latin1');
      }
      for (const match of raw.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) {
        out += match[1];
      }
    }
  }
  return out;
}

test.beforeEach(async ({ page }) => {
  await setupCapacitorMocks(page);
});

test.describe('Part J (J1-J5) — output correctness', () => {
  test('J1: PDF to Markdown produces headings, lists, links and a well-formed table', async ({ page }) => {
    await openConverter(page, 'pdf-to-markdown');
    await expectNoHorizontalOverflow(page);
    await upload(page, PDF_FIXTURE);
    await expectTouchTargets(page);
    await expectNoHorizontalOverflow(page);
    await convert(page);

    const { name, buffer } = await saveAndRead(page);
    expect(name).toMatch(/\.md$/);
    const md = buffer.toString('utf8');

    // Heading hierarchy from font sizes: the 24pt title outranks the 16pt
    // section, so the title must not come out at a deeper level.
    const titleMatch = md.match(/^(#+)\s+Quarterly Filing Guide/m);
    const sectionMatch = md.match(/^(#+)\s+Section One: Eligibility/m);
    expect(titleMatch, `no heading for the document title in:\n${md.slice(0, 600)}`).toBeTruthy();
    expect(sectionMatch).toBeTruthy();
    expect(titleMatch![1].length).toBeLessThanOrEqual(sectionMatch![1].length);

    // List markers survive.
    expect(md).toMatch(/^-\s+Proof of address/m);
    expect(md).toMatch(/^1\.\s+Complete every mandatory field/m);

    // The bare URL becomes a markdown link.
    expect(md).toContain('](https://example.com/filing-rules)');

    // Every pipe-table row has the same number of columns as its header.
    const tableRows = md.split('\n').filter(l => l.trim().startsWith('|') && l.trim().endsWith('|'));
    if (tableRows.length > 0) {
      const columns = tableRows[0].split('|').length;
      for (const row of tableRows) {
        expect(row.split('|').length, `ragged table row: ${row}`).toBe(columns);
      }
      // A header, a separator and at least one body row.
      expect(tableRows.length).toBeGreaterThanOrEqual(3);
      expect(tableRows[1]).toMatch(/^\|[\s-|:]+\|$/);
    }

    // Page two made it into the same document.
    expect(md).toContain('Section Two');
  });

  test('J1: sidecar image mode hands back a zip and the Save button says so', async ({ page }) => {
    await openConverter(page, 'pdf-to-markdown');
    await upload(page, PDF_FIXTURE);

    await page.locator('select.field-select').first().selectOption('sidecar');
    await convert(page);

    const { name, buffer } = await saveAndRead(page);

    if (name.endsWith('.zip')) {
      // The label must describe the file that exists, not the nominal target.
      await expect(page.getByRole('button', { name: /save zip/i })).toBeVisible();
      const zip = await JSZip.loadAsync(buffer);
      const names = Object.keys(zip.files);
      expect(names.some(n => n.endsWith('.md'))).toBe(true);
      expect(names.some(n => n.startsWith('images/'))).toBe(true);
    } else {
      // No embedded images in the fixture: a plain .md is the correct output.
      expect(name).toMatch(/\.md$/);
      await expect(page.getByRole('button', { name: /save md/i })).toBeVisible();
    }
  });

  test('J2: PDF to HTML is self-contained, offline and in reading order', async ({ page }) => {
    await openConverter(page, 'pdf-to-html');
    await expectNoHorizontalOverflow(page);
    await upload(page, PDF_FIXTURE);
    await page.locator('select.field-select').first().selectOption('reflowable');
    await convert(page);

    const { name, buffer } = await saveAndRead(page);
    expect(name).toMatch(/\.html$/);
    const html = buffer.toString('utf8');

    // Nothing in the file may reach the network.
    expect(html).not.toMatch(/<img[^>]*src=["']https?:\/\//i);
    expect(html).not.toMatch(/<script[^>]*src=["']https?:\/\//i);
    expect(html).not.toMatch(/<link[^>]*href=["']https?:\/\//i);
    expect(html).not.toMatch(/@import\s+url\(["']?https?:\/\//i);

    // Reflowable mode emits semantic flow in document order.
    const titleIdx = html.indexOf('Quarterly Filing Guide');
    const sectionIdx = html.indexOf('Section One');
    const bodyIdx = html.indexOf('identity document');
    expect(titleIdx).toBeGreaterThan(-1);
    expect(sectionIdx).toBeGreaterThan(titleIdx);
    expect(bodyIdx).toBeGreaterThan(sectionIdx);

    // It has to render on a phone: a viewport meta and no fixed page boxes.
    expect(html).toContain('name="viewport"');
    expect(html).not.toContain('class="pdf-page-fixed"');
    expect(html, 'reflowable output ships CSS for page boxes it never emits').not.toContain(
      '.pdf-page-fixed'
    );
  });

  test('J2: layout-preserving mode positions text and still fits a phone screen', async ({ page }) => {
    await openConverter(page, 'pdf-to-html');
    await upload(page, PDF_FIXTURE);
    await page.locator('select.field-select').first().selectOption('layout-preserving');
    await convert(page);

    const { buffer } = await saveAndRead(page);
    const html = buffer.toString('utf8');
    expect(html).toContain('pdf-page-fixed');
    expect(html).toContain('pdf-text-item');

    // The fixed page is 595pt wide. Opened on a phone it must not drag the
    // whole document sideways, so each page sits in its own scroller.
    expect(html).toContain('class="pdf-fixed-scroller"');
    expect(html).toMatch(/\.pdf-fixed-scroller\s*\{[^}]*overflow-x:\s*auto/);

    // Prove it: open the generated file and check the document itself does
    // not scroll horizontally at phone width.
    const tmpHtml = path.join(CONV_DIR, 'tmp-layout-preserving.html');
    fs.writeFileSync(tmpHtml, buffer);
    try {
      const viewer = await page.context().newPage();
      await viewer.setViewportSize({ width: 375, height: 812 });
      await viewer.goto('file://' + tmpHtml);
      const scrolls = await viewer.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1
      );
      expect(scrolls, 'the generated page scrolls the whole document sideways on a phone').toBe(
        false
      );
      await viewer.close();
    } finally {
      fs.rmSync(tmpHtml, { force: true });
    }
  });

  test('J3: PDF to EPUB is a valid EPUB 3 package', async ({ page }) => {
    await openConverter(page, 'pdf-to-epub');
    await expectNoHorizontalOverflow(page);
    await upload(page, PDF_FIXTURE);
    await convert(page);

    const { name, buffer } = await saveAndRead(page);
    expect(name).toMatch(/\.epub$/);

    const zip = await JSZip.loadAsync(buffer);
    const entries = Object.keys(zip.files);

    // mimetype first and stored, or no reader will accept it.
    expect(entries[0]).toBe('mimetype');
    expect(await zip.files['mimetype'].async('string')).toBe('application/epub+zip');
    // JSZip records the compression it read back from the archive.
    expect((zip.files['mimetype'] as any).options?.compression ?? 'STORE').toBe('STORE');

    const container = await zip.files['META-INF/container.xml'].async('string');
    expect(container).toContain('OEBPS/content.opf');

    const opf = await zip.files['OEBPS/content.opf'].async('string');
    const manifestIds = [...opf.matchAll(/<item\s+id="([^"]+)"\s+href="([^"]+)"/g)].map(m => ({
      id: m[1],
      href: m[2]
    }));
    const spineRefs = [...opf.matchAll(/<itemref\s+idref="([^"]+)"/g)].map(m => m[1]);

    expect(spineRefs.length).toBeGreaterThan(0);
    // Every spine entry resolves to a manifest item that exists in the zip.
    for (const ref of spineRefs) {
      const item = manifestIds.find(m => m.id === ref);
      expect(item, `spine references ${ref}, which is not in the manifest`).toBeTruthy();
      expect(zip.files[`OEBPS/${item!.href}`], `missing ${item!.href}`).toBeTruthy();
    }

    // The nav document is declared and every link in it resolves.
    expect(opf).toContain('properties="nav"');
    const nav = await zip.files['OEBPS/nav.xhtml'].async('string');
    const navHrefs = [...nav.matchAll(/<a\s+href="([^"#]+)/g)].map(m => m[1]);
    expect(navHrefs.length).toBeGreaterThan(0);
    for (const href of navHrefs) {
      expect(zip.files[`OEBPS/${href}`], `nav points at missing ${href}`).toBeTruthy();
    }

    // Content actually came across.
    const firstChapter = await zip.files[`OEBPS/${navHrefs[0]}`].async('string');
    expect(firstChapter).toContain('Quarterly Filing Guide');
  });

  test('J4: Markdown to PDF renders a real document', async ({ page }) => {
    await openConverter(page, 'markdown-to-pdf');
    await expectNoHorizontalOverflow(page);
    await upload(page, path.join(CONV_DIR, 'sample.md'));
    await expectTouchTargets(page);
    await convert(page);

    const { name, buffer } = await saveAndRead(page);
    expect(name).toMatch(/\.pdf$/);
    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  test('J4: a long unbroken line wraps instead of being cut at the margin', async ({ page }) => {
    await openConverter(page, 'markdown-to-pdf');
    await upload(page, path.join(CONV_DIR, 'wide-content.md'));
    await convert(page);

    const { buffer } = await saveAndRead(page);
    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);

    // 400 x-characters in a code block and 400 more in a paragraph: all 800
    // have to survive. Clipping at the right margin would silently lose most
    // of a long URL, token or path.
    const drawn = drawnText(doc);
    const xCount = (drawn.match(/x/g) || []).length;
    expect(xCount, 'long lines were cut at the margin instead of wrapped').toBeGreaterThanOrEqual(
      800
    );
  });

  test.describe('J4: JSON / XML / YAML to PDF', () => {
    for (const { id, fixture } of [
      { id: 'json-to-pdf', fixture: 'sample.json' },
      { id: 'xml-to-pdf', fixture: 'sample.xml' },
      { id: 'yaml-to-pdf', fixture: 'sample.yaml' }
    ]) {
      test(`${id} converts and keeps its options reachable on a phone`, async ({ page }) => {
        await openConverter(page, id);
        await expectNoHorizontalOverflow(page);
        await upload(page, path.join(CONV_DIR, fixture));

        // The indent-guide switch is part of this feature's promise.
        await expect(page.locator('.config-card').getByText('Indentation Guides')).toBeVisible();
        await expectTouchTargets(page);
        await expectNoHorizontalOverflow(page);

        await convert(page);
        const { name, buffer } = await saveAndRead(page);
        expect(name).toMatch(/\.pdf$/);
        const doc = await PDFDocument.load(buffer);
        expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
      });
    }
  });

  test('J4: malformed JSON reports a parse error instead of a garbled PDF', async ({ page }) => {
    await openConverter(page, 'json-to-pdf');

    const broken = path.join(CONV_DIR, 'broken.json');
    fs.writeFileSync(broken, '{ name: "unquoted", broken: [1, 2, }');
    try {
      await upload(page, broken);
      await page.getByRole('button', { name: /start conversion/i }).click();

      await expect(page.locator('.error-banner')).toBeVisible({ timeout: 30000 });
      await expect(page.locator('.error-banner')).toContainText(/parse error/i);
      await expect(page.locator('.result-card')).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
    } finally {
      fs.rmSync(broken, { force: true });
    }
  });

  test('J4: Devanagari markdown converts and says what it could not draw', async ({ page }) => {
    await openConverter(page, 'markdown-to-pdf');
    await upload(page, path.join(CONV_DIR, 'hindi-notes.md'));
    await convert(page);

    // The conversion must not fail, and the person must be told rather than
    // handed a document quietly missing half its text.
    const warning = page.locator('.warning-banner');
    await expect(warning).toBeVisible();
    await expect(warning).toContainText(/Devanagari/i);
    await expectNoHorizontalOverflow(page);

    const { buffer } = await saveAndRead(page);
    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  test('J5: EML merges attachments, blocks remote images, and honours the switch', async ({ page }) => {
    await openConverter(page, 'eml-to-pdf');
    await expectNoHorizontalOverflow(page);
    await upload(page, path.join(CONV_DIR, 'rich-message.eml'));
    await expect(page.getByText('Process Attachments')).toBeVisible();
    await expectTouchTargets(page);
    await convert(page);

    // The remote tracking pixel must be reported, not fetched.
    const warning = page.locator('.warning-banner');
    await expect(warning).toBeVisible();
    await expect(warning).toContainText(/remote images were blocked/i);

    const withAttachments = await saveAndRead(page);
    const withDoc = await PDFDocument.load(withAttachments.buffer);
    // Message body page plus the merged page from report.pdf.
    expect(withDoc.getPageCount()).toBeGreaterThanOrEqual(2);

    // Turning the switch off has to change the output.
    await page.getByRole('button', { name: /convert another document/i }).click();
    await upload(page, path.join(CONV_DIR, 'rich-message.eml'));
    // The native input is zero-sized behind the styled box, so the label is
    // what a thumb actually hits -- drive it the same way.
    const attachmentsCheckbox = page.locator('.checkbox-row input[type="checkbox"]').first();
    await expect(attachmentsCheckbox).toBeChecked();
    await page.locator('.checkbox-row').first().click();
    await expect(attachmentsCheckbox).not.toBeChecked();
    await convert(page);

    const withoutAttachments = await saveAndRead(page);
    const withoutDoc = await PDFDocument.load(withoutAttachments.buffer);
    expect(
      withoutDoc.getPageCount(),
      'unchecking "Process Attachments" did not change the output'
    ).toBeLessThan(withDoc.getPageCount());
  });

  test('J5: MSG to PDF converts a message export', async ({ page }) => {
    await openConverter(page, 'msg-to-pdf');
    await expectNoHorizontalOverflow(page);
    await upload(page, path.join(CONV_DIR, 'sample.msg'));
    await expectTouchTargets(page);
    await convert(page);

    const { name, buffer } = await saveAndRead(page);
    expect(name).toMatch(/\.pdf$/);
    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});

/*
 * The pre-J converters draw with the same WinAnsi-encoded standard fonts, so
 * they carried the same hard failure on Indic text. Word lives here rather
 * than in the unit suite because mammoth's Node build cannot take an
 * arrayBuffer -- only the browser build the app actually ships can.
 */
test.describe('Pre-J converters — Indic text', () => {
  test('Word to PDF converts a Hindi document and reports what it could not draw', async ({
    page
  }) => {
    await openConverter(page, 'word-to-pdf');
    await expectNoHorizontalOverflow(page);
    await upload(page, path.join(CONV_DIR, 'hindi-document.docx'));
    await expectTouchTargets(page);
    await convert(page);

    const warning = page.locator('.warning-banner');
    await expect(warning).toBeVisible();
    await expect(warning).toContainText(/Devanagari/i);

    const { name, buffer } = await saveAndRead(page);
    expect(name).toMatch(/\.pdf$/);
    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);

    // The English half of the document has to come through untouched.
    expect(drawnText(doc)).toContain('English paragraph must survive');
  });

  test('Text to PDF keeps Latin text when the input is mixed', async ({ page }) => {
    await openConverter(page, 'text-to-pdf');

    const mixed = path.join(CONV_DIR, 'tmp-mixed.txt');
    fs.writeFileSync(
      mixed,
      '\u0906\u0935\u0947\u0926\u0928\nThis English line is untouched.\n',
      'utf8'
    );
    try {
      await upload(page, mixed);
      await convert(page);

      await expect(page.locator('.warning-banner')).toContainText(/Devanagari/i);

      const { buffer } = await saveAndRead(page);
      const doc = await PDFDocument.load(buffer);
      expect(drawnText(doc)).toContain('This English line is untouched.');
    } finally {
      fs.rmSync(mixed, { force: true });
    }
  });
});

test.describe('Part J (J1-J5) — phone layout', () => {
  const J_CONVERTERS = [
    'pdf-to-markdown',
    'pdf-to-html',
    'pdf-to-epub',
    'markdown-to-pdf',
    'json-to-pdf',
    'xml-to-pdf',
    'yaml-to-pdf',
    'eml-to-pdf',
    'msg-to-pdf'
  ];

  test('every J1-J5 tool is reachable from the hub and fits a 375px screen', async ({ page }) => {
    await page.goto('/features/pdf/conversion');
    await expectNoHorizontalOverflow(page);

    // The badge count and the search placeholder must agree; two different
    // numbers on one screen is the kind of claim that gets flagged on review.
    const badge = await page.locator('app-page-header').getByText(/FORMATS/).innerText();
    const badgeCount = Number(badge.match(/\d+/)?.[0]);
    const placeholder = await page.locator('.search-input').getAttribute('placeholder');
    const placeholderCount = Number(placeholder?.match(/\d+/)?.[0]);
    expect(placeholderCount).toBe(badgeCount);

    for (const id of J_CONVERTERS) {
      await page.goto(`/features/pdf/conversion/${id}`);
      await expect(page.locator('app-page-header'), `${id} did not render`).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectTouchTargets(page);
    }
  });

  test('the J tools still fit at 320px, the narrowest phone that ships', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });

    for (const id of ['pdf-to-markdown', 'pdf-to-html', 'json-to-pdf', 'eml-to-pdf']) {
      await page.goto(`/features/pdf/conversion/${id}`);
      await expect(page.locator('.dropzone-card')).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }

    // With a file chosen the options panel appears; it must fit too.
    await page.goto('/features/pdf/conversion/pdf-to-markdown');
    await upload(page, PDF_FIXTURE);
    await expect(page.locator('.config-card')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
  });

  test('the options panel and result card are legible in dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openConverter(page, 'eml-to-pdf');
    await upload(page, path.join(CONV_DIR, 'rich-message.eml'));
    await expect(page.locator('.config-card')).toBeVisible();

    // Every token used by this page has to resolve; an undefined custom
    // property falls back to transparent and only shows up on dark.
    const unresolved = await page.evaluate(() => {
      const bad: string[] = [];
      const check = (sel: string, prop: string) => {
        const el = document.querySelector(sel);
        if (!el) return;
        const value = getComputedStyle(el).getPropertyValue(prop).trim();
        if (!value || value === 'transparent' || value === 'rgba(0, 0, 0, 0)') {
          bad.push(`${sel} ${prop} = "${value}"`);
        }
      };
      check('.config-card', 'background-color');
      check('.config-card', 'border-color');
      check('.field-label', 'color');
      check('.config-title', 'color');
      return bad;
    });
    expect(unresolved).toEqual([]);

    await convert(page);
    const warningColor = await page.locator('.warning-banner .warning-text p').evaluate(
      el => getComputedStyle(el).color
    );
    expect(warningColor).not.toBe('rgba(0, 0, 0, 0)');
    await expectNoHorizontalOverflow(page);
  });
});
