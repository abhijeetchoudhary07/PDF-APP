import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalController } from '@ionic/angular';
import { AppIconComponent, TranslatePipe } from '../../../../shared/components/ui';
import { PdfEditorStateService } from '../../../../core/services/pdf-editor-state.service';
import { PdfAnnotationFlattenService } from '../../../../core/services/pdf-annotation-flatten.service';
import { PdfExportPipelineService } from '../../../../core/services/pdf-export-pipeline.service';
import { StorageService } from '../../../../core/services/storage.service';
import { HistoryService } from '../../../../core/services/history.service';

interface Notice {
  key: string;
  variant: 'ok' | 'warn' | 'danger' | 'info';
  params: Record<string, string | number>;
}

/**
 * K7 — flatten the comments, or export them as an overlay.
 *
 * Both paths run against the document as it will be exported, not against
 * the file as it was opened: the marks someone just placed live in the
 * editor's overlay model until the export pipeline writes them, so
 * flattening the opened bytes would flatten a document with nothing on it.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-flatten-overlay-modal',
  standalone: true,
  imports: [CommonModule, AppIconComponent, TranslatePipe],
  templateUrl: './pdf-flatten-overlay-modal.component.html',
  styleUrls: ['./pdf-flatten-overlay-modal.component.scss']
})
export class PdfFlattenOverlayModalComponent {
  state = inject(PdfEditorStateService);
  private flattenService = inject(PdfAnnotationFlattenService);
  private exportPipeline = inject(PdfExportPipelineService);
  private storage = inject(StorageService);
  private history = inject(HistoryService);
  private modalCtrl = inject(ModalController);

  isBusy = false;
  notices: Notice[] = [];

  get hasDocument(): boolean {
    return this.state.document !== null;
  }

  async flatten(): Promise<void> {
    const doc = this.state.document;
    if (!doc) return;

    this.isBusy = true;
    this.notices = [];

    try {
      const composed = await this.composedBytes();
      const result = await this.flattenService.flattenAnnotations(composed, {
        keepFormFieldsInteractive: true
      });

      if (result.flattened === 0 && result.skippedWithoutAppearance === 0) {
        this.notices = [{ key: 'editor.foNothingToDo', variant: 'info', params: {} }];
        return;
      }

      const name = this.outputName('annotations-flattened');
      const file = new File([result.pdfBytes as BlobPart], name, { type: 'application/pdf' });
      const uri = await this.storage.saveFile(file, 'document');
      await this.record(file, uri, 'pdf-editor-flatten-annotations');

      const notices: Notice[] = [
        {
          key: 'editor.foFlattenResult',
          variant: 'ok',
          params: { count: result.flattened, widgets: result.widgetsKept }
        },
        { key: 'editor.kSavedAs', variant: 'ok', params: { name } }
      ];

      if (result.skippedWithoutAppearance > 0) {
        notices.push({
          key: 'editor.foFlattenSkipped',
          variant: 'warn',
          params: { count: result.skippedWithoutAppearance }
        });
      }

      this.notices = notices;
    } catch (error) {
      this.reportFailure(error);
    } finally {
      this.isBusy = false;
    }
  }

  async exportOverlay(): Promise<void> {
    const doc = this.state.document;
    if (!doc) return;

    this.isBusy = true;
    this.notices = [];

    try {
      const composed = await this.composedBytes();
      const result = await this.flattenService.exportAnnotationOverlay(composed, doc);

      if (result.annotationsDrawn === 0 && result.annotationsCopied === 0) {
        this.notices = [{ key: 'editor.foNothingToDo', variant: 'info', params: {} }];
        return;
      }

      const name = this.outputName('annotation-overlay');
      const file = new File([result.blob], name, { type: 'application/pdf' });
      const uri = await this.storage.saveFile(file, 'document');
      await this.record(file, uri, 'pdf-editor-annotation-overlay');

      this.notices = [
        {
          key: 'editor.foOverlayResult',
          variant: 'ok',
          params: { pages: result.pageCount, drawn: result.annotationsDrawn }
        },
        { key: 'editor.kSavedAs', variant: 'ok', params: { name } }
      ];
    } catch (error) {
      this.reportFailure(error);
    } finally {
      this.isBusy = false;
    }
  }

  /**
   * The document with this session's marks written in.
   *
   * Running the export pipeline first is what makes "flatten the comments"
   * mean the comments on screen. Without it the pass would see only the
   * annotations the file arrived with.
   */
  private async composedBytes(): Promise<Uint8Array> {
    const doc = this.state.document;
    if (!doc) return new Uint8Array();

    const exported = await this.exportPipeline.exportDocument(doc);
    return new Uint8Array(await exported.blob.arrayBuffer());
  }

  private outputName(suffix: string): string {
    const base = (this.state.document?.name || 'document').replace(/\.pdf$/i, '');
    return `${base}_${suffix}.pdf`;
  }

  private async record(file: File, uri: string | null | undefined, operation: string): Promise<void> {
    await this.history.addHistoryItem({
      operation,
      originalFileName: this.state.document?.name || 'document.pdf',
      outputFileName: file.name,
      originalSizeBytes: this.state.document?.sizeBytes || 0,
      outputSizeBytes: file.size,
      outputPath: uri || 'web-download'
    });
  }

  private reportFailure(error: unknown): void {
    console.error('Flatten or overlay export failed', error);
    this.notices = [
      {
        key: 'editor.kFailed',
        variant: 'danger',
        params: { reason: error instanceof Error ? error.message : String(error) }
      }
    ];
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }
}
