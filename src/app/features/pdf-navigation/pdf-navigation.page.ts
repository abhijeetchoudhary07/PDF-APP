import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { PDFDocument } from 'pdf-lib';
import { PdfOutlineService } from '../../core/services/pdf-outline.service';
import { PdfPageLabelService } from '../../core/services/pdf-page-label.service';
import { FileService } from '../../core/services/file.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import { ToastService } from '../../core/services/toast.service';
import {
  NavigationMode,
  NavigationProgress,
  OutlineNode,
  OutlineNotice,
  PageLabelNotice,
  PageLabelPreviewRow,
  PageLabelRange,
  PageLabelStyle,
  PAGE_LABEL_STYLES,
  defaultHeadingScanOptions,
  defaultPageLabelRange
} from '../../core/models/pdf-navigation.types';
import {
  AppHeaderComponent,
  AppFooterComponent,
  AppPageHeaderComponent,
  AppButtonComponent,
  AppIconComponent,
  AppProgressComponent,
  AppRelatedToolsComponent,
  FileDropzoneComponent,
  TranslatePipe
} from '../../shared/components/ui';
import { PdfPreviewComponent } from '../../shared/components/pdf-preview/pdf-preview.component';

export type NavigationStep = 'select' | 'configure' | 'processing' | 'result';

export interface VisibleOutlineRow {
  node: OutlineNode;
  depth: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  canIndent: boolean;
  canOutdent: boolean;
  isFirst: boolean;
  isLast: boolean;
}

@Component({
  selector: 'app-pdf-navigation',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './pdf-navigation.page.html',
  styleUrls: ['./pdf-navigation.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    AppHeaderComponent,
    AppFooterComponent,
    AppPageHeaderComponent,
    AppButtonComponent,
    AppIconComponent,
    AppProgressComponent,
    AppRelatedToolsComponent,
    FileDropzoneComponent,
    PdfPreviewComponent,
    TranslatePipe
  ],
  providers: [DecimalPipe]
})
export class PdfNavigationPage implements OnInit {
  private outlineService = inject(PdfOutlineService);
  private pageLabelService = inject(PdfPageLabelService);
  private fileService = inject(FileService);
  private storageService = inject(StorageService);
  private shareService = inject(ShareService);
  private historyService = inject(HistoryService);
  private toastService = inject(ToastService);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);

  currentStep: NavigationStep = 'select';
  activeMode: NavigationMode = 'bookmarks';

  selectedFile?: File;
  originalArrayBuffer?: ArrayBuffer;
  pageCount = 0;

  // Tabs for studio mode
  readonly tabs = [
    { id: 'bookmarks', label: 'navigation.tabBookmarks', icon: 'bookmark' },
    { id: 'labels', label: 'navigation.tabLabels', icon: 'list-number' }
  ];

  // --- E1: Bookmarks State ---
  outlineNodes: OutlineNode[] = [];
  outlineNotices: OutlineNotice[] = [];
  isScanningHeadings = false;
  scanProgressText = '';
  scanPercent = 0;
  private abortController?: AbortController;

  // Bookmark modal editing state
  isModalOpen = false;
  modalMode: 'add' | 'edit' = 'add';
  editTitle = '';
  editPage = 1;
  targetParentId?: string;
  targetNodeId?: string;

  // --- E2: Page Labels State ---
  labelRanges: PageLabelRange[] = [];
  labelNotices: PageLabelNotice[] = [];
  previewRows: PageLabelPreviewRow[] = [];
  duplicateLabels: string[] = [];
  readonly labelStyles: PageLabelStyle[] = PAGE_LABEL_STYLES;

  // --- Output State ---
  isProcessing = false;
  processingProgress = 0;
  processingText = '';
  outputFile?: File;
  outputArrayBuffer?: ArrayBuffer;
  bookmarksWrittenCount = 0;
  rangesWrittenCount = 0;

  ngOnInit(): void {
    const routeMode = this.route.snapshot.data['mode'] || this.route.snapshot.queryParams['mode'];
    if (routeMode === 'labels' || this.route.snapshot.url.some(s => s.path.includes('label'))) {
      this.activeMode = 'labels';
    } else {
      this.activeMode = 'bookmarks';
    }
  }

  setMode(mode: string): void {
    if (mode === 'bookmarks' || mode === 'labels') {
      this.activeMode = mode;
      if (this.currentStep === 'configure') {
        if (this.activeMode === 'labels' && this.labelRanges.length === 0) {
          this.labelRanges = [defaultPageLabelRange(1)];
          this.refreshLabelPreview();
        }
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

    try {
      const doc = await PDFDocument.load(this.originalArrayBuffer.slice(0), { ignoreEncryption: true });
      this.pageCount = doc.getPageCount();

      // Read existing outline
      const { nodes, notices } = await this.outlineService.readOutline(this.originalArrayBuffer);
      this.outlineNodes = nodes;
      this.outlineNotices = notices;

      // Read existing page labels
      const existingRanges = this.pageLabelService.readPageLabels(doc);
      this.labelRanges = existingRanges.length > 0 ? existingRanges : [defaultPageLabelRange(1)];
      this.refreshLabelPreview();

      this.currentStep = 'configure';
    } catch (err: any) {
      this.toastService.error('Failed to parse PDF document: ' + (err?.message || err));
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // E1: Bookmarks & Outline Operations
  // ════════════════════════════════════════════════════════════════════

  get visibleOutlineRows(): VisibleOutlineRow[] {
    const rows: VisibleOutlineRow[] = [];

    const traverse = (nodes: OutlineNode[], depth: number, parentNode?: OutlineNode) => {
      nodes.forEach((node, index) => {
        const hasChildren = node.children && node.children.length > 0;
        const isCollapsed = !!node.collapsed;

        rows.push({
          node,
          depth,
          hasChildren,
          isCollapsed,
          canIndent: index > 0,
          canOutdent: depth > 0,
          isFirst: index === 0,
          isLast: index === nodes.length - 1
        });

        if (hasChildren && !isCollapsed) {
          traverse(node.children, depth + 1, node);
        }
      });
    };

    traverse(this.outlineNodes, 0);
    return rows;
  }

  getRowIndent(depth: number): number {
    return 12 + Math.min(depth, 3) * 16;
  }

  toggleCollapse(node: OutlineNode): void {
    node.collapsed = !node.collapsed;
    this.cdr.detectChanges();
  }

  openAddBookmarkModal(parentId?: string): void {
    this.modalMode = 'add';
    this.targetParentId = parentId;
    this.targetNodeId = undefined;
    this.editTitle = '';
    this.editPage = 1;
    this.isModalOpen = true;
  }

  openEditBookmarkModal(node: OutlineNode): void {
    this.modalMode = 'edit';
    this.targetNodeId = node.id;
    this.targetParentId = undefined;
    this.editTitle = node.title;
    this.editPage = node.pageIndex + 1;
    this.isModalOpen = true;
  }

  closeModal(): void {
    this.isModalOpen = false;
  }

  saveBookmarkFromModal(): void {
    const trimmed = this.editTitle.trim() || 'Untitled';
    const pageIndex = Math.max(0, Math.min(this.pageCount - 1, (this.editPage || 1) - 1));

    if (this.modalMode === 'add') {
      const newNode: OutlineNode = {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
        title: trimmed,
        pageIndex,
        children: []
      };

      if (this.targetParentId) {
        const parent = this.findNode(this.outlineNodes, this.targetParentId);
        if (parent) {
          parent.children.push(newNode);
          parent.collapsed = false;
        } else {
          this.outlineNodes.push(newNode);
        }
      } else {
        this.outlineNodes.push(newNode);
      }
    } else if (this.targetNodeId) {
      const existing = this.findNode(this.outlineNodes, this.targetNodeId);
      if (existing) {
        existing.title = trimmed;
        existing.pageIndex = pageIndex;
      }
    }

    this.isModalOpen = false;
    this.cdr.detectChanges();
  }

  deleteNode(id: string): void {
    const removeRecursive = (list: OutlineNode[]): boolean => {
      const idx = list.findIndex(n => n.id === id);
      if (idx >= 0) {
        list.splice(idx, 1);
        return true;
      }
      for (const item of list) {
        if (removeRecursive(item.children)) return true;
      }
      return false;
    };

    removeRecursive(this.outlineNodes);
    this.cdr.detectChanges();
  }

  indentNode(id: string): void {
    const locateAndIndent = (list: OutlineNode[]): boolean => {
      const idx = list.findIndex(n => n.id === id);
      if (idx > 0) {
        const [target] = list.splice(idx, 1);
        list[idx - 1].children.push(target);
        list[idx - 1].collapsed = false;
        return true;
      }
      for (const item of list) {
        if (locateAndIndent(item.children)) return true;
      }
      return false;
    };

    locateAndIndent(this.outlineNodes);
    this.cdr.detectChanges();
  }

  outdentNode(id: string): void {
    const locateAndOutdent = (
      list: OutlineNode[],
      parent?: OutlineNode,
      grandparentList?: OutlineNode[]
    ): boolean => {
      const idx = list.findIndex(n => n.id === id);
      if (idx >= 0 && parent && grandparentList) {
        const [target] = list.splice(idx, 1);
        const parentIdx = grandparentList.indexOf(parent);
        grandparentList.splice(parentIdx + 1, 0, target);
        return true;
      }
      for (const item of list) {
        if (locateAndOutdent(item.children, item, list)) return true;
      }
      return false;
    };

    locateAndOutdent(this.outlineNodes, undefined, undefined);
    this.cdr.detectChanges();
  }

  moveNodeUp(id: string): void {
    const moveRecursive = (list: OutlineNode[]): boolean => {
      const idx = list.findIndex(n => n.id === id);
      if (idx > 0) {
        const temp = list[idx - 1];
        list[idx - 1] = list[idx];
        list[idx] = temp;
        return true;
      }
      for (const item of list) {
        if (moveRecursive(item.children)) return true;
      }
      return false;
    };

    moveRecursive(this.outlineNodes);
    this.cdr.detectChanges();
  }

  moveNodeDown(id: string): void {
    const moveRecursive = (list: OutlineNode[]): boolean => {
      const idx = list.findIndex(n => n.id === id);
      if (idx >= 0 && idx < list.length - 1) {
        const temp = list[idx + 1];
        list[idx + 1] = list[idx];
        list[idx] = temp;
        return true;
      }
      for (const item of list) {
        if (moveRecursive(item.children)) return true;
      }
      return false;
    };

    moveRecursive(this.outlineNodes);
    this.cdr.detectChanges();
  }

  private findNode(nodes: OutlineNode[], id: string): OutlineNode | undefined {
    for (const node of nodes) {
      if (node.id === id) return node;
      const found = this.findNode(node.children, id);
      if (found) return found;
    }
    return undefined;
  }

  async autoGenerateFromHeadings(): Promise<void> {
    if (!this.originalArrayBuffer) return;

    this.isScanningHeadings = true;
    this.scanPercent = 0;
    this.abortController = new AbortController();
    this.cdr.detectChanges();

    try {
      const { nodes, notices } = await this.outlineService.generateFromHeadings(
        this.originalArrayBuffer,
        defaultHeadingScanOptions(),
        {
          onProgress: p => {
            this.scanPercent = p.percent;
            this.scanProgressText = `Scanning page ${p.completed} of ${p.total}...`;
            this.cdr.detectChanges();
          },
          signal: this.abortController.signal
        }
      );

      if (nodes.length > 0) {
        this.outlineNodes = nodes;
        this.toastService.success(`Auto-generated outline with ${this.outlineService.totalCount(nodes)} heading(s).`);
      } else {
        const noticeKind = notices[0]?.kind;
        if (noticeKind === 'no-text-layer') {
          this.toastService.error('This document has no selectable text layer to detect headings.');
        } else {
          this.toastService.warning('No prominent headings detected in document text.');
        }
      }
    } catch (err: any) {
      if (err?.message?.includes('cancelled')) {
        this.toastService.warning('Heading scan cancelled.');
      } else {
        this.toastService.error('Failed to scan headings: ' + (err?.message || err));
      }
    } finally {
      this.isScanningHeadings = false;
      this.abortController = undefined;
      this.cdr.detectChanges();
    }
  }

  clearOutline(): void {
    this.outlineNodes = [];
    this.toastService.success('Document outline cleared.');
  }

  async exportBookmarks(): Promise<void> {
    if (!this.selectedFile || !this.originalArrayBuffer) return;

    this.currentStep = 'processing';
    this.isProcessing = true;
    this.processingProgress = 0;
    this.processingText = 'Writing bookmark outline tree...';
    this.cdr.detectChanges();

    try {
      const outputName = this.selectedFile.name.replace(/\.pdf$/i, '') + '_bookmarks.pdf';
      const result = await this.outlineService.exportWithOutline(
        this.originalArrayBuffer,
        this.outlineNodes,
        outputName,
        p => {
          this.processingProgress = p.percent;
          this.cdr.detectChanges();
        }
      );

      await this.storageService.saveFile(result.file, 'outline');

      this.outputFile = result.file;
      this.outputArrayBuffer = await result.blob.arrayBuffer();
      this.bookmarksWrittenCount = result.bookmarkCount;

      await this.historyService.addHistoryItem({
        operation: `Saved outline (${result.bookmarkCount} bookmarks)`,
        originalFileName: this.selectedFile.name,
        outputFileName: outputName,
        originalSizeBytes: this.selectedFile.size,
        outputSizeBytes: result.sizeBytes
      });

      this.currentStep = 'result';
      this.toastService.success('Bookmarks saved successfully!');
    } catch (err: any) {
      this.toastService.error('Failed to write bookmarks: ' + (err?.message || err));
      this.currentStep = 'configure';
    } finally {
      this.isProcessing = false;
      this.cdr.detectChanges();
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // E2: Logical Page Labels Operations
  // ════════════════════════════════════════════════════════════════════

  refreshLabelPreview(): void {
    if (this.pageCount <= 0) return;
    this.previewRows = this.pageLabelService.preview(this.labelRanges, this.pageCount, 300);
    this.duplicateLabels = this.pageLabelService.findDuplicateLabels(this.labelRanges, this.pageCount);
  }

  addRange(): void {
    const last = this.labelRanges[this.labelRanges.length - 1];
    const nextStart = last ? Math.min(this.pageCount, last.startPage + 3) : 1;
    this.labelRanges.push(defaultPageLabelRange(nextStart));
    this.refreshLabelPreview();
  }

  removeRange(id: string): void {
    if (this.labelRanges.length <= 1) return;
    this.labelRanges = this.labelRanges.filter(r => r.id !== id);
    this.refreshLabelPreview();
  }

  resetLabels(): void {
    this.labelRanges = [defaultPageLabelRange(1)];
    this.refreshLabelPreview();
    this.toastService.success('Reset to standard physical numbering.');
  }

  async exportLabels(): Promise<void> {
    if (!this.selectedFile || !this.originalArrayBuffer) return;

    this.currentStep = 'processing';
    this.isProcessing = true;
    this.processingProgress = 0;
    this.processingText = 'Writing logical page labels...';
    this.cdr.detectChanges();

    try {
      const outputName = this.selectedFile.name.replace(/\.pdf$/i, '') + '_labels.pdf';
      const result = await this.pageLabelService.exportWithLabels(
        this.originalArrayBuffer,
        this.labelRanges,
        outputName,
        p => {
          this.processingProgress = p.percent;
          this.cdr.detectChanges();
        }
      );

      await this.storageService.saveFile(result.file, 'labels');

      this.outputFile = result.file;
      this.outputArrayBuffer = await result.blob.arrayBuffer();
      this.rangesWrittenCount = result.rangeCount;

      await this.historyService.addHistoryItem({
        operation: `Applied logical page labels (${result.rangeCount} ranges)`,
        originalFileName: this.selectedFile.name,
        outputFileName: outputName,
        originalSizeBytes: this.selectedFile.size,
        outputSizeBytes: result.sizeBytes
      });

      this.currentStep = 'result';
      this.toastService.success('Page labels saved successfully!');
    } catch (err: any) {
      this.toastService.error('Failed to write page labels: ' + (err?.message || err));
      this.currentStep = 'configure';
    } finally {
      this.isProcessing = false;
      this.cdr.detectChanges();
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // Result Actions
  // ════════════════════════════════════════════════════════════════════

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
    this.outlineNodes = [];
    this.labelRanges = [];
    this.previewRows = [];
    this.duplicateLabels = [];
  }
}
