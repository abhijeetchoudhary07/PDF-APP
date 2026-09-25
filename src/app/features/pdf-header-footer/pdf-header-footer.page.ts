import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { PdfHeaderFooterService } from '../../core/services/pdf-header-footer.service';
import { FileService } from '../../core/services/file.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import { ToastService } from '../../core/services/toast.service';
import {
  HeaderFooterConfig,
  PageTargetMode,
  FirstPageMode
} from '../../core/models/pdf-analysis.types';
import {
  AppHeaderComponent,
  AppFooterComponent,
  AppPageHeaderComponent,
  AppButtonComponent,
  AppBadgeComponent,
  AppTabsComponent,
  AppRelatedToolsComponent,
  FileDropzoneComponent,
  TranslatePipe
} from '../../shared/components/ui';
import { PdfPreviewComponent, OverlayConfig } from '../../shared/components/pdf-preview/pdf-preview.component';

export type HeaderFooterStep = 'select' | 'configure' | 'processing' | 'result';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-header-footer',
  templateUrl: './pdf-header-footer.page.html',
  styleUrls: ['./pdf-header-footer.page.scss'],
  standalone: true,
  imports: [
    FormsModule,
    RouterModule,
    AppHeaderComponent,
    AppFooterComponent,
    AppPageHeaderComponent,
    AppButtonComponent,
    AppTabsComponent,
    AppRelatedToolsComponent,
    FileDropzoneComponent,
    PdfPreviewComponent,
    TranslatePipe
],
  providers: [DecimalPipe]
})
export class PdfHeaderFooterPage {
  private headerFooterService = inject(PdfHeaderFooterService);
  private fileService = inject(FileService);
  private shareService = inject(ShareService);
  private historyService = inject(HistoryService);
  private toastService = inject(ToastService);
  private cdr = inject(ChangeDetectorRef);

  currentStep: HeaderFooterStep = 'select';
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

  // Configuration
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

  // Result state
  isProcessing = false;
  outputFile?: File;
  outputArrayBuffer?: ArrayBuffer;
  pagesModifiedCount = 0;

  // Live preview overlay
  previewOverlay: OverlayConfig = {};

  // Color presets
  colorPresets = ['#000000', '#475569', '#2563eb', '#16a34a', '#dc2626', '#9333ea'];

  async onFileSelected(file: File): Promise<void> {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      this.toastService.error('Please select a valid PDF file.');
      return;
    }

    this.selectedFile = file;
    this.originalArrayBuffer = await file.arrayBuffer();
    this.currentStep = 'configure';
    this.updatePreviewOverlay();
  }

  insertTag(field: 'headerLeft' | 'headerCenter' | 'headerRight' | 'footerLeft' | 'footerCenter' | 'footerRight', tag: string): void {
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
  }
}
