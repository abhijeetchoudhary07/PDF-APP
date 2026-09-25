import { Component, ElementRef, HostListener, ViewChild, AfterViewChecked, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { GlobalSearchService } from '../../../../core/services/global-search.service';
import { ToolRegistryService, ToolItem } from '../../../../core/services/tool-registry.service';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-global-search-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe],
  template: `
    @if (searchService.isOpen$ | async) {
      <div
        class="search-backdrop"
        (click)="close()">
        <div
          class="search-dialog"
          (click)="$event.stopPropagation()"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="'search.dialogLabel' | translate">
          <!-- Search Input Bar -->
          <div class="search-input-header">
            <button
              type="button"
              class="search-back-btn"
              (click)="close()"
              [attr.aria-label]="'search.closeSearch' | translate">
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2.4" fill="none">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2.2" fill="none" class="search-icon">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              #searchInput
              type="text"
              [(ngModel)]="searchQuery"
              (ngModelChange)="onQueryChange()"
              (keydown)="onKeyDown($event)"
              [placeholder]="'search.inputPlaceholder' | translate"
              class="search-modal-input"
              aria-autocomplete="list" />
            <div class="search-actions">
              @if (!searchQuery) {
                <span class="shortcut-tag">ESC</span>
              }
              <button
                type="button"
                class="close-text-btn"
                (click)="close()"
                [attr.aria-label]="'search.closeSearch' | translate">
                {{ 'common.close' | translate }}
              </button>
              @if (searchQuery) {
                <button
                  type="button"
                  class="clear-btn"
                  (click)="searchQuery = ''; onQueryChange()"
                  [attr.aria-label]="'search.clearQuery' | translate">
                  &times;
                </button>
              }
            </div>
          </div>
          <!-- Search Content / Results -->
          <div class="search-results-area">
            <!-- Active Search Results -->
            @if (searchQuery.trim()) {
              <div class="results-list" role="listbox">
                @if (results.length === 0) {
                  <div class="no-match-box">
                    <p class="no-match-title">{{ 'search.noMatchTitle' | translate:{ query: searchQuery } }}</p>
                    <p class="no-match-sub">{{ 'search.noMatchSub' | translate }}</p>
                  </div>
                }
                @for (tool of results; track tool; let i = $index) {
                  <div
                    class="result-item"
                    [class.selected]="i === selectedIndex"
                    (mouseenter)="selectedIndex = i"
                    (click)="selectTool(tool)"
                    role="option"
                    [attr.aria-selected]="i === selectedIndex">
                    <div class="tool-icon-circle" [ngClass]="'color-' + tool.color">
                      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none">
                        @if (tool.category === 'PHOTO') {
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"></path>
                        }
                        @if (tool.category === 'SIGNATURE' || tool.category === 'SIGN') {
                          <path d="M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                        }
                        @if (tool.category === 'PDF' || tool.category === 'ORGANIZE' || tool.category === 'EDIT') {
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8"></path>
                        }
                        @if (tool.category === 'CONVERT') {
                          <path d="M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                        }
                        @if (tool.category === 'PROTECT') {
                          <path d="M3 11h18v11H3z M7 11V7a5 5 0 0 1 10 0v4"></path>
                        }
                        @if (tool.category === 'BATCH') {
                          <path d="M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5"></path>
                        }
                        @if (tool.category === 'PRESETS') {
                          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                        }
                      </svg>
                    </div>
                    <div class="result-details">
                      <div class="title-row">
                        <span class="tool-title">{{ tool.title }}</span>
                        <span class="cat-badge" [ngClass]="'badge-' + tool.color">{{ ('categories.' + tool.category) | translate }}</span>
                      </div>
                      <p class="tool-desc">{{ tool.description }}</p>
                    </div>
                    <div class="action-hint">
                      <span>{{ 'search.jumpToTool' | translate }}</span>
                      <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
                        <polyline points="9 18 15 12 9 6"></polyline>
                      </svg>
                    </div>
                  </div>
                }
              </div>
            }
            <!-- Empty State: Quick Recents & Suggested -->
            @if (!searchQuery.trim()) {
              <div class="recents-section">
                @if ((toolRegistry.recentTools$ | async)?.length) {
                  <div class="section-group">
                    <span class="group-title">{{ 'search.recentlyUsed' | translate }}</span>
                    <div class="recents-grid">
                      @for (recent of toolRegistry.recentTools$ | async; track recent) {
                        <button
                          type="button"
                          class="recent-chip"
                          (click)="selectTool(recent)">
                          <span class="chip-dot" [ngClass]="'color-' + recent.color"></span>
                          <span class="chip-text">{{ recent.title }}</span>
                        </button>
                      }
                    </div>
                  </div>
                }
                <div class="section-group">
                  <span class="group-title">{{ 'search.popularTools' | translate }}</span>
                  <div class="popular-list">
                    @for (pop of popularTools; track pop) {
                      <div
                        class="result-item"
                        (click)="selectTool(pop)">
                        <div class="tool-icon-circle" [ngClass]="'color-' + pop.color">
                          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                          </svg>
                        </div>
                        <div class="result-details">
                          <div class="title-row">
                            <span class="tool-title">{{ pop.title }}</span>
                            <span class="cat-badge" [ngClass]="'badge-' + pop.color">{{ ('categories.' + pop.category) | translate }}</span>
                          </div>
                          <p class="tool-desc">{{ pop.description }}</p>
                        </div>
                        <div class="action-hint">
                          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
                            <polyline points="9 18 15 12 9 6"></polyline>
                          </svg>
                        </div>
                      </div>
                    }
                  </div>
                </div>
              </div>
            }
          </div>
          <!-- Footer Help -->
          <div class="search-dialog-footer">
            <div class="footer-tips">
              <span><kbd>&uarr;</kbd> <kbd>&darr;</kbd> to navigate</span>
              <span><kbd>&crarr;</kbd> to select</span>
              <span><kbd>esc</kbd> to close</span>
            </div>
            <span class="footer-offline">100% Client-Side Engine</span>
          </div>
        </div>
      </div>
    }
    `,
  styles: [`
    .search-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(15, 23, 42, 0.65);
      backdrop-filter: blur(6px);
      z-index: 3000;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 60px var(--space-4, 16px) var(--space-4, 16px);
      animation: fadeIn var(--transition-fast, 150ms) ease-out;
    }

    .search-dialog {
      background-color: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-xl, 16px);
      box-shadow: var(--shadow-modal);
      width: 100%;
      max-width: 640px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: slideDown var(--transition-fast, 150ms) ease-out;
    }

    .search-input-header {
      display: flex;
      align-items: center;
      padding: var(--space-4, 16px) var(--space-5, 20px);
      border-bottom: 1px solid var(--color-border);
      gap: var(--space-3, 12px);
      background-color: var(--color-surface);
    }

    .search-icon {
      color: var(--color-text-muted);
      flex-shrink: 0;
    }

    .search-modal-input {
      flex: 1;
      border: none;
      outline: none;
      background: transparent;
      font-size: var(--font-body, 16px);
      color: var(--color-text);
      font-family: inherit;
    }

    .search-modal-input::placeholder {
      color: var(--color-text-muted);
    }

    .search-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* Both close affordances are off by default; the media queries pick one. */
    .search-back-btn {
      display: none;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      flex-shrink: 0;
      margin-left: -6px;
      border: none;
      border-radius: var(--radius-md, 10px);
      background: transparent;
      color: var(--color-text);
      cursor: pointer;
      transition: background-color var(--transition-fast, 150ms), transform var(--transition-fast, 150ms);
    }

    .search-back-btn:hover {
      background-color: var(--color-background-subtle);
    }

    .search-back-btn:active {
      transform: translateX(-2px) scale(0.94);
    }

    .close-text-btn {
      display: none;
      border: 1px solid var(--color-border);
      background-color: var(--color-background-subtle);
      color: var(--color-text-secondary);
      font-family: inherit;
      font-size: var(--font-caption, 12px);
      font-weight: var(--font-weight-semibold, 600);
      padding: 6px 12px;
      border-radius: var(--radius-full, 9999px);
      cursor: pointer;
    }

    .shortcut-tag {
      font-size: 11px;
      font-weight: var(--font-weight-semibold, 600);
      background-color: var(--color-background-subtle);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-xs, 4px);
      padding: 2px 6px;
      color: var(--color-text-muted);
    }

    .clear-btn {
      background: transparent;
      border: none;
      font-size: 20px;
      color: var(--color-text-muted);
      cursor: pointer;
      line-height: 1;
      padding: 0 4px;
    }

    .search-results-area {
      max-height: 420px;
      overflow-y: auto;
      padding: var(--space-3, 12px) 0;
    }

    .results-list, .popular-list {
      display: flex;
      flex-direction: column;
    }

    .result-item {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
      padding: 10px var(--space-5, 20px);
      cursor: pointer;
      transition: background-color var(--transition-fast, 150ms);
    }

    .result-item:hover, .result-item.selected {
      background-color: var(--color-background-subtle);
    }

    .tool-icon-circle {
      width: 38px;
      height: 38px;
      border-radius: var(--radius-md, 10px);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .color-photo { background-color: var(--color-photo-soft); color: var(--color-photo); }
    .color-signature { background-color: var(--color-signature-soft); color: var(--color-signature); }
    .color-pdf { background-color: var(--color-pdf-soft); color: var(--color-pdf); }
    .color-convert { background-color: var(--color-convert-soft); color: var(--color-convert); }
    .color-organize { background-color: var(--color-organize-soft); color: var(--color-organize); }
    .color-edit { background-color: var(--color-edit-soft); color: var(--color-edit); }
    .color-sign { background-color: var(--color-sign-soft); color: var(--color-sign); }
    .color-security { background-color: var(--color-security-soft); color: var(--color-security); }
    .color-batch { background-color: var(--color-batch-soft); color: var(--color-batch); }
    .color-presets { background-color: var(--color-presets-soft); color: var(--color-presets); }

    .result-details {
      flex: 1;
      min-width: 0;
    }

    .title-row {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      margin-bottom: 2px;
    }

    .tool-title {
      font-size: var(--font-label, 14px);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text);
    }

    .cat-badge {
      font-size: 10px;
      font-weight: var(--font-weight-bold, 700);
      padding: 1px 6px;
      border-radius: var(--radius-full, 9999px);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .badge-photo { background: var(--color-photo-soft); color: var(--color-photo); }
    .badge-signature { background: var(--color-signature-soft); color: var(--color-signature); }
    .badge-pdf { background: var(--color-pdf-soft); color: var(--color-pdf); }
    .badge-convert { background: var(--color-convert-soft); color: var(--color-convert); }
    .badge-organize { background: var(--color-organize-soft); color: var(--color-organize); }
    .badge-edit { background: var(--color-edit-soft); color: var(--color-edit); }
    .badge-sign { background: var(--color-sign-soft); color: var(--color-sign); }
    .badge-security { background: var(--color-security-soft); color: var(--color-security); }
    .badge-batch { background: var(--color-batch-soft); color: var(--color-batch); }
    .badge-presets { background: var(--color-presets-soft); color: var(--color-presets); }

    .tool-desc {
      margin: 0;
      font-size: var(--font-caption, 12px);
      color: var(--color-text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .action-hint {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: var(--font-caption, 12px);
      color: var(--color-text-muted);
      flex-shrink: 0;
      opacity: 0;
      transition: opacity var(--transition-fast, 150ms);
    }

    .result-item:hover .action-hint, .result-item.selected .action-hint {
      opacity: 1;
      color: var(--color-primary);
    }

    .no-match-box {
      padding: var(--space-8, 32px) var(--space-5, 20px);
      text-align: center;
    }

    .no-match-title {
      font-size: var(--font-label, 14px);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text);
      margin: 0 0 var(--space-1, 4px);
    }

    .no-match-sub {
      font-size: var(--font-caption, 12px);
      color: var(--color-text-secondary);
      margin: 0;
    }

    .recents-section {
      padding: 0 var(--space-5, 20px);
    }

    .section-group {
      margin-bottom: var(--space-4, 16px);
    }

    .group-title {
      display: block;
      font-size: 11px;
      font-weight: var(--font-weight-semibold, 600);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
      margin-bottom: var(--space-2, 8px);
    }

    .recents-grid {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2, 8px);
    }

    .recent-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background-color: var(--color-background-subtle);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-full, 9999px);
      cursor: pointer;
      font-size: var(--font-caption, 12px);
      color: var(--color-text);
      transition: all var(--transition-fast, 150ms);
    }

    .recent-chip:hover {
      background-color: var(--color-surface-hover);
      border-color: var(--color-border-hover);
      transform: translateY(-1px);
    }

    .chip-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }

    .search-dialog-footer {
      padding: var(--space-3, 12px) var(--space-5, 20px);
      border-top: 1px solid var(--color-divider);
      background-color: var(--color-background-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      color: var(--color-text-muted);
    }

    .footer-tips {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
    }

    kbd {
      padding: 1px 4px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-xs, 4px);
      font-family: inherit;
    }

    .footer-offline {
      color: var(--color-success);
      font-weight: var(--font-weight-medium, 500);
    }

    @media (max-width: 640px) {
      .search-backdrop {
        padding: 0;
        align-items: flex-start;
      }
      .search-dialog {
        max-width: 100%;
        height: 100%;
        border-radius: 0;
        border: none;
        animation: searchSheetIn var(--transition-normal) cubic-bezier(0.16, 1, 0.3, 1);
      }
      .search-results-area {
        max-height: none;
        flex: 1;
      }
      .search-dialog-footer {
        display: none;
      }
      /* Full-screen sheet: give it the back chevron a phone user expects. */
      .search-back-btn {
        display: inline-flex;
      }
      .close-text-btn {
        display: inline-block;
      }
      .shortcut-tag {
        display: none;
      }
      /*
       * Touch targets never reveal a hover hint, so keep the chevron visible —
       * but drop the "Jump to tool" wording, which on a phone squeezes the
       * result title into two wrapped lines.
       */
      .action-hint {
        opacity: 1;
        color: var(--color-text-muted);
      }
      .action-hint span {
        display: none;
      }
      .result-item {
        padding-inline: var(--space-4, 16px);
      }
      .title-row {
        flex-wrap: wrap;
      }
    }

    @keyframes searchSheetIn {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `]
})
export class AppGlobalSearchModalComponent implements AfterViewChecked {
  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;

  searchQuery = '';
  results: ToolItem[] = [];
  selectedIndex = 0;
  private hasAutoFocused = false;

  popularTools: ToolItem[] = [];

  public searchService = inject(GlobalSearchService);
  public toolRegistry = inject(ToolRegistryService);
  private router = inject(Router);

  constructor() {
    this.popularTools = [
      this.toolRegistry.getToolById('photo_tools')!,
      this.toolRegistry.getToolById('pdf_dashboard')!,
      this.toolRegistry.getToolById('signature_tools')!,
      this.toolRegistry.getToolById('doc_converter')!,
      this.toolRegistry.getToolById('presets')!
    ].filter(Boolean);
  }

  ngAfterViewChecked() {
    if (this.searchService.isOpen$.value && !this.hasAutoFocused && this.searchInputRef) {
      this.searchInputRef.nativeElement.focus();
      this.hasAutoFocused = true;
    }
    if (!this.searchService.isOpen$.value) {
      this.hasAutoFocused = false;
    }
  }

  onQueryChange() {
    this.results = this.toolRegistry.search(this.searchQuery);
    this.selectedIndex = 0;
  }

  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (this.results.length > 0) {
        this.selectedIndex = (this.selectedIndex + 1) % this.results.length;
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (this.results.length > 0) {
        this.selectedIndex = (this.selectedIndex - 1 + this.results.length) % this.results.length;
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (this.results.length > 0 && this.results[this.selectedIndex]) {
        this.selectTool(this.results[this.selectedIndex]);
      }
    } else if (event.key === 'Escape') {
      this.close();
    }
  }

  selectTool(tool: ToolItem) {
    this.toolRegistry.recordToolUsage(tool.id);
    this.close();
    this.router.navigateByUrl(tool.route);
  }

  /**
   * Escape closes the dialog from anywhere inside it, not only from the field.
   *
   * The dialog renders an "ESC" hint next to the close button, but the only
   * handler was `(keydown)` on the input — so the moment focus moved anywhere
   * else (clicking a result, tabbing to Close, or simply scrolling the list on
   * a touch device) the key the dialog was advertising stopped working and the
   * backdrop had to be found instead.
   *
   * Guarded on the open state because the listener is on `document` and the
   * component outlives any one opening of the dialog.
   */
  @HostListener('document:keydown.escape')
  onDocumentEscape(): void {
    if (this.searchService.isOpen$.value) {
      this.close();
    }
  }

  close() {
    this.searchService.close();
    this.searchQuery = '';
    this.results = [];
  }
}
