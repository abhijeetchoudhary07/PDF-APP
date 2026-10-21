import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { AppIconComponent } from '../../../../shared/components/ui';
import { PdfEditorStateService } from '../../../../core/services/pdf-editor-state.service';
import { PdfLinkEditorService } from '../../../../core/services/pdf-link-editor.service';
import { PdfHyperlink, LinkAuditReport } from '../../../../core/models/editor-features.types';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-link-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent],
  template: `
    <div class="modal-wrapper">
      <div class="modal-header">
        <div class="header-title">
          <app-icon name="link"></app-icon>
          <h3>Hyperlink Manager</h3>
        </div>
        <button class="close-btn" (click)="dismiss()" aria-label="Close">
          <app-icon name="close"></app-icon>
        </button>
      </div>

      <div class="modal-body">
        <!-- ADD LINK CARD -->
        <div class="card add-card">
          <h4 class="card-title">Add Link to Page {{ state.currentPageNumber }}</h4>

          <div class="type-toggle">
            <button
              class="type-btn"
              [class.active]="newLinkType === 'url'"
              (click)="newLinkType = 'url'"
            >
              Web URL
            </button>
            <button
              class="type-btn"
              [class.active]="newLinkType === 'page'"
              (click)="newLinkType = 'page'"
            >
              Jump to Page
            </button>
          </div>

          @if (newLinkType === 'url') {
            <label class="field-label">Target URL</label>
            <input
              type="url"
              [(ngModel)]="newLinkUrl"
              placeholder="https://example.com"
              class="text-input"
            />
          } @else {
            <label class="field-label">Destination Page Number (1 to {{ totalPages }})</label>
            <input
              type="number"
              [(ngModel)]="newLinkTargetPage"
              [min]="1"
              [max]="totalPages"
              class="text-input"
            />
          }

          <button class="primary-btn" (click)="addLink()" [disabled]="!isFormValid()">
            <app-icon name="add"></app-icon>
            <span>Add Hyperlink</span>
          </button>
        </div>

        <!-- AUDIT SUMMARY STRIP -->
        <div class="audit-strip">
          <div class="stat-box">
            <span class="stat-num">{{ auditReport.totalLinks }}</span>
            <span class="stat-label">Total Links</span>
          </div>
          <div class="stat-box">
            <span class="stat-num">{{ auditReport.urlLinksCount }}</span>
            <span class="stat-label">Web URLs</span>
          </div>
          <div class="stat-box">
            <span class="stat-num">{{ auditReport.pageLinksCount }}</span>
            <span class="stat-label">Page Jumps</span>
          </div>
          <div class="stat-box" [class.has-dangling]="auditReport.danglingLinksCount > 0">
            <span class="stat-num">{{ auditReport.danglingLinksCount }}</span>
            <span class="stat-label">Dangling</span>
          </div>
        </div>

        <!-- LINKS REVIEW LIST -->
        <div class="links-section">
          <h4 class="section-title">Document Links Review</h4>
          @if (allLinks.length === 0) {
            <div class="empty-state">No hyperlinks detected in document.</div>
          }
          <div class="links-list">
            @for (link of allLinks; track link.id) {
              <div class="link-item" [class.dangling]="link.isDangling">
                <div class="link-info" (click)="jumpToPage(link.pageNumber)">
                  <div class="badge-row">
                    <span class="page-badge">Page {{ link.pageNumber }}</span>
                    <span class="kind-badge" [class.url]="link.type === 'url'">
                      {{ link.type === 'url' ? 'URL' : 'Page Jump' }}
                    </span>
                    @if (link.isDangling) {
                      <span class="dangling-badge">Target Missing</span>
                    }
                  </div>
                  <div class="target-text">
                    {{ link.type === 'url' ? link.url : ('Target: Page ' + link.targetPage) }}
                  </div>
                </div>
                <button class="delete-btn" (click)="deleteLink(link)" aria-label="Delete link">
                  <app-icon name="trash"></app-icon>
                </button>
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
      app-icon { font-size: 1.25rem; color: #3b82f6; }
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
      gap: 12px;
    }
    .card-title { margin: 0; font-size: 0.95rem; font-weight: 600; }
    .type-toggle {
      display: flex;
      gap: 8px;
    }
    .type-btn {
      flex: 1;
      min-height: 44px;
      border: 1px solid var(--border-color, #cbd5e1);
      background: var(--bg-surface, #ffffff);
      border-radius: 8px;
      font-size: 0.88rem;
      font-weight: 600;
      cursor: pointer;
    }
    .type-btn.active {
      border-color: #3b82f6;
      background: #eff6ff;
      color: #1d4ed8;
    }
    .field-label {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-secondary, #64748b);
      text-transform: uppercase;
    }
    .text-input {
      width: 100%;
      min-height: 44px;
      padding: 8px 12px;
      font-size: 0.95rem;
      border: 1px solid var(--border-color, #cbd5e1);
      border-radius: 8px;
      background: var(--bg-surface, #ffffff);
      color: inherit;
      box-sizing: border-box;
    }
    .primary-btn {
      min-height: 44px;
      border: none;
      border-radius: 8px;
      background: #3b82f6;
      color: #ffffff;
      font-size: 0.9rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
    }
    .primary-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .audit-strip {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;

      @media (max-width: 380px) {
        grid-template-columns: repeat(2, 1fr);
      }
    }
    .stat-box {
      background: var(--bg-subtle, #f8fafc);
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: 8px;
      padding: 8px;
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .stat-box.has-dangling {
      background: #fef2f2;
      border-color: #fecaca;
      .stat-num { color: #dc2626; }
    }
    .stat-num { font-size: 1.1rem; font-weight: 700; color: #1e293b; }
    .stat-label { font-size: 0.7rem; color: #64748b; }
    .section-title { margin: 0; font-size: 0.95rem; font-weight: 600; }
    .empty-state {
      padding: 16px;
      text-align: center;
      color: #64748b;
      font-size: 0.88rem;
    }
    .links-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 220px;
      overflow-y: auto;
    }
    .link-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: 8px;
      background: var(--bg-surface, #ffffff);
    }
    .link-item.dangling {
      border-color: #fca5a5;
      background: #fef2f2;
    }
    .link-info {
      flex: 1;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .badge-row {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .page-badge {
      font-size: 0.72rem;
      font-weight: 700;
      background: #e2e8f0;
      color: #334155;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .kind-badge {
      font-size: 0.7rem;
      background: #e0f2fe;
      color: #0369a1;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .dangling-badge {
      font-size: 0.7rem;
      font-weight: 600;
      background: #fee2e2;
      color: #b91c1c;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .target-text {
      font-size: 0.85rem;
      color: #0f172a;
      word-break: break-all;
    }
    .delete-btn {
      min-width: 44px;
      min-height: 44px;
      border: none;
      background: transparent;
      color: #ef4444;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      cursor: pointer;
    }
  `]
})
export class PdfLinkModalComponent implements OnInit {
  state = inject(PdfEditorStateService);
  private linkService = inject(PdfLinkEditorService);
  private modalCtrl = inject(ModalController);

  newLinkType: 'url' | 'page' = 'url';
  newLinkUrl = '';
  newLinkTargetPage = 1;

  allLinks: PdfHyperlink[] = [];
  auditReport: LinkAuditReport = {
    totalLinks: 0,
    urlLinksCount: 0,
    pageLinksCount: 0,
    danglingLinksCount: 0,
    danglingLinks: [],
    links: []
  };

  get totalPages(): number {
    return this.state.document?.pageCount || 1;
  }

  ngOnInit() {
    this.refreshLinks();
  }

  refreshLinks() {
    const doc = this.state.document;
    if (!doc) return;

    this.allLinks = doc.pages.flatMap(p => p.links || []);
    this.auditReport = this.linkService.auditLinks(this.allLinks, doc.pageCount);
  }

  isFormValid(): boolean {
    if (this.newLinkType === 'url') {
      return this.newLinkUrl.trim().length > 3;
    }
    return this.newLinkTargetPage >= 1 && this.newLinkTargetPage <= this.totalPages;
  }

  addLink() {
    if (!this.isFormValid()) return;

    const pageNum = this.state.currentPageNumber;
    const link: Omit<PdfHyperlink, 'id'> = {
      pageNumber: pageNum,
      rect: { x: 50, y: 100, width: 140, height: 24 },
      type: this.newLinkType,
      url: this.newLinkType === 'url' ? this.newLinkUrl.trim() : undefined,
      targetPage: this.newLinkType === 'page' ? +this.newLinkTargetPage : undefined,
      label: this.newLinkType === 'url' ? this.newLinkUrl.trim() : `Page ${this.newLinkTargetPage}`
    };

    this.state.addLink(link);
    this.newLinkUrl = '';
    this.refreshLinks();
  }

  deleteLink(link: PdfHyperlink) {
    this.state.deleteLink(link.id);
    this.refreshLinks();
  }

  jumpToPage(pageNumber: number) {
    this.state.setCurrentPage(pageNumber);
  }

  dismiss() {
    this.modalCtrl.dismiss();
  }
}
