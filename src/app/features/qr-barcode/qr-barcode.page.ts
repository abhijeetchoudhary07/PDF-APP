import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { QrBarcodeService } from '../../core/services/qr-barcode.service';
import { FileService } from '../../core/services/file.service';
import { ShareService } from '../../core/services/share.service';
import { HistoryService } from '../../core/services/history.service';
import { ToastService } from '../../core/services/toast.service';
import { AnalyticsService } from '../../core/services/analytics.service';
import { DocumentBridgeService } from '../../core/services/document-bridge.service';
import {
  BarcodeScanResult,
  QrGeneratorOptions,
  QrContentType,
  BarcodeReportFormat
} from '../../core/models/qr-barcode.types';
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

export type QrToolkitTab = 'scan' | 'generate';
export type ScanInputSource = 'camera' | 'image' | 'pdf';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-qr-barcode',
  templateUrl: './qr-barcode.page.html',
  styleUrls: ['./qr-barcode.page.scss'],
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
export class QrBarcodePage implements OnInit {
  qrService = inject(QrBarcodeService);
  private fileService = inject(FileService);
  private shareService = inject(ShareService);
  private historyService = inject(HistoryService);
  private toastService = inject(ToastService);
  private analyticsService = inject(AnalyticsService);
  private bridgeService = inject(DocumentBridgeService);
  private cdr = inject(ChangeDetectorRef);

  activeTab: QrToolkitTab = 'scan';
  toolkitTabs: { id: QrToolkitTab; label: string }[] = [
    { id: 'scan', label: 'Scan & Decode' },
    { id: 'generate', label: 'QR Generator' }
  ];

  // SCAN STATE
  scanSource: ScanInputSource = 'image';
  selectedImageFile?: File;
  selectedPdfFile?: File;
  pdfTotalPages = 1;
  pdfScanAllPages = true;
  pdfSelectedPage = 1;

  isScanning = false;
  scanProgressPct = 0;
  scanProgressMsg = '';
  scanResults: BarcodeScanResult[] = [];
  selectedResultIds: Set<string> = new Set();

  // URL Safety Modal State
  pendingUrl: string | null = null;
  pendingUrlDomain: string = '';

  // GENERATOR STATE
  generatorOptions: QrGeneratorOptions = {
    contentType: 'url',
    content: 'https://',
    size: 280,
    margin: 2,
    errorCorrectionLevel: 'M',
    foregroundColor: '#000000',
    backgroundColor: '#ffffff',
    urlPayload: 'https://',
    emailPayload: { address: '', subject: '', body: '' },
    phonePayload: '',
    wifiPayload: { ssid: '', password: '', encryption: 'WPA', hidden: false },
    vcardPayload: { name: '', phone: '', email: '', org: '', title: '' }
  };

  previewQrDataUrl: string = '';
  isGenerating = false;
  generatorDocTitle: string = 'My QR Code';

  async ngOnInit() {
    // Check if handed off from document scanner or another tool
    const target = this.bridgeService.getQrTarget();
    if (target?.file) {
      if (target.file.type === 'application/pdf' || target.file.name.endsWith('.pdf')) {
        this.scanSource = 'pdf';
        this.onPdfSelected(target.file);
      } else {
        this.scanSource = 'image';
        this.onImageSelected(target.file);
      }
    }

    await this.updateQrPreview();
  }

  // =========================================================================
  // TAB SWITCHING
  // =========================================================================
  setTab(tab: QrToolkitTab) {
    this.activeTab = tab;
    if (tab === 'generate' && !this.previewQrDataUrl) {
      this.updateQrPreview();
    }
  }

  // =========================================================================
  // SCAN: INPUT HANDLERS
  // =========================================================================
  setScanSource(source: ScanInputSource) {
    this.scanSource = source;
  }

  async scanFromCamera() {
    try {
      this.isScanning = true;
      this.scanProgressMsg = 'Opening camera...';
      this.cdr.markForCheck();

      const image = await Camera.getPhoto({
        quality: 92,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera
      });

      if (image.webPath) {
        this.scanProgressMsg = 'Decoding barcode from camera photo...';
        this.cdr.markForCheck();

        const response = await fetch(image.webPath);
        const blob = await response.blob();
        await this.processImageBlobForScan(blob, 'camera_capture.jpg');
      }
    } catch (err: any) {
      if (!err?.message?.includes('cancelled')) {
        this.toastService.warning('Camera capture cancelled or unavailable');
      }
    } finally {
      this.isScanning = false;
      this.cdr.markForCheck();
    }
  }

  async onImageSelected(file: File) {
    this.selectedImageFile = file;
    await this.processImageBlobForScan(file, file.name);
  }

  async onPdfSelected(file: File) {
    this.selectedPdfFile = file;
    this.isScanning = true;
    this.scanProgressPct = 10;
    this.scanProgressMsg = 'Analyzing PDF document...';
    this.cdr.markForCheck();

    try {
      // Quick inspect for page count
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await (window as any).pdfjsLib?.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) }).promise;
      this.pdfTotalPages = pdf ? pdf.numPages : 1;
      this.pdfSelectedPage = 1;

      // Start scan
      await this.runPdfScan();
    } catch (err) {
      console.error('Error reading PDF for barcode scan', err);
      this.toastService.error('Failed to read PDF document');
    } finally {
      this.isScanning = false;
      this.cdr.markForCheck();
    }
  }

  async runPdfScan() {
    if (!this.selectedPdfFile) return;

    this.isScanning = true;
    this.scanProgressPct = 0;
    this.scanProgressMsg = 'Scanning PDF pages for codes...';
    this.scanResults = [];
    this.cdr.markForCheck();

    try {
      const pagesToScan = this.pdfScanAllPages
        ? undefined
        : [this.pdfSelectedPage];

      const results = await this.qrService.decodeFromPdfAllPages(
        this.selectedPdfFile,
        pagesToScan,
        (pct, msg) => {
          this.scanProgressPct = pct;
          this.scanProgressMsg = msg;
          this.cdr.markForCheck();
        }
      );

      this.scanResults = results;
      this.selectedResultIds = new Set(results.map(r => r.id));

      if (results.length > 0) {
        this.toastService.success(`Found ${results.length} code(s) in PDF`);
        this.recordScanHistory(this.selectedPdfFile.name, results.length);
        this.analyticsService.logEvent('qr_scanned', { count: results.length, source: 'pdf' });
      } else {
        this.toastService.warning('No QR codes or barcodes detected in selected pages');
      }
    } catch (err) {
      console.error('Error during PDF scan', err);
      this.toastService.error('Error scanning PDF for barcodes');
    } finally {
      this.isScanning = false;
      this.cdr.markForCheck();
    }
  }

  private async processImageBlobForScan(blob: Blob, fileName: string) {
    this.isScanning = true;
    this.scanProgressMsg = 'Scanning image for QR and barcodes...';
    this.scanResults = [];
    this.cdr.markForCheck();

    try {
      const results = await this.qrService.decodeFromImage(blob);
      this.scanResults = results;
      this.selectedResultIds = new Set(results.map(r => r.id));

      if (results.length > 0) {
        this.toastService.success(`Detected ${results.length} code(s)`);
        this.recordScanHistory(fileName, results.length);
        this.analyticsService.logEvent('qr_scanned', { count: results.length, source: 'image' });
      } else {
        this.toastService.warning('No QR code or barcode found in image');
      }
    } catch (err) {
      console.error('Error scanning image', err);
      this.toastService.error('Error decoding barcodes from image');
    } finally {
      this.isScanning = false;
      this.cdr.markForCheck();
    }
  }

  // =========================================================================
  // SCAN: RESULT ACTIONS & URL SAFETY
  // =========================================================================
  toggleSelectResult(id: string) {
    if (this.selectedResultIds.has(id)) {
      this.selectedResultIds.delete(id);
    } else {
      this.selectedResultIds.add(id);
    }
  }

  toggleSelectAll() {
    if (this.selectedResultIds.size === this.scanResults.length) {
      this.selectedResultIds.clear();
    } else {
      this.selectedResultIds = new Set(this.scanResults.map(r => r.id));
    }
  }

  async copyContent(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      this.toastService.success('Content copied to clipboard');
    } catch {
      this.toastService.error('Could not copy content');
    }
  }

  async shareResult(result: BarcodeScanResult) {
    await this.shareService.share({
      title: `${result.format} Decoded Content`,
      text: result.rawContent
    });
  }

  openSafeUrlPrompt(url: string) {
    this.pendingUrl = url;
    this.pendingUrlDomain = this.qrService.extractDomain(url);
  }

  cancelSafeUrl() {
    this.pendingUrl = null;
    this.pendingUrlDomain = '';
  }

  confirmOpenUrl() {
    if (this.pendingUrl) {
      window.open(this.pendingUrl, '_blank', 'noopener,noreferrer');
      this.cancelSafeUrl();
    }
  }

  exportReport(format: BarcodeReportFormat) {
    const selected = this.scanResults.filter(r => this.selectedResultIds.has(r.id));
    const targetResults = selected.length > 0 ? selected : this.scanResults;

    if (targetResults.length === 0) {
      this.toastService.warning('No scan results to export');
      return;
    }

    const blob = this.qrService.exportReport(targetResults, format);
    const ext = format === 'csv' ? 'csv' : format === 'json' ? 'json' : 'txt';
    this.fileService.downloadBlob(blob, `barcode_scan_report_${Date.now()}.${ext}`);
    this.toastService.success(`Exported ${format.toUpperCase()} report`);
  }

  resetScan() {
    this.selectedImageFile = undefined;
    this.selectedPdfFile = undefined;
    this.scanResults = [];
    this.selectedResultIds.clear();
  }

  // =========================================================================
  // GENERATOR ACTIONS
  // =========================================================================
  setContentType(type: QrContentType) {
    this.generatorOptions.contentType = type;
    this.updateQrPreview();
  }

  async updateQrPreview() {
    this.isGenerating = true;
    try {
      this.previewQrDataUrl = await this.qrService.generateQrDataUrl(this.generatorOptions);
    } catch (err) {
      console.warn('Error generating preview QR', err);
    } finally {
      this.isGenerating = false;
      this.cdr.markForCheck();
    }
  }

  async downloadPng() {
    try {
      const dataUrl = await this.qrService.generateQrDataUrl(this.generatorOptions);
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      this.fileService.downloadBlob(blob, `qrcode_${Date.now()}.png`);
      this.recordGenerateHistory('PNG');
      this.toastService.success('QR Code PNG downloaded');
      this.analyticsService.logEvent('qr_generated', { format: 'png', type: this.generatorOptions.contentType });
    } catch (err) {
      this.toastService.error('Failed to download PNG');
    }
  }

  async downloadSvg() {
    try {
      const svgStr = await this.qrService.generateQrSvg(this.generatorOptions);
      const blob = new Blob([svgStr], { type: 'image/svg+xml' });
      this.fileService.downloadBlob(blob, `qrcode_${Date.now()}.svg`);
      this.recordGenerateHistory('SVG');
      this.toastService.success('QR Code SVG downloaded');
      this.analyticsService.logEvent('qr_generated', { format: 'svg', type: this.generatorOptions.contentType });
    } catch (err) {
      this.toastService.error('Failed to download SVG');
    }
  }

  async downloadPdf() {
    try {
      const blob = await this.qrService.generateQrPdf(this.generatorOptions, this.generatorDocTitle);
      this.fileService.downloadBlob(blob, `qrcode_document_${Date.now()}.pdf`);
      this.recordGenerateHistory('PDF');
      this.toastService.success('QR Document PDF downloaded');
      this.analyticsService.logEvent('qr_generated', { format: 'pdf', type: this.generatorOptions.contentType });
    } catch (err) {
      this.toastService.error('Failed to generate PDF document');
    }
  }

  async shareQr() {
    try {
      const dataUrl = await this.qrService.generateQrDataUrl(this.generatorOptions);
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], 'qrcode.png', { type: 'image/png' });
      await this.shareService.shareFile(file, 'Generated QR Code');
    } catch {
      await this.shareService.share({
        title: 'QR Code Content',
        text: this.qrService.formatPayload(this.generatorOptions)
      });
    }
  }

  private async recordScanHistory(fileName: string, count: number) {
    try {
      await this.historyService.addHistoryItem({
        operation: 'qr-scan',
        originalFileName: fileName,
        outputFileName: `Scan Result (${count} codes)`,
        originalSizeBytes: 0,
        outputSizeBytes: 0
      });
    } catch {
      // ignore
    }
  }

  private async recordGenerateHistory(format: string) {
    try {
      await this.historyService.addHistoryItem({
        operation: 'qr-generate',
        originalFileName: `QR ${this.generatorOptions.contentType}`,
        outputFileName: `qrcode.${format.toLowerCase()}`,
        originalSizeBytes: 0,
        outputSizeBytes: 0
      });
    } catch {
      // ignore
    }
  }
}
