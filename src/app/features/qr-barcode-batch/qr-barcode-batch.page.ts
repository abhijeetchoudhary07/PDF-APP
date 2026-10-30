import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  ChangeDetectorRef,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { AppIconComponent } from '../../shared/components/ui/icon/icon.component';
import { BarcodeBatchService } from '../../core/services/barcode-batch.service';
import {
  BarcodeBatchItem,
  BarcodeFormat,
  BarcodeType1D,
  BatchDeduplicationOptions,
  BulkBarcodeGenerationOptions
} from '../../core/models/qr-barcode.types';

export type QrBarcodeBatchTab = 'batchScan' | 'generator1D';

@Component({
  selector: 'app-qr-barcode-batch',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppIconComponent],
  templateUrl: './qr-barcode-batch.page.html',
  styleUrls: ['./qr-barcode-batch.page.scss']
})
export class QrBarcodeBatchPage implements OnInit, OnDestroy {
  barcodeService = inject(BarcodeBatchService);
  private cdr = inject(ChangeDetectorRef);
  private sanitizer = inject(DomSanitizer);

  @ViewChild('videoElement', { static: false }) videoElementRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('scanCanvas', { static: false }) scanCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('bulkCsvInput', { static: false }) bulkCsvInputRef?: ElementRef<HTMLInputElement>;

  // Tab State
  activeTab: QrBarcodeBatchTab = 'batchScan';

  // Batch Scan State
  isCameraActive = false;
  cameraError: string | null = null;
  dedupMode: 'cooldown' | 'session' | 'none' = 'cooldown';
  scannedItems: BarcodeBatchItem[] = [];
  isLaserPulsing = false;
  drawerExpanded = false;
  toastMessage: string | null = null;
  private toastTimeout: any = null;

  private videoStream: MediaStream | null = null;
  private scanTimer: any = null;

  // 1D Barcode Generator State
  selectedFormat: BarcodeType1D = 'CODE_128';
  generatorPayload = '123456789012';
  previewSvgSafe: SafeHtml | null = null;
  generatorError: string | null = null;
  private previewRequestId = 0;

  // Bulk Generator State
  isBulkMode = false;
  bulkPayloadsText = 'SKU-001\nSKU-002\nSKU-003\nSKU-004';
  bulkGridType: '12-up' | '24-up' = '24-up';
  isProcessingBulk = false;

  readonly availableFormats: { id: BarcodeType1D; labelKey: string }[] = [
    { id: 'CODE_128', labelKey: 'barcodeBatch.formatCode128' },
    { id: 'EAN_13', labelKey: 'barcodeBatch.formatEan13' },
    { id: 'CODE_39', labelKey: 'barcodeBatch.formatCode39' },
    { id: 'QR_CODE', labelKey: 'barcodeBatch.formatQr' }
  ];

  ngOnInit(): void {
    this.scannedItems = this.barcodeService.getSessionItems();
    this.update1DPreview();

    if (typeof window !== 'undefined') {
      (window as any).__simulateBarcodeScan = (payload?: string, format?: BarcodeFormat) => {
        return this.simulateBarcodeScan(payload, format);
      };
    }
  }

  ngOnDestroy(): void {
    this.stopCamera();
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
    if (typeof window !== 'undefined') {
      delete (window as any).__simulateBarcodeScan;
    }
  }

  switchTab(tab: QrBarcodeBatchTab): void {
    this.activeTab = tab;
    if (tab === 'generator1D') {
      this.stopCamera();
      this.update1DPreview();
    }
    this.cdr.markForCheck();
  }

  // =========================================================================
  // CONTINUOUS BATCH SCANNER
  // =========================================================================

  async toggleCamera(): Promise<void> {
    if (this.isCameraActive) {
      this.stopCamera();
    } else {
      await this.startCamera();
    }
  }

  async startCamera(): Promise<void> {
    this.cameraError = null;
    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('Camera access not supported on this device/browser');
      }

      this.videoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      this.isCameraActive = true;
      this.cdr.detectChanges();

      if (this.videoElementRef?.nativeElement) {
        this.videoElementRef.nativeElement.srcObject = this.videoStream;
        await this.videoElementRef.nativeElement.play();
      }

      this.startContinuousScanLoop();
    } catch (err: any) {
      console.warn('Unable to access camera', err);
      this.cameraError = err?.message || 'Camera permission denied or camera not available';
      this.isCameraActive = false;
      this.cdr.markForCheck();
    }
  }

  stopCamera(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    if (this.videoStream) {
      this.videoStream.getTracks().forEach(track => track.stop());
      this.videoStream = null;
    }
    if (this.videoElementRef?.nativeElement) {
      this.videoElementRef.nativeElement.srcObject = null;
    }
    this.isCameraActive = false;
    this.cdr.markForCheck();
  }

  private startContinuousScanLoop(): void {
    if (this.scanTimer) clearInterval(this.scanTimer);

    // Poll every 350ms to maintain real-time responsiveness without pegging CPU
    this.scanTimer = setInterval(async () => {
      await this.captureAndDecodeFrame();
    }, 350);
  }

  private async captureAndDecodeFrame(): Promise<void> {
    const video = this.videoElementRef?.nativeElement;
    const canvas = this.scanCanvasRef?.nativeElement;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) return;

    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const results = await this.barcodeService.decodeFromImage(canvas);
      if (results && results.length > 0) {
        for (const res of results) {
          this.handleDetectedBarcode(res.rawContent, res.format);
        }
      }
    } catch {
      // Decode errors on partial frames are normal; ignore silently
    }
  }

  /**
   * Process a detected barcode: deduplicate, feedback, update session.
   */
  handleDetectedBarcode(payload: string, format: BarcodeFormat): boolean {
    const captured = this.barcodeService.handleCapturedBarcode(
      payload,
      format,
      this.dedupMode,
      3000
    );

    if (captured) {
      this.scannedItems = this.barcodeService.getSessionItems();

      // Trigger reticle feedback
      this.isLaserPulsing = true;
      setTimeout(() => {
        this.isLaserPulsing = false;
        this.cdr.markForCheck();
      }, 600);

      this.barcodeService.playCaptureFeedback();
      this.showToast('barcodeBatch.scanSuccess');
      this.cdr.markForCheck();
      return true;
    }

    return false;
  }

  /**
   * Manual or simulated barcode scan (used for testing or devices without camera).
   */
  simulateBarcodeScan(payload: string = '400638133393', format: BarcodeFormat = 'EAN_13'): boolean {
    return this.handleDetectedBarcode(payload, format);
  }

  setDedupMode(mode: 'cooldown' | 'session' | 'none'): void {
    this.dedupMode = mode;
    this.cdr.markForCheck();
  }

  toggleDrawer(): void {
    this.drawerExpanded = !this.drawerExpanded;
    this.cdr.markForCheck();
  }

  deleteScannedItem(index: number, event?: Event): void {
    if (event) event.stopPropagation();
    this.scannedItems.splice(index, 1);
    this.barcodeService.clearSession();
    this.scannedItems.forEach(item => {
      this.barcodeService.handleCapturedBarcode(item.payload, item.format, 'none');
    });
    this.cdr.markForCheck();
  }

  clearAllScanned(): void {
    this.barcodeService.clearSession();
    this.scannedItems = [];
    this.cdr.markForCheck();
  }

  async exportBatchCsv(): Promise<void> {
    if (this.scannedItems.length === 0) return;
    try {
      const res = await this.barcodeService.exportBatchCsv(this.scannedItems);
      this.showToast('barcodeBatch.exportSuccess', { name: res.file.name });
    } catch (err: any) {
      this.showToast(err?.message || 'Export failed');
    }
  }

  async exportBatchTxt(): Promise<void> {
    if (this.scannedItems.length === 0) return;
    try {
      const res = await this.barcodeService.exportBatchTxt(this.scannedItems);
      this.showToast('barcodeBatch.exportSuccess', { name: res.file.name });
    } catch (err: any) {
      this.showToast(err?.message || 'Export failed');
    }
  }

  // =========================================================================
  // 1D & BULK BARCODE GENERATOR
  // =========================================================================

  selectFormat(format: BarcodeType1D): void {
    this.selectedFormat = format;
    if (format === 'EAN_13' && (!this.generatorPayload || !/^\d{12,13}$/.test(this.generatorPayload))) {
      this.generatorPayload = '400638133393';
    }
    this.update1DPreview();
  }

  onPayloadInput(value: string): void {
    this.generatorPayload = value;
    this.update1DPreview();
  }

  async update1DPreview(): Promise<void> {
    const currentReq = ++this.previewRequestId;
    this.generatorError = null;
    const cleanPayload = this.generatorPayload?.trim() || '';

    if (!cleanPayload) {
      this.previewSvgSafe = null;
      return;
    }

    try {
      if (this.selectedFormat === 'EAN_13') {
        const check = this.barcodeService.validateAndComputeEan13(cleanPayload);
        if (!check.valid) {
          if (currentReq === this.previewRequestId) {
            this.generatorError = check.error || 'barcodeBatch.invalidEan13';
            this.previewSvgSafe = null;
            this.cdr.markForCheck();
          }
          return;
        }
      }

      const svgString = await this.barcodeService.generate1DBarcodeSvg({
        format: this.selectedFormat,
        payload: cleanPayload,
        width: 320,
        height: 120,
        includeText: true
      });

      if (currentReq === this.previewRequestId) {
        this.previewSvgSafe = this.sanitizer.bypassSecurityTrustHtml(svgString);
      }
    } catch (err: any) {
      if (currentReq === this.previewRequestId) {
        this.generatorError = err?.message || 'Error generating barcode';
        this.previewSvgSafe = null;
      }
    }

    this.cdr.markForCheck();
  }

  toggleBulkMode(enable: boolean): void {
    this.isBulkMode = enable;
    this.cdr.markForCheck();
  }

  triggerBulkCsvUpload(): void {
    this.bulkCsvInputRef?.nativeElement.click();
  }

  async onBulkCsvSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const text = await file.text();
    if (text) {
      this.bulkPayloadsText = text;
      this.isBulkMode = true;
      this.cdr.markForCheck();
    }
    input.value = '';
  }

  parseBulkPayloads(): string[] {
    if (!this.bulkPayloadsText) return [];
    const lines = this.bulkPayloadsText
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'));
    // Enforce safe memory boundary
    return lines.slice(0, 1000);
  }

  async generateBulkLabelSheet(): Promise<void> {
    const payloads = this.isBulkMode
      ? this.parseBulkPayloads()
      : (this.generatorPayload?.trim() ? [this.generatorPayload.trim()] : []);
    if (payloads.length === 0) {
      this.showToast('Please enter at least one barcode payload');
      return;
    }

    this.isProcessingBulk = true;
    this.cdr.markForCheck();

    try {
      const result = await this.barcodeService.generateLabelSheetPdf({
        payloads,
        format: this.selectedFormat,
        gridType: this.bulkGridType,
        includeText: true
      });

      this.showToast('barcodeBatch.exportSuccess', { name: result.file.name });
    } catch (err: any) {
      this.showToast(err?.message || 'Error generating label sheet');
    } finally {
      this.isProcessingBulk = false;
      this.cdr.markForCheck();
    }
  }

  async downloadBulkZip(): Promise<void> {
    const payloads = this.isBulkMode
      ? this.parseBulkPayloads()
      : (this.generatorPayload?.trim() ? [this.generatorPayload.trim()] : []);
    if (payloads.length === 0) {
      this.showToast('Please enter at least one barcode payload');
      return;
    }

    this.isProcessingBulk = true;
    this.cdr.markForCheck();

    try {
      const result = await this.barcodeService.generateBulkZipArchive({
        payloads,
        format: this.selectedFormat,
        gridType: this.bulkGridType,
        includeText: true
      });

      this.showToast('barcodeBatch.exportSuccess', { name: result.file.name });
    } catch (err: any) {
      this.showToast(err?.message || 'Error creating ZIP archive');
    } finally {
      this.isProcessingBulk = false;
      this.cdr.markForCheck();
    }
  }

  // =========================================================================
  // TOAST / FEEDBACK
  // =========================================================================

  private showToast(messageKey: string, params?: Record<string, any>): void {
    this.toastMessage = messageKey;
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toastMessage = null;
      this.cdr.markForCheck();
    }, 2800);
    this.cdr.markForCheck();
  }
}
