import { Component, OnInit, OnDestroy, HostListener, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';
import JSZip from 'jszip';

import { PdfPageManagerService } from '../../core/services/pdf-page-manager.service';
import { FileService } from '../../core/services/file.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import {
  PdfSourceDocument,
  PdfPageItem,
  PdfExportResult,
  PdfWorkspaceMode,
  PdfSplitMode,
  PdfSplitConfig
} from '../../core/models/pdf-organization.types';
import { PdfRangeParserUtil } from '../../core/utilities/pdf-range-parser.util';
import { ResultPreviewComponent, PreviewData } from '../../shared/components/result-preview/result-preview.component';
import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppFooterComponent,
  AppButtonComponent,
  AppBadgeComponent,
  AppTabsComponent,
  AppProgressComponent,
  AppModalComponent,
  FileDropzoneComponent,
  FilePreviewComponent,
  PdfPageThumbnailComponent,
  AppIconComponent
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-organizer',
  templateUrl: './pdf-organizer.page.html',
  styleUrls: ['./pdf-organizer.page.scss'],
  standalone: true,
  imports: [
    AppIconComponent,
    CommonModule,
    FormsModule,
    RouterModule,
    ResultPreviewComponent,
    AppHeaderComponent,
    AppPageHeaderComponent,
    AppFooterComponent,
    AppButtonComponent,
    AppBadgeComponent,
    AppTabsComponent,
    AppProgressComponent,
    AppModalComponent,
    FileDropzoneComponent
  ],
  providers: [DecimalPipe]
})
export class PdfOrganizerPage implements OnInit, OnDestroy {
  pageManager = inject(PdfPageManagerService);
  private fileService = inject(FileService);
  private storageService = inject(StorageService);
  private shareService = inject(ShareService);
  private historyService = inject(HistoryService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  mode: PdfWorkspaceMode = 'organize';

  modeTabs = [
    { id: 'organize', label: 'Organize', icon: 'grid-outline' },
    { id: 'merge', label: 'Merge', icon: 'documents-outline' },
    { id: 'split', label: 'Split', icon: 'cut-outline' },
    { id: 'rotate', label: 'Rotate', icon: 'sync-outline' },
    { id: 'delete', label: 'Delete', icon: 'trash-outline' },
    { id: 'extract', label: 'Extract', icon: 'copy-outline' }
  ];

  splitModeTabs = [
    { id: 'every-n', label: 'Every N Pages' },
    { id: 'after-selected', label: 'After Cut Points' },
    { id: 'extract', label: 'Page Range' },
    { id: 'individual', label: 'Single Pages' }
  ];

  // Merge Mode state
  mergeFiles: File[] = [];
  mergeDocs: { id: string; file: File; pageCount: number; size: number }[] = [];
  draggedMergeIndex: number | null = null;

  // Split Mode state
  splitMode: PdfSplitMode = 'every-n';
  splitEveryN = 2;
  splitAfterPages: number[] = [];
  splitRangeString = '';
  rangeValidationError = '';
  splitChunksPreview: number[][] = [];
  splitExportResults: PdfExportResult[] = [];

  // Drag and Drop (Pages)
  draggedPageIndex: number | null = null;
  dragOverPageIndex: number | null = null;

  // Processing & Export State
  isProcessing = false;
  processingProgress = 0;
  processingStage = '';
  abortController: AbortController | null = null;
  lastExportResult?: PdfExportResult;

  // High-Res Zoom Modal State
  zoomModalOpen = false;
  zoomPage?: PdfPageItem;
  zoomImageUrl?: string;
  isZoomLoading = false;

  ngOnInit() {
    // Read route param or query param for mode
    this.route.paramMap.subscribe(params => {
      const routeMode = params.get('mode') as PdfWorkspaceMode;
      if (routeMode && this.isValidMode(routeMode)) {
        this.setMode(routeMode);
      }
    });

    this.route.queryParamMap.subscribe(params => {
      const qMode = params.get('mode') as PdfWorkspaceMode;
      if (qMode && this.isValidMode(qMode)) {
        this.setMode(qMode);
      }
    });

    // Check URL path directly for sub-routes like /features/pdf/merge
    const currentUrl = this.router.url;
    if (currentUrl.includes('/pdf/merge')) this.mode = 'merge';
    else if (currentUrl.includes('/pdf/split')) this.mode = 'split';
    else if (currentUrl.includes('/pdf/rotate')) this.mode = 'rotate';
    else if (currentUrl.includes('/pdf/delete')) this.mode = 'delete';
    else if (currentUrl.includes('/pdf/extract')) this.mode = 'extract';
    else if (currentUrl.includes('/pdf/organize')) this.mode = 'organize';
  }

  ngOnDestroy() {
    this.cancelProcessing();
    this.pageManager.clear();
  }

  private isValidMode(mode: string): mode is PdfWorkspaceMode {
    return ['organize', 'merge', 'split', 'rotate', 'delete', 'extract'].includes(mode);
  }

  setMode(newMode: PdfWorkspaceMode) {
    this.mode = newMode;
    this.lastExportResult = undefined;
    this.splitExportResults = [];
    if (newMode === 'split') {
      this.updateSplitPreview();
    }
  }

  // --- Document Upload & File Handling ---

  async selectPdfFile() {
    const file = await this.fileService.pickPdfFile();
    if (file) {
      await this.processSinglePdf(file);
    }
  }

  async selectMultiplePdfs() {
    const files = await this.fileService.pickMultiplePdfs();
    if (files && files.length > 0) {
      await this.processMultiplePdfs(files);
    }
  }

  async onFileDropped(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();

    const dt = event.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      const files = Array.from(dt.files).filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
      if (files.length === 0) {
        this.showToast('Please upload PDF files.', 'warning');
        return;
      }
      if (this.mode === 'merge' || files.length > 1) {
        await this.processMultiplePdfs(files);
      } else {
        await this.processSinglePdf(files[0]);
      }
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  async processSinglePdf(file: File, password?: string) {
    this.isProcessing = true;
    this.processingStage = 'Loading PDF document...';
    this.lastExportResult = undefined;
    this.splitExportResults = [];
    this.pageManager.clear();

    const res = await this.pageManager.loadDocument(file, password);
    this.isProcessing = false;

    if (res.needPassword) {
      await this.promptPassword(file);
      return;
    }

    if (!res.success) {
      this.showToast(res.error || 'Failed to load PDF.', 'danger');
      return;
    }

    this.showToast(`Loaded ${res.doc?.name} (${res.doc?.pageCount} pages)`, 'success');
    this.updateSplitPreview();

    // Trigger lazy thumbnail rendering in background for first 20 pages
    this.renderThumbnailsForVisible();
  }

  private async promptPassword(file: File) {
    const alert = await this.alertCtrl.create({
      header: 'Password Protected PDF',
      message: `"${file.name}" is encrypted. Enter password to unlock:`,
      inputs: [
        {
          name: 'password',
          type: 'password',
          placeholder: 'Enter password'
        }
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Unlock',
          handler: (data) => {
            if (data.password) {
              this.processSinglePdf(file, data.password);
            }
          }
        }
      ]
    });
    await alert.present();
  }

  async processMultiplePdfs(files: File[]) {
    this.isProcessing = true;
    this.processingStage = 'Reading selected PDFs...';
    this.lastExportResult = undefined;
    this.splitExportResults = [];

    const res = await this.pageManager.loadMultipleDocuments(files);
    this.isProcessing = false;

    if (res.docs.length > 0) {
      const newDocs = res.docs.map(d => ({
        id: d.id,
        file: d.file || new File([d.arrayBuffer], d.name, { type: 'application/pdf' }),
        pageCount: d.pageCount,
        size: d.sizeBytes
      }));
      this.mergeDocs = [...this.mergeDocs, ...newDocs];

      const totalP = this.pageManager.pages.length;
      this.showToast(`Loaded ${res.docs.length} PDF(s) (${totalP} pages total)`, 'success');
      this.renderThumbnailsForVisible();
    }

    if (res.errors.length > 0) {
      this.showToast(`Errors loading some files:\n${res.errors.join(', ')}`, 'warning');
    }
  }

  // --- Thumbnail Rendering ---

  private async renderThumbnailsForVisible() {
    const pagesToRender = this.pageManager.pages.slice(0, 30);
    this.pageManager.renderThumbnailsLazy(pagesToRender);
  }

  onThumbnailIntersect(page: PdfPageItem) {
    if (!page.thumbnailUrl && !page.thumbnailLoading && !page.thumbnailError) {
      this.pageManager.renderThumbnail(page).catch(() => {});
    }
  }

  // --- Page Operations (Accessible Mobile + Desktop) ---

  movePageLeft(index: number) {
    if (index > 0) {
      this.pageManager.reorderPage(index, index - 1);
    }
  }

  movePageRight(index: number) {
    if (index < this.pageManager.pages.length - 1) {
      this.pageManager.reorderPage(index, index + 1);
    }
  }

  async promptMoveToPosition(page: PdfPageItem) {
    const total = this.pageManager.pages.length;
    const alert = await this.alertCtrl.create({
      header: 'Move Page',
      message: `Move Page ${page.displayNumber} to position (1 - ${total}):`,
      inputs: [
        {
          name: 'target',
          type: 'number',
          min: 1,
          max: total,
          value: page.displayNumber
        }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Move',
          handler: (data) => {
            const target = Number(data.target);
            if (target >= 1 && target <= total && target !== page.displayNumber) {
              this.pageManager.movePageToPosition(page.id, target);
            }
          }
        }
      ]
    });
    await alert.present();
  }

  rotatePage(page: PdfPageItem, delta: number) {
    this.pageManager.rotatePages([page.id], delta);
  }

  duplicatePage(page: PdfPageItem) {
    this.pageManager.duplicatePages([page.id]);
    this.showToast(`Duplicated Page ${page.displayNumber}`, 'success');
  }

  deletePage(page: PdfPageItem) {
    this.pageManager.deletePages([page.id]);
    this.showToast(`Deleted Page ${page.displayNumber}`, 'medium');
  }

  // --- Multi-Select Actions ---

  toggleSelectPage(page: PdfPageItem) {
    this.pageManager.togglePageSelection(page.id);
    if (this.mode === 'extract' || this.mode === 'split') {
      this.syncRangeInputWithSelection();
      this.updateSplitPreview();
    }
  }

  selectAll() {
    this.pageManager.selectAll();
    if (this.mode === 'extract' || this.mode === 'split') {
      this.syncRangeInputWithSelection();
      this.updateSplitPreview();
    }
  }

  deselectAll() {
    this.pageManager.deselectAll();
    if (this.mode === 'extract' || this.mode === 'split') {
      this.syncRangeInputWithSelection();
      this.updateSplitPreview();
    }
  }

  invertSelection() {
    this.pageManager.invertSelection();
    if (this.mode === 'extract' || this.mode === 'split') {
      this.syncRangeInputWithSelection();
      this.updateSplitPreview();
    }
  }

  rotateSelected(delta: number) {
    const selectedIds = Array.from(this.pageManager.selectedIds);
    if (selectedIds.length === 0) return;
    this.pageManager.rotatePages(selectedIds, delta);
  }

  deleteSelected() {
    const selectedIds = Array.from(this.pageManager.selectedIds);
    if (selectedIds.length === 0) return;
    this.pageManager.deletePages(selectedIds);
    this.showToast(`Deleted ${selectedIds.length} page(s)`, 'medium');
    this.updateSplitPreview();
  }

  duplicateSelected() {
    const selectedIds = Array.from(this.pageManager.selectedIds);
    if (selectedIds.length === 0) return;
    this.pageManager.duplicatePages(selectedIds);
    this.showToast(`Duplicated ${selectedIds.length} page(s)`, 'success');
  }

  rotateAll(delta: number) {
    this.pageManager.rotateAll(delta);
  }

  // --- Drag & Drop (Pages) ---

  onPageDragStart(event: DragEvent, index: number) {
    this.draggedPageIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `${index}`);
    }
  }

  onPageDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    this.dragOverPageIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onPageDrop(event: DragEvent, index: number) {
    event.preventDefault();
    if (this.draggedPageIndex !== null && this.draggedPageIndex !== index) {
      this.pageManager.reorderPage(this.draggedPageIndex, index);
    }
    this.draggedPageIndex = null;
    this.dragOverPageIndex = null;
  }

  onPageDragEnd() {
    this.draggedPageIndex = null;
    this.dragOverPageIndex = null;
  }

  // --- Merge Mode Reordering ---

  moveMergeDoc(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= this.mergeDocs.length) return;
    const temp = this.mergeDocs[index];
    this.mergeDocs[index] = this.mergeDocs[target];
    this.mergeDocs[target] = temp;
    this.syncPagesWithMergeDocs();
  }

  removeMergeDoc(index: number) {
    const [removed] = this.mergeDocs.splice(index, 1);
    if (removed) {
      const pagesToDelete = this.pageManager.pages
        .filter(p => p.sourceDocId === removed.id)
        .map(p => p.id);
      if (pagesToDelete.length > 0) {
        this.pageManager.deletePages(pagesToDelete);
      }
    }
  }

  private syncPagesWithMergeDocs() {
    const docIds = this.mergeDocs.map(d => d.id);
    this.pageManager.reorderPagesBySourceDocIds(docIds);
  }

  // --- Split Mode Logic ---

  setSplitMode(mode: PdfSplitMode) {
    this.splitMode = mode;
    this.updateSplitPreview();
  }

  onRangeInputChanged() {
    const totalPages = this.pageManager.pages.length;
    const result = PdfRangeParserUtil.parseRange(this.splitRangeString, totalPages);
    if (!result.valid) {
      this.rangeValidationError = result.error || 'Invalid range';
      return;
    }
    this.rangeValidationError = '';

    // Synchronize page selection with range
    this.pageManager.deselectAll();
    result.pages.forEach(pNum => {
      const page = this.pageManager.pages[pNum - 1];
      if (page) this.pageManager.selectPage(page.id);
    });

    this.updateSplitPreview();
  }

  private syncRangeInputWithSelection() {
    const selectedPages = this.pageManager.getSelectedPages().map(p => p.displayNumber);
    this.splitRangeString = PdfRangeParserUtil.formatRange(selectedPages);
    this.rangeValidationError = '';
  }

  toggleSplitAfterPage(pageNum: number) {
    const idx = this.splitAfterPages.indexOf(pageNum);
    if (idx >= 0) {
      this.splitAfterPages.splice(idx, 1);
    } else {
      this.splitAfterPages.push(pageNum);
      this.splitAfterPages.sort((a, b) => a - b);
    }
    this.updateSplitPreview();
  }

  updateSplitPreview() {
    const totalPages = this.pageManager.pages.length;
    if (totalPages === 0) {
      this.splitChunksPreview = [];
      return;
    }

    const config: PdfSplitConfig = {
      mode: this.splitMode,
      everyN: this.splitEveryN,
      afterPages: this.splitAfterPages,
      selectedPageNumbers: this.pageManager.getSelectedPages().map(p => p.displayNumber)
    };

    this.splitChunksPreview = PdfRangeParserUtil.calculateSplitChunks(totalPages, config);
  }

  // --- High-Res Zoom Preview ---

  async openZoomModal(page: PdfPageItem) {
    this.zoomPage = page;
    this.zoomModalOpen = true;
    this.isZoomLoading = true;
    this.zoomImageUrl = undefined;

    try {
      this.zoomImageUrl = await this.pageManager.renderHighResPage(page);
    } catch {
      this.zoomImageUrl = page.thumbnailUrl;
    } finally {
      this.isZoomLoading = false;
    }
  }

  closeZoomModal() {
    this.zoomModalOpen = false;
    this.zoomPage = undefined;
    this.zoomImageUrl = undefined;
  }

  prevZoomPage() {
    if (!this.zoomPage) return;
    const currentIndex = this.pageManager.pages.findIndex(p => p.id === this.zoomPage!.id);
    if (currentIndex > 0) {
      this.openZoomModal(this.pageManager.pages[currentIndex - 1]);
    }
  }

  nextZoomPage() {
    if (!this.zoomPage) return;
    const currentIndex = this.pageManager.pages.findIndex(p => p.id === this.zoomPage!.id);
    if (currentIndex < this.pageManager.pages.length - 1) {
      this.openZoomModal(this.pageManager.pages[currentIndex + 1]);
    }
  }

  // --- Export Execution ---

  cancelProcessing() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isProcessing = false;
  }

  async executeExport() {
    if (this.pageManager.pages.length === 0) {
      this.showToast('Please upload a PDF first.', 'warning');
      return;
    }

    this.isProcessing = true;
    this.processingProgress = 0;
    this.abortController = new AbortController();

    try {
      switch (this.mode) {
        case 'organize':
        case 'rotate':
        case 'delete':
          await this.exportOrganizedPdf();
          break;
        case 'extract':
          await this.exportExtractedPdf();
          break;
        case 'split':
          await this.exportSplitPdfs();
          break;
        case 'merge':
          await this.exportMergedPdf();
          break;
      }
    } catch (e: any) {
      if (e.message?.includes('cancelled')) {
        this.showToast('Operation cancelled.', 'medium');
      } else {
        this.showToast(`Export failed: ${e.message}`, 'danger');
      }
    } finally {
      this.isProcessing = false;
      this.abortController = null;
    }
  }

  private async exportOrganizedPdf() {
    this.processingStage = 'Generating PDF...';
    const originalDoc = this.pageManager.sourceDocs[0];
    const baseName = originalDoc ? originalDoc.name.replace(/\.pdf$/i, '') : 'document';
    const outputName = `${baseName}_organized_${Date.now()}.pdf`;

    const result = await this.pageManager.exportSinglePdf(
      this.pageManager.pages,
      outputName,
      (progress) => (this.processingProgress = progress),
      this.abortController?.signal
    );

    this.lastExportResult = result;
    await this.logHistoryItem(
      this.mode === 'rotate' ? 'PDF: Rotated Pages' : this.mode === 'delete' ? 'PDF: Deleted Pages' : 'PDF: Organized',
      originalDoc?.name || 'document.pdf',
      result.name,
      originalDoc?.sizeBytes || 0,
      result.sizeBytes
    );
    this.showToast('PDF exported successfully!', 'success');
  }

  private async exportExtractedPdf() {
    const selectedPages = this.pageManager.getSelectedPages();
    if (selectedPages.length === 0) {
      this.showToast('Please select at least one page to extract.', 'warning');
      this.isProcessing = false;
      return;
    }

    this.processingStage = 'Extracting selected pages...';
    const originalDoc = this.pageManager.sourceDocs[0];
    const baseName = originalDoc ? originalDoc.name.replace(/\.pdf$/i, '') : 'document';
    const pageRanges = PdfRangeParserUtil.formatRange(selectedPages.map(p => p.displayNumber));
    const outputName = `${baseName}_extracted_${pageRanges.replace(/[\s,]+/g, '_')}.pdf`;

    const result = await this.pageManager.exportSinglePdf(
      selectedPages,
      outputName,
      (progress) => (this.processingProgress = progress),
      this.abortController?.signal
    );

    this.lastExportResult = result;
    await this.logHistoryItem(
      `PDF: Extracted pages ${pageRanges}`,
      originalDoc?.name || 'document.pdf',
      result.name,
      originalDoc?.sizeBytes || 0,
      result.sizeBytes
    );
    this.showToast('Extracted PDF generated!', 'success');
  }

  private async exportSplitPdfs() {
    this.updateSplitPreview();
    if (this.splitChunksPreview.length === 0) {
      this.showToast('No split chunks defined.', 'warning');
      this.isProcessing = false;
      return;
    }

    this.processingStage = `Splitting into ${this.splitChunksPreview.length} PDF(s)...`;
    const originalDoc = this.pageManager.sourceDocs[0];
    const baseName = originalDoc ? originalDoc.name : 'document.pdf';

    const results = await this.pageManager.exportSplitPdfs(
      this.splitChunksPreview,
      baseName,
      (progress) => (this.processingProgress = progress),
      this.abortController?.signal
    );

    this.splitExportResults = results;
    await this.logHistoryItem(
      `PDF: Split into ${results.length} files`,
      originalDoc?.name || 'document.pdf',
      `${results.length} split files`,
      originalDoc?.sizeBytes || 0,
      results.reduce((sum, r) => sum + r.sizeBytes, 0)
    );
    this.showToast(`Successfully created ${results.length} PDF parts!`, 'success');
  }

  private async exportMergedPdf() {
    this.processingStage = 'Merging documents...';
    const outputName = `merged_${Date.now()}.pdf`;

    const result = await this.pageManager.exportSinglePdf(
      this.pageManager.pages,
      outputName,
      (progress) => (this.processingProgress = progress),
      this.abortController?.signal
    );

    this.lastExportResult = result;
    const totalOriginalSize = this.pageManager.sourceDocs.reduce((sum, d) => sum + d.sizeBytes, 0);

    await this.logHistoryItem(
      `PDF: Merged ${this.pageManager.sourceDocs.length} PDFs`,
      `${this.pageManager.sourceDocs.length} files`,
      result.name,
      totalOriginalSize,
      result.sizeBytes
    );
    this.showToast('Merged PDF created successfully!', 'success');
  }

  // --- Save, Share & Download ---

  async saveResult(result: PdfExportResult) {
    const uri = await this.storageService.saveFile(result.file, 'document');
    if (uri && uri !== 'web-download') {
      this.showToast(`Saved to ${uri}`, 'success');
    }
  }

  async shareResult(result: PdfExportResult) {
    const uri = await this.storageService.saveFile(result.file, 'document_share');
    if (uri && uri !== 'web-download') {
      await this.shareService.shareFile(uri, result.name);
    }
  }

  async downloadAllSplitAsZip() {
    if (this.splitExportResults.length === 0) return;

    this.isProcessing = true;
    this.processingStage = 'Packaging ZIP archive...';

    try {
      const zip = new JSZip();
      for (const res of this.splitExportResults) {
        zip.file(res.name, res.blob);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipFile = new File([zipBlob], `split_pdfs_${Date.now()}.zip`, { type: 'application/zip' });
      const uri = await this.storageService.saveFile(zipFile, 'archive');

      if (uri && uri !== 'web-download') {
        this.showToast(`Saved ZIP to ${uri}`, 'success');
      } else {
        this.showToast('Downloaded ZIP archive.', 'success');
      }
    } catch (e: any) {
      this.showToast(`ZIP generation failed: ${e.message}`, 'danger');
    } finally {
      this.isProcessing = false;
    }
  }

  private async logHistoryItem(
    operation: string,
    originalName: string,
    outputName: string,
    origSize: number,
    outSize: number
  ) {
    await this.historyService.addHistoryItem({
      operation,
      originalFileName: originalName,
      outputFileName: outputName,
      originalSizeBytes: origSize,
      outputSizeBytes: outSize,
      outputPath: 'web-download'
    });
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

  get beforePreviewData(): PreviewData | undefined {
    const doc = this.pageManager.sourceDocs[0];
    if (!doc) return undefined;
    return {
      name: doc.name,
      type: 'application/pdf',
      sizeBytes: doc.sizeBytes,
      pages: doc.pageCount
    };
  }

  get afterPreviewData(): PreviewData | undefined {
    if (!this.lastExportResult) return undefined;
    return {
      name: this.lastExportResult.name,
      type: 'application/pdf',
      sizeBytes: this.lastExportResult.sizeBytes,
      pages: this.lastExportResult.pageCount
    };
  }
}
