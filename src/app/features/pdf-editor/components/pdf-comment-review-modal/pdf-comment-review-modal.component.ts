import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { AppIconComponent, TranslatePipe } from '../../../../shared/components/ui';
import { PdfEditorStateService } from '../../../../core/services/pdf-editor-state.service';
import { PdfCommentReviewService } from '../../../../core/services/pdf-comment-review.service';
import { StorageService } from '../../../../core/services/storage.service';
import { HistoryService } from '../../../../core/services/history.service';
import { CommentThread } from '../../../../core/models/editor-features.types';

/**
 * K3 — the review sheet.
 *
 * The existing sticky-note tool is untouched; this is the conversation
 * around it. A thread with no replies behaves exactly as a note always did,
 * which is the point: adding review to the editor should not change what
 * the note tool already does.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-comment-review-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent, TranslatePipe],
  templateUrl: './pdf-comment-review-modal.component.html',
  styleUrls: ['./pdf-comment-review-modal.component.scss']
})
export class PdfCommentReviewModalComponent implements OnInit {
  state = inject(PdfEditorStateService);
  private commentReview = inject(PdfCommentReviewService);
  private storage = inject(StorageService);
  private history = inject(HistoryService);
  private modalCtrl = inject(ModalController);

  author = 'Reviewer';
  newComment = '';
  replyText: Record<string, string> = {};

  threads: CommentThread[] = [];
  isExporting = false;
  statusKey: string | null = null;
  statusParams: Record<string, string | number> = {};

  get openCount(): number {
    return this.threads.filter(thread => !thread.resolved).length;
  }

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    const doc = this.state.document;
    this.threads = doc ? doc.pages.flatMap(page => page.comments || []) : [];
  }

  private get initials(): string {
    const parts = (this.author || 'Reviewer').trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /** Adds the thread at a default spot on the current page. */
  addThread(): void {
    if (!this.newComment.trim() || !this.state.document) return;

    this.state.addCommentThread({
      pageNumber: this.state.currentPageNumber,
      x: 56,
      y: 96,
      author: (this.author || 'Reviewer').trim(),
      initials: this.initials,
      text: this.newComment.trim()
    });

    this.newComment = '';
    this.refresh();
  }

  /** Hands the thread to the canvas, where the pin is placed by tapping. */
  placeOnPage(): void {
    if (!this.newComment.trim() || !this.state.document) return;

    this.state.startPlacement('comment', {
      author: (this.author || 'Reviewer').trim(),
      initials: this.initials,
      text: this.newComment.trim()
    });

    this.newComment = '';
    this.modalCtrl.dismiss({ placing: 'comment' });
  }

  addReply(thread: CommentThread): void {
    const text = (this.replyText[thread.id] || '').trim();
    if (!text) return;

    this.state.addCommentReply(thread.id, {
      author: (this.author || 'Reviewer').trim(),
      initials: this.initials,
      text
    });

    this.replyText[thread.id] = '';
    this.refresh();
  }

  toggleResolved(thread: CommentThread): void {
    this.state.resolveCommentThread(thread.id, !thread.resolved);
    this.refresh();
  }

  deleteThread(thread: CommentThread): void {
    this.state.deleteCommentThread(thread.id);
    this.refresh();
  }

  jumpTo(thread: CommentThread): void {
    this.state.setCurrentPage(thread.pageNumber);
  }

  // ── Exports ────────────────────────────────────────────────────────

  async exportCsv(): Promise<void> {
    if (this.threads.length === 0) return;

    this.isExporting = true;
    this.statusKey = null;

    try {
      const csv = this.commentReview.generateCsvSummary(this.threads);
      const name = this.outputName('comments', 'csv');
      const file = new File([csv], name, { type: 'text/csv;charset=utf-8' });

      /* Through StorageService, which is where the free-tier daily quota
       * lives — saving around it would be saving around monetization. */
      const uri = await this.storage.saveFile(file, 'document');
      await this.recordOutput(file, uri);

      this.statusKey = 'editor.kSavedAs';
      this.statusParams = { name };
    } catch (error) {
      this.reportFailure(error);
    } finally {
      this.isExporting = false;
    }
  }

  async exportPdf(): Promise<void> {
    if (this.threads.length === 0) return;

    this.isExporting = true;
    this.statusKey = null;

    try {
      const result = await this.commentReview.buildCommentSummary(
        this.threads,
        this.state.document?.name || 'document.pdf'
      );

      const name = this.outputName('comment-report', 'pdf');
      const file = new File([result.pdfBytes as BlobPart], name, { type: 'application/pdf' });
      const uri = await this.storage.saveFile(file, 'document');
      await this.recordOutput(file, uri);

      if (result.droppedCharacters > 0) {
        this.statusKey = 'editor.frDroppedChars';
        this.statusParams = {
          count: result.droppedCharacters,
          sample: result.droppedSample
        };
      } else {
        this.statusKey = 'editor.kSavedAs';
        this.statusParams = { name };
      }
    } catch (error) {
      this.reportFailure(error);
    } finally {
      this.isExporting = false;
    }
  }

  private outputName(suffix: string, extension: string): string {
    const base = (this.state.document?.name || 'document').replace(/\.pdf$/i, '');
    return `${base}_${suffix}.${extension}`;
  }

  private async recordOutput(file: File, uri: string | null | undefined): Promise<void> {
    await this.history.addHistoryItem({
      operation: 'pdf-editor-comments',
      originalFileName: this.state.document?.name || 'document.pdf',
      outputFileName: file.name,
      originalSizeBytes: this.state.document?.sizeBytes || 0,
      outputSizeBytes: file.size,
      outputPath: uri || 'web-download'
    });
  }

  private reportFailure(error: unknown): void {
    console.error('Comment export failed', error);
    this.statusKey = 'editor.kFailed';
    this.statusParams = {
      reason: error instanceof Error ? error.message : String(error)
    };
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }
}
