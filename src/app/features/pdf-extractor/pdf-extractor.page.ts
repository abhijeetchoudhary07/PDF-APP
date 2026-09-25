import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { PdfExtractorService, ExtractionOptions } from '../../core/services/pdf-extractor.service';
import { FileService } from '../../core/services/file.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import { ToastService } from '../../core/services/toast.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import {
  ExtractedDocumentContent,
  ExtractedImageItem,
  ExtractedTableData,
  ExtractedAttachmentItem
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

export type ExtractorStep = 'select' | 'processing' | 'result';
export type ExtractorTab = 'text' | 'images' | 'tables' | 'pages' | 'attachments';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-extractor',
  templateUrl: './pdf-extractor.page.html',
  styleUrls: ['./pdf-extractor.page.scss'],
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
    AppTabsComponent,
    AppRelatedToolsComponent,
    FileDropzoneComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class PdfExtractorPage {
  extractorService = inject(PdfExtractorService);
  private fileService = inject(FileService);
  private shareService = inject(ShareService);
  private historyService = inject(HistoryService);
  private toastService = inject(ToastService);
  private bridgeService = inject(DocumentBridgeService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  currentStep: ExtractorStep = 'select';
  selectedFile?: File;

  // Options
  options: ExtractionOptions = {
    extractText: true,
    extractImages: true,
    extractTables: true,
    extractAttachments: true
  };
  extractPagesSelected = true;

  // Processing state
  isProcessing = false;
  progressPercent = 0;
  progressMessage = '';

  // Results
  extractedContent?: ExtractedDocumentContent;
  activeTab: ExtractorTab = 'text';

  tabs: { id: ExtractorTab; label: string }[] = [
    { id: 'text', label: 'Text' },
    { id: 'images', label: 'Images' },
    { id: 'tables', label: 'Tables' },
    { id: 'pages', label: 'Pages' },
    { id: 'attachments', label: 'Attachments' }
  ];

  // Text state
  isCopied = false;

  // Image state
  isExportingZip = false;

  // Page extraction state (reusing pageManager)
  selectedPageNumbers: Set<number> = new Set();
  isExportingPages = false;

  handoffToIntelligence(): void {
    if (this.selectedFile) {
      this.bridgeService.setIntelligenceTarget({
        file: this.selectedFile,
        text: this.extractedContent?.fullText,
        source: 'extractor'
      });
      this.router.navigate(['/features/pdf-intelligence']);
    }
  }

  onFileSelected(file: File): void {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      this.toastService.error('Please select a valid PDF file.');
      return;
    }
    this.selectedFile = file;
  }

  async startExtraction(): Promise<void> {
    if (!this.selectedFile) return;

    this.currentStep = 'processing';
    this.isProcessing = true;
    this.progressPercent = 5;
    this.progressMessage = 'Preparing document for content extraction...';
    this.cdr.detectChanges();

    try {
      this.extractedContent = await this.extractorService.extractContent(
        this.selectedFile,
        this.options,
        (pct, msg) => {
          this.progressPercent = pct;
          this.progressMessage = msg;
          this.cdr.detectChanges();
        }
      );

      // Initialize page manager for page extraction tab
      if (this.extractPagesSelected) {
        await this.extractorService.pageManager.loadDocument(this.selectedFile);
        this.selectedPageNumbers = new Set(
          Array.from({ length: this.extractedContent.totalPages }, (_, i) => i + 1)
        );
        // Lazily render page thumbnails for visual selection
        this.extractorService.pageManager.renderThumbnailsLazy(
          this.extractorService.pageManager.pages,
          () => this.cdr.detectChanges()
        );
      }

      this.currentStep = 'result';
      this.activeTab = this.options.extractText ? 'text' : 'images';

      // Add to history
      await this.historyService.addHistoryItem({
        operation: 'Extracted content',
        originalFileName: this.selectedFile.name,
        outputFileName: `${this.selectedFile.name}_extracted`,
        originalSizeBytes: this.selectedFile.size,
        outputSizeBytes: this.selectedFile.size
      });

      this.toastService.success('Extraction completed successfully.');
    } catch (err: any) {
      this.toastService.error('Extraction failed: ' + (err?.message || err));
      this.currentStep = 'select';
    } finally {
      this.isProcessing = false;
      this.cdr.detectChanges();
    }
  }

  // Text Actions
  copyText(): void {
    if (this.extractedContent?.fullText) {
      navigator.clipboard.writeText(this.extractedContent.fullText);
      this.isCopied = true;
      this.toastService.success('Text copied to clipboard!');
      setTimeout(() => (this.isCopied = false), 2500);
    }
  }

  downloadTxt(): void {
    if (!this.extractedContent?.fullText || !this.selectedFile) return;
    const baseName = this.selectedFile.name.replace(/\.pdf$/i, '');
    const blob = new Blob([this.extractedContent.fullText], { type: 'text/plain;charset=utf-8' });
    const file = new File([blob], `${baseName}_extracted_text.txt`, { type: 'text/plain' });
    this.fileService.downloadFile(file);
    this.toastService.success('Plain text (.txt) downloaded.');
  }

  downloadJson(): void {
    if (!this.extractedContent || !this.selectedFile) return;
    const baseName = this.selectedFile.name.replace(/\.pdf$/i, '');
    const jsonStr = JSON.stringify(this.extractedContent.pageTexts, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const file = new File([blob], `${baseName}_extracted_text.json`, { type: 'application/json' });
    this.fileService.downloadFile(file);
    this.toastService.success('Structured JSON downloaded.');
  }

  // Image Actions
  toggleSelectAllImages(): void {
    if (!this.extractedContent) return;
    const allSelected = this.extractedContent.images.every(i => i.selected);
    this.extractedContent.images.forEach(i => (i.selected = !allSelected));
  }

  get selectedImagesCount(): number {
    return this.extractedContent?.images.filter(i => i.selected).length || 0;
  }

  downloadSingleImage(image: ExtractedImageItem): void {
    const file = new File([image.blob], image.name, { type: 'image/png' });
    this.fileService.downloadFile(file);
    this.toastService.success(`Downloaded ${image.name}`);
  }

  async downloadImagesZip(): Promise<void> {
    if (!this.extractedContent) return;
    const selected = this.extractedContent.images.filter(i => i.selected);
    if (selected.length === 0) {
      this.toastService.warning('Please select at least one image to export.');
      return;
    }

    this.isExportingZip = true;
    try {
      const zipFile = await this.extractorService.exportImagesAsZip(selected);
      this.fileService.downloadFile(zipFile);
      this.toastService.success('Images ZIP downloaded.');
    } catch (e: any) {
      this.toastService.error('Failed to create ZIP: ' + (e?.message || e));
    } finally {
      this.isExportingZip = false;
      this.cdr.detectChanges();
    }
  }

  // Table Actions
  downloadTableCsv(table: ExtractedTableData): void {
    const file = this.extractorService.exportTableAsCsv(table, `table_page_${table.pageNumber}.csv`);
    this.fileService.downloadFile(file);
    this.toastService.success('Table CSV downloaded.');
  }

  downloadTableXlsx(table: ExtractedTableData): void {
    const file = this.extractorService.exportTableAsExcel(table, `table_page_${table.pageNumber}.xlsx`);
    this.fileService.downloadFile(file);
    this.toastService.success('Table Excel (.xlsx) downloaded.');
  }

  // Page Extraction Actions (Reusing PdfPageManagerService)
  togglePageSelection(pageNum: number): void {
    if (this.selectedPageNumbers.has(pageNum)) {
      this.selectedPageNumbers.delete(pageNum);
    } else {
      this.selectedPageNumbers.add(pageNum);
    }
  }

  selectAllPages(): void {
    if (!this.extractedContent) return;
    for (let i = 1; i <= this.extractedContent.totalPages; i++) {
      this.selectedPageNumbers.add(i);
    }
  }

  deselectAllPages(): void {
    this.selectedPageNumbers.clear();
  }

  async exportSelectedPages(): Promise<void> {
    if (this.selectedPageNumbers.size === 0) {
      this.toastService.warning('Please select at least one page to export.');
      return;
    }

    this.isExportingPages = true;
    try {
      const pageIndices = Array.from(this.selectedPageNumbers).map(p => p - 1);
      const selectedPages = pageIndices
        .map(i => this.extractorService.pageManager.pages[i])
        .filter(p => !!p);

      const fileName = `${this.selectedFile?.name.replace(/\.pdf$/i, '')}_extracted_pages.pdf`;
      const result = await this.extractorService.pageManager.exportSinglePdf(selectedPages, fileName);

      if (result && result.file) {
        this.fileService.downloadFile(result.file);
        this.toastService.success('Extracted pages PDF downloaded.');
      } else {
        this.toastService.error('Failed to export selected pages.');
      }
    } catch (e: any) {
      this.toastService.error('Page export failed: ' + (e?.message || e));
    } finally {
      this.isExportingPages = false;
      this.cdr.detectChanges();
    }
  }

  // Attachment Actions
  downloadAttachment(att: ExtractedAttachmentItem): void {
    const file = new File([att.blob], att.name, { type: att.mimeType });
    this.fileService.downloadFile(file);
    this.toastService.success(`Downloaded ${att.name}`);
  }

  reset(): void {
    this.currentStep = 'select';
    this.selectedFile = undefined;
    this.extractedContent = undefined;
    this.selectedPageNumbers.clear();
  }
}
