import { AppIconComponent } from '../../../../shared/components/ui';
import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular/lazy';
import { PdfEditorStateService } from '../../../../core/services/pdf-editor-state.service';
import { PdfRedaction } from '../../../../core/models/pdf-editor.types';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-redaction-modal',
  template: `
    <div class="redaction-modal-wrapper">
      <div class="redaction-modal-header">
        <h3>PDF Redaction Manager</h3>
        <button class="modal-close-btn" (click)="dismiss()">
          <app-icon name="close"></app-icon>
        </button>
      </div>

      <div class="redaction-modal-content">
        <!-- SECURITY NOTICE BANNER -->
        <div class="security-banner">
          <app-icon name="shield-checkmark" class="security-icon"></app-icon>
          <div>
            <strong>True Redaction Guarantee</strong>
            <p>
              A visual black rectangle alone is NOT secure because underlying text remains extractable.
              When applied, our export engine permanently burns blackouts into the pixel raster, destroying
              underlying vector text streams so sensitive data cannot be recovered by text extraction tools.
            </p>
          </div>
        </div>

        <!-- PREVIEW TOGGLE -->
        <div class="preview-toggle-card">
          <div>
            <h4 class="toggle-title">Preview Mode</h4>
            <p class="toggle-subtitle">View document with blackouts active</p>
          </div>
          <label class="switch">
            <input type="checkbox" [checked]="state.redactionPreview$ | async" (change)="togglePreviewDirect($event)" />
            <span class="slider round"></span>
          </label>
        </div>

        <!-- PENDING REDACTIONS LIST -->
        <div class="redactions-list-section">
          <div class="section-title-row">
            <h4>Marked Areas ({{ totalRedactions }})</h4>
          </div>

          <p *ngIf="totalRedactions === 0" class="no-redactions">
            No redaction marks placed yet. Select the Redaction tool and drag over sensitive content to mark it.
          </p>

          <div *ngIf="totalRedactions > 0" class="redactions-list">
            <ng-container *ngFor="let page of state.document?.pages">
              <div *ngFor="let red of page.redactions" class="redaction-item">
                <div class="item-left">
                  <app-icon
                    [name]="red.isApplied ? 'checkmark-circle' : 'time-outline'"
                    [class.text-success]="red.isApplied"
                    [class.text-warning]="!red.isApplied"
                    class="status-icon"
                  ></app-icon>
                  <div class="item-details">
                    <h5>Page {{ red.pageNumber }} Redaction</h5>
                    <p>{{ red.width | number:'1.0-0' }} x {{ red.height | number:'1.0-0' }} pt &bull; {{ red.isApplied ? 'Applied' : 'Pending' }}</p>
                  </div>
                </div>
                <button class="delete-btn" (click)="deleteRedaction(page.pageNumber, red.id)">
                  <app-icon name="trash-outline"></app-icon>
                </button>
              </div>
            </ng-container>
          </div>
        </div>

        <!-- ACTIONS -->
        <div class="actions">
          <button
            class="btn btn-danger"
            (click)="applyAll()"
            [disabled]="pendingRedactionsCount === 0"
          >
            <app-icon name="lock-closed"></app-icon>
            Permanently Apply Redactions ({{ pendingRedactionsCount }})
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .redaction-modal-wrapper {
      background: var(--color-surface, #ffffff);
      border-radius: var(--radius-lg, 12px);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .redaction-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-4, 16px);
      background: var(--color-error, #dc2626);
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
    .redaction-modal-content {
      padding: var(--space-5, 20px);
      overflow-y: auto;
      max-width: 540px;
      margin: 0 auto;
      width: 100%;
    }
    .security-banner {
      display: flex;
      gap: 12px;
      background: var(--color-error-soft, rgba(239, 68, 68, 0.08));
      border: 1px solid var(--color-error-soft, rgba(239, 68, 68, 0.2));
      border-radius: var(--radius-md, 8px);
      padding: 14px;
      margin-bottom: var(--space-4, 16px);

      .security-icon {
        font-size: 28px;
        color: var(--color-error, #dc2626);
        flex-shrink: 0;
      }
      strong {
        color: var(--color-error, #dc2626);
        font-size: var(--font-sm, 14px);
      }
      p {
        margin: 4px 0 0;
        font-size: var(--font-xs, 12px);
        color: var(--color-text-secondary, #64748b);
        line-height: 1.4;
      }
    }
    .preview-toggle-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-3, 12px);
      background: var(--color-background, #f8fafc);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 8px);
      margin-bottom: var(--space-4, 16px);

      .toggle-title {
        margin: 0;
        font-size: var(--font-sm, 14px);
        font-weight: 600;
        color: var(--color-text, #0f172a);
      }
      .toggle-subtitle {
        margin: 2px 0 0;
        font-size: var(--font-xs, 12px);
        color: var(--color-text-secondary, #64748b);
      }
    }
    .switch {
      position: relative;
      display: inline-block;
      width: 44px;
      height: 24px;
      input {
        opacity: 0;
        width: 0;
        height: 0;
      }
    }
    .slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: #cbd5e1;
      transition: .3s;
      border-radius: 24px;
      &:before {
        position: absolute;
        content: "";
        height: 18px;
        width: 18px;
        left: 3px;
        bottom: 3px;
        background-color: white;
        transition: .3s;
        border-radius: 50%;
      }
    }
    input:checked + .slider {
      background-color: var(--color-primary, #2563eb);
    }
    input:checked + .slider:before {
      transform: translateX(20px);
    }
    .section-title-row {
      margin-bottom: var(--space-2, 8px);
      h4 {
        margin: 0;
        font-size: var(--font-sm, 14px);
        font-weight: 600;
        color: var(--color-text, #0f172a);
      }
    }
    .no-redactions {
      text-align: center;
      padding: 24px 16px;
      color: var(--color-text-muted, #94a3b8);
      font-size: var(--font-sm, 14px);
    }
    .redactions-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2, 8px);
    }
    .redaction-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-3, 12px);
      background: var(--color-surface, #ffffff);
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: var(--radius-md, 8px);

      .item-left {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
      }
      .status-icon {
        font-size: 20px;
        &.text-success { color: var(--color-success, #16a34a); }
        &.text-warning { color: var(--color-warning, #d97706); }
      }
      .item-details {
        h5 {
          margin: 0;
          font-size: var(--font-sm, 14px);
          font-weight: 600;
          color: var(--color-text, #0f172a);
        }
        p {
          margin: 2px 0 0;
          font-size: var(--font-xs, 12px);
          color: var(--color-text-secondary, #64748b);
        }
      }
      .delete-btn {
        background: transparent;
        border: none;
        color: var(--color-error, #dc2626);
        cursor: pointer;
        padding: 4px;
        font-size: 16px;
        &:hover {
          color: #b91c1c;
        }
      }
    }
    .actions {
      margin-top: var(--space-5, 20px);
    }
    .btn {
      width: 100%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 16px;
      border-radius: var(--radius-md, 8px);
      font-size: var(--font-sm, 14px);
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all var(--transition-fast);

      &.btn-danger {
        background: var(--color-error, #dc2626);
        color: #ffffff;
        &:hover:not(:disabled) {
          background: #b91c1c;
        }
        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }
    }
  `],
  standalone: true,
  imports: [
    AppIconComponent,CommonModule, FormsModule, IonicModule]
})
export class PdfRedactionModalComponent implements OnInit {
  constructor(
    private modalCtrl: ModalController,
    public state: PdfEditorStateService
  ) {}

  ngOnInit() {}

  get totalRedactions(): number {
    const doc = this.state.document;
    if (!doc) return 0;
    return doc.pages.reduce((sum, p) => sum + p.redactions.length, 0);
  }

  get pendingRedactionsCount(): number {
    const doc = this.state.document;
    if (!doc) return 0;
    return doc.pages.reduce((sum, p) => sum + p.redactions.filter(r => !r.isApplied).length, 0);
  }

  togglePreview(e: any) {
    this.state.setRedactionPreview(e.detail.checked);
  }

  togglePreviewDirect(e: Event) {
    const target = e.target as HTMLInputElement;
    this.state.setRedactionPreview(target?.checked ?? false);
  }

  deleteRedaction(pageNumber: number, id: string) {
    const page = this.state.document?.pages.find(p => p.pageNumber === pageNumber);
    if (page) {
      const idx = page.redactions.findIndex(r => r.id === id);
      if (idx !== -1) {
        page.redactions.splice(idx, 1);
      }
    }
  }

  applyAll() {
    this.state.applyAllRedactions();
    this.dismiss({ applied: true });
  }

  dismiss(data?: any) {
    this.modalCtrl.dismiss(data);
  }
}
