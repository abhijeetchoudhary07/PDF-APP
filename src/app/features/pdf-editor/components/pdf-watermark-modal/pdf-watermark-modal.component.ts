import { AppIconComponent } from '../../../../shared/components/ui';
import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular/lazy';
import { PdfEditorStateService } from '../../../../core/services/pdf-editor-state.service';
import {
  PdfWatermark,
  WatermarkPosition,
  FontStyleName
} from '../../../../core/models/pdf-editor.types';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-watermark-modal',
  template: `
    <div class="watermark-modal-wrapper">
      <div class="watermark-modal-header">
        <h3>PDF Watermark</h3>
        <button class="modal-close-btn" (click)="dismiss()">
          <app-icon name="close"></app-icon>
        </button>
      </div>

      <div class="watermark-modal-content">
        <div class="watermark-type-pills">
          <button
            type="button"
            class="pill-btn"
            [class.active]="watermarkType === 'text'"
            (click)="watermarkType = 'text'">
            Text Watermark
          </button>
          <button
            type="button"
            class="pill-btn"
            [class.active]="watermarkType === 'image'"
            (click)="watermarkType = 'image'">
            Image Watermark
          </button>
        </div>

        <!-- TEXT WATERMARK CONTROLS -->
        <div *ngIf="watermarkType === 'text'" class="form-section">
          <div class="form-group">
            <label class="form-label">Watermark Text</label>
            <input type="text" [(ngModel)]="text" placeholder="e.g. CONFIDENTIAL, DRAFT" class="custom-input" />
          </div>

          <div class="form-group">
            <label class="form-label">Font Size ({{ fontSize }} pt)</label>
            <input type="range" min="16" max="100" [(ngModel)]="fontSize" class="custom-range" />
          </div>

          <div class="form-group">
            <label class="form-label">Font</label>
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
        </div>

        <!-- IMAGE WATERMARK CONTROLS -->
        <div *ngIf="watermarkType === 'image'" class="form-section">
          <button type="button" class="btn btn-outline" (click)="pickImage()">
            <app-icon name="image-outline"></app-icon>
            {{ imageUrl ? 'Change Image' : 'Select Image' }}
          </button>
          <input #fileInput type="file" accept="image/*" (change)="onFileSelected($event)" style="display: none;" />

          <div *ngIf="imageUrl" class="image-preview">
            <img [src]="imageUrl" alt="Watermark Preview" />
          </div>

          <div *ngIf="imageUrl" class="form-group">
            <label class="form-label">Scale ({{ (scale * 100) | number:'1.0-0' }}%)</label>
            <input type="range" min="0.1" max="1.5" step="0.05" [(ngModel)]="scale" class="custom-range" />
          </div>
        </div>

        <!-- SHARED CONTROLS (Opacity, Rotation, Position, Scope) -->
        <div class="form-section">
          <div class="form-group">
            <label class="form-label">Opacity ({{ (opacity * 100) | number:'1.0-0' }}%)</label>
            <input type="range" min="0.05" max="1.0" step="0.05" [(ngModel)]="opacity" class="custom-range" />
          </div>

          <div class="form-group">
            <label class="form-label">Rotation ({{ rotation }}°)</label>
            <input type="range" min="-90" max="90" step="5" [(ngModel)]="rotation" class="custom-range" />
          </div>

          <div class="form-group">
            <label class="form-label">Position</label>
            <select [(ngModel)]="position" class="custom-select">
              <option value="center">Center</option>
              <option value="diagonal">Diagonal</option>
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
            </select>
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

        <!-- ACTIONS -->
        <div class="actions">
          <button class="btn btn-primary" (click)="saveWatermark()">
            Apply Watermark
          </button>
          <button class="btn btn-danger-outline" (click)="removeWatermark()">
            Remove Watermark
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .watermark-modal-wrapper {
      background: var(--color-surface, #ffffff);
      border-radius: var(--radius-lg, 12px);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .watermark-modal-header {
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
    .watermark-modal-content {
      padding: var(--space-5, 20px);
      overflow-y: auto;
      max-width: 500px;
      margin: 0 auto;
      width: 100%;
    }
    .watermark-type-pills, .scope-toggle-pills {
      display: flex;
      background: var(--color-background, #f1f5f9);
      border-radius: var(--radius-md, 8px);
      padding: 3px;
      gap: 3px;
      margin-bottom: var(--space-4, 16px);

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
    .form-section {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 12px);
      margin-bottom: var(--space-4, 16px);
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
    .color-picker {
      width: 44px;
      height: 32px;
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-sm, 6px);
      cursor: pointer;
      background: transparent;
    }
    .image-preview {
      display: flex;
      justify-content: center;
      max-height: 120px;
      overflow: hidden;
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 8px);
      padding: 8px;
      img {
        max-height: 100px;
        object-fit: contain;
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
      &.btn-outline {
        background: transparent;
        border: 1px solid var(--color-border, #e2e8f0);
        color: var(--color-text, #0f172a);
        &:hover {
          background: var(--color-background, #f8fafc);
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
export class PdfWatermarkModalComponent implements OnInit {
  watermarkType: 'text' | 'image' = 'text';
  text = 'CONFIDENTIAL';
  fontSize = 48;
  fontFamily: FontStyleName = 'Helvetica';
  color = '#888888';
  opacity = 0.2;
  rotation = 45;
  position: WatermarkPosition = 'diagonal';
  targetPages: 'all' | 'custom' = 'all';

  imageUrl?: string;
  imageBlob?: Blob;
  scale = 0.5;

  constructor(
    private modalCtrl: ModalController,
    private state: PdfEditorStateService
  ) {}

  ngOnInit() {
    const existing = this.state.document?.watermark;
    if (existing) {
      this.watermarkType = existing.type;
      this.text = existing.text || 'CONFIDENTIAL';
      this.fontSize = existing.fontSize || 48;
      this.fontFamily = existing.fontFamily || 'Helvetica';
      this.color = existing.color || '#888888';
      this.opacity = existing.opacity || 0.2;
      this.rotation = existing.rotation || 45;
      this.position = existing.position || 'diagonal';
      this.targetPages = existing.targetPages || 'all';
      this.imageUrl = existing.imageUrl;
      this.scale = existing.scale || 0.5;
    }
  }

  pickImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e: any) => this.onFileSelected(e);
    input.click();
  }

  onFileSelected(event: any) {
    const file = event.target.files?.[0];
    if (file) {
      this.imageBlob = file;
      const reader = new FileReader();
      reader.onload = () => {
        this.imageUrl = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  saveWatermark() {
    const watermark: PdfWatermark = {
      type: this.watermarkType,
      text: this.watermarkType === 'text' ? this.text : undefined,
      imageUrl: this.watermarkType === 'image' ? this.imageUrl : undefined,
      imageBlob: this.watermarkType === 'image' ? this.imageBlob : undefined,
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      color: this.color,
      opacity: this.opacity,
      rotation: this.rotation,
      position: this.position,
      scale: this.scale,
      targetPages: this.targetPages,
      selectedPages:
        this.targetPages === 'custom' ? [this.state.currentPageNumber] : undefined
    };

    this.state.setWatermark(watermark);
    this.dismiss({ saved: true });
  }

  removeWatermark() {
    this.state.setWatermark(undefined);
    this.dismiss({ removed: true });
  }

  dismiss(data?: any) {
    this.modalCtrl.dismiss(data);
  }
}
