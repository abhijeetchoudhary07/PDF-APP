import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { AppIconComponent } from '../../../../shared/components/ui';
import { PdfEditorStateService } from '../../../../core/services/pdf-editor-state.service';
import { PdfTextEditorService } from '../../../../core/services/pdf-text-editor.service';
import { ExistingTextRun, TextEditCommand } from '../../../../core/models/editor-features.types';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-text-edit-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent],
  template: `
    <div class="modal-wrapper">
      <div class="modal-header">
        <div class="header-title">
          <app-icon name="text"></app-icon>
          <h3>Edit Existing Text</h3>
        </div>
        <button class="close-btn" (click)="dismiss()" aria-label="Close">
          <app-icon name="close"></app-icon>
        </button>
      </div>

      <div class="modal-body">
        <!-- HONEST SCOPE NOTICE -->
        <div class="scope-card">
          <div class="scope-badge">Scope Notice</div>
          <p>
            Supports <strong>same-font, same-size, single-line text edits</strong>.
            Paragraph reflow, multi-column re-spacing, and justified flow are out of scope.
            If embedded subset fonts lack required glyphs, <em>whiteout-and-retype</em> fallback will be applied to guarantee selectable, searchable text.
          </p>
        </div>

        @if (isLoadingRuns) {
          <div class="loading-state">
            <app-icon name="sync"></app-icon>
            <span>Scanning page text runs...</span>
          </div>
        }

        <!-- SELECTED RUN EDITOR -->
        @if (selectedRun) {
          <div class="card edit-card">
            <div class="edit-card-header">
              <h4 class="card-title">Editing Selected Text</h4>
              <button class="cancel-select-btn" (click)="selectedRun = null">Change</button>
            </div>

            <div class="font-meta-strip">
              <span>Font: <strong>{{ selectedRun.fontFamily }}</strong></span>
              <span>Size: <strong>{{ selectedRun.fontSize }} pt</strong></span>
            </div>

            <label class="field-label">Original Text</label>
            <div class="orig-text">"{{ selectedRun.text }}"</div>

            <label class="field-label">New Replacement Text</label>
            <input
              type="text"
              [(ngModel)]="editedText"
              placeholder="Enter replacement text..."
              class="text-input"
            />

            <!-- FALLBACK STATUS NOTICE -->
            @if (isFallbackTriggered()) {
              <div class="fallback-alert">
                <app-icon name="alert-circle-outline"></app-icon>
                <span>Embedded subset font lacks glyphs; fallback whiteout-and-retype will be cleanly used.</span>
              </div>
            }

            <button
              class="primary-btn"
              (click)="applyEdit()"
              [disabled]="!editedText.trim() || editedText === selectedRun.text"
            >
              <app-icon name="checkmark"></app-icon>
              <span>Apply Text Edit</span>
            </button>
          </div>
        }

        <!-- PAGE TEXT RUNS LIST -->
        @if (!selectedRun && !isLoadingRuns) {
          <div class="runs-section">
            <h4 class="section-title">Select Text Run on Page {{ state.currentPageNumber }} ({{ textRuns.length }})</h4>
            @if (textRuns.length === 0) {
              <div class="empty-state">No vector text runs found on this page.</div>
            }
            <div class="runs-list">
              @for (run of textRuns; track run.id) {
                <div class="run-item" (click)="selectRun(run)">
                  <div class="run-meta">
                    <span class="font-pill">{{ run.fontFamily }} {{ run.fontSize }}pt</span>
                    @if (run.hasMissingGlyphs) {
                      <span class="subset-pill">Subset</span>
                    }
                  </div>
                  <div class="run-text">"{{ run.text }}"</div>
                </div>
              }
            </div>
          </div>
        }
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
      app-icon { font-size: 1.25rem; color: #6366f1; }
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
      gap: 14px;
    }
    .scope-card {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 12px 14px;
      p { margin: 6px 0 0; font-size: 0.82rem; line-height: 1.4; color: #475569; }
    }
    .scope-badge {
      display: inline-block;
      font-size: 0.72rem;
      font-weight: 700;
      background: #e2e8f0;
      color: #334155;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .loading-state {
      padding: 24px;
      text-align: center;
      color: #64748b;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-size: 0.9rem;
    }
    .card {
      background: var(--bg-subtle, #f8fafc);
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: 12px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .edit-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .card-title { margin: 0; font-size: 0.95rem; font-weight: 600; }
    .cancel-select-btn {
      background: transparent;
      border: none;
      color: #3b82f6;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
    }
    .font-meta-strip {
      display: flex;
      gap: 14px;
      font-size: 0.82rem;
      color: #64748b;
    }
    .field-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
    }
    .orig-text {
      font-size: 0.92rem;
      background: #f1f5f9;
      padding: 8px 12px;
      border-radius: 6px;
      color: #1e293b;
      word-break: break-word;
    }
    .text-input {
      width: 100%;
      min-height: 44px;
      padding: 8px 12px;
      font-size: 0.92rem;
      border: 1px solid var(--border-color, #cbd5e1);
      border-radius: 8px;
      background: var(--bg-surface, #ffffff);
      box-sizing: border-box;
    }
    .fallback-alert {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #fef3c7;
      border: 1px solid #fde68a;
      color: #92400e;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 0.8rem;
    }
    .primary-btn {
      min-height: 44px;
      border: none;
      border-radius: 8px;
      background: #6366f1;
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
    .section-title { margin: 0; font-size: 0.95rem; font-weight: 600; }
    .empty-state {
      padding: 16px;
      text-align: center;
      color: #64748b;
      font-size: 0.88rem;
    }
    .runs-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 320px;
      overflow-y: auto;
    }
    .run-item {
      padding: 10px 12px;
      border: 1px solid var(--border-color, #e2e8f0);
      background: var(--bg-surface, #ffffff);
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 4px;
      transition: border-color 0.15s;
    }
    .run-item:hover { border-color: #6366f1; }
    .run-meta { display: flex; gap: 6px; }
    .font-pill {
      font-size: 0.72rem;
      background: #e2e8f0;
      color: #334155;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .subset-pill {
      font-size: 0.7rem;
      background: #fef3c7;
      color: #92400e;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .run-text { font-size: 0.88rem; color: #1e293b; word-break: break-all; }
  `]
})
export class PdfTextEditModalComponent implements OnInit {
  state = inject(PdfEditorStateService);
  private textEditorService = inject(PdfTextEditorService);
  private modalCtrl = inject(ModalController);

  textRuns: ExistingTextRun[] = [];
  selectedRun: ExistingTextRun | null = null;
  editedText = '';
  isLoadingRuns = false;

  async ngOnInit() {
    await this.scanPageText();
  }

  async scanPageText() {
    const doc = this.state.document;
    if (!doc) return;

    this.isLoadingRuns = true;
    try {
      this.textRuns = await this.textEditorService.extractTextRuns(
        doc.arrayBuffer,
        this.state.currentPageNumber
      );
    } catch (e) {
      console.error('Scan text runs error', e);
    } finally {
      this.isLoadingRuns = false;
    }
  }

  selectRun(run: ExistingTextRun) {
    this.selectedRun = run;
    this.editedText = run.text;
  }

  isFallbackTriggered(): boolean {
    if (!this.selectedRun || !this.editedText) return false;
    return !this.textEditorService.canEmbedDirectly(this.selectedRun.fontName, this.editedText);
  }

  applyEdit() {
    if (!this.selectedRun || !this.editedText.trim()) return;

    const useFallback = this.isFallbackTriggered();
    const command: TextEditCommand = {
      runId: this.selectedRun.id,
      pageNumber: this.selectedRun.pageNumber,
      originalText: this.selectedRun.text,
      newText: this.editedText.trim(),
      bounds: {
        x: this.selectedRun.x,
        y: this.selectedRun.y,
        width: this.selectedRun.width,
        height: this.selectedRun.height
      },
      fontSize: this.selectedRun.fontSize,
      fontFamily: this.selectedRun.fontFamily as any,
      fallbackWhiteoutApplied: useFallback,
      fallbackNotice: useFallback
        ? 'The embedded subset font lacks required glyphs. Applied whiteout-and-retype fallback.'
        : undefined
    };

    this.state.addTextEdit(command);
    this.modalCtrl.dismiss({ applied: true, command });
  }

  dismiss() {
    this.modalCtrl.dismiss();
  }
}
