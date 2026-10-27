import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import {
  ModalController,
  ToastController,
  AlertController,
  ActionSheetController
} from '@ionic/angular';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { Subscription } from 'rxjs';

import { PdfEditorStateService } from '../../core/services/pdf-editor-state.service';
import { PdfRenderService } from '../../core/services/pdf-render.service';
import { PdfExportPipelineService } from '../../core/services/pdf-export-pipeline.service';
import { FileService } from '../../core/services/file.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';

import {
  PdfEditorDocument,
  PdfEditorPage as EditorPageModel,
  EditorTool,
  ShapeType,
  AnnotationType
} from '../../core/models/pdf-editor.types';
import { PlacementCompleted } from '../../core/services/pdf-editor-state.service';

import { PdfReaderComponent } from './components/pdf-reader/pdf-reader.component';
import { PdfCanvasComponent } from './components/pdf-canvas/pdf-canvas.component';
import { PdfCropModalComponent } from './components/pdf-crop-modal/pdf-crop-modal.component';
import { PdfWatermarkModalComponent } from './components/pdf-watermark-modal/pdf-watermark-modal.component';
import { PdfPageNumberModalComponent } from './components/pdf-page-number-modal/pdf-page-number-modal.component';
import { PdfRedactionModalComponent } from './components/pdf-redaction-modal/pdf-redaction-modal.component';
import { PdfFindReplaceModalComponent } from './components/pdf-find-replace-modal/pdf-find-replace-modal.component';
import { PdfLinkModalComponent } from './components/pdf-link-modal/pdf-link-modal.component';
import { PdfCommentReviewModalComponent } from './components/pdf-comment-review-modal/pdf-comment-review-modal.component';
import { PdfShapeMeasurementModalComponent } from './components/pdf-shape-measurement-modal/pdf-shape-measurement-modal.component';
import { PdfTextEditModalComponent } from './components/pdf-text-edit-modal/pdf-text-edit-modal.component';
import { PdfFlattenOverlayModalComponent } from './components/pdf-flatten-overlay-modal/pdf-flatten-overlay-modal.component';
import { PdfImageToolsModalComponent } from './components/pdf-image-tools-modal/pdf-image-tools-modal.component';
import { PdfWhiteoutModalComponent } from './components/pdf-whiteout-modal/pdf-whiteout-modal.component';
import { TranslationService } from '../../core/services/translation.service';
import { PdfShapeMeasurementService } from '../../core/services/pdf-shape-measurement.service';
import { CommentThread } from '../../core/models/editor-features.types';
import {
  AppButtonComponent,
  AppIconComponent,
  AppLanguageSelectorComponent,
  TranslatePipe
} from '../../shared/components/ui';

@Component({
  // Full-height workspace: it manages its own internal scrolling panes, so it
  // opts out of the shared page-level scroll container.
  host: { class: 'is-workspace' },
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-editor',
  templateUrl: './pdf-editor.page.html',
  styleUrls: ['./pdf-editor.page.scss'],
  standalone: true,
  imports: [
    AppIconComponent,
    CommonModule,
    FormsModule,
    RouterModule,
    PdfReaderComponent,
    PdfCanvasComponent,
    AppButtonComponent,
    AppLanguageSelectorComponent,
    TranslatePipe
  ]
})
export class PdfEditorPage implements OnInit, OnDestroy {
  state = inject(PdfEditorStateService);
  private renderService = inject(PdfRenderService);
  private exportPipeline = inject(PdfExportPipelineService);
  private fileService = inject(FileService);
  private storageService = inject(StorageService);
  private shareService = inject(ShareService);
  private historyService = inject(HistoryService);
  private modalCtrl = inject(ModalController);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private actionSheetCtrl = inject(ActionSheetController);
  private router = inject(Router);
  private i18n = inject(TranslationService);
  private shapes = inject(PdfShapeMeasurementService);

  showThumbnails = false;
  showSearch = false;
  mobileActiveGroup: 'view' | 'annotate' | 'shapes' | 'insert' | 'tools' = 'view';

  // Export overlay state
  isExporting = false;
  exportProgress = 0;
  exportStage = '';

  private subs = new Subscription();

  ngOnInit() {
    this.subs.add(
      this.state.isExporting$.subscribe(exp => (this.isExporting = exp))
    );
    this.subs.add(
      this.state.exportProgress$.subscribe(p => (this.exportProgress = p))
    );

    /*
     * Placement runs on the canvas, not in the sheet that started it, so
     * this is where the person finds out it worked. Without it, tapping the
     * page to put a comment down gives no feedback at all beyond a small
     * marker that may be under their finger.
     */
    this.subs.add(
      this.state.placementCompleted$.subscribe(event => {
        void this.announcePlacement(event);
      })
    );
  }

  /** Confirms what landed on the page, and reopens the sheet behind it. */
  private async announcePlacement(event: PlacementCompleted): Promise<void> {
    switch (event.tool) {
      case 'link':
        await this.showToast(
          this.i18n.translate('editor.placedLink', { page: event.link.pageNumber }),
          'success'
        );
        await this.openLinkModal();
        return;

      case 'comment':
        await this.showToast(
          this.i18n.translate('editor.placedComment', { page: event.thread.pageNumber }),
          'success'
        );
        await this.openCommentModal();
        return;

      case 'whiteout':
        await this.showToast(
          this.i18n.translate('editor.placedWhiteout', { page: event.region.pageNumber }),
          'warning'
        );
        return;

      case 'measure':
        if ('calibratedScale' in event) {
          await this.showToast(
            this.i18n.translate('editor.calibrationSet', {
              text: this.shapes.calibrationLabel(event.calibratedScale).text
            }),
            'success'
          );
        } else {
          await this.showToast(
            this.i18n.translate('editor.placedMeasurement', {
              value: event.measurement.formattedString
            }),
            'success'
          );
        }
        await this.openShapeMeasurementModal();
        return;
    }
  }

  /** Opens the review sheet on the thread whose pin was tapped. */
  async onCommentOpened(thread: CommentThread): Promise<void> {
    this.state.setCurrentPage(thread.pageNumber);
    await this.openCommentModal();
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
    this.renderService.clear();
    this.state.clearDocument();
  }

  // --- Document Loading ---

  async selectPdfFile() {
    const file = await this.fileService.pickPdfFile();
    if (file) {
      await this.loadPdfFile(file);
    }
  }

  async onFileDropped(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const dt = event.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      const file = dt.files[0];
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        await this.loadPdfFile(file);
      } else {
        await this.showToast(this.i18n.translate('editor.dropPdfOnly'), 'warning');
      }
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  async loadPdfFile(file: File) {
    this.isExporting = true;
    this.exportStage = this.i18n.translate('editor.loadingDocument');
    this.exportProgress = 10;

    try {
      const arrayBuffer = await file.arrayBuffer();

      // Read pages metadata using pdf-lib
      const pdfLibDoc = await PDFDocument.load(arrayBuffer.slice(0), {
        ignoreEncryption: true
      });
      const numPages = pdfLibDoc.getPageCount();

      this.exportProgress = 40;

      // Initialize PdfRenderService
      const docId = `doc_${file.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_${file.size}`;
      await this.renderService.loadPdf(arrayBuffer, docId);

      this.exportProgress = 70;

      // Build EditorPage models
      const pages: EditorPageModel[] = [];
      const pdfPages = pdfLibDoc.getPages();

      for (let i = 0; i < numPages; i++) {
        const page = pdfPages[i];
        const size = page.getSize();
        pages.push({
          pageNumber: i + 1,
          originalWidth: size.width,
          originalHeight: size.height,
          currentWidth: size.width,
          currentHeight: size.height,
          rotation: 0,
          elements: [],
          redactions: []
        });
      }

      const docModel: PdfEditorDocument = {
        id: docId,
        name: file.name,
        sizeBytes: file.size,
        pageCount: numPages,
        file,
        arrayBuffer,
        pages
      };

      this.state.initDocument(docModel);
      this.exportProgress = 100;
      await this.showToast(
        this.i18n.translate('editor.loadedDocument', { name: file.name, pages: numPages }),
        'success'
      );
    } catch (e: any) {
      await this.showToast(
        this.i18n.translate('editor.kFailed', { reason: e?.message || String(e) }),
        'danger'
      );
    } finally {
      this.isExporting = false;
    }
  }

  // --- Tool Switching ---

  setTool(tool: EditorTool) {
    this.state.setActiveTool(tool);
  }

  setShapeTool(shape: ShapeType) {
    this.state.updateToolSettings({ shapeType: shape });
    this.state.setActiveTool(shape);
  }

  setAnnotationTool(annot: AnnotationType) {
    this.state.updateToolSettings({ annotationType: annot });
    if (annot === 'highlight') {
      this.state.updateToolSettings({ color: '#FFF200' });
      this.state.setActiveTool('highlight');
    } else if (annot === 'underline') {
      this.state.updateToolSettings({ color: '#FF0000', strokeWidth: 2 });
      this.state.setActiveTool('underline');
    } else if (annot === 'strikethrough') {
      this.state.updateToolSettings({ color: '#FF0000', strokeWidth: 2 });
      this.state.setActiveTool('strikethrough');
    } else if (annot === 'note') {
      this.state.updateToolSettings({ color: '#FFD700' });
      this.state.setActiveTool('note');
    }
  }

  async insertImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            const aspect = img.width / img.height;
            const width = Math.min(200, this.state.currentPage?.originalWidth || 200);
            const height = width / aspect;

            this.state.addElement({
              type: 'image',
              imageUrl: reader.result as string,
              imageBlob: file,
              aspectRatio: aspect,
              x: 50,
              y: 50,
              width,
              height,
              rotation: 0,
              opacity: 1.0
            } as any);
            this.state.setActiveTool('select');
          };
          img.src = reader.result as string;
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  }

  // --- Modals (Crop, Watermark, Page Numbering, Redaction) ---

  async openCropModal() {
    const modal = await this.modalCtrl.create({
      component: PdfCropModalComponent
    });
    await modal.present();
  }

  async openWatermarkModal() {
    const modal = await this.modalCtrl.create({
      component: PdfWatermarkModalComponent
    });
    await modal.present();
  }

  async openPageNumberModal() {
    const modal = await this.modalCtrl.create({
      component: PdfPageNumberModalComponent
    });
    await modal.present();
  }

  async openRedactionModal() {
    const modal = await this.modalCtrl.create({
      component: PdfRedactionModalComponent
    });
    await modal.present();
  }

  async openFindReplaceModal() {
    const modal = await this.modalCtrl.create({
      component: PdfFindReplaceModalComponent
    });
    await modal.present();
  }

  async openLinkModal() {
    const modal = await this.modalCtrl.create({
      component: PdfLinkModalComponent
    });
    await modal.present();
  }

  async openCommentModal() {
    const modal = await this.modalCtrl.create({
      component: PdfCommentReviewModalComponent
    });
    await modal.present();
  }

  async openShapeMeasurementModal() {
    const modal = await this.modalCtrl.create({
      component: PdfShapeMeasurementModalComponent
    });
    await modal.present();
  }

  async openTextEditModal() {
    const modal = await this.modalCtrl.create({
      component: PdfTextEditModalComponent
    });
    await modal.present();
  }

  async openFlattenOverlayModal() {
    const modal = await this.modalCtrl.create({
      component: PdfFlattenOverlayModalComponent
    });
    await modal.present();
  }

  async openImageToolsModal() {
    const modal = await this.modalCtrl.create({
      component: PdfImageToolsModalComponent
    });
    await modal.present();
  }

  /**
   * The whiteout sheet.
   *
   * This replaces an alert that dropped a fixed 140 x 30 rectangle at a
   * fixed spot on the page and called it placed. Whiteout is an area tool,
   * so it now opens a sheet that explains what covering does, offers the way
   * out to real redaction, and hands the area off to be drawn on the page.
   */
  async activateWhiteout() {
    const modal = await this.modalCtrl.create({
      component: PdfWhiteoutModalComponent
    });
    await modal.present();
  }

  // --- Export & Share ---

  async exportPdf() {
    const doc = this.state.document;
    if (!doc) return;

    this.isExporting = true;
    this.exportStage = this.i18n.translate('editor.exportingStage');
    this.exportProgress = 5;

    try {
      const result = await this.exportPipeline.exportDocument(
        doc,
        undefined,
        progress => {
          this.exportProgress = progress;
        }
      );

      // Save to storage and history
      const uri = await this.storageService.saveFile(result.file, 'document');
      await this.historyService.addHistoryItem({
        operation: 'pdf-editor',
        originalFileName: doc.name,
        outputFileName: result.file.name,
        originalSizeBytes: doc.sizeBytes,
        outputSizeBytes: result.sizeBytes,
        outputPath: uri || 'web-download'
      });

      await this.showToast(this.i18n.translate('editor.exportDone'), 'success');
    } catch (e: any) {
      await this.showToast(
        this.i18n.translate('editor.kFailed', { reason: e?.message || String(e) }),
        'danger'
      );
    } finally {
      this.isExporting = false;
    }
  }

  async sharePdf() {
    const doc = this.state.document;
    if (!doc) return;

    this.isExporting = true;
    this.exportStage = this.i18n.translate('editor.sharingStage');
    this.exportProgress = 10;

    try {
      const result = await this.exportPipeline.exportDocument(
        doc,
        undefined,
        progress => {
          this.exportProgress = progress;
        }
      );

      await this.shareService.shareFile(result.file, result.file.name);
      await this.showToast(this.i18n.translate('editor.shareStarted'), 'success');
    } catch (e: any) {
      await this.showToast(
        this.i18n.translate('editor.kFailed', { reason: e?.message || String(e) }),
        'danger'
      );
    } finally {
      this.isExporting = false;
    }
  }

  private async showToast(message: string, color: 'success' | 'warning' | 'danger' | 'medium' = 'medium') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      position: 'top',
      color
    });
    await toast.present();
  }
}
