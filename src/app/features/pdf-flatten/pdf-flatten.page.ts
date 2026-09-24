import { Component, ElementRef, ViewChild, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, AlertController } from '@ionic/angular/lazy';
import { FileService } from '../../core/services/file.service';
import { PdfFlattenService, FlattenInspectionResult, FlattenResult } from '../../core/services/pdf-flatten.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import { SingleFileWorkflowState, ProcessingStage, PROCESSING_STAGE_LABELS } from '../../core/models/file-workflow-state.model';
import * as pdfjsLib from 'pdfjs-dist';

import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppFooterComponent,
  AppButtonComponent,
  AppTabsComponent,
  AppProgressComponent,
  FileDropzoneComponent,
  FilePreviewComponent,
  ResultPreviewComponent,
  AppIconComponent
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-flatten',
  templateUrl: './pdf-flatten.page.html',
  styleUrls: ['./pdf-flatten.page.scss'],
  standalone: true,
  imports: [
    AppIconComponent,
    IonicModule,
    CommonModule,
    FormsModule,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    AppButtonComponent,
    AppTabsComponent,
    AppProgressComponent,
    FileDropzoneComponent,
    FilePreviewComponent
  ],
  providers: [DecimalPipe]
})
export class PdfFlattenPage {
  @ViewChild('originalCanvas') originalCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('flattenedCanvas') flattenedCanvas?: ElementRef<HTMLCanvasElement>;

  comparisonTabs = [
    { id: 'side-by-side', label: 'Side-by-Side' },
    { id: 'toggle', label: 'Toggle View' }
  ];

  workflowState: SingleFileWorkflowState = 'EMPTY';
  currentStage: ProcessingStage = 'idle';
  stageLabels = PROCESSING_STAGE_LABELS;
  errorMessage = '';

  pdfFile?: File;
  pdfArrayBuffer?: ArrayBuffer;
  inspection?: FlattenInspectionResult;

  mode: 'vector' | 'raster' = 'vector';
  flattenProgress = 0;
  isFlattening = false;

  flattenResult?: FlattenResult;
  viewComparison: 'side-by-side' | 'toggle' = 'side-by-side';
  toggleViewActive: 'original' | 'flattened' = 'flattened';

  currentPage = 1;

  constructor(
    private fileService: FileService,
    private flattenService: PdfFlattenService,
    private storageService: StorageService,
    private shareService: ShareService,
    private historyService: HistoryService,
    private alertCtrl: AlertController,
    private cdr: ChangeDetectorRef
  ) {}

  async selectPdf(): Promise<void> {
    const file = await this.fileService.pickPdfFile();
    if (!file) return;
    await this.onFileSelected(file);
  }

  async onFileSelected(file: File): Promise<void> {
    this.pdfFile = file;
    this.flattenResult = undefined;
    this.currentPage = 1;
    this.errorMessage = '';
    this.workflowState = 'FILE_SELECTED';

    try {
      this.currentStage = 'analyzing';
      this.pdfArrayBuffer = await file.arrayBuffer();
      this.inspection = await this.flattenService.inspectElementsToFlatten(this.pdfArrayBuffer);
      this.workflowState = 'CONFIGURING';
      this.currentStage = 'idle';
    } catch (e: any) {
      this.workflowState = 'ERROR';
      this.errorMessage = 'Could not inspect PDF: ' + (e.message || String(e));
    }
    this.cdr.markForCheck();
  }

  removePdf(): void {
    this.pdfFile = undefined;
    this.pdfArrayBuffer = undefined;
    this.inspection = undefined;
    this.flattenResult = undefined;
    this.workflowState = 'EMPTY';
    this.errorMessage = '';
    this.currentStage = 'idle';
    this.cdr.markForCheck();
  }

  async executeFlatten(): Promise<void> {
    if (!this.pdfFile || !this.pdfArrayBuffer) return;

    this.isFlattening = true;
    this.flattenProgress = 0;
    this.workflowState = 'PROCESSING';
    this.currentStage = 'processing';
    this.errorMessage = '';

    try {
      this.currentStage = 'processing';
      this.flattenResult = await this.flattenService.flattenPdf(
        this.pdfArrayBuffer,
        this.mode,
        `${this.pdfFile.name.replace(/\.pdf$/i, '')}_flattened.pdf`,
        p => {
          this.flattenProgress = p;
          if (p >= 80) this.currentStage = 'optimizing';
          this.cdr.markForCheck();
        }
      );

      this.currentStage = 'complete';
      this.workflowState = 'SUCCESS';
      this.cdr.markForCheck();
      setTimeout(() => this.renderComparisonCanvases(), 200);
    } catch (e: any) {
      this.workflowState = 'ERROR';
      this.errorMessage = e.message || 'Flattening failed. Please verify the document is not password protected or corrupted.';
      const alert = await this.alertCtrl.create({
        header: 'Flattening Error',
        message: this.errorMessage,
        buttons: ['OK']
      });
      await alert.present();
    } finally {
      this.isFlattening = false;
      this.cdr.markForCheck();
    }
  }

  async renderComparisonCanvases(): Promise<void> {
    if (!this.pdfArrayBuffer || !this.flattenResult) return;

    // 1. Render Original
    try {
      const origTask = pdfjsLib.getDocument({
        data: new Uint8Array(this.pdfArrayBuffer.slice(0))
      } as any);
      const origPdf = await origTask.promise;
      const origPage = await origPdf.getPage(this.currentPage);
      const origViewport = origPage.getViewport({ scale: 1.0 });

      if (this.originalCanvas?.nativeElement) {
        const canvas = this.originalCanvas.nativeElement;
        canvas.width = Math.floor(origViewport.width);
        canvas.height = Math.floor(origViewport.height);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          await origPage.render({ canvasContext: ctx, viewport: origViewport } as any).promise;
        }
      }
    } catch {
      // Ignore render error
    }

    // 2. Render Flattened
    try {
      const flatBytes = await this.flattenResult.flattenedBlob.arrayBuffer();
      const flatTask = pdfjsLib.getDocument({
        data: new Uint8Array(flatBytes)
      } as any);
      const flatPdf = await flatTask.promise;
      const flatPage = await flatPdf.getPage(this.currentPage);
      const flatViewport = flatPage.getViewport({ scale: 1.0 });

      if (this.flattenedCanvas?.nativeElement) {
        const canvas = this.flattenedCanvas.nativeElement;
        canvas.width = Math.floor(flatViewport.width);
        canvas.height = Math.floor(flatViewport.height);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          await flatPage.render({ canvasContext: ctx, viewport: flatViewport } as any).promise;
        }
      }
    } catch {
      // Ignore render error
    }
  }

  async saveFlattened(): Promise<void> {
    if (!this.flattenResult || !this.pdfFile) return;

    const uri = await this.storageService.saveFile(this.flattenResult.flattenedFile, 'pdf');
    await this.historyService.addHistoryItem({
      operation: 'pdf_flatten',
      originalFileName: this.pdfFile.name,
      outputFileName: this.flattenResult.flattenedFile.name,
      originalSizeBytes: this.flattenResult.originalSizeBytes,
      outputSizeBytes: this.flattenResult.flattenedSizeBytes,
      outputPath: uri
    });

    const alert = await this.alertCtrl.create({
      header: 'Flattened PDF Saved',
      message: `Exported as "${this.flattenResult.flattenedFile.name}". All interactive elements are now static content.`,
      buttons: [
        {
          text: 'Share',
          handler: () => {
            if (uri && uri !== 'web-download') {
              this.shareService.shareFile(uri, 'Flattened Document');
            }
          }
        },
        { text: 'Done', role: 'cancel' }
      ]
    });
    await alert.present();
  }
}
