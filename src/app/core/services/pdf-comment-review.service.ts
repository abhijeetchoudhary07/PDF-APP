import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import {
  PDFDocument,
  PDFName,
  PDFString,
  PDFArray,
  StandardFonts,
  rgb
} from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import {
  CommentThread,
  CommentReply,
  CommentSummaryRow
} from '../models/editor-features.types';
import { PdfEditorDocument } from '../models/pdf-editor.types';

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2) + Date.now().toString(36);

@Injectable({
  providedIn: 'root'
})
export class PdfCommentReviewService {
  constructor() {}

  /**
   * Creates a new top-level comment thread
   */
  createThread(
    pageNumber: number,
    x: number,
    y: number,
    text: string,
    author: string = 'User'
  ): CommentThread {
    const initials = this.getInitials(author);
    return {
      id: generateId(),
      pageNumber,
      x,
      y,
      author,
      initials,
      createdAt: Date.now(),
      text,
      resolved: false,
      replies: []
    };
  }

  /**
   * Adds a reply to an existing comment thread
   */
  addReply(
    thread: CommentThread,
    text: string,
    author: string = 'User'
  ): CommentReply {
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

  /**
   * Toggles resolve state
   */
  toggleResolved(thread: CommentThread): boolean {
    thread.resolved = !thread.resolved;
    return thread.resolved;
  }

  /**
   * Generates CSV export summary for review
   */
  generateCsvSummary(threads: CommentThread[]): string {
    const headers = ['Page', 'Author', 'Initials', 'Date', 'Status', 'Comment', 'RepliesCount'];
    const rows = threads.map(t => {
      const dateStr = new Date(t.createdAt).toISOString().split('T')[0];
      const sanitizedText = `"${t.text.replace(/"/g, '""')}"`;
      const status = t.resolved ? 'Resolved' : 'Open';
      return [t.pageNumber, `"${t.author}"`, t.initials, dateStr, status, sanitizedText, t.replies.length].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  exportCommentsCsv(threads: CommentThread[]): string {
    return this.generateCsvSummary(threads);
  }

  /**
   * Generates a PDF summary report document
   */
  async generatePdfSummary(
    threads: CommentThread[],
    docTitle: string = 'Document'
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage([595, 842]); // A4
    const { width, height } = page.getSize();

    // Header
    page.drawText('Comment & Review Summary Report', {
      x: 40,
      y: height - 50,
      size: 18,
      font: fontBold,
      color: rgb(0.1, 0.2, 0.4)
    });

    page.drawText(`Document: ${docTitle} • Total Threads: ${threads.length}`, {
      x: 40,
      y: height - 72,
      size: 11,
      font,
      color: rgb(0.4, 0.4, 0.5)
    });

    let currentY = height - 110;

    for (let i = 0; i < threads.length; i++) {
      const thread = threads[i];
      if (currentY < 90) {
        // Need new page
        const newPage = pdfDoc.addPage([595, 842]);
        currentY = height - 60;
      }

      const status = thread.resolved ? '[RESOLVED]' : '[OPEN]';
      const statusColor = thread.resolved ? rgb(0.1, 0.6, 0.2) : rgb(0.8, 0.3, 0.1);

      page.drawText(`Thread #${i + 1} — Page ${thread.pageNumber} • ${thread.author} (${status})`, {
        x: 40,
        y: currentY,
        size: 11,
        font: fontBold,
        color: statusColor
      });
      currentY -= 16;

      page.drawText(thread.text.slice(0, 90), {
        x: 50,
        y: currentY,
        size: 10,
        font,
        color: rgb(0.15, 0.15, 0.15)
      });
      currentY -= 14;

      for (const reply of thread.replies) {
        page.drawText(`↳ ${reply.author}: ${reply.text.slice(0, 80)}`, {
          x: 65,
          y: currentY,
          size: 9,
          font,
          color: rgb(0.35, 0.35, 0.35)
        });
        currentY -= 12;
      }

      currentY -= 8;
    }

    return await pdfDoc.save();
  }

  async generateCommentSummaryPdf(
    threads: CommentThread[],
    docTitle: string = 'Document'
  ): Promise<Uint8Array> {
    return this.generatePdfSummary(threads, docTitle);
  }

  /**
   * Applies comment threads to PDF using standard /Text and /IRT (In-Reply-To) reply chains
   */
  async applyCommentsToPdf(
    pdfDoc: PDFDocument,
    threads: CommentThread[]
  ): Promise<void> {
    const pages = pdfDoc.getPages();
    const context = pdfDoc.context;

    for (const thread of threads) {
      const pageIndex = thread.pageNumber - 1;
      if (pageIndex < 0 || pageIndex >= pages.length) continue;

      const page = pages[pageIndex];
      const pageHeight = page.getHeight();
      const pdfY = pageHeight - thread.y - 20;

      // Top-level sticky note /Text annotation
      const threadAnnot = context.obj({
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of('Text'),
        Rect: [thread.x, pdfY, thread.x + 24, pdfY + 24],
        Contents: PDFString.of(thread.text),
        T: PDFString.of(thread.author),
        Name: PDFName.of('Comment'),
        Open: false
      });

      const threadRef = context.register(threadAnnot);
      let annots = page.node.lookup(PDFName.of('Annots'));
      if (!annots) {
        annots = context.obj([threadRef]);
        page.node.set(PDFName.of('Annots'), annots);
      } else if (annots instanceof PDFArray) {
        annots.push(threadRef);
      }

      // Add replies with /IRT (In-Reply-To) pointing to root thread
      let parentRef = threadRef;
      for (const reply of thread.replies) {
        const replyAnnot = context.obj({
          Type: PDFName.of('Annot'),
          Subtype: PDFName.of('Text'),
          Rect: [thread.x, pdfY, thread.x + 24, pdfY + 24],
          Contents: PDFString.of(reply.text),
          T: PDFString.of(reply.author),
          IRT: parentRef,
          RT: PDFName.of('R'), // Reply
          Open: false
        });

        const replyRef = context.register(replyAnnot);
        (annots as PDFArray).push(replyRef);
        parentRef = replyRef;
      }
    }
  }

  private getInitials(name: string): string {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
}
