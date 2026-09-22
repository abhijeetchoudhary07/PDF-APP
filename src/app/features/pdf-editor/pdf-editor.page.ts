import { Component, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import {
  IonicModule,
  ModalController,
  ToastController,
  AlertController,
  ActionSheetController
} from '@ionic/angular/lazy';
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

import { PdfReaderComponent } from './components/pdf-reader/pdf-reader.component';
import { PdfCanvasComponent } from './components/pdf-canvas/pdf-canvas.component';
import { PdfCropModalComponent } from './components/pdf-crop-modal/pdf-crop-modal.component';
import { PdfWatermarkModalComponent } from './components/pdf-watermark-modal/pdf-watermark-modal.component';
import { PdfPageNumberModalComponent } from './components/pdf-page-number-modal/pdf-page-number-modal.component';
import { PdfRedactionModalComponent } from './components/pdf-redaction-modal/pdf-redaction-modal.component';
import { AppButtonComponent,
  AppIconComponent
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
    IonicModule,
    PdfReaderComponent,
    PdfCanvasComponent,
    AppButtonComponent
  ]
})
export class PdfEditorPage implements OnInit, OnDestroy {
  showThumbnails = false;
  showSearch = false;
  mobileActiveGroup: 'view' | 'annotate' | 'shapes' | 'insert' | 'tools' = 'view';

  // Export overlay state
  isExporting = false;
  exportProgress = 0;
  exportStage = '';

  private subs = new Subscription();

  constructor(
    public state: PdfEditorStateService,
    private renderService: PdfRenderService,
    private exportPipeline: PdfExportPipelineService,
    private fileService: FileService,
    private storageService: StorageService,
    private shareService: ShareService,
    private historyService: HistoryService,
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private actionSheetCtrl: ActionSheetController,
    private router: Router
  ) {}

  ngOnInit() {
    this.subs.add(
      this.state.isExporting$.subscribe(exp => (this.isExporting = exp))
    );
    this.subs.add(
      this.state.exportProgress$.subscribe(p => (this.exportProgress = p))
    );
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
        this.showToast('Please drop a valid PDF file.', 'warning');
      }
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  async loadPdfFile(file: File) {
    this.isExporting = true;
    this.exportStage = 'Loading PDF document...';
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
      const docId = `doc_${Date.now()}`;
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
      this.showToast(`Loaded ${file.name} (${numPages} pages)`, 'success');
    } catch (e: any) {
      this.showToast(`Failed to load PDF: ${e.message}`, 'danger');
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

  // --- Export & Share ---

  async exportPdf() {
    const doc = this.state.document;
    if (!doc) return;

    this.isExporting = true;
    this.exportStage = 'Compiling PDF with overlays and security checks...';
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

      this.showToast('Export complete! PDF saved.', 'success');
    } catch (e: any) {
      this.showToast(`Export failed: ${e.message}`, 'danger');
    } finally {
      this.isExporting = false;
    }
  }

  async sharePdf() {
    const doc = this.state.document;
    if (!doc) return;

    this.isExporting = true;
    this.exportStage = 'Preparing PDF for sharing...';
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
      this.showToast('Share initiated.', 'success');
    } catch (e: any) {
      this.showToast(`Share failed: ${e.message}`, 'danger');
    } finally {
      this.isExporting = false;
    }
  }

  private async showToast(message: string, color: 'success' | 'warning' | 'danger' | 'medium' = 'medium') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      position: 'bottom',
      color
    });
    await toast.present();
  }
}
