import { Component, ChangeDetectorRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { PdfInspectorService } from '../../core/services/pdf-inspector.service';
import { ToastService } from '../../core/services/toast.service';
import {
  EmbeddedAttachment,
  EmbeddedJavaScriptAction,
  PdfInspectionReport
} from '../../core/models/pdf-inspector.types';
import {
  AppHeaderComponent,
  AppFooterComponent,
  AppPageHeaderComponent,
  AppButtonComponent,
  AppBadgeComponent,
  AppRelatedToolsComponent,
  FileDropzoneComponent,
  TranslatePipe
} from '../../shared/components/ui';

export type InspectTab = 'attachments' | 'javascript' | 'links';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-inspect',
  templateUrl: './pdf-inspect.page.html',
  styleUrls: ['./pdf-inspect.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    AppHeaderComponent,
    AppFooterComponent,
    AppPageHeaderComponent,
    AppButtonComponent,
    AppBadgeComponent,
    AppRelatedToolsComponent,
    FileDropzoneComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class PdfInspectPage {
  private readonly inspectorService = inject(PdfInspectorService);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);

  activeTab: InspectTab = 'attachments';
  currentFile?: File;
  currentBuffer?: ArrayBuffer;
  report?: PdfInspectionReport;
  isInspecting = false;
  isModifying = false;

  // Confirm delete modal
  pendingDeleteType?: 'attachment' | 'javascript';
  pendingDeleteId?: string;
  pendingDeleteName?: string;
  showConfirmModal = false;

  async onFileSelected(file: File): Promise<void> {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      this.toast.error('Please select a valid PDF file.');
      return;
    }

    this.currentFile = file;
    this.currentBuffer = await file.arrayBuffer();
    await this.inspectCurrent();
  }

  async inspectCurrent(): Promise<void> {
    if (!this.currentBuffer || !this.currentFile) return;

    this.isInspecting = true;
    this.report = undefined;
    this.cdr.markForCheck();

    try {
      this.report = await this.inspectorService.inspectDocument(this.currentBuffer, this.currentFile.name);
      if (this.report.hasSuspiciousActions) {
        this.toast.warning('Interactive scripts or external launch actions detected.');
      } else {
        this.toast.success('Document inspection completed.');
      }
    } catch (err: any) {
      this.toast.error('Inspection failed: ' + (err?.message || err));
    } finally {
      this.isInspecting = false;
      this.cdr.markForCheck();
    }
  }

  downloadAttachment(att: EmbeddedAttachment): void {
    try {
      const blob = new Blob([att.data as BlobPart], { type: att.mimeType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.name;
      a.click();
      URL.revokeObjectURL(url);
      this.toast.success(`Extracted "${att.name}".`);
    } catch (err: any) {
      this.toast.error('Failed to download attachment: ' + (err?.message || err));
    }
  }

  promptDeleteAttachment(att: EmbeddedAttachment): void {
    this.pendingDeleteType = 'attachment';
    this.pendingDeleteId = att.id;
    this.pendingDeleteName = att.name;
    this.showConfirmModal = true;
    this.cdr.markForCheck();
  }

  promptDeleteScript(js: EmbeddedJavaScriptAction): void {
    this.pendingDeleteType = 'javascript';
    this.pendingDeleteId = js.id;
    this.pendingDeleteName = js.name || js.source;
    this.showConfirmModal = true;
    this.cdr.markForCheck();
  }

  cancelDelete(): void {
    this.showConfirmModal = false;
    this.pendingDeleteType = undefined;
    this.pendingDeleteId = undefined;
    this.pendingDeleteName = undefined;
    this.cdr.markForCheck();
  }

  async confirmDelete(): Promise<void> {
    if (!this.currentBuffer || !this.pendingDeleteType || !this.pendingDeleteId) return;

    this.isModifying = true;
    this.showConfirmModal = false;
    this.cdr.markForCheck();

    try {
      let updatedBytes: Uint8Array;
      if (this.pendingDeleteType === 'attachment') {
        updatedBytes = await this.inspectorService.deleteAttachment(this.currentBuffer, this.pendingDeleteId);
        this.toast.success('Attachment deleted from PDF.');
      } else {
        updatedBytes = await this.inspectorService.deleteJavaScriptAction(this.currentBuffer, this.pendingDeleteId);
        this.toast.success('JavaScript action deleted.');
      }

      this.currentBuffer = updatedBytes.buffer.slice(updatedBytes.byteOffset, updatedBytes.byteOffset + updatedBytes.byteLength) as ArrayBuffer;
      // Re-inspect the cleaned document
      await this.inspectCurrent();
    } catch (err: any) {
      this.toast.error('Deletion failed: ' + (err?.message || err));
    } finally {
      this.isModifying = false;
      this.pendingDeleteType = undefined;
      this.pendingDeleteId = undefined;
      this.cdr.markForCheck();
    }
  }

  async saveCleanedPdf(): Promise<void> {
    if (!this.currentBuffer || !this.currentFile) return;

    try {
      const bytes = new Uint8Array(this.currentBuffer);
      const safeName = `inspected_${this.currentFile.name}`;
      const res = await this.inspectorService.saveInspectedPdf(bytes, safeName);
      if (res) {
        this.toast.success('Updated PDF saved to device.');
      }
    } catch (err: any) {
      this.toast.error('Failed to save file: ' + (err?.message || err));
    }
  }

  async copyCode(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      this.toast.info('Script copied to clipboard.');
    } catch {
      this.toast.error('Could not copy code.');
    }
  }

  resetCurrent(): void {
    this.currentFile = undefined;
    this.currentBuffer = undefined;
    this.report = undefined;
    this.cdr.markForCheck();
  }
}
