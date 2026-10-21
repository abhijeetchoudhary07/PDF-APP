import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { AppIconComponent } from '../../../../shared/components/ui';
import { PdfEditorStateService } from '../../../../core/services/pdf-editor-state.service';
import { PdfFindReplaceService } from '../../../../core/services/pdf-find-replace.service';
import { FindMatch, FindReplaceOptions } from '../../../../core/models/editor-features.types';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-find-replace-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent],
  template: `
    <div class="modal-wrapper">
      <div class="modal-header">
        <div class="header-title">
          <app-icon name="search"></app-icon>
          <h3>Find & Replace</h3>
        </div>
        <button class="close-btn" (click)="dismiss()" aria-label="Close">
          <app-icon name="close"></app-icon>
        </button>
      </div>

      <div class="modal-body">
        <!-- SEARCH & REPLACE INPUTS -->
        <div class="input-card">
          <label class="field-label">Find text</label>
          <div class="input-row">
            <input
              type="text"
              [(ngModel)]="searchQuery"
              placeholder="Search in PDF & form fields..."
              class="text-input"
              (keyup.enter)="executeSearch()"
            />
          </div>

          <label class="field-label">Replace with</label>
          <div class="input-row">
            <input
              type="text"
              [(ngModel)]="replaceQuery"
              placeholder="Replacement text..."
              class="text-input"
            />
          </div>

          <!-- NOTICE ABOUT REPLACEMENT SCOPE -->
          <div class="scope-notice">
            <app-icon name="alert-circle-outline"></app-icon>
            <span>In-document replacement updates form field values and editor-added text runs cleanly.</span>
          </div>

          <!-- OPTIONS -->
          <div class="options-grid">
            <label class="checkbox-label">
              <input type="checkbox" [(ngModel)]="options.caseSensitive" />
              <span>Match Case</span>
            </label>
            <label class="checkbox-label">
              <input type="checkbox" [(ngModel)]="options.wholeWord" />
              <span>Whole Word</span>
            </label>
            <label class="checkbox-label">
              <input type="checkbox" [(ngModel)]="options.includeFormFields" />
              <span>Form Fields</span>
            </label>
          </div>

          <div class="btn-row">
            <button class="action-btn primary-btn" (click)="executeSearch()" [disabled]="!searchQuery || isSearching">
              <app-icon name="search"></app-icon>
              <span>{{ isSearching ? 'Searching...' : 'Find Matches' }}</span>
            </button>
            <button
              class="action-btn replace-btn"
              (click)="replaceAll()"
              [disabled]="matches.length === 0 || !replaceQuery || isReplacing"
            >
              <app-icon name="refresh"></app-icon>
              <span>Replace All ({{ matches.length }})</span>
            </button>
          </div>
        </div>

        <!-- MATCHES LIST -->
        <div class="results-section">
          <div class="results-header">
            <h4>Matches Found: {{ matches.length }}</h4>
            @if (searchPerformed && matches.length === 0) {
              <span class="no-matches-tag">No matches</span>
            }
          </div>

          <div class="matches-list">
            @for (match of matches; track match.id; let idx = $index) {
              <div class="match-item" [class.active]="selectedMatchIndex === idx">
                <div class="match-info" (click)="jumpToMatch(match, idx)">
                  <span class="page-badge">Page {{ match.pageNumber }}</span>
                  <span class="source-badge">{{ match.source }}</span>
                  <div class="match-text">"{{ match.text }}"</div>
                </div>
                <button
                  class="replace-one-btn"
                  (click)="replaceSingle(match)"
                  [disabled]="!replaceQuery"
                  aria-label="Replace this match"
                >
                  Replace
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
      app-icon { font-size: 1.25rem; color: var(--color-primary, #3b82f6); }
    }
    .close-btn {
      background: transparent;
      border: none;
      padding: 8px;
      cursor: pointer;
      font-size: 1.25rem;
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
    .input-card {
      background: var(--bg-subtle, #f8fafc);
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: 12px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .field-label {
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--text-secondary, #64748b);
      text-transform: uppercase;
      letter-spacing: 0.5px;
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
    .scope-notice {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      color: #1e40af;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 0.8rem;
    }
    .options-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: 8px;
      margin-top: 4px;
    }
    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.88rem;
      cursor: pointer;
      min-height: 44px;
      input { width: 18px; height: 18px; }
    }
    .btn-row {
      display: flex;
      gap: 10px;
      margin-top: 8px;
      flex-wrap: wrap;
    }
    .action-btn {
      flex: 1;
      min-height: 44px;
      min-width: 130px;
      border: none;
      border-radius: 8px;
      font-size: 0.9rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .primary-btn {
      background: var(--color-primary, #3b82f6);
      color: #ffffff;
    }
    .replace-btn {
      background: #059669;
      color: #ffffff;
    }
    .action-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .results-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .results-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      h4 { margin: 0; font-size: 0.95rem; }
    }
    .no-matches-tag {
      font-size: 0.8rem;
      color: #ef4444;
      font-weight: 600;
    }
    .matches-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 240px;
      overflow-y: auto;
    }
    .match-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 12px;
      border: 1px solid var(--border-color, #e2e8f0);
      background: var(--bg-surface, #ffffff);
      border-radius: 8px;
    }
    .match-item.active {
      border-color: #3b82f6;
      background: #eff6ff;
    }
    .match-info {
      flex: 1;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .page-badge {
      font-size: 0.75rem;
      font-weight: 700;
      background: #e2e8f0;
      color: #334155;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .source-badge {
      font-size: 0.72rem;
      background: #dbeafe;
      color: #1e40af;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .match-text {
      font-size: 0.88rem;
      color: var(--text-primary, #1e293b);
      word-break: break-all;
    }
    .replace-one-btn {
      min-height: 44px;
      padding: 6px 12px;
      border: 1px solid #10b981;
      background: #ecfdf5;
      color: #065f46;
      border-radius: 6px;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
    }
    .replace-one-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  `]
})
export class PdfFindReplaceModalComponent implements OnInit {
  state = inject(PdfEditorStateService);
  private findReplaceService = inject(PdfFindReplaceService);
  private modalCtrl = inject(ModalController);

  searchQuery = '';
  replaceQuery = '';
  options: FindReplaceOptions = {
    caseSensitive: false,
    wholeWord: false,
    includeFormFields: true
  };

  matches: FindMatch[] = [];
  selectedMatchIndex: number | null = null;
  isSearching = false;
  isReplacing = false;
  searchPerformed = false;

  ngOnInit() {}

  async executeSearch() {
    if (!this.searchQuery.trim() || !this.state.document) return;

    this.isSearching = true;
    this.searchPerformed = true;
    this.matches = [];

    try {
      this.matches = await this.findReplaceService.findAcrossDocument(
        this.state.document.arrayBuffer,
        this.searchQuery,
        this.options,
        this.state.document
      );
      if (this.matches.length > 0) {
        this.selectedMatchIndex = 0;
        this.jumpToMatch(this.matches[0], 0);
      }
    } catch (e) {
      console.error('Search error', e);
    } finally {
      this.isSearching = false;
    }
  }

  jumpToMatch(match: FindMatch, index: number) {
    this.selectedMatchIndex = index;
    this.state.setCurrentPage(match.pageNumber);
  }

  replaceSingle(match: FindMatch) {
    if (!this.replaceQuery || !this.state.document) return;

    if (match.source === 'editor-element' && match.elementId) {
      this.state.updateElement(match.elementId, { text: this.replaceQuery } as any);
    }

    // Remove from matches list
    this.matches = this.matches.filter(m => m.id !== match.id);
  }

  async replaceAll() {
    if (!this.replaceQuery || !this.state.document || this.matches.length === 0) return;

    this.isReplacing = true;

    try {
      const res = await this.findReplaceService.replaceAll(
        this.state.document.arrayBuffer,
        this.searchQuery,
        this.replaceQuery,
        this.options,
        this.state.document
      );

      // Re-run search to verify clear
      await this.executeSearch();
    } catch (e) {
      console.error('Replace all error', e);
    } finally {
      this.isReplacing = false;
    }
  }

  dismiss() {
    this.modalCtrl.dismiss();
  }
}
