import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import {
  PDFArray,
  PDFDocument,
  PDFFont,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFString,
  StandardFonts,
  rgb
} from 'pdf-lib';
import {
  CommentReply,
  CommentSummaryResult,
  CommentSummaryRow,
  CommentThread
} from '../models/editor-features.types';
import { PdfLayoutHelper } from '../conversion/utils/pdf-layout.helper';

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2) + Date.now().toString(36);

/* A4, and the margins the summary report lays out against. */
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 40;
const BOTTOM_LIMIT = 60;

/**
 * K3 — Sticky notes grown into a review workflow.
 *
 * The existing note tool is untouched: a note with no replies is still
 * written as the same single /Text annotation it always was. What this adds
 * is the thread around it — replies, a resolved state, an author — and the
 * two exports a reviewer actually needs.
 *
 * Replies are written the way the format defines them, as further /Text
 * annotations carrying /IRT pointing back at the thread's root and /RT /R,
 * so Acrobat, Preview and Firefox all show them as a conversation rather
 * than as a pile of separate notes in the same spot. Each thread also gets a
 * /Popup, because a note without one opens as a bare icon in several
 * viewers, and an appearance stream, because an annotation with no /AP is
 * invisible in viewers that do not synthesise one — and cannot be flattened
 * by K7 either.
 */
@Injectable({
  providedIn: 'root'
})
export class PdfCommentReviewService {
  // ════════════════════════════════════════════════════════════════════
  // The thread model
  // ════════════════════════════════════════════════════════════════════

  createThread(
    pageNumber: number,
    x: number,
    y: number,
    text: string,
    author = 'User'
  ): CommentThread {
    return {
      id: generateId(),
      pageNumber,
      x,
      y,
      author,
      initials: this.getInitials(author),
      createdAt: Date.now(),
      text,
      resolved: false,
      replies: []
    };
  }

  addReply(thread: CommentThread, text: string, author = 'User'): CommentReply {
    const reply: CommentReply = {
      id: generateId(),
      author,
      initials: this.getInitials(author),
      createdAt: Date.now(),
      text
    };
    thread.replies.push(reply);
    return reply;
  }

  toggleResolved(thread: CommentThread): boolean {
    thread.resolved = !thread.resolved;
    return thread.resolved;
  }

  /**
   * One row per thread, in page order.
   *
   * Replies are a count here rather than rows of their own: the CSV is the
   * list a reviewer sorts and filters, and one line per thread is what makes
   * that work. The reply text goes into the PDF report, which is the form
   * meant to be read.
   */
  summaryRows(threads: CommentThread[]): CommentSummaryRow[] {
    return this.inPageOrder(threads).map(thread => ({
      page: thread.pageNumber,
      author: thread.author,
      initials: thread.initials,
      date: this.isoDate(thread.createdAt),
      text: thread.text,
      status: thread.resolved ? 'Resolved' : 'Open',
      repliesCount: thread.replies.length
    }));
  }

  // ════════════════════════════════════════════════════════════════════
  // CSV export
  // ════════════════════════════════════════════════════════════════════

  /**
   * The review as a spreadsheet.
   *
   * Prefixed with a BOM so Excel opens a Devanagari or Bengali author name
   * as UTF-8 rather than as mojibake, and every field is quoted, because a
   * comment containing a comma or a line break is the normal case here, not
   * an edge one.
   */
  generateCsvSummary(threads: CommentThread[]): string {
    /* The header is plain: these names carry no commas, and an unquoted
     * first row is what a spreadsheet expects to find. */
    const header = 'Page,Author,Initials,Date,Status,Comment,RepliesCount';
    const rows = this.summaryRows(threads).map(row =>
      [
        String(row.page),
        row.author,
        row.initials,
        row.date,
        row.status,
        row.text,
        String(row.repliesCount)
      ]
        .map(field => this.csvField(field))
        .join(',')
    );

    return `﻿${[header, ...rows].join('\r\n')}`;
  }

  /** `generateCsvSummary` under the name the modal first called it by. */
  exportCommentsCsv(threads: CommentThread[]): string {
    return this.generateCsvSummary(threads);
  }

  private csvField(value: string): string {
    return `"${(value ?? '').replace(/"/g, '""')}"`;
  }

  // ════════════════════════════════════════════════════════════════════
  // PDF export
  // ════════════════════════════════════════════════════════════════════

  /**
   * The review as a readable report.
   *
   * Text is wrapped and paginated rather than cut at a character count, and
   * every string goes through the WinAnsi guard first: the standard fonts
   * throw on a character they cannot encode, so one Hindi comment in the
   * list would otherwise take the whole export down. Characters that have to
   * be dropped are counted and reported, never swapped in silence.
   */
  async buildCommentSummary(
    threads: CommentThread[],
    docTitle = 'Document'
  ): Promise<CommentSummaryResult> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const ordered = this.inPageOrder(threads);
    const dropped = { count: 0, samples: new Set<string>() };

    const safe = (value: string): string => {
      const result = PdfLayoutHelper.toDrawableText(value ?? '');
      dropped.count += result.dropped;
      if (result.sample) dropped.samples.add(result.sample);
      return result.text;
    };

    let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - 54;

    /*
     * The bug this replaces: the first version called addPage() and then
     * kept drawing on the original page object, so everything past the first
     * screenful was written off the bottom of page one and lost.
     */
    const newPage = () => {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - 54;
    };

    const ensureRoom = (needed: number) => {
      if (y - needed < BOTTOM_LIMIT) newPage();
    };

    const writeLines = (
      text: string,
      options: { font: PDFFont; size: number; indent: number; color: ReturnType<typeof rgb> }
    ) => {
      const maxWidth = PAGE_WIDTH - MARGIN * 2 - options.indent;
      const lines = PdfLayoutHelper.wrapText(text, options.font, options.size, maxWidth);
      const lineHeight = options.size * 1.35;

      for (const line of lines) {
        ensureRoom(lineHeight);
        page.drawText(line, {
          x: MARGIN + options.indent,
          y,
          size: options.size,
          font: options.font,
          color: options.color
        });
        y -= lineHeight;
      }
    };

    page.drawText(safe('Comment & review summary'), {
      x: MARGIN,
      y,
      size: 18,
      font: bold,
      color: rgb(0.1, 0.17, 0.34)
    });
    y -= 24;

    const openCount = ordered.filter(thread => !thread.resolved).length;
    page.drawText(
      safe(
        `${docTitle} — ${ordered.length} thread${ordered.length === 1 ? '' : 's'}, ${openCount} open`
      ),
      { x: MARGIN, y, size: 10.5, font, color: rgb(0.35, 0.4, 0.47) }
    );
    y -= 28;

    ordered.forEach((thread, index) => {
      ensureRoom(46);

      const status = thread.resolved ? 'Resolved' : 'Open';
      writeLines(
        safe(`${index + 1}. Page ${thread.pageNumber} · ${thread.author} · ${status}`),
        {
          font: bold,
          size: 11,
          indent: 0,
          color: thread.resolved ? rgb(0.05, 0.42, 0.24) : rgb(0.65, 0.3, 0.05)
        }
      );

      writeLines(safe(thread.text), {
        font,
        size: 10.5,
        indent: 12,
        color: rgb(0.11, 0.13, 0.18)
      });

      for (const reply of thread.replies) {
        writeLines(safe(`- ${reply.author}: ${reply.text}`), {
          font,
          size: 10,
          indent: 26,
          color: rgb(0.33, 0.36, 0.42)
        });
      }

      y -= 10;
    });

    const pdfBytes = await pdfDoc.save({ useObjectStreams: false });

    return {
      pdfBytes,
      rowCount: this.summaryRows(ordered).length,
      droppedCharacters: dropped.count,
      droppedSample: [...dropped.samples].join(' '),
      pageCount: pdfDoc.getPageCount()
    };
  }

  /**
   * The report's bytes alone.
   *
   * Both of these keep the signature they shipped with. The richer result,
   * with its dropped-character report, is `buildCommentSummary`.
   */
  async generateCommentSummaryPdf(
    threads: CommentThread[],
    docTitle = 'Document'
  ): Promise<Uint8Array> {
    return (await this.buildCommentSummary(threads, docTitle)).pdfBytes;
  }

  async generatePdfSummary(threads: CommentThread[], docTitle = 'Document'): Promise<Uint8Array> {
    return this.generateCommentSummaryPdf(threads, docTitle);
  }

  // ════════════════════════════════════════════════════════════════════
  // Writing threads into the file
  // ════════════════════════════════════════════════════════════════════

  /**
   * Writes every thread as standard annotations other viewers understand.
   *
   * `y` arrives top-left origin like everything else in Part K, and is
   * flipped here. The icon is placed by its top-left corner rather than
   * centred on the click, which is where a sticky note looks like it belongs.
   */
  async applyCommentsToPdf(pdfDoc: PDFDocument, threads: CommentThread[]): Promise<void> {
    const pages = pdfDoc.getPages();
    const context = pdfDoc.context;
    const iconSize = 22;

    for (const thread of threads) {
      const pageIndex = thread.pageNumber - 1;
      if (pageIndex < 0 || pageIndex >= pages.length) continue;

      const page = pages[pageIndex];
      const pageHeight = page.getHeight();

      const left = thread.x;
      const bottom = pageHeight - thread.y - iconSize;
      const rect = context.obj([left, bottom, left + iconSize, bottom + iconSize]);

      const appearance = this.noteAppearance(pdfDoc, iconSize, thread.resolved);

      const rootRef = context.nextRef();
      const popupRef = context.nextRef();

      const root = context.obj({
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of('Text'),
        Rect: rect,
        Contents: PDFHexString.fromText(thread.text),
        T: PDFHexString.fromText(thread.author),
        Name: PDFName.of(thread.resolved ? 'Checkmark' : 'Comment'),
        /* 4 = Print: a review note that vanishes when the page is printed is
         * not much use to the person doing the review. */
        F: PDFNumber.of(4),
        M: PDFString.of(this.pdfDate(thread.createdAt)),
        CreationDate: PDFString.of(this.pdfDate(thread.createdAt)),
        C: context.obj(thread.resolved ? [0.26, 0.73, 0.51] : [1, 0.84, 0.25]),
        Open: false,
        Popup: popupRef,
        AP: context.obj({ N: appearance })
      });
      context.assign(rootRef, root);

      context.assign(
        popupRef,
        context.obj({
          Type: PDFName.of('Annot'),
          Subtype: PDFName.of('Popup'),
          Rect: context.obj([
            left + iconSize,
            Math.max(0, bottom - 90),
            Math.min(page.getWidth(), left + iconSize + 190),
            bottom + iconSize
          ]),
          Parent: rootRef,
          Open: false
        })
      );

      const refs: PDFRef[] = [rootRef, popupRef];

      for (const reply of thread.replies) {
        const replyRef = context.nextRef();
        context.assign(
          replyRef,
          context.obj({
            Type: PDFName.of('Annot'),
            Subtype: PDFName.of('Text'),
            Rect: rect,
            Contents: PDFHexString.fromText(reply.text),
            T: PDFHexString.fromText(reply.author),
            Name: PDFName.of('Comment'),
            F: PDFNumber.of(4),
            M: PDFString.of(this.pdfDate(reply.createdAt)),
            CreationDate: PDFString.of(this.pdfDate(reply.createdAt)),
            /*
             * Every reply points at the ROOT, not at the reply before it.
             * A chain of IRTs pointing at each other reads as a reply to a
             * reply to a reply, which is not what a flat thread is.
             */
            IRT: rootRef,
            RT: PDFName.of('R'),
            Open: false
          })
        );
        refs.push(replyRef);
      }

      const annots = page.node.lookup(PDFName.of('Annots'));
      if (annots instanceof PDFArray) {
        for (const ref of refs) annots.push(ref);
      } else {
        page.node.set(PDFName.of('Annots'), context.obj(refs));
      }
    }
  }

  /**
   * A small appearance stream for the note icon.
   *
   * Without one the note is invisible in any viewer that does not generate
   * its own — and there is nothing for K7 to flatten, so "flatten
   * annotations" would quietly drop every comment in the document.
   */
  private noteAppearance(pdfDoc: PDFDocument, size: number, resolved: boolean) {
    const fill = resolved ? '0.26 0.73 0.51' : '1 0.84 0.25';
    const half = size / 2;
    const corner = size * 0.18;

    const operators = [
      'q',
      `${fill} rg`,
      '0.25 0.28 0.33 RG',
      '0.6 w',
      /* A rounded-ish speech bubble: a rectangle plus a tail. */
      `${corner} ${corner} m`,
      `${size - corner} ${corner} l`,
      `${size - corner} ${size - corner} l`,
      `${corner} ${size - corner} l`,
      'h',
      `${corner + 2} ${corner} m`,
      `${half} ${corner - 3} l`,
      `${half + 4} ${corner} l`,
      'h',
      'B',
      'Q'
    ].join('\n');

    return pdfDoc.context.register(
      pdfDoc.context.stream(operators, {
        Type: PDFName.of('XObject'),
        Subtype: PDFName.of('Form'),
        BBox: pdfDoc.context.obj([0, 0, size, size]),
        Resources: pdfDoc.context.obj({})
      })
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // Helpers
  // ════════════════════════════════════════════════════════════════════

  private inPageOrder(threads: CommentThread[]): CommentThread[] {
    return [...(threads || [])].sort((a, b) =>
      a.pageNumber !== b.pageNumber ? a.pageNumber - b.pageNumber : a.y - b.y
    );
  }

  private isoDate(timestamp: number): string {
    return new Date(timestamp).toISOString().split('T')[0];
  }

  /** `D:YYYYMMDDHHmmSSZ`, the date format annotations are written in. */
  private pdfDate(timestamp: number): string {
    const date = new Date(timestamp);
    const pad = (value: number) => String(value).padStart(2, '0');
    return (
      `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
      `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
    );
  }

  private getInitials(name: string): string {
    const trimmed = (name || '').trim();
    if (!trimmed) return 'U';

    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
}
