/**
 * J11 (batch PDF tools) on a phone.
 *
 * The queue's own mechanics are unit tested. What can only be checked here is
 * the screen a person actually uses: that every operation is reachable with a
 * thumb at 320px, that the cost of a run is stated before it starts, that a
 * run that half-worked says so afterwards, and that the result log is a file
 * the device really produces.
 */
import { test, expect, Page } from '@playwright/test';
import { setupCapacitorMocks } from '../fixtures/mocks';
import * as path from 'path';
import * as fs from 'fs';

const PDF_FIXTURE = path.resolve(__dirname, '../test-data/pdf/structured-doc.pdf');

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
    const bad: string[] = [];
    for (const sel of ['.op-chip', '.custom-select', '.custom-input', '.remove-btn', 'app-button button']) {
      document.querySelectorAll(sel).forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        if (r.height < 43.5) bad.push(`${sel} -> ${r.height.toFixed(2)}px`);
      });
    }
    return bad;
  });
  expect(small, `controls under the 44px touch target: ${small.join(', ')}`).toEqual([]);
}

/** Queues files without going through the OS picker the page opens. */
async function queueFiles(page: Page, files: { name: string; body: string }[]) {
  await page.evaluate(entries => {
    const host = document.querySelector('app-batch-pdf');
    const cmp = (window as any).ng.getComponent(host);
    cmp.items = entries.map((entry, index) => {
      const file = new File([entry.body], entry.name, { type: 'application/pdf' });
      return {
        id: `e2e-${index}`,
        file,
        status: 'queued',
        originalSizeBytes: file.size,
        quotaCharged: false
      };
    });
    cmp.autoSave = false;
    // Setting the array from outside Angular's zone does not schedule a
    // render on its own, so ask for one.
    (window as any).ng.applyChanges(host);
  }, files);
}

/** A tiny PDF that really parses, with `title` as its largest text. */
function pdfWithTitle(title: string): string {
  const content = `BT /F1 24 Tf 40 220 Td (${title}) Tj ET`;
  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 300]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>',
    `<</Length ${content.length}>>\nstream\n${content}\nendstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach(offset => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

test.beforeEach(async ({ page }) => {
  await setupCapacitorMocks(page);
  await page.goto('/features/batch-pdf');
  await expect(page.locator('.batch-config-card')).toBeVisible();
});

test.describe('Part J (J11) — batch tools on a phone', () => {
  test('offers every operation, reachable with a thumb at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);

    const labels = await page.locator('.op-chip .chip-label').allTextContents();
    expect(labels.map(l => l.trim())).toEqual([
      'Compress',
      'OCR Searchable PDF',
      'PDF to Word',
      'Protect (Encrypt)',
      'Unprotect (Unlock)',
      'Strip Metadata',
      'Rename from Content'
    ]);

    // Each one reveals its own settings without breaking the layout.
    for (const label of ['Compress', 'OCR Searchable PDF', 'Protect (Encrypt)', 'Rename from Content']) {
      await page.locator('.op-chip', { hasText: label }).click();
      await expectNoHorizontalOverflow(page);
      await expectTouchTargets(page);
    }
  });

  test('offers only the OCR languages the app ships', async ({ page }) => {
    await page.locator('.op-chip', { hasText: 'OCR Searchable PDF' }).click();
    const select = page.locator('#ocrLangSelect');
    await expect(select).toBeVisible();

    const codes = await select.locator('option').evaluateAll(options =>
      options.map(o => (o as HTMLOptionElement).value)
    );
    expect(codes).toEqual(['eng', 'hin', 'mar', 'ben', 'pan']);
  });

  test('states what a run will cost before it starts', async ({ page }) => {
    await queueFiles(page, [
      { name: 'one.pdf', body: pdfWithTitle('Property Tax Receipt') },
      { name: 'two.pdf', body: pdfWithTitle('Electricity Bill March') }
    ]);

    const banner = page.locator('.quota-preview-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/2 operations/);
    await expect(banner).toContainText(/left today|Unlimited/);
    await expectNoHorizontalOverflow(page);
  });

  test('renames from the document title and reports the file it could not read', async ({ page }) => {
    await page.locator('.op-chip', { hasText: 'Rename from Content' }).click();
    await queueFiles(page, [
      { name: 'scan-a.pdf', body: pdfWithTitle('Property Tax Receipt') },
      { name: 'photo-only.pdf', body: '%PDF-1.4 not really a pdf' },
      { name: 'scan-b.pdf', body: pdfWithTitle('Electricity Bill March') }
    ]);

    await page.getByRole('button', { name: /start batch/i }).click();
    await expect(page.locator('.run-summary-panel')).toBeVisible({ timeout: 60000 });

    // The two readable files are renamed after their own titles.
    await expect(page.locator('.queue-item').nth(0)).toContainText('Property_Tax_Receipt.pdf');
    await expect(page.locator('.queue-item').nth(2)).toContainText('Electricity_Bill_March.pdf');

    // The third says why, and points at the thing that would fix it.
    const failed = page.locator('.queue-item').nth(1);
    await expect(failed).toContainText(/Failed/);
    await expect(failed).toContainText(/OCR/i);

    const summary = page.locator('.run-summary-panel');
    await expect(summary).toContainText('Finished with errors');
    await expect(summary).toContainText('2');
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
  });

  test('the result log is a real file with every outcome in it', async ({ page }) => {
    await page.locator('.op-chip', { hasText: 'Rename from Content' }).click();
    await queueFiles(page, [
      { name: 'scan-a.pdf', body: pdfWithTitle('Annual Return Form') },
      { name: 'photo-only.pdf', body: '%PDF-1.4 not really a pdf' }
    ]);

    await page.getByRole('button', { name: /start batch/i }).click();
    await expect(page.locator('.run-summary-panel')).toBeVisible({ timeout: 60000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
    await page.getByRole('button', { name: /export csv log/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^batch_rename-from-content_results_\d{4}-\d{2}-\d{2}\.csv$/);
    const csvPath = await download.path();
    expect(csvPath).toBeTruthy();
    const csv = fs.readFileSync(csvPath as string, 'utf8');

    const lines = csv.trim().split('\n');
    expect(lines[0]).toContain('File Name');
    expect(lines.length).toBe(3);
    expect(csv).toContain('Annual_Return_Form.pdf');
    expect(csv).toContain('"done"');
    expect(csv).toContain('"failed"');
    expect(csv).toMatch(/OCR/i);
  });

  test('a run that stops at the daily limit says what it did not do', async ({ page }) => {
    // One operation left, three files queued.
    await page.evaluate(() => {
      const host = document.querySelector('app-batch-pdf');
      const cmp = (window as any).ng.getComponent(host);
      let left = 1;
      Object.defineProperty(cmp.quota, 'isUnlimited', { get: () => false, configurable: true });
      cmp.quota.remaining = async () => left;
      cmp.quota.canStart = async () => left > 0;
      cmp.quota.consume = async () => { left = Math.max(0, left - 1); };
    });

    await page.locator('.op-chip', { hasText: 'Rename from Content' }).click();
    await queueFiles(page, [
      { name: 'a.pdf', body: pdfWithTitle('First Document') },
      { name: 'b.pdf', body: pdfWithTitle('Second Document') },
      { name: 'c.pdf', body: pdfWithTitle('Third Document') }
    ]);
    await page.evaluate(async () => {
      const host = document.querySelector('app-batch-pdf');
      const cmp = (window as any).ng.getComponent(host);
      cmp.autoSave = true;
      // The banner reads the count fetched when the page loaded, so ask for it
      // again now the stub is in place.
      await cmp.refreshQuota();
      (window as any).ng.applyChanges(host);
    });

    const banner = page.locator('.quota-preview-banner');
    await expect(banner).toContainText(/Exceeds remaining quota/i);

    await page.getByRole('button', { name: /start batch/i }).click();
    const summary = page.locator('.run-summary-panel');
    await expect(summary).toBeVisible({ timeout: 60000 });

    await expect(summary).toContainText('Stopped at the daily limit');
    await expect(summary).toContainText(/left untouched/i);
    // The files it never reached say so rather than looking processed.
    await expect(page.locator('.queue-item').nth(2)).toContainText(/quota limit reached/i);
    await expectNoHorizontalOverflow(page);
  });
});
