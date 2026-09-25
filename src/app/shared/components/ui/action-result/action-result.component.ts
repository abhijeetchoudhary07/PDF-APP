import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';

import { RouterModule } from '@angular/router';
import { AppButtonComponent } from '../button/button.component';
import { AppRelatedToolsComponent } from '../related-tools/related-tools.component';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-action-result',
  standalone: true,
  imports: [RouterModule, AppButtonComponent, AppRelatedToolsComponent],
  template: `
    <div class="action-result-container">
      <!-- Success Header Card -->
      <div class="result-success-card">
        <div class="success-icon-box">
          <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" stroke-width="2.2" fill="none">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        </div>
    
        <h2 class="result-title">{{ title }}</h2>
        <p class="result-subtitle">{{ subtitle }}</p>
    
        <!-- File Metadata Pill -->
        @if (fileName || outputSizeFormatted) {
          <div class="meta-pill">
            @if (fileName) {
              <span class="file-name">{{ fileName }}</span>
            }
            @if (fileName && outputSizeFormatted) {
              <span class="meta-divider">&bull;</span>
            }
            @if (outputSizeFormatted) {
              <span class="file-size">{{ outputSizeFormatted }}</span>
            }
            @if (compressionRatio) {
              <span class="ratio-badge">{{ compressionRatio }}</span>
            }
          </div>
        }
    
        <!-- Action Buttons -->
        <div class="action-buttons-group">
          <app-button
            variant="primary"
            size="lg"
            (clicked)="saveClicked.emit()">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" class="btn-icon">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Save File
          </app-button>
    
          <app-button
            variant="secondary"
            size="lg"
            (clicked)="shareClicked.emit()">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" class="btn-icon">
              <circle cx="18" cy="5" r="3"></circle>
              <circle cx="6" cy="12" r="3"></circle>
              <circle cx="18" cy="19" r="3"></circle>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
            Share
          </app-button>
    
          <app-button
            variant="outline"
            size="lg"
            (clicked)="resetClicked.emit()">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" class="btn-icon">
              <polyline points="1 4 1 10 7 10"></polyline>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
            </svg>
            Process Another
          </app-button>
        </div>
    
        <!-- Privacy assurance -->
        <div class="offline-tag">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          </svg>
          <span>Processed 100% locally on your device</span>
        </div>
      </div>
    
      <!-- Smart Cross-Linking / Next Steps -->
      <app-related-tools
        [currentToolId]="currentToolId"
        [category]="category"
        title="Next Steps & Related Tools"
        subtitle="Continue editing, organizing, or converting this file without leaving the app">
      </app-related-tools>
    </div>
    `,
  styles: [`
    .action-result-container {
      width: 100%;
      max-width: 700px;
      margin: 0 auto;
      padding: var(--space-6, 24px) 0;
      animation: fadeIn var(--transition-fast, 150ms) ease-out;
    }

    .result-success-card {
      background-color: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-xl, 16px);
      box-shadow: var(--shadow-md);
      padding: var(--space-8, 32px) var(--space-6, 24px);
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .success-icon-box {
      width: 64px;
      height: 64px;
      border-radius: var(--radius-full, 9999px);
      background-color: var(--color-success-soft);
      color: var(--color-success);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: var(--space-4, 16px);
      box-shadow: 0 0 0 8px rgba(16, 185, 129, 0.08);
    }

    .result-title {
      font-size: var(--font-h2, 22px);
      font-weight: var(--font-weight-bold, 700);
      color: var(--color-text);
      margin: 0 0 var(--space-1, 4px) 0;
      letter-spacing: -0.015em;
    }

    .result-subtitle {
      font-size: var(--font-body, 15px);
      color: var(--color-text-secondary);
      margin: 0 0 var(--space-4, 16px) 0;
    }

    .meta-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      background-color: var(--color-background-subtle);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-full, 9999px);
      font-size: var(--font-small, 13px);
      margin-bottom: var(--space-6, 24px);
    }

    .file-name {
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text);
      max-width: 250px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .meta-divider {
      color: var(--color-text-muted);
    }

    .file-size {
      color: var(--color-text-secondary);
    }

    .ratio-badge {
      background-color: var(--color-success-soft);
      color: var(--color-success);
      font-size: 11px;
      font-weight: var(--font-weight-bold, 700);
      padding: 1px 6px;
      border-radius: var(--radius-full, 9999px);
    }

    .action-buttons-group {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: var(--space-3, 12px);
      margin-bottom: var(--space-5, 20px);
      width: 100%;
    }

    .btn-icon {
      margin-right: 6px;
    }

    .offline-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: var(--font-caption, 12px);
      color: var(--color-success);
      font-weight: var(--font-weight-medium, 500);
    }

    @media (max-width: 640px) {
      .action-buttons-group {
        flex-direction: column;
        width: 100%;
      }
      .action-buttons-group app-button {
        width: 100%;
      }
    }
  `]
})
export class AppActionResultComponent {
  @Input() title = 'Your File is Ready';
  @Input() subtitle = 'The operation was processed successfully on your device';
  @Input() fileName?: string;
  @Input() outputSizeFormatted?: string;
  @Input() compressionRatio?: string;
  @Input() currentToolId?: string;
  @Input() category?: string;

  @Output() saveClicked = new EventEmitter<void>();
  @Output() shareClicked = new EventEmitter<void>();
  @Output() resetClicked = new EventEmitter<void>();
}
