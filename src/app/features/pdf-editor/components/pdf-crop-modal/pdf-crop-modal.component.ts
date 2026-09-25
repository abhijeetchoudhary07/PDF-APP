import { AppIconComponent } from '../../../../shared/components/ui';
import { Component, Input, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { PdfEditorStateService } from '../../../../core/services/pdf-editor-state.service';
import { PdfCropBox } from '../../../../core/models/pdf-editor.types';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-crop-modal',
  template: `
    <div class="crop-modal-wrapper">
      <div class="crop-modal-header">
        <h3>Crop PDF Page</h3>
        <button class="modal-close-btn" (click)="dismiss()">
          <app-icon name="close"></app-icon>
        </button>
      </div>

      <div class="crop-modal-content">
        <!-- Preset Aspect Ratios -->
        <div class="form-group">
          <label class="form-label">Aspect Ratio Preset</label>
          <select [(ngModel)]="selectedPreset" (change)="applyPreset()" class="custom-select">
            <option value="free">Free / Custom</option>
            <option value="1:1">1:1 (Square)</option>
            <option value="4:3">4:3 (Standard)</option>
            <option value="16:9">16:9 (Widescreen)</option>
            <option value="a4">A4 (1:1.414)</option>
            <option value="letter">Letter (1:1.294)</option>
          </select>
        </div>

        <!-- Margin Insets (Points) -->
        <div class="insets-grid">
          <div class="form-group">
            <label class="form-label">Left Margin (pt)</label>
            <input type="number" min="0" [(ngModel)]="leftMargin" (input)="updateBox()" class="custom-input" />
          </div>
          <div class="form-group">
            <label class="form-label">Top Margin (pt)</label>
            <input type="number" min="0" [(ngModel)]="topMargin" (input)="updateBox()" class="custom-input" />
          </div>
          <div class="form-group">
            <label class="form-label">Right Margin (pt)</label>
            <input type="number" min="0" [(ngModel)]="rightMargin" (input)="updateBox()" class="custom-input" />
          </div>
          <div class="form-group">
            <label class="form-label">Bottom Margin (pt)</label>
            <input type="number" min="0" [(ngModel)]="bottomMargin" (input)="updateBox()" class="custom-input" />
          </div>
        </div>

        <!-- Scope -->
        <div class="form-group">
          <label class="form-label">Apply To</label>
          <div class="scope-toggle-pills">
            <button
              type="button"
              class="pill-btn"
              [class.active]="applyScope === 'current'"
              (click)="applyScope = 'current'">
              Current Page
            </button>
            <button
              type="button"
              class="pill-btn"
              [class.active]="applyScope === 'all'"
              (click)="applyScope = 'all'">
              All Pages
            </button>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="actions">
          <button class="btn btn-primary" (click)="saveCrop()">
            Apply Crop
          </button>
          <button class="btn btn-outline" (click)="resetCrop()">
            Reset Crop
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .crop-modal-wrapper {
      background: var(--color-surface, #ffffff);
      border-radius: var(--radius-lg, 12px);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .crop-modal-header {
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
    .crop-modal-content {
      padding: var(--space-5, 20px);
      overflow-y: auto;
      max-width: 500px;
      margin: 0 auto;
      width: 100%;
    }
    .form-group {
      margin-bottom: var(--space-4, 16px);
    }
    .form-label {
      display: block;
      font-size: var(--font-xs, 12px);
      font-weight: 600;
      color: var(--color-text-secondary, #64748b);
      margin-bottom: var(--space-1, 4px);
    }
    .custom-select, .custom-input {
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
    .insets-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
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
    .actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: var(--space-5, 20px);
    }
    .btn {
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
      &.btn-outline {
        background: transparent;
        border: 1px solid var(--color-border, #e2e8f0);
        color: var(--color-text, #0f172a);
        &:hover {
          background: var(--color-background, #f8fafc);
        }
      }
    }
  `],
  standalone: true,
  imports: [
    AppIconComponent,
    FormsModule
]
})
export class PdfCropModalComponent implements OnInit {
  private modalCtrl = inject(ModalController);
  private state = inject(PdfEditorStateService);

  selectedPreset: 'free' | '1:1' | '4:3' | '16:9' | 'a4' | 'letter' = 'free';
  applyScope: 'current' | 'all' = 'current';

  leftMargin = 20;
  topMargin = 20;
  rightMargin = 20;
  bottomMargin = 20;

  pageWidth = 595;
  pageHeight = 842;

  ngOnInit() {
    const page = this.state.currentPage;
    if (page) {
      this.pageWidth = page.originalWidth;
      this.pageHeight = page.originalHeight;
      if (page.cropBox) {
        this.leftMargin = page.cropBox.x;
        this.topMargin = page.cropBox.y;
        this.rightMargin = Math.max(0, this.pageWidth - (page.cropBox.x + page.cropBox.width));
        this.bottomMargin = Math.max(0, this.pageHeight - (page.cropBox.y + page.cropBox.height));
        this.selectedPreset = page.cropBox.aspectRatioPreset || 'free';
      }
    }
  }

  applyPreset() {
    if (this.selectedPreset === 'free') return;

    let targetRatio = 1.0;
    if (this.selectedPreset === '1:1') targetRatio = 1.0;
    else if (this.selectedPreset === '4:3') targetRatio = 4 / 3;
    else if (this.selectedPreset === '16:9') targetRatio = 16 / 9;
    else if (this.selectedPreset === 'a4') targetRatio = 1 / 1.414;
    else if (this.selectedPreset === 'letter') targetRatio = 8.5 / 11;

    const availableW = this.pageWidth - 40;
    const availableH = this.pageHeight - 40;

    let cropW = availableW;
    let cropH = cropW / targetRatio;

    if (cropH > availableH) {
      cropH = availableH;
      cropW = cropH * targetRatio;
    }

    this.leftMargin = Math.round((this.pageWidth - cropW) / 2);
    this.rightMargin = this.leftMargin;
    this.topMargin = Math.round((this.pageHeight - cropH) / 2);
    this.bottomMargin = this.topMargin;
  }

  updateBox() {
    // Keep within bounds
    this.leftMargin = Math.max(0, Math.min(this.leftMargin, this.pageWidth - 50));
    this.topMargin = Math.max(0, Math.min(this.topMargin, this.pageHeight - 50));
    this.rightMargin = Math.max(0, Math.min(this.rightMargin, this.pageWidth - this.leftMargin - 50));
    this.bottomMargin = Math.max(0, Math.min(this.bottomMargin, this.pageHeight - this.topMargin - 50));
  }

  saveCrop() {
    const cropBox: PdfCropBox = {
      x: this.leftMargin,
      y: this.topMargin,
      width: this.pageWidth - this.leftMargin - this.rightMargin,
      height: this.pageHeight - this.topMargin - this.bottomMargin,
      aspectRatioPreset: this.selectedPreset
    };

    if (this.applyScope === 'all') {
      this.state.setCropAllPages(cropBox);
    } else {
      this.state.setPageCrop(this.state.currentPageNumber, cropBox);
    }

    this.dismiss({ saved: true });
  }

  resetCrop() {
    if (this.applyScope === 'all') {
      this.state.resetCrop();
    } else {
      this.state.resetCrop(this.state.currentPageNumber);
    }
    this.dismiss({ reset: true });
  }

  dismiss(data?: any) {
    this.modalCtrl.dismiss(data);
  }
}
