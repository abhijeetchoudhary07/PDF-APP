import { Component, ElementRef, ViewChild, OnDestroy, AfterViewInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, AlertController, ToastController, ModalController } from '@ionic/angular/lazy';
import { FileService } from '../../core/services/file.service';
import { PdfSignService, PlacedSignature } from '../../core/services/pdf-sign.service';
import { StorageService } from '../../core/services/storage.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import * as pdfjsLib from 'pdfjs-dist';

import {
  AppHeaderComponent,
  AppPageHeaderComponent,
  AppFooterComponent,
  AppButtonComponent,
  AppBadgeComponent,
  AppTabsComponent,
  AppIconComponent
} from '../../shared/components/ui';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-pdf-sign',
  templateUrl: './pdf-sign.page.html',
  styleUrls: ['./pdf-sign.page.scss'],
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
    AppBadgeComponent,
    AppTabsComponent
  ]
})
export class PdfSignPage implements OnDestroy, AfterViewInit {
  @ViewChild('pdfCanvas') pdfCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('drawCanvas') drawCanvas?: ElementRef<HTMLCanvasElement>;

  get creationTabs() {
    return [
      { id: 'draw', label: 'Draw' },
      { id: 'upload', label: 'Upload' },
      { id: 'recent', label: `Recent (${this.recentSignatures.length})` }
    ];
  }

  pdfFile?: File;
  pdfArrayBuffer?: ArrayBuffer;
  totalPages = 1;
  currentPage = 1;
  viewportScale = 1.0;
  pdfPageDimensions = { width: 595, height: 842 };

  // Signatures state
  signatures: PlacedSignature[] = [];
  selectedSignatureId?: string;
  recentSignatures: string[] = [];

  // Signature Creation Modal / Pad
  activeCreationMode: 'draw' | 'upload' | 'recent' = 'draw';
  showSignatureDialog = false;

  // Drawing pad state
  isDrawing = false;
  drawColor = '#000000';
  drawStrokeWidth = 2.5;
  private drawCtx: CanvasRenderingContext2D | null = null;

  isProcessing = false;
  Math = Math;

  updateSignatureWidth(width: number): void {
    if (this.selectedSignature) {
      this.selectedSignature.width = width;
      this.selectedSignature.height = Math.round(width * 0.43);
    }
  }

  constructor(
    private fileService: FileService,
    private pdfSignService: PdfSignService,
    private storageService: StorageService,
    private shareService: ShareService,
    private historyService: HistoryService,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController
  ) {}

  ngAfterViewInit(): void {
    this.initDrawCanvas();
  }

  ngOnDestroy(): void {}

  get currentSignatures(): PlacedSignature[] {
    return this.signatures.filter(s => s.pageNumber === this.currentPage);
  }

  get selectedSignature(): PlacedSignature | undefined {
    return this.signatures.find(s => s.id === this.selectedSignatureId);
  }

  async selectPdf(): Promise<void> {
    const file = await this.fileService.pickPdfFile();
    if (!file) return;

    this.isProcessing = true;
    try {
      this.pdfFile = file;
      this.pdfArrayBuffer = await file.arrayBuffer();

      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(this.pdfArrayBuffer.slice(0))
      } as any);
      const pdf = await loadingTask.promise;
      this.totalPages = pdf.numPages;
      this.currentPage = 1;
      this.signatures = [];
      this.selectedSignatureId = undefined;

      await this.renderCurrentPdfPage();
      this.recentSignatures = this.pdfSignService.getRecentSignatures();
    } catch (e: any) {
      const alert = await this.alertCtrl.create({
        header: 'Error Opening PDF',
        message: e.message || String(e),
        buttons: ['OK']
      });
      await alert.present();
    } finally {
      this.isProcessing = false;
    }
  }

  async renderCurrentPdfPage(): Promise<void> {
    if (!this.pdfArrayBuffer || !this.pdfCanvas?.nativeElement) return;

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(this.pdfArrayBuffer.slice(0))
    } as any);
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(this.currentPage);

    // Render at scale 1.2 for crisp mobile viewing
    const viewport = page.getViewport({ scale: 1.2 });
    this.viewportScale = 1.2;
    this.pdfPageDimensions = { width: page.view[2] || viewport.width / 1.2, height: page.view[3] || viewport.height / 1.2 };

    const canvas = this.pdfCanvas.nativeElement;
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await (page.render({ canvasContext: ctx, viewport } as any)).promise;
    }
  }

  openSignatureDialog(): void {
    this.showSignatureDialog = true;
    this.recentSignatures = this.pdfSignService.getRecentSignatures();
    setTimeout(() => this.initDrawCanvas(), 100);
  }

  closeSignatureDialog(): void {
    this.showSignatureDialog = false;
  }

  // --- DRAWING CANVAS METHODS ---
  private initDrawCanvas(): void {
    if (!this.drawCanvas?.nativeElement) return;
    const canvas = this.drawCanvas.nativeElement;
    canvas.width = canvas.offsetWidth || 340;
    canvas.height = 180;
    this.drawCtx = canvas.getContext('2d');
    if (this.drawCtx) {
      this.drawCtx.lineCap = 'round';
      this.drawCtx.lineJoin = 'round';
      this.drawCtx.strokeStyle = this.drawColor;
      this.drawCtx.lineWidth = this.drawStrokeWidth;
    }
  }

  startDraw(e: MouseEvent | TouchEvent): void {
    this.isDrawing = true;
    if (!this.drawCtx || !this.drawCanvas?.nativeElement) return;
    const rect = this.drawCanvas.nativeElement.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    this.drawCtx.beginPath();
    this.drawCtx.moveTo(clientX - rect.left, clientY - rect.top);
  }

  drawMove(e: MouseEvent | TouchEvent): void {
    if (!this.isDrawing || !this.drawCtx || !this.drawCanvas?.nativeElement) return;
    e.preventDefault();
    const rect = this.drawCanvas.nativeElement.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    this.drawCtx.lineTo(clientX - rect.left, clientY - rect.top);
    this.drawCtx.stroke();
  }

  endDraw(): void {
    this.isDrawing = false;
  }

  clearDraw(): void {
    if (!this.drawCtx || !this.drawCanvas?.nativeElement) return;
    this.drawCtx.clearRect(0, 0, this.drawCanvas.nativeElement.width, this.drawCanvas.nativeElement.height);
  }

  insertDrawnSignature(): void {
    if (!this.drawCanvas?.nativeElement) return;
    const dataUrl = this.drawCanvas.nativeElement.toDataURL('image/png');
    this.placeSignatureOnDocument(dataUrl);
    this.closeSignatureDialog();
  }

  async onUploadSignature(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    this.isProcessing = true;
    try {
      const file = input.files[0];
      const preparedDataUrl = await this.pdfSignService.prepareSignatureFromUpload(file, {
        autoCrop: true,
        transparentBg: true
      });
      this.placeSignatureOnDocument(preparedDataUrl);
      this.closeSignatureDialog();
    } catch (e: any) {
      alert('Failed to process uploaded signature: ' + e);
    } finally {
      this.isProcessing = false;
      input.value = '';
    }
  }

  selectRecentSignature(dataUrl: string): void {
    this.placeSignatureOnDocument(dataUrl);
    this.closeSignatureDialog();
  }

  placeSignatureOnDocument(dataUrl: string): void {
    const id = `sig_${Date.now()}`;
    const newSig: PlacedSignature = {
      id,
      pageNumber: this.currentPage,
      x: 80,
      y: 120 + this.currentSignatures.length * 30,
      width: 140,
      height: 60,
      rotation: 0,
      opacity: 1.0,
      dataUrl
    };

    this.signatures.push(newSig);
    this.selectedSignatureId = id;
  }

  selectSignature(id: string): void {
    this.selectedSignatureId = id;
  }

  rotateSelected(deltaDegrees: number): void {
    if (this.selectedSignature) {
      this.selectedSignature.rotation = (this.selectedSignature.rotation + deltaDegrees + 360) % 360;
    }
  }

  deleteSelected(): void {
    if (this.selectedSignatureId) {
      this.signatures = this.signatures.filter(s => s.id !== this.selectedSignatureId);
      this.selectedSignatureId = undefined;
    }
  }

  // --- EXPORT SIGNED PDF ---
  async exportSignedPdf(): Promise<void> {
    if (!this.pdfFile || !this.pdfArrayBuffer) return;

    this.isProcessing = true;
    try {
      const result = await this.pdfSignService.embedSignatures(
        this.pdfArrayBuffer,
        this.signatures,
        `${this.pdfFile.name.replace(/\.pdf$/i, '')}_signed.pdf`
      );

      const uri = await this.storageService.saveFile(result.file, 'pdf');
      await this.historyService.addHistoryItem({
        operation: 'pdf_sign',
        originalFileName: this.pdfFile.name,
        outputFileName: result.file.name,
        originalSizeBytes: this.pdfFile.size,
        outputSizeBytes: result.sizeBytes,
        outputPath: uri
      });

      const alert = await this.alertCtrl.create({
        header: 'Document Signed Successfully',
        message: `Embedded ${this.signatures.length} signature(s). Saved to device.`,
        buttons: [
          {
            text: 'Share',
            handler: () => {
              if (uri && uri !== 'web-download') {
                this.shareService.shareFile(uri, 'Signed Document');
              }
            }
          },
          { text: 'Done', role: 'cancel' }
        ]
      });
      await alert.present();
    } catch (e: any) {
      const alert = await this.alertCtrl.create({
        header: 'Export Failed',
        message: e.message || String(e),
        buttons: ['OK']
      });
      await alert.present();
    } finally {
      this.isProcessing = false;
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.selectedSignatureId = undefined;
      this.renderCurrentPdfPage();
    }
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.selectedSignatureId = undefined;
      this.renderCurrentPdfPage();
    }
  }
}
