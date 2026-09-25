import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { AppButtonComponent } from '../ui/button/button.component';
import { AppBadgeComponent } from '../ui/badge/badge.component';
import { AppModalComponent } from '../ui/modal/modal.component';
import { BeforeAfterPreviewComponent } from '../before-after-preview/before-after-preview.component';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { ShareService } from '../../../core/services/share.service';

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

  /*
   * One name per event.
   *
   * There used to be two of each — `onSave`/`saved`, `onShare`/`shared` and
   * `onChangeSettings`/`reset` — with every action emitting both halves. Five
   * templates bound one set and one template bound the other, and nothing
   * said which was current, so a new caller had an even chance of binding the
   * pair that would eventually be deleted.
   *
   * The surviving names avoid both traps the old ones fell into: no `on`
   * prefix (Angular supplies that at the binding site), and nothing that
   * shadows a native DOM event — `reset` is a real event, so `(reset)` on this
   * component read as though it might be one.
   */
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

  handleSave(): void {
    this.saved.emit();
  }

  handleShare(): void {
    this.openShareModal();
  }

  openShareModal(): void {
    const filename = this.outputFilename || this.afterData?.name || 'document';
    const title = `Share ${filename}`;
    const text = `Document prepared with Indian Form Helper: ${filename}`;
    const pageUrl = typeof window !== 'undefined' ? window.location.href : 'https://indianformhelper.com';

    this.shareUrls = this.shareService.getSocialShareUrls({
      title,
      text,
      url: pageUrl
    });

    this.isShareModalOpen = true;
    this.shared.emit();
  }

  closeShareModal(): void {
    this.isShareModalOpen = false;
  }

  shareNative(): void {
    if (typeof navigator !== 'undefined' && navigator.share) {
      const shareData: any = {
        title: this.outputFilename || this.afterData?.name || 'Processed File',
        text: `Prepared with Indian Form Helper: ${this.outputFilename || this.afterData?.name || ''}`,
        url: window.location.href
      };
      if (this.file && (navigator as any).canShare && (navigator as any).canShare({ files: [this.file] })) {
        shareData.files = [this.file];
      }
      navigator.share(shareData).catch((err) => {
        if (err.name !== 'AbortError') console.warn('Native share error', err);
      });
    }
  }

  async copyShareLink(): Promise<void> {
    const text = `Prepared with Indian Form Helper: ${this.outputFilename || this.afterData?.name || 'Document'} - ${window.location.href}`;
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
    return typeof navigator !== 'undefined' && !!navigator.share;
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

