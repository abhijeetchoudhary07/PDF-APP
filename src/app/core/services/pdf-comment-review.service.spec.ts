import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { PdfCommentReviewService } from './pdf-comment-review.service';
import { makeTextPdf } from '../testing/k-editor-fixtures';
import { CommentThread } from '../models/editor-features.types';

/** pdf.js reports an annotation's text as `contentsObj.str`, not `contents`. */
const contentsOf = (annot: Record<string, unknown>): string =>
  (annot['contentsObj'] as { str?: string } | undefined)?.str ?? '';

/** Every annotation pdf.js can see, page by page. */
async function readAnnotations(bytes: Uint8Array): Promise<Record<string, unknown>[][]> {
  const task = pdfjsLib.getDocument({ data: new Uint8Array(bytes) } as never) as never as {
    promise: Promise<{ numPages: number; getPage: (n: number) => Promise<unknown> }>;
    destroy: () => Promise<void>;
  };
  try {
    const pdf = await task.promise;
    const out: Record<string, unknown>[][] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = (await pdf.getPage(i)) as {
        getAnnotations: () => Promise<Record<string, unknown>[]>;
      };
      out.push(await page.getAnnotations());
    }
    return out;
  } finally {
    await task.destroy().catch(() => undefined);
  }
}

describe('PdfCommentReviewService (K3)', () => {
  let service: PdfCommentReviewService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PdfCommentReviewService);
  });

  const threadWith = (over: Partial<CommentThread> = {}): CommentThread => ({
    id: 't1',
    pageNumber: 1,
    x: 60,
    y: 120,
    author: 'Asha Patel',
    initials: 'AP',
    createdAt: Date.UTC(2026, 9, 25, 9, 30),
    text: 'Please confirm the date on this line.',
    resolved: false,
    replies: [],
    ...over
  });

  describe('the thread model', () => {
    it('derives initials from one name and from two', () => {
      expect(service.createThread(1, 0, 0, 'x', 'Asha Patel').initials).toBe('AP');
      expect(service.createThread(1, 0, 0, 'x', 'Asha').initials).toBe('AS');
      expect(service.createThread(1, 0, 0, 'x', '').initials).toBe('U');
    });

    it('adds a reply under its thread', () => {
      const thread = service.createThread(2, 10, 20, 'Root note', 'Asha Patel');
      const reply = service.addReply(thread, 'Checked, it is correct.', 'Ravi Kumar');

      expect(thread.replies).toHaveLength(1);
      expect(reply.author).toBe('Ravi Kumar');
      expect(reply.initials).toBe('RK');
    });

    it('toggles resolved both ways', () => {
      const thread = service.createThread(1, 0, 0, 'x');

      expect(service.toggleResolved(thread)).toBe(true);
      expect(thread.resolved).toBe(true);
      expect(service.toggleResolved(thread)).toBe(false);
    });
  });

  describe('CSV summary', () => {
    it('writes one row per thread, with its replies as a count', () => {
      const threads = [
        threadWith({ replies: [] }),
        threadWith({
          id: 't2',
          pageNumber: 2,
          replies: [
            { id: 'r1', author: 'Ravi Kumar', initials: 'RK', createdAt: Date.now(), text: 'Fixed' }
          ]
        })
      ];

      const csv = service.generateCsvSummary(threads);
      const lines = csv.replace(/^﻿/, '').split('\r\n');

      /* Header plus the two threads; the reply shows as a count on its own
       * thread's row, which is what the feature's acceptance asks for. */
      expect(lines).toHaveLength(3);
      expect(service.summaryRows(threads)).toHaveLength(2);
      expect(service.summaryRows(threads)[1].repliesCount).toBe(1);
    });

    it('escapes a comment that carries a comma, a quote or a newline', () => {
      const csv = service.generateCsvSummary([
        threadWith({ text: 'Says "yes", then\nno' })
      ]);

      expect(csv).toContain('"Says ""yes"", then\nno"');
      /* Every field is quoted, so the embedded comma cannot split the row. */
      expect(csv.replace(/^﻿/, '').split('\r\n')[1].startsWith('"1","Asha Patel"')).toBe(true);
    });

    it('starts with a BOM so a spreadsheet reads it as UTF-8', () => {
      const csv = service.generateCsvSummary([threadWith({ author: 'आशा पटेल' })]);

      expect(csv.charCodeAt(0)).toBe(0xfeff);
      expect(csv).toContain('आशा पटेल');
    });

    it('records the resolved state', () => {
      const csv = service.generateCsvSummary([
        threadWith({ resolved: true }),
        threadWith({ id: 't2', resolved: false })
      ]);

      expect(csv).toContain('"Resolved"');
      expect(csv).toContain('"Open"');
    });
  });

  describe('PDF summary', () => {
    it('matches its row count to the thread and reply count', async () => {
      const threads = [
        threadWith({
          replies: [
            { id: 'r1', author: 'Ravi', initials: 'RA', createdAt: Date.now(), text: 'One' },
            { id: 'r2', author: 'Ravi', initials: 'RA', createdAt: Date.now(), text: 'Two' }
          ]
        }),
        threadWith({ id: 't2', pageNumber: 4, replies: [] })
      ];

      const result = await service.buildCommentSummary(threads, 'contract.pdf');

      expect(result.rowCount).toBe(2);
      expect(result.pageCount).toBeGreaterThanOrEqual(1);
    });

    it('paginates instead of writing off the bottom of the first page', async () => {
      const threads = Array.from({ length: 60 }, (_, index) =>
        threadWith({
          id: `t${index}`,
          pageNumber: index + 1,
          text: `Comment number ${index} with enough words in it to take a line or two of the report.`
        })
      );

      const result = await service.buildCommentSummary(threads);

      expect(result.pageCount).toBeGreaterThan(1);

      const doc = await PDFDocument.load(result.pdfBytes);
      expect(doc.getPageCount()).toBe(result.pageCount);
    });

    it('does not throw on a comment the standard fonts cannot encode', async () => {
      const result = await service.buildCommentSummary([
        threadWith({ text: 'कृपया तारीख जाँचें', author: 'आशा' })
      ]);

      expect(result.pdfBytes.byteLength).toBeGreaterThan(0);
      expect(result.droppedCharacters).toBeGreaterThan(0);
      expect(result.droppedSample.length).toBeGreaterThan(0);
    });

    it('reports nothing dropped for an ordinary Latin comment', async () => {
      const result = await service.buildCommentSummary([threadWith()]);

      expect(result.droppedCharacters).toBe(0);
      expect(result.droppedSample).toBe('');
    });

    it('handles an empty review', async () => {
      const result = await service.buildCommentSummary([]);

      expect(result.rowCount).toBe(0);
      expect(result.pageCount).toBe(1);
    });
  });

  describe('writing annotations', () => {
    const write = async (threads: CommentThread[]): Promise<Uint8Array> => {
      const pdfDoc = await PDFDocument.load(
        await makeTextPdf([{ width: 400, height: 600 }, { width: 400, height: 600 }]),
        { ignoreEncryption: true }
      );
      await service.applyCommentsToPdf(pdfDoc, threads);
      return pdfDoc.save({ useObjectStreams: false });
    };

    it('writes a note with no replies as a single /Text annotation', async () => {
      const annots = await readAnnotations(await write([threadWith()]));
      const texts = annots[0].filter(annot => annot['subtype'] === 'Text');

      expect(texts).toHaveLength(1);
      expect(contentsOf(texts[0])).toBe('Please confirm the date on this line.');
      expect(texts[0]['titleObj']).toMatchObject({ str: 'Asha Patel' });
    });

    it('places the note by its top-left corner in editor coordinates', async () => {
      const annots = await readAnnotations(await write([threadWith({ x: 60, y: 120 })]));
      const rect = (annots[0].find(annot => annot['subtype'] === 'Text')!['rect']) as number[];

      expect(rect[0]).toBeCloseTo(60, 1);
      /* Top-left y of 120 on a 600pt page: the icon's TOP is at 480. */
      expect(Math.max(rect[1], rect[3])).toBeCloseTo(480, 1);
    });

    it('chains replies to the thread root rather than to each other', async () => {
      const thread = threadWith({
        replies: [
          { id: 'r1', author: 'Ravi', initials: 'RA', createdAt: Date.now(), text: 'First reply' },
          { id: 'r2', author: 'Mira', initials: 'MI', createdAt: Date.now(), text: 'Second reply' }
        ]
      });

      const annots = (await readAnnotations(await write([thread])))[0];
      const replies = annots.filter(annot => annot['inReplyTo'] !== undefined);

      expect(replies).toHaveLength(2);
      /* Both point at the same root, which is what a flat thread means. */
      const roots = new Set(replies.map(reply => String(reply['inReplyTo'])));
      expect(roots.size).toBe(1);
      expect(replies.map(contentsOf).sort()).toEqual(['First reply', 'Second reply']);
    });

    it('gives each thread a popup and an appearance stream', async () => {
      const annots = (await readAnnotations(await write([threadWith()])))[0];

      expect(annots.some(annot => annot['subtype'] === 'Popup')).toBe(true);

      const pdfDoc = await PDFDocument.load(await write([threadWith()]), {
        ignoreEncryption: true
      });
      const raw = Buffer.from(await pdfDoc.save({ useObjectStreams: false })).toString('latin1');
      expect(raw).toContain('/AP');
    });

    it('writes each thread onto its own page', async () => {
      const annots = await readAnnotations(
        await write([threadWith(), threadWith({ id: 't2', pageNumber: 2, text: 'Second page' })])
      );

      expect(annots[0].filter(annot => annot['subtype'] === 'Text')).toHaveLength(1);
      expect(annots[1].filter(annot => annot['subtype'] === 'Text')).toHaveLength(1);
    });

    it('skips a thread whose page is outside the document', async () => {
      const annots = await readAnnotations(await write([threadWith({ pageNumber: 11 })]));

      expect(annots.flat().filter(annot => annot['subtype'] === 'Text')).toHaveLength(0);
    });

    it('keeps a comment written in Devanagari readable', async () => {
      const annots = await readAnnotations(
        await write([threadWith({ text: 'कृपया तारीख जाँचें', author: 'आशा पटेल' })])
      );

      const note = annots[0].find(annot => annot['subtype'] === 'Text')!;
      expect(contentsOf(note)).toBe('कृपया तारीख जाँचें');
    });
  });
});
