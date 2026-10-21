import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { AppIconComponent } from '../../../../shared/components/ui';
import { PdfEditorStateService } from '../../../../core/services/pdf-editor-state.service';
import { PdfCommentReviewService } from '../../../../core/services/pdf-comment-review.service';
import { StorageService } from '../../../../core/services/storage.service';
import { CommentThread } from '../../../../core/models/editor-features.types';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-comment-review-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent],
  template: `
    <div class="modal-wrapper">
      <div class="modal-header">
        <div class="header-title">
          <app-icon name="chatbox"></app-icon>
          <h3>Comment & Review Threads</h3>
        </div>
        <button class="close-btn" (click)="dismiss()" aria-label="Close">
          <app-icon name="close"></app-icon>
        </button>
      </div>

      <div class="modal-body">
        <!-- ADD THREAD CARD -->
        <div class="card add-card">
          <h4 class="card-title">Add Note on Page {{ state.currentPageNumber }}</h4>
          <div class="author-row">
            <input
              type="text"
              [(ngModel)]="authorName"
              placeholder="Your name"
              class="text-input author-input"
            />
            <input
              type="text"
              [(ngModel)]="authorInitials"
              maxlength="3"
              placeholder="Initials"
              class="text-input initials-input"
            />
          </div>
          <textarea
            [(ngModel)]="newCommentText"
            placeholder="Write comment or review note..."
            rows="2"
            class="textarea-input"
          ></textarea>
          <button class="primary-btn" (click)="addCommentThread()" [disabled]="!newCommentText.trim()">
            <app-icon name="add"></app-icon>
            <span>Post Comment</span>
          </button>
        </div>

        <!-- EXPORT ACTIONS STRIP -->
        <div class="export-strip">
          <button class="export-btn" (click)="exportSummaryCsv()" [disabled]="allThreads.length === 0">
            <app-icon name="document-text"></app-icon>
            <span>Export CSV</span>
          </button>
          <button class="export-btn" (click)="exportSummaryPdf()" [disabled]="allThreads.length === 0">
            <app-icon name="download"></app-icon>
            <span>Export Summary PDF</span>
          </button>
        </div>

        <!-- THREADS LIST -->
        <div class="threads-section">
          <h4 class="section-title">Review Threads ({{ allThreads.length }})</h4>
          @if (allThreads.length === 0) {
            <div class="empty-state">No comment threads yet. Add one above!</div>
          }
          <div class="threads-list">
            @for (thread of allThreads; track thread.id) {
              <div class="thread-card" [class.resolved]="thread.resolved">
                <div class="thread-header">
                  <div class="author-badge">
                    <span class="initials-avatar">{{ thread.initials }}</span>
                    <div>
                      <span class="author-name">{{ thread.author }}</span>
                      <span class="thread-page" (click)="jumpToPage(thread.pageNumber)">
                        Page {{ thread.pageNumber }}
                      </span>
                    </div>
                  </div>
                  <div class="status-actions">
                    <button
                      class="resolve-toggle-btn"
                      [class.is-resolved]="thread.resolved"
                      (click)="toggleResolve(thread)"
                    >
                      {{ thread.resolved ? 'Resolved' : 'Resolve' }}
                    </button>
                    <button class="icon-action-btn delete" (click)="deleteThread(thread)">
                      <app-icon name="trash"></app-icon>
                    </button>
                  </div>
                </div>

                <div class="thread-text">{{ thread.text }}</div>

                <!-- REPLIES LIST -->
                @if (thread.replies && thread.replies.length > 0) {
                  <div class="replies-list">
                    @for (reply of thread.replies; track reply.id) {
                      <div class="reply-bubble">
                        <span class="reply-author">{{ reply.author }}:</span>
                        <span class="reply-text">{{ reply.text }}</span>
                      </div>
                    }
                  </div>
                }

                <!-- QUICK REPLY ROW -->
                <div class="reply-input-row">
                  <input
                    type="text"
                    [(ngModel)]="replyTexts[thread.id]"
                    placeholder="Reply..."
                    class="reply-input"
                    (keyup.enter)="addReply(thread)"
                  />
                  <button
                    class="reply-send-btn"
                    (click)="addReply(thread)"
                    [disabled]="!replyTexts[thread.id]?.trim()"
                  >
                    Reply
                  </button>
                </div>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
      background: #ffffff;
    }
    .modal-wrapper {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #ffffff;
      color: var(--text-primary, #1e293b);
      font-family: inherit;
    }
    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      background: #ffffff;
      border-bottom: 1px solid var(--border-color, #e2e8f0);
    }
    .header-title {
      display: flex;
      align-items: center;
      gap: 10px;
      h3 { margin: 0; font-size: 1.15rem; font-weight: 700; }
      app-icon { font-size: 1.25rem; color: #f59e0b; }
    }
    .close-btn {
      background: transparent;
      border: none;
      padding: 8px;
      cursor: pointer;
      min-width: 44px;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
    }
    .modal-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px 16px max(32px, env(safe-area-inset-bottom, 32px)) 16px;
      -webkit-overflow-scrolling: touch;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .card {
      background: var(--bg-subtle, #f8fafc);
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: 12px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .card-title { margin: 0; font-size: 0.95rem; font-weight: 600; }
    .author-row {
      display: flex;
      gap: 8px;
    }
    .author-input { flex: 2; }
    .initials-input { flex: 1; max-width: 90px; text-transform: uppercase; }
    .text-input, .textarea-input {
      width: 100%;
      min-height: 44px;
      padding: 8px 12px;
      font-size: 0.92rem;
      border: 1px solid var(--border-color, #cbd5e1);
      border-radius: 8px;
      background: var(--bg-surface, #ffffff);
      color: inherit;
      box-sizing: border-box;
      font-family: inherit;
    }
    .primary-btn {
      min-height: 44px;
      border: none;
      border-radius: 8px;
      background: #f59e0b;
      color: #ffffff;
      font-size: 0.9rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
    }
    .primary-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .export-strip {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .export-btn {
      flex: 1;
      min-height: 44px;
      min-width: 140px;
      border: 1px solid var(--border-color, #cbd5e1);
      background: var(--bg-subtle, #f8fafc);
      border-radius: 8px;
      font-size: 0.82rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      cursor: pointer;

      @media (max-width: 360px) {
        min-width: 100%;
      }
    }
    .export-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .threads-section {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .section-title { margin: 0; font-size: 0.95rem; font-weight: 600; }
    .empty-state {
      padding: 16px;
      text-align: center;
      color: #64748b;
      font-size: 0.88rem;
    }
    .threads-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-height: 320px;
      overflow-y: auto;
    }
    .thread-card {
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: 10px;
      padding: 12px;
      background: var(--bg-surface, #ffffff);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .thread-card.resolved {
      opacity: 0.7;
      background: #f8fafc;
    }
    .thread-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .author-badge {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .initials-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: #fde68a;
      color: #92400e;
      font-size: 0.75rem;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .author-name { font-size: 0.88rem; font-weight: 600; display: block; }
    .thread-page { font-size: 0.75rem; color: #3b82f6; cursor: pointer; text-decoration: underline; }
    .status-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .resolve-toggle-btn {
      min-height: 36px;
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid #10b981;
      background: #ecfdf5;
      color: #065f46;
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
    }
    .resolve-toggle-btn.is-resolved {
      border-color: #64748b;
      background: #f1f5f9;
      color: #475569;
    }
    .icon-action-btn {
      min-width: 44px;
      min-height: 44px;
      border: none;
      background: transparent;
      color: #ef4444;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .thread-text { font-size: 0.9rem; line-height: 1.4; word-break: break-word; }
    .replies-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding-left: 12px;
      border-left: 2px solid #e2e8f0;
      margin-top: 4px;
    }
    .reply-bubble {
      font-size: 0.85rem;
      line-height: 1.35;
      background: var(--bg-subtle, #f8fafc);
      padding: 6px 10px;
      border-radius: 6px;
    }
    .reply-author { font-weight: 600; margin-right: 4px; color: #334155; }
    .reply-input-row {
      display: flex;
      gap: 6px;
      margin-top: 6px;
    }
    .reply-input {
      flex: 1;
      min-height: 44px;
      padding: 6px 10px;
      font-size: 0.88rem;
      border: 1px solid var(--border-color, #cbd5e1);
      border-radius: 8px;
      background: var(--bg-surface, #ffffff);
    }
    .reply-send-btn {
      min-height: 44px;
      min-width: 60px;
      padding: 4px 14px;
      border: none;
      border-radius: 8px;
      background: #3b82f6;
      color: #ffffff;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
    }
    .reply-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  `]
})
export class PdfCommentReviewModalComponent implements OnInit {
  state = inject(PdfEditorStateService);
  private commentService = inject(PdfCommentReviewService);
  private storageService = inject(StorageService);
  private modalCtrl = inject(ModalController);

  authorName = 'Reviewer';
  authorInitials = 'REV';
  newCommentText = '';
  replyTexts: Record<string, string> = {};

  allThreads: CommentThread[] = [];

  ngOnInit() {
    this.refreshThreads();
  }

  refreshThreads() {
    const doc = this.state.document;
    if (!doc) return;
    this.allThreads = doc.pages.flatMap(p => p.comments || []);
  }

  addCommentThread() {
    if (!this.newCommentText.trim()) return;

    const pageNum = this.state.currentPageNumber;
    this.state.addCommentThread({
      pageNumber: pageNum,
      x: 60,
      y: 120,
      author: this.authorName.trim() || 'Reviewer',
      initials: (this.authorInitials.trim() || 'REV').slice(0, 3).toUpperCase(),
      text: this.newCommentText.trim()
    });

    this.newCommentText = '';
    this.refreshThreads();
  }

  addReply(thread: CommentThread) {
    const text = this.replyTexts[thread.id]?.trim();
    if (!text) return;

    this.state.addCommentReply(thread.id, {
      author: this.authorName.trim() || 'Reviewer',
      initials: (this.authorInitials.trim() || 'REV').slice(0, 3).toUpperCase(),
      text
    });

    this.replyTexts[thread.id] = '';
    this.refreshThreads();
  }

  toggleResolve(thread: CommentThread) {
    this.state.resolveCommentThread(thread.id, !thread.resolved);
    this.refreshThreads();
  }

  deleteThread(thread: CommentThread) {
    this.state.deleteCommentThread(thread.id);
    this.refreshThreads();
  }

  jumpToPage(pageNumber: number) {
    this.state.setCurrentPage(pageNumber);
  }

  exportSummaryCsv() {
    const csvContent = this.commentService.exportCommentsCsv(this.allThreads);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const file = new File([blob], `comment_summary_${Date.now()}.csv`, { type: 'text/csv' });
    this.storageService.saveFile(file, 'document');
  }

  async exportSummaryPdf() {
    const pdfBytes = await this.commentService.generateCommentSummaryPdf(
      this.allThreads,
      this.state.document?.name || 'document.pdf'
    );
    const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
    const file = new File([blob], `comment_report_${Date.now()}.pdf`, { type: 'application/pdf' });
    await this.storageService.saveFile(file, 'document');
  }

  dismiss() {
    this.modalCtrl.dismiss();
  }
}
