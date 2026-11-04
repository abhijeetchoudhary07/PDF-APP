import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ChangeDetectionStrategy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { AppButtonComponent } from '../ui/button/button.component';
import { AppBadgeComponent } from '../ui/badge/badge.component';
import { AppModalComponent } from '../ui/modal/modal.component';
import { BeforeAfterPreviewComponent } from '../before-after-preview/before-after-preview.component';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { ShareService } from '../../../core/services/share.service';
import { AdService } from '../../../core/services/ad.service';

export interface PreviewData {
  name: string;
  type: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  pages?: number;
}

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-result-preview',
  templateUrl: './result-preview.component.html',
  styleUrls: ['./result-preview.component.scss'],
  standalone: true,
  imports: [CommonModule, AppButtonComponent, AppModalComponent, BeforeAfterPreviewComponent, TranslatePipe],
  providers: [DecimalPipe]
})
export class ResultPreviewComponent implements OnInit, OnChanges {
  private shareService = inject(ShareService);
  private adService = inject(AdService, { optional: true });
  private cdr = inject(ChangeDetectorRef, { optional: true });

  @Input() beforeData?: PreviewData;
  @Input() afterData?: PreviewData;
  @Input() file?: File;
  @Input() title?: string;
  @Input() subtitle?: string;
  @Input() beforeUrl?: string;
  @Input() afterUrl?: string;
  @Input() outputFilename?: string;
  @Input() showWarning?: string; // For "Impossible Targets" warning
  @Input() showVisualComparison = true;

  @Output() saved = new EventEmitter<void>();
  @Output() shared = new EventEmitter<void>();
  @Output() resetRequested = new EventEmitter<void>();

  isShareModalOpen = false;
  copiedToast = false;
  shareUrls = {
    whatsapp: '',
    telegram: '',
    twitter: '',
    facebook: '',
    linkedin: '',
    email: ''
  };

  ngOnInit(): void {
    this.initData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.initData();
  }

  private initData(): void {
    if (this.file && !this.afterData) {
      this.afterData = {
        name: this.file.name,
        type: this.file.type || 'application/pdf',
        sizeBytes: this.file.size
      };
    }
  }

  async resolveFile(): Promise<File | undefined> {
    if (this.file) {
      return this.file;
    }
    if (this.afterUrl) {
      try {
        const res = await fetch(this.afterUrl);
        const blob = await res.blob();
        const filename = this.outputFilename || this.afterData?.name || 'document';
        const type = this.afterData?.type || blob.type || 'application/octet-stream';
        return new File([blob], filename, { type });
      } catch (e) {
        console.warn('Could not resolve file from afterUrl:', e);
      }
    }
    return undefined;
  }

  handleSave(): void {
    void this.adService?.triggerActionInterstitial();
    this.saved.emit();
  }

  async handleShare(): Promise<void> {
    void this.adService?.triggerActionInterstitial();
    const fileToShare = await this.resolveFile();
    const fileName = this.outputFilename || this.afterData?.name || fileToShare?.name || 'document';

    // 1. Try native file sharing first (Capacitor native app or modern Web Share API supporting files)
    if (fileToShare && this.shareService.canShareFiles(fileToShare)) {
      const success = await this.shareService.shareFile(fileToShare, fileName);
      if (success) {
        this.shared.emit();
      }
      return;
    }

    // 2. Fallback: if native sharing not supported on this platform, open share modal
    this.openShareModal();
  }

  openShareModal(): void {
    const filename = this.outputFilename || this.afterData?.name || 'document';
    const title = `Share ${filename}`;
    const text = `Document prepared with Indian Form Helper: ${filename}`;
    const pageUrl = 'https://indianformhelper.com';

    this.shareUrls = this.shareService.getSocialShareUrls({
      title,
      text,
      url: pageUrl
    });

    this.isShareModalOpen = true;
    this.cdr?.markForCheck();
  }

  closeShareModal(): void {
    this.isShareModalOpen = false;
    this.cdr?.markForCheck();
  }

  async shareViaWhatsApp(): Promise<void> {
    const fileToShare = await this.resolveFile();
    const fileName = this.outputFilename || this.afterData?.name || fileToShare?.name || 'document';

    if (fileToShare && this.shareService.canShareFiles(fileToShare)) {
      const shared = await this.shareService.shareFile(fileToShare, fileName);
      if (shared) {
        this.shared.emit();
        this.closeShareModal();
        return;
      }
    }

    // Fallback on desktop browsers where Web Share API cannot attach files:
    // Download the actual file and open WhatsApp Web so the user can easily attach it
    if (fileToShare) {
      this.shareService.triggerBrowserDownload(fileToShare, fileName);
    }
    this.shared.emit();
    window.open(this.shareUrls.whatsapp || 'https://web.whatsapp.com', '_blank');
    this.closeShareModal();
  }

  async shareViaTelegram(): Promise<void> {
    const fileToShare = await this.resolveFile();
    const fileName = this.outputFilename || this.afterData?.name || fileToShare?.name || 'document';

    if (fileToShare && this.shareService.canShareFiles(fileToShare)) {
      const shared = await this.shareService.shareFile(fileToShare, fileName);
      if (shared) {
        this.shared.emit();
        this.closeShareModal();
        return;
      }
    }

    if (fileToShare) {
      this.shareService.triggerBrowserDownload(fileToShare, fileName);
    }
    this.shared.emit();
    window.open(this.shareUrls.telegram || 'https://web.telegram.org', '_blank');
    this.closeShareModal();
  }

  async shareViaEmail(): Promise<void> {
    const fileToShare = await this.resolveFile();
    const fileName = this.outputFilename || this.afterData?.name || fileToShare?.name || 'document';

    if (fileToShare && this.shareService.canShareFiles(fileToShare)) {
      const shared = await this.shareService.shareFile(fileToShare, fileName);
      if (shared) {
        this.shared.emit();
        this.closeShareModal();
        return;
      }
    }

    if (fileToShare) {
      this.shareService.triggerBrowserDownload(fileToShare, fileName);
    }
    this.shared.emit();
    window.location.href = this.shareUrls.email;
    this.closeShareModal();
  }

  async shareNative(): Promise<void> {
    const fileToShare = await this.resolveFile();
    const fileName = this.outputFilename || this.afterData?.name || fileToShare?.name || 'document';
    if (fileToShare) {
      await this.shareService.shareFile(fileToShare, fileName);
    }
  }

  async copyShareLink(): Promise<void> {
    const url = typeof window !== 'undefined' && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')
      ? window.location.href
      : 'https://indianformhelper.com';
    const text = `Prepared with Indian Form Helper: ${this.outputFilename || this.afterData?.name || 'Document'} - ${url}`;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      this.copiedToast = true;
      setTimeout(() => this.copiedToast = false, 2500);
    } catch {
      this.copiedToast = true;
      setTimeout(() => this.copiedToast = false, 2500);
    }
  }

  get canNativeShare(): boolean {
    return this.shareService.canShareFiles(this.file);
  }

  handleReset(): void {
    this.resetRequested.emit();
  }

  get compressionPercentage(): number {
    if (!this.beforeData || !this.afterData) return 0;
    if (this.afterData.sizeBytes >= this.beforeData.sizeBytes) return 0;
    return ((this.beforeData.sizeBytes - this.afterData.sizeBytes) / this.beforeData.sizeBytes) * 100;
  }

  get hasVisualPreview(): boolean {
    return this.showVisualComparison && (!!this.beforeUrl || !!this.afterUrl);
  }
}
