import { Component, ChangeDetectorRef, ChangeDetectionStrategy, OnInit, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { PDFDocument } from 'pdf-lib';
import { PdfHeaderFooterService } from '../../core/services/pdf-header-footer.service';
import { FileService } from '../../core/services/file.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import { ToastService } from '../../core/services/toast.service';
import {
  HeaderFooterConfig,
  PageTargetMode,
  FirstPageMode
} from '../../core/models/pdf-analysis.types';
import {
  BatesBatchPlan,
  BatesFilePlan,
  BatesOptions,
  BatesOutput,
  BatesPosition,
  BATES_POSITIONS,
  defaultBatesOptions
} from '../../core/models/pdf-navigation.types';
import {
  AppHeaderComponent,
  AppFooterComponent,
  AppPageHeaderComponent,
  AppButtonComponent,
  AppTabsComponent,
  AppIconComponent,
  AppProgressComponent,
  AppRelatedToolsComponent,
  FileDropzoneComponent,
  TranslatePipe
} from '../../shared/components/ui';
import { PdfPreviewComponent, OverlayConfig } from '../../shared/components/pdf-preview/pdf-preview.component';

export type HeaderFooterStep = 'select' | 'configure' | 'processing' | 'result';
export type StudioMode = 'headerFooter' | 'bates';

export interface BatesFileItem {
  file: File;
  buffer: ArrayBuffer;
  pageCount: number;
}

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-header-footer',
  templateUrl: './pdf-header-footer.page.html',
  styleUrls: ['./pdf-header-footer.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    AppHeaderComponent,
    AppFooterComponent,
    AppPageHeaderComponent,
    AppButtonComponent,
    AppTabsComponent,
    AppIconComponent,
    AppProgressComponent,
    AppRelatedToolsComponent,
    FileDropzoneComponent,
    PdfPreviewComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class PdfHeaderFooterPage implements OnInit {
  private headerFooterService = inject(PdfHeaderFooterService);
  private fileService = inject(FileService);
  private storageService = inject(StorageService);
  private shareService = inject(ShareService);
  private historyService = inject(HistoryService);
  private toastService = inject(ToastService);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);

  currentStep: HeaderFooterStep = 'select';
  studioMode: StudioMode = 'headerFooter';

  ngOnInit(): void {
    const routeMode = this.route.snapshot.data['mode'] || this.route.snapshot.queryParams['mode'];
    if (routeMode === 'bates' || this.route.snapshot.url.some(s => s.path.includes('bates'))) {
      this.studioMode = 'bates';
    }
  }

  selectedFile?: File;
  originalArrayBuffer?: ArrayBuffer;

  // Active section tab: 'header' | 'footer' | 'settings' | 'firstPage'
  activeTab: 'header' | 'footer' | 'settings' | 'firstPage' = 'footer';

  tabs = [
    { id: 'footer', label: 'Footer' },
    { id: 'header', label: 'Header' },
    { id: 'settings', label: 'Typography & Margins' },
    { id: 'firstPage', label: 'First Page Rules' }
  ];

  // Configuration for standard Header/Footer
  config: HeaderFooterConfig = {
    header: {
      leftText: '',
      centerText: '',
      rightText: ''
    },
    footer: {
      leftText: '',
      centerText: 'Page {page} of {totalPages}',
      rightText: ''
    },
    firstPageHeader: {
      leftText: '',
      centerText: '',
      rightText: ''
    },
    firstPageFooter: {
      leftText: '',
      centerText: '',
      rightText: ''
    },
    fontFamily: 'Helvetica',
    fontSize: 10,
    fontColor: '#475569',
    topMargin: 36,
    bottomMargin: 36,
    leftMargin: 40,
    rightMargin: 40,
    pageTargetMode: 'all',
    customPageRange: '',
    firstPageMode: 'include',
    startPageNumber: 1
  };

  // E3 Bates Numbering Configuration & Batch State
  batesFiles: BatesFileItem[] = [];
  batesOptions: BatesOptions = defaultBatesOptions();
  batesBatchPlan?: BatesBatchPlan;
  readonly batesPositions = BATES_POSITIONS;
  batesOutputs: BatesOutput[] = [];
  batesProgress = 0;
  batesProgressText = '';

  // Result state
  isProcessing = false;
  outputFile?: File;
  outputArrayBuffer?: ArrayBuffer;
  pagesModifiedCount = 0;

  // Live preview overlay
  previewOverlay: OverlayConfig = {};

  // Color presets
  colorPresets = ['#000000', '#475569', '#2563eb', '#16a34a', '#dc2626', '#9333ea'];

  switchStudioMode(mode: StudioMode): void {
    if (this.studioMode === mode) return;
    this.studioMode = mode;
    if (this.currentStep === 'configure') {
      if (this.studioMode === 'bates') {
        this.updateBatesPlan();
      } else {
        this.updatePreviewOverlay();
      }
    }
  }

  async onFileSelected(file: File): Promise<void> {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      this.toastService.error('Please select a valid PDF file.');
      return;
    }

    this.selectedFile = file;
    this.originalArrayBuffer = await file.arrayBuffer();

    if (this.studioMode === 'bates') {
      try {
        const doc = await PDFDocument.load(this.originalArrayBuffer.slice(0), { ignoreEncryption: true });
        this.batesFiles = [{ file, buffer: this.originalArrayBuffer, pageCount: doc.getPageCount() }];
        this.updateBatesPlan();
      } catch {
        this.batesFiles = [{ file, buffer: this.originalArrayBuffer, pageCount: 1 }];
        this.updateBatesPlan();
      }
    } else {
      this.updatePreviewOverlay();
    }

    this.currentStep = 'configure';
  }

  async onBatesFilesSelected(files: File[]): Promise<void> {
    const valid = files.filter(f => f.name.toLowerCase().endsWith('.pdf'));
    if (valid.length === 0) {
      this.toastService.error('Please select valid PDF documents.');
      return;
    }

    const loaded: BatesFileItem[] = [];
    for (const f of valid) {
      try {
        const buf = await f.arrayBuffer();
        const doc = await PDFDocument.load(buf.slice(0), { ignoreEncryption: true });
        loaded.push({ file: f, buffer: buf, pageCount: doc.getPageCount() });
      } catch {
        const buf = await f.arrayBuffer();
        loaded.push({ file: f, buffer: buf, pageCount: 1 });
      }
    }

    this.batesFiles = loaded;
    if (this.batesFiles.length > 0) {
      this.selectedFile = this.batesFiles[0].file;
      this.originalArrayBuffer = this.batesFiles[0].buffer;
      this.updateBatesPlan();
      this.currentStep = 'configure';
    }
  }

  async addMoreBatesFiles(files: File[]): Promise<void> {
    const valid = files.filter(f => f.name.toLowerCase().endsWith('.pdf'));
    for (const f of valid) {
      try {
        const buf = await f.arrayBuffer();
        const doc = await PDFDocument.load(buf.slice(0), { ignoreEncryption: true });
        this.batesFiles.push({ file: f, buffer: buf, pageCount: doc.getPageCount() });
      } catch {
        const buf = await f.arrayBuffer();
        this.batesFiles.push({ file: f, buffer: buf, pageCount: 1 });
      }
    }
    this.updateBatesPlan();
    this.toastService.success(`Added ${valid.length} file(s) to Bates batch.`);
  }

  removeBatesFile(index: number): void {
    if (index >= 0 && index < this.batesFiles.length) {
      this.batesFiles.splice(index, 1);
      if (this.batesFiles.length > 0) {
        this.selectedFile = this.batesFiles[0].file;
        this.originalArrayBuffer = this.batesFiles[0].buffer;
        this.updateBatesPlan();
      } else {
        this.reset();
      }
    }
  }

  setBatesPosition(pos: BatesPosition): void {
    this.batesOptions.position = pos;
    this.updateBatesPreviewOverlay();
  }

  setBatesWidth(w: number): void {
    this.batesOptions.width = w;
    this.updateBatesPlan();
  }

  updateBatesPlan(): void {
    if (this.batesFiles.length === 0) {
      this.batesBatchPlan = undefined;
      return;
    }
    this.batesBatchPlan = this.headerFooterService.planBatesBatch(
      this.batesFiles.map(b => ({ name: b.file.name, pageCount: b.pageCount })),
      this.batesOptions
    );
    this.updateBatesPreviewOverlay();
  }

  updateBatesPreviewOverlay(): void {
    const stamp = this.headerFooterService.formatBatesNumber(
      this.batesOptions.startNumber,
      this.batesOptions
    );
    const pos = this.batesOptions.position;

    this.previewOverlay = {
      headerLeft: pos === 'top-left' ? stamp : '',
      headerCenter: pos === 'top-centre' ? stamp : '',
      headerRight: pos === 'top-right' ? stamp : '',
      footerLeft: pos === 'bottom-left' ? stamp : '',
      footerCenter: pos === 'bottom-centre' ? stamp : '',
      footerRight: pos === 'bottom-right' ? stamp : '',
      headerFooterFontSize: this.batesOptions.fontSize,
      headerFooterColor: this.batesOptions.fontColor,
      headerFooterFontFamily: 'Helvetica',
      topMargin: this.batesOptions.marginY,
      bottomMargin: this.batesOptions.marginY,
      leftMargin: this.batesOptions.marginX,
      rightMargin: this.batesOptions.marginX,
      firstPageMode: 'include'
    };
  }

  insertTag(
    field: 'headerLeft' | 'headerCenter' | 'headerRight' | 'footerLeft' | 'footerCenter' | 'footerRight',
    tag: string
  ): void {
    if (field === 'headerLeft') this.config.header.leftText += tag;
    else if (field === 'headerCenter') this.config.header.centerText += tag;
    else if (field === 'headerRight') this.config.header.rightText += tag;
    else if (field === 'footerLeft') this.config.footer.leftText += tag;
    else if (field === 'footerCenter') this.config.footer.centerText += tag;
    else if (field === 'footerRight') this.config.footer.rightText += tag;

    this.updatePreviewOverlay();
  }

  updatePreviewOverlay(): void {
    const docTitle = this.selectedFile?.name.replace(/\.pdf$/i, '') || '';
    const fileName = this.selectedFile?.name || '';

    this.previewOverlay = {
      headerLeft: this.config.header.leftText,
      headerCenter: this.config.header.centerText,
      headerRight: this.config.header.rightText,
      footerLeft: this.config.footer.leftText,
      footerCenter: this.config.footer.centerText,
      footerRight: this.config.footer.rightText,
      headerFooterFontSize: this.config.fontSize,
      headerFooterColor: this.config.fontColor,
      headerFooterFontFamily: this.config.fontFamily,
      topMargin: this.config.topMargin,
      bottomMargin: this.config.bottomMargin,
      leftMargin: this.config.leftMargin,
      rightMargin: this.config.rightMargin,
      firstPageMode: this.config.firstPageMode,
      firstPageHeaderCenter: this.config.firstPageHeader?.centerText,
      firstPageFooterCenter: this.config.firstPageFooter?.centerText,
      docTitle,
      docFileName: fileName
    };
  }

  async applyAndGenerate(): Promise<void> {
    if (this.studioMode === 'bates') {
      await this.applyBatesAndGenerate();
      return;
    }

    if (!this.selectedFile || !this.originalArrayBuffer) return;

    this.currentStep = 'processing';
    this.isProcessing = true;
    this.cdr.detectChanges();

    try {
      const outputName = this.selectedFile.name.replace(/\.pdf$/i, '') + '_header_footer.pdf';
      const result = await this.headerFooterService.applyHeaderFooter(
        this.originalArrayBuffer,
        this.config,
        this.selectedFile.name,
        outputName
      );

      // Meter through StorageService
      await this.storageService.saveFile(result.file, 'header_footer');

      this.outputFile = result.file;
      this.outputArrayBuffer = await result.blob.arrayBuffer();
      this.pagesModifiedCount = result.pagesModified;
      this.currentStep = 'result';

      // Add to history
      await this.historyService.addHistoryItem({
        operation: 'Added headers/footers',
        originalFileName: this.selectedFile.name,
        outputFileName: outputName,
        originalSizeBytes: this.selectedFile.size,
        outputSizeBytes: result.sizeBytes
      });

      this.toastService.success('Headers & footers applied successfully!');
    } catch (err: any) {
      this.toastService.error('Failed to apply headers/footers: ' + (err?.message || err));
      this.currentStep = 'configure';
    } finally {
      this.isProcessing = false;
      this.cdr.detectChanges();
    }
  }

  async applyBatesAndGenerate(): Promise<void> {
    if (this.batesFiles.length === 0 || !this.batesBatchPlan) return;

    this.currentStep = 'processing';
    this.isProcessing = true;
    this.batesProgress = 0;
    this.batesOutputs = [];
    this.cdr.detectChanges();

    const batchOpId = `bates_batch_${Date.now()}`;
    const totalFiles = this.batesBatchPlan.files.length;

    try {
      for (let i = 0; i < totalFiles; i++) {
        const plan = this.batesBatchPlan.files[i];
        const srcItem = this.batesFiles[i];
        if (!srcItem || srcItem.pageCount === 0) continue;

        this.batesProgressText = `Stamping ${srcItem.file.name} (${i + 1}/${totalFiles})...`;
        this.cdr.detectChanges();

        const outName = srcItem.file.name.replace(/\.pdf$/i, '') + '_bates.pdf';
        const result = await this.headerFooterService.applyBatesNumbering(
          srcItem.buffer,
          this.batesOptions,
          plan.firstNumber,
          outName,
          p => {
            const overallPercent = Math.round(((i + p.percent / 100) / totalFiles) * 100);
            this.batesProgress = overallPercent;
            this.cdr.detectChanges();
          }
        );

        // Meter through StorageService with grouped batch operationId
        await this.storageService.saveFile(result.file, 'bates', batchOpId);
        this.batesOutputs.push(result);
      }

      if (this.batesOutputs.length > 0) {
        this.outputFile = this.batesOutputs[0].file;
        this.outputArrayBuffer = await this.batesOutputs[0].blob.arrayBuffer();
        this.pagesModifiedCount = this.batesBatchPlan.totalPages;

        await this.historyService.addHistoryItem({
          operation: `Applied Bates numbering to ${this.batesOutputs.length} file(s)`,
          originalFileName: this.batesFiles[0].file.name,
          outputFileName: this.outputFile.name,
          originalSizeBytes: this.batesFiles.reduce((acc, f) => acc + f.file.size, 0),
          outputSizeBytes: this.batesOutputs.reduce((acc, o) => acc + o.sizeBytes, 0)
        });

        this.currentStep = 'result';
        this.toastService.success('Bates numbering applied successfully!');
      } else {
        throw new Error('No pages were stamped.');
      }
    } catch (err: any) {
      this.toastService.error('Failed to apply Bates numbering: ' + (err?.message || err));
      this.currentStep = 'configure';
    } finally {
      this.isProcessing = false;
      this.cdr.detectChanges();
    }
  }

  downloadSingleBates(output: BatesOutput): void {
    this.fileService.downloadFile(output.file);
    this.toastService.success(`Downloaded ${output.name}`);
  }

  shareSingleBates(output: BatesOutput): void {
    this.shareService.shareFile(output.file);
  }

  async downloadAllBates(): Promise<void> {
    for (const output of this.batesOutputs) {
      this.fileService.downloadFile(output.file);
      await new Promise(r => setTimeout(r, 400));
    }
    this.toastService.success(`Downloaded all ${this.batesOutputs.length} documents.`);
  }

  downloadResult(): void {
    if (this.outputFile) {
      this.fileService.downloadFile(this.outputFile);
      this.toastService.success('File downloaded successfully.');
    }
  }

  shareResult(): void {
    if (this.outputFile) {
      this.shareService.shareFile(this.outputFile);
    }
  }

  reset(): void {
    this.currentStep = 'select';
    this.selectedFile = undefined;
    this.originalArrayBuffer = undefined;
    this.outputFile = undefined;
    this.outputArrayBuffer = undefined;
    this.batesFiles = [];
    this.batesBatchPlan = undefined;
    this.batesOutputs = [];
    this.batesProgress = 0;
  }
}
