import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalController } from '@ionic/angular';
import { AppIconComponent } from '../../../../shared/components/ui';
import { PdfEditorStateService } from '../../../../core/services/pdf-editor-state.service';
import { PdfAnnotationFlattenService } from '../../../../core/services/pdf-annotation-flatten.service';
import { StorageService } from '../../../../core/services/storage.service';
import { HistoryService } from '../../../../core/services/history.service';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-flatten-overlay-modal',
  standalone: true,
  imports: [CommonModule, AppIconComponent],
  template: `
    <div class="modal-wrapper">
      <div class="modal-header">
        <div class="header-title">
          <app-icon name="layers"></app-icon>
          <h3>Flatten & Overlay Tools</h3>
        </div>
        <button class="close-btn" (click)="dismiss()" aria-label="Close">
          <app-icon name="close"></app-icon>
        </button>
      </div>

      <div class="modal-body">
        <!-- FLATTEN ANNOTATIONS CARD -->
        <div class="card">
          <div class="card-title-row">
            <app-icon name="shield-checkmark" class="card-icon blue"></app-icon>
            <div>
              <h4 class="card-title">Flatten Annotations Only</h4>
              <p class="card-desc">Bake drawings, highlights, and notes into the PDF page streams while strictly preserving all interactive AcroForm fields (fillable text inputs, checkboxes, dropdowns).</p>
            </div>
          </div>
          <div class="pill-badge">Forms Stay Interactive</div>
          <button class="action-btn" (click)="flattenAnnotations()" [disabled]="isProcessing">
            <app-icon name="layers"></app-icon>
            <span>{{ isProcessing && currentAction === 'flatten' ? 'Flattening...' : 'Flatten Annotations Only' }}</span>
          </button>
        </div>

        <!-- EXPORT TRANSPARENT OVERLAY CARD -->
        <div class="card">
          <div class="card-title-row">
            <app-icon name="copy" class="card-icon amber"></app-icon>
            <div>
              <h4 class="card-title">Export Transparent Overlay PDF</h4>
              <p class="card-desc">Extract only the annotation and markup layer onto transparent pages with identical geometry and page count. Pairs directly with the C6 Overlay / Underlay tool.</p>
            </div>
          </div>
          <div class="pill-badge">Transparent Background &bull; C6 Compatible</div>
          <button class="action-btn overlay-btn" (click)="exportOverlay()" [disabled]="isProcessing">
            <app-icon name="download"></app-icon>
            <span>{{ isProcessing && currentAction === 'overlay' ? 'Exporting Overlay...' : 'Export Transparent Overlay' }}</span>
          </button>
        </div>

        @if (statusMessage) {
          <div class="status-box">
            <app-icon name="checkmark-circle" class="status-icon"></app-icon>
            <span>{{ statusMessage }}</span>
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
      app-icon { font-size: 1.25rem; color: #0284c7; }
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
    .card-title-row {
      display: flex;
      gap: 12px;
    }
    .card-icon {
      font-size: 1.5rem;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .card-icon.blue { color: #0284c7; }
    .card-icon.amber { color: #d97706; }
    .card-title { margin: 0; font-size: 0.98rem; font-weight: 700; }
    .card-desc { margin: 4px 0 0; font-size: 0.82rem; line-height: 1.4; color: #475569; }
    .pill-badge {
      display: inline-block;
      align-self: flex-start;
      font-size: 0.72rem;
      font-weight: 600;
      background: #e0f2fe;
      color: #0369a1;
      padding: 3px 8px;
      border-radius: 4px;
    }
    .action-btn {
      min-height: 44px;
      border: none;
      border-radius: 8px;
      background: #0284c7;
      color: #ffffff;
      font-size: 0.9rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .overlay-btn { background: #d97706; }
    .action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .status-box {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      color: #065f46;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 0.88rem;
    }
    .status-icon { color: #10b981; font-size: 1.2rem; }
  `]
})
export class PdfFlattenOverlayModalComponent implements OnInit {
  state = inject(PdfEditorStateService);
  private flattenService = inject(PdfAnnotationFlattenService);
  private storageService = inject(StorageService);
  private historyService = inject(HistoryService);
  private modalCtrl = inject(ModalController);

  isProcessing = false;
  currentAction: 'flatten' | 'overlay' | null = null;
  statusMessage = '';

  ngOnInit() {}

  async flattenAnnotations() {
    const doc = this.state.document;
    if (!doc) return;

    this.isProcessing = true;
    this.currentAction = 'flatten';
    this.statusMessage = '';

    try {
      const flattenedBytes = await this.flattenService.flattenAnnotationsOnly(
        new Uint8Array(doc.arrayBuffer.slice(0)),
        { keepFormFieldsInteractive: true }
      );

      const blob = new Blob([flattenedBytes as any], { type: 'application/pdf' });
      const file = new File([blob], `${doc.name.replace(/\.pdf$/i, '')}_annotations_flattened.pdf`, { type: 'application/pdf' });
      const uri = await this.storageService.saveFile(file, 'document');

      await this.historyService.addHistoryItem({
        operation: 'pdf-editor-flatten',
        originalFileName: doc.name,
        outputFileName: file.name,
        originalSizeBytes: doc.sizeBytes,
        outputSizeBytes: file.size,
        outputPath: uri || 'download'
      });

      this.statusMessage = 'Annotations flattened! Interactive form fields preserved intact.';
    } catch (e: any) {
      this.statusMessage = `Flattening failed: ${e.message}`;
    } finally {
      this.isProcessing = false;
    }
  }

  async exportOverlay() {
    const doc = this.state.document;
    if (!doc) return;

    this.isProcessing = true;
    this.currentAction = 'overlay';
    this.statusMessage = '';

    try {
      const res = await this.flattenService.exportAnnotationOverlay(
        new Uint8Array(doc.arrayBuffer.slice(0)),
        doc
      );

      const file = new File([res.blob], `${doc.name.replace(/\.pdf$/i, '')}_transparent_overlay.pdf`, { type: 'application/pdf' });
      const uri = await this.storageService.saveFile(file, 'document');

      await this.historyService.addHistoryItem({
        operation: 'pdf-editor-overlay',
        originalFileName: doc.name,
        outputFileName: file.name,
        originalSizeBytes: doc.sizeBytes,
        outputSizeBytes: file.size,
        outputPath: uri || 'download'
      });

      this.statusMessage = `Exported transparent overlay PDF (${res.pageCount} pages)! Compatible with C6 Overlay.`;
    } catch (e: any) {
      this.statusMessage = `Overlay export failed: ${e.message}`;
    } finally {
      this.isProcessing = false;
    }
  }

  dismiss() {
    this.modalCtrl.dismiss();
  }
}
