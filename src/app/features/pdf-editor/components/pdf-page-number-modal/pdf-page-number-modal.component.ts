import { AppIconComponent } from '../../../../shared/components/ui';
import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular/lazy';
import { PdfEditorStateService } from '../../../../core/services/pdf-editor-state.service';
import {
  PdfPageNumberingConfig,
  PageNumberPosition,
  FontStyleName
} from '../../../../core/models/pdf-editor.types';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-page-number-modal',
  template: `
    <div class="page-number-modal-wrapper">
      <div class="page-number-modal-header">
        <h3>Number PDF Pages</h3>
        <button class="modal-close-btn" (click)="dismiss()">
          <app-icon name="close"></app-icon>
        </button>
      </div>

      <div class="page-number-modal-content">
        <!-- Position Grid (6 positions) -->
        <div class="form-group">
          <label class="form-label">Position</label>
          <div class="position-grid">
            <button type="button" class="pos-btn" [class.active]="position === 'top-left'" (click)="position = 'top-left'">Top Left</button>
            <button type="button" class="pos-btn" [class.active]="position === 'top-center'" (click)="position = 'top-center'">Top Center</button>
            <button type="button" class="pos-btn" [class.active]="position === 'top-right'" (click)="position = 'top-right'">Top Right</button>
            <button type="button" class="pos-btn" [class.active]="position === 'bottom-left'" (click)="position = 'bottom-left'">Bottom Left</button>
            <button type="button" class="pos-btn" [class.active]="position === 'bottom-center'" (click)="position = 'bottom-center'">Bottom Center</button>
            <button type="button" class="pos-btn" [class.active]="position === 'bottom-right'" (click)="position = 'bottom-right'">Bottom Right</button>
          </div>
        </div>

        <!-- Format & Numbering Options -->
        <div class="form-section">
          <div class="form-group">
            <label class="form-label">Starting Number</label>
            <input type="number" [(ngModel)]="startingNumber" min="1" class="custom-input" />
          </div>

          <div class="form-group">
            <label class="form-label">Prefix (e.g. "Page ", "Sheet ")</label>
            <input type="text" [(ngModel)]="prefix" placeholder="e.g. Page " class="custom-input" />
          </div>

          <div class="form-group">
            <label class="form-label">Suffix (e.g. " of {{ '{' }}total{{ '}' }}", "-A")</label>
            <input type="text" [(ngModel)]="suffix" placeholder="e.g. of {{ '{' }}total{{ '}' }}" class="custom-input" />
          </div>

          <div class="form-group">
            <label class="form-label">Font Size ({{ fontSize }} pt)</label>
            <input type="range" min="8" max="24" [(ngModel)]="fontSize" class="custom-range" />
          </div>

          <div class="form-group">
            <label class="form-label">Font Style</label>
            <select [(ngModel)]="fontFamily" class="custom-select">
              <option value="Helvetica">Helvetica</option>
              <option value="TimesRoman">Times New Roman</option>
              <option value="Courier">Courier</option>
            </select>
          </div>

          <div class="form-group row-group">
            <label class="form-label">Color</label>
            <input type="color" [(ngModel)]="color" class="color-picker" />
          </div>

          <div class="form-group">
            <label class="form-label">Apply To</label>
            <div class="scope-toggle-pills">
              <button
                type="button"
                class="pill-btn"
                [class.active]="targetPages === 'all'"
                (click)="targetPages = 'all'">
                All Pages
              </button>
              <button
                type="button"
                class="pill-btn"
                [class.active]="targetPages === 'custom'"
                (click)="targetPages = 'custom'">
                Current Page
              </button>
            </div>
          </div>
        </div>

        <!-- Live Preview Box -->
        <div class="preview-box">
          <span class="preview-title">Preview on Page {{ state.currentPageNumber }}:</span>
          <div class="preview-badge" [style.font-size.px]="fontSize" [style.font-family]="fontFamily" [style.color]="color">
            {{ getPreviewText() }}
          </div>
        </div>

        <!-- Actions -->
        <div class="actions">
          <button class="btn btn-primary" (click)="savePageNumbering()">
            Apply Page Numbers
          </button>
          <button class="btn btn-danger-outline" (click)="removePageNumbering()">
            Remove Page Numbers
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page-number-modal-wrapper {
      background: var(--color-surface, #ffffff);
      border-radius: var(--radius-lg, 12px);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .page-number-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-4, 16px);
      background: var(--color-primary, #2563eb);
      color: #ffffff;

      h3 {
        margin: 0;
        font-size: var(--font-base, 16px);
        font-weight: 700;
      }
      .modal-close-btn {
        background: transparent;
        border: none;
        color: #ffffff;
        font-size: 20px;
        cursor: pointer;
        padding: 4px;
      }
    }
    .page-number-modal-content {
      padding: var(--space-5, 20px);
      overflow-y: auto;
      max-width: 500px;
      margin: 0 auto;
      width: 100%;
    }
    .position-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
    }
    .pos-btn {
      padding: 10px 4px;
      font-size: 11px;
      font-weight: 600;
      border: 1px solid var(--color-border, #e2e8f0);
      background: var(--color-background, #f8fafc);
      border-radius: var(--radius-sm, 6px);
      cursor: pointer;
      color: var(--color-text, #0f172a);
      transition: all var(--transition-fast);

      &.active {
        background: var(--color-primary, #2563eb);
        color: #ffffff;
        border-color: var(--color-primary, #2563eb);
      }
    }
    .form-section {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 12px);
      margin-top: var(--space-4, 16px);
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-1, 4px);

      &.row-group {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
      }
    }
    .form-label {
      font-size: var(--font-xs, 12px);
      font-weight: 600;
      color: var(--color-text-secondary, #64748b);
    }
    .custom-input, .custom-select {
      width: 100%;
      padding: var(--space-2, 8px) var(--space-3, 12px);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 8px);
      font-size: var(--font-sm, 14px);
      background: var(--color-surface, #ffffff);
      color: var(--color-text, #0f172a);
      &:focus {
        outline: none;
        border-color: var(--color-primary, #2563eb);
      }
    }
    .custom-range {
      width: 100%;
      accent-color: var(--color-primary, #2563eb);
    }
    .scope-toggle-pills {
      display: flex;
      background: var(--color-background, #f1f5f9);
      border-radius: var(--radius-md, 8px);
      padding: 3px;
      gap: 3px;

      .pill-btn {
        flex: 1;
        padding: 8px;
        border: none;
        background: transparent;
        border-radius: var(--radius-sm, 6px);
        font-size: var(--font-xs, 12px);
        font-weight: 600;
        color: var(--color-text-secondary, #64748b);
        cursor: pointer;
        transition: all var(--transition-fast);

        &.active {
          background: var(--color-surface, #ffffff);
          color: var(--color-primary, #2563eb);
          box-shadow: var(--shadow-xs);
        }
      }
    }
    .color-picker {
      width: 44px;
      height: 32px;
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-sm, 6px);
      cursor: pointer;
      background: transparent;
    }
    .preview-box {
      background: var(--color-background, #f8fafc);
      border: 1px dashed var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 8px);
      padding: 12px;
      text-align: center;
      margin-top: var(--space-4, 16px);

      .preview-title {
        display: block;
        font-size: 11px;
        color: var(--color-text-secondary, #64748b);
        margin-bottom: 6px;
      }
      .preview-badge {
        font-weight: 600;
      }
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: var(--space-5, 20px);
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 10px 16px;
      border-radius: var(--radius-md, 8px);
      font-size: var(--font-sm, 14px);
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all var(--transition-fast);

      &.btn-primary {
        background: var(--color-primary, #2563eb);
        color: #ffffff;
        &:hover {
          background: var(--color-primary-dark, #1d4ed8);
        }
      }
      &.btn-danger-outline {
        background: transparent;
        border: 1px solid var(--color-error, #dc2626);
        color: var(--color-error, #dc2626);
        &:hover {
          background: var(--color-error-soft, rgba(239, 68, 68, 0.1));
        }
      }
    }
  `],
  standalone: true,
  imports: [
    AppIconComponent,CommonModule, FormsModule, IonicModule]
})
export class PdfPageNumberModalComponent implements OnInit {
  position: PageNumberPosition = 'bottom-center';
  startingNumber = 1;
  fontSize = 11;
  fontFamily: FontStyleName = 'Helvetica';
  color = '#333333';
  prefix = 'Page ';
  suffix = ' of {total}';
  targetPages: 'all' | 'custom' = 'all';

  constructor(
    private modalCtrl: ModalController,
    public state: PdfEditorStateService
  ) {}

  ngOnInit() {
    const existing = this.state.document?.pageNumbering;
    if (existing) {
      this.position = existing.position;
      this.startingNumber = existing.startingNumber;
      this.fontSize = existing.fontSize;
      this.fontFamily = existing.fontFamily;
      this.color = existing.color;
      this.prefix = existing.prefix;
      this.suffix = existing.suffix;
      this.targetPages = existing.targetPages;
    }
  }

  getPreviewText(): string {
    const total = this.state.document?.pageCount || 1;
    const current = this.state.currentPageNumber;
    const actualNum = this.startingNumber + (current - 1);
    return `${this.prefix || ''}${actualNum}${this.suffix || ''}`.replace('{total}', `${total}`);
  }

  savePageNumbering() {
    const config: PdfPageNumberingConfig = {
      position: this.position,
      startingNumber: this.startingNumber,
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      color: this.color,
      prefix: this.prefix,
      suffix: this.suffix,
      targetPages: this.targetPages,
      selectedPages:
        this.targetPages === 'custom' ? [this.state.currentPageNumber] : undefined
    };

    this.state.setPageNumbering(config);
    this.dismiss({ saved: true });
  }

  removePageNumbering() {
    this.state.setPageNumbering(undefined);
    this.dismiss({ removed: true });
  }

  dismiss(data?: any) {
    this.modalCtrl.dismiss(data);
  }
}
