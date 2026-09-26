import { Page, Locator, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import * as XLSX from 'xlsx';
import * as JSZip from 'jszip';

/**
 * Returns absolute path to a Phase 2 fixture file in e2e/test-data/phase2/
 */
export function getPhase2FixturePath(filename: string): string {
  return path.resolve(__dirname, '../test-data/phase2', filename);
}

/**
 * Uploads a file to a dropzone input element.
 * Handles both standard hidden file inputs and dropzone targets.
 */
export async function uploadFileToDropzone(
  page: Page,
  filePath: string,
  dropzoneIndex: number = 0
): Promise<void> {
  const dropzoneCards = page.locator('.dropzone-card');
  const cardCount = await dropzoneCards.count();
  let fileInput: Locator;
  if (cardCount > dropzoneIndex) {
    fileInput = dropzoneCards.nth(dropzoneIndex).locator('input[type="file"]');
  } else {
    fileInput = page.locator('input[type="file"]').nth(0);
  }
  await fileInput.waitFor({ state: 'attached', timeout: 15000 });
  await fileInput.setInputFiles(filePath);
}

/**
 * Waits for processing spinners/sections to complete and disappear.
 */
export async function waitForProcessingToFinish(page: Page, timeoutMs = 25000): Promise<void> {
  const spinner = page.locator('.spinner, .processing-section, .proc-card, .progress-card, .scanning-section');
  if (await spinner.count() > 0) {
    try {
      await spinner.first().waitFor({ state: 'hidden', timeout: timeoutMs });
    } catch {
      // If element is already removed from DOM
    }
  }
}

/**
 * Waits for canvas rendering in app-pdf-preview or direct canvas elements.
 */
export async function waitForCanvasRender(page: Page, timeoutMs = 15000): Promise<void> {
  const canvas = page.locator('app-pdf-preview canvas, canvas.preview-canvas, .pdf-canvas, canvas').first();
  await canvas.waitFor({ state: 'visible', timeout: timeoutMs });
}

/**
 * Intercepts a file download triggered by a user action (e.g. clicking a download button).
 * Returns the downloaded file's buffer, name, and size.
 */
export async function interceptDownload(
  page: Page,
  action: () => Promise<void>
): Promise<{ fileName: string; buffer: Buffer; size: number; suggestedFilename: string }> {
  const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
  await action();
  const download = await downloadPromise;

  const suggestedFilename = download.suggestedFilename();
  const tempPath = await download.path();
  let buffer: Buffer;

  if (tempPath && fs.existsSync(tempPath)) {
    buffer = fs.readFileSync(tempPath);
  } else {
    // Read from stream if temp path is not directly accessible
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    buffer = Buffer.concat(chunks);
  }

  return {
    fileName: suggestedFilename,
    suggestedFilename,
    buffer,
    size: buffer.length
  };
}

/**
 * Validates downloaded plain text content.
 */
export function validateDownloadedText(buffer: Buffer, expectedSubstrings: string[] = []): string {
  const text = buffer.toString('utf-8');
  expect(text.length).toBeGreaterThan(0);
  for (const expected of expectedSubstrings) {
    expect(text).toContain(expected);
  }
  return text;
}

/**
 * Validates downloaded JSON content.
 */
export function validateDownloadedJson<T = any>(buffer: Buffer): T {
  const text = buffer.toString('utf-8');
  expect(text.length).toBeGreaterThan(0);
  const parsed = JSON.parse(text);
  expect(parsed).toBeTruthy();
  return parsed as T;
}

/**
 * Validates downloaded CSV content.
 */
export function validateDownloadedCsv(
  buffer: Buffer,
  expectedMinRows = 1
): { headers: string[]; rows: string[][] } {
  const text = buffer.toString('utf-8').trim();
  expect(text.length).toBeGreaterThan(0);
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  expect(lines.length).toBeGreaterThanOrEqual(expectedMinRows);

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map(l => l.split(',').map(c => c.trim().replace(/^"|"$/g, '')));
  return { headers, rows };
}

/**
 * Validates downloaded XLSX spreadsheet content.
 */
export function validateDownloadedXlsx(buffer: Buffer): {
  sheetNames: string[];
  firstSheetRows: any[][];
} {
  expect(buffer.length).toBeGreaterThan(0);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  expect(workbook.SheetNames.length).toBeGreaterThan(0);

  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  return {
    sheetNames: workbook.SheetNames,
    firstSheetRows: rows
  };
}

/**
 * Validates downloaded ZIP archive content.
 */
export async function validateDownloadedZip(
  buffer: Buffer,
  expectedMinFiles = 1
): Promise<{ entryNames: string[]; fileCount: number }> {
  expect(buffer.length).toBeGreaterThan(0);
  const zip = await JSZip.loadAsync(buffer);
  const entryNames = Object.keys(zip.files).filter(name => !zip.files[name].dir);
  expect(entryNames.length).toBeGreaterThanOrEqual(expectedMinFiles);
  return {
    entryNames,
    fileCount: entryNames.length
  };
}

/**
 * Validates downloaded PDF file with pdf-lib.
 */
export async function validateDownloadedPdf(
  buffer: Buffer,
  expectedMinPages = 1
): Promise<{ pageCount: number; title?: string; author?: string }> {
  expect(buffer.length).toBeGreaterThan(0);
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const pageCount = pdfDoc.getPageCount();
  expect(pageCount).toBeGreaterThanOrEqual(expectedMinPages);

  return {
    pageCount,
    title: pdfDoc.getTitle(),
    author: pdfDoc.getAuthor()
  };
}

/**
 * Sets up error recording on a Playwright page.
 */
export function setupErrorListener(page: Page): {
  consoleErrors: string[];
  pageErrors: Error[];
  failedRequests: string[];
} {
  const consoleErrors: string[] = [];
  const pageErrors: Error[] = [];
  const failedRequests: string[] = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Filter out benign browser warnings or known font warnings if any
      if (!text.includes('favicon.ico')) {
        consoleErrors.push(text);
      }
    }
  });

  page.on('pageerror', err => {
    pageErrors.push(err);
  });

  page.on('requestfailed', req => {
    if (!req.url().includes('favicon.ico')) {
      failedRequests.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText || 'failed'}`);
    }
  });

  return { consoleErrors, pageErrors, failedRequests };
}

/**
 * Reads the local processing history the way the app actually stores it.
 *
 * `HistoryService` goes through `@capacitor/preferences`, and on the web that
 * plugin keeps every value in `localStorage` under a `CapacitorStorage.`
 * prefix. Specs that read the bare `IFH_HISTORY_V2` key found nothing and had
 * been failing on that alone. Both spellings are checked because
 * `setupCapacitorMocks` installs an unprefixed stand-in, which takes effect
 * only when the app resolves the plugin through `window.Capacitor.Plugins`.
 */
export async function readHistory(page: Page): Promise<Array<Record<string, any>>> {
  const raw = await page.evaluate(() => {
    const KEY = 'IFH_HISTORY_V2';
    return localStorage.getItem(`CapacitorStorage.${KEY}`) ?? localStorage.getItem(KEY);
  });
  return raw ? JSON.parse(raw) : [];
}
