import {
  Component,
  OnInit,
  AfterViewInit,
  ElementRef,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

import { PdfSignatureAppearanceService } from '../../core/services/pdf-signature-appearance.service';
import {
  SignatureAppearanceTemplate,
  SignatureAppearanceOptions,
  SignatureLayoutPreset,
  TypedSignatureFont,
  SignatureInkColor,
  StampRenderResult
} from '../../core/models/signature-appearance.types';
import {
  AppButtonComponent,
  AppBadgeComponent,
  AppIconComponent,
  TranslatePipe
} from '../../shared/components/ui';

export type SignatureStudioTab = 'draw' | 'type' | 'upload' | 'templates';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-sign-templates',
  templateUrl: './sign-templates.page.html',
  styleUrls: ['./sign-templates.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AppButtonComponent,
    AppBadgeComponent,
    AppIconComponent,
    TranslatePipe
  ]
})
export class SignTemplatesPage implements OnInit, AfterViewInit {
  private appearanceService = inject(PdfSignatureAppearanceService);
  private toastCtrl = inject(ToastController);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('drawCanvas') drawCanvasRef?: ElementRef<HTMLCanvasElement>;

  // Studio Mode Tabs
  activeTab: SignatureStudioTab = 'type';

  // Fonts & Colors
  readonly fonts: TypedSignatureFont[] = [
    'Caveat',
    'Dancing Script',
    'Alex Brush',
    'Great Vibes',
    'Sacramento'
  ];

  readonly inkColors: Array<{ code: SignatureInkColor; labelKey: string }> = [
    { code: '#000000', labelKey: 'signTemplates.colorBlack' },
    { code: '#1e3a8a', labelKey: 'signTemplates.colorDarkBlue' },
    { code: '#0a2540', labelKey: 'signTemplates.colorRoyalNavy' },
    { code: '#881337', labelKey: 'signTemplates.colorDarkRed' },
    { code: '#14532d', labelKey: 'signTemplates.colorDarkGreen' }
  ];

  // Active Template / Customizer State
  currentTemplate: SignatureAppearanceTemplate = this.appearanceService.getDefaultTemplate();
  savedTemplates: SignatureAppearanceTemplate[] = [];

  // Type Tab State
  fontPreviews: Record<TypedSignatureFont, string> = {
    'Caveat': '',
    'Dancing Script': '',
    'Alex Brush': '',
    'Great Vibes': '',
    'Sacramento': ''
  };

  // Drawing Pad State
  private isDrawing = false;
  private drawCtx: CanvasRenderingContext2D | null = null;
  drawnSignatureDataUrl: string | null = null;

  // Upload Tab State
  uploadedSignatureDataUrl: string | null = null;
  uploadedLogoDataUrl: string | null = null;
  isProcessingUpload = false;

  // Live Composite Stamp Preview
  liveStampResult: StampRenderResult | null = null;
  isRenderingStamp = false;

  async ngOnInit(): Promise<void> {
    await this.appearanceService.ensureFontsLoaded();
    await this.loadSavedTemplates();
    this.updateFontPreviews();
    await this.refreshLiveStamp();
  }

  ngAfterViewInit(): void {
    if (this.activeTab === 'draw') {
      this.initDrawCanvas();
    }
  }

  // ==========================================
  // Tab Switching & Studio Navigation
  // ==========================================

  setTab(tab: SignatureStudioTab): void {
    this.activeTab = tab;
    if (tab === 'draw') {
      setTimeout(() => this.initDrawCanvas(), 50);
      this.currentTemplate.signatureSource = 'draw';
    } else if (tab === 'type') {
      this.currentTemplate.signatureSource = 'type';
      this.updateFontPreviews();
    } else if (tab === 'upload') {
      this.currentTemplate.signatureSource = 'upload';
    }
    this.refreshLiveStamp();
    this.cdr.markForCheck();
  }

  // ==========================================
  // Type Tab Logic
  // ==========================================

  onSignerNameChange(): void {
    this.updateFontPreviews();
    this.refreshLiveStamp();
  }

  selectFont(font: TypedSignatureFont): void {
    this.currentTemplate.typedFont = font;
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    this.refreshLiveStamp();
  }

  selectInkColor(color: SignatureInkColor): void {
    this.currentTemplate.inkColor = color;
    if (this.drawCtx) {
      this.drawCtx.strokeStyle = color;
    }
    this.updateFontPreviews();
    this.refreshLiveStamp();
  }

  updateFontPreviews(): void {
    const name = this.currentTemplate.signer.fullName || 'Signer';
    const color = this.currentTemplate.inkColor || '#1e3a8a';
    for (const font of this.fonts) {
      this.fontPreviews[font] = this.appearanceService.renderTypedSignature(name, font, color, 1.5);
    }
    this.cdr.markForCheck();
  }

  // ==========================================
  // Draw Tab Logic
  // ==========================================

  private initDrawCanvas(): void {
    if (!this.drawCanvasRef?.nativeElement) return;
    const canvas = this.drawCanvasRef.nativeElement;
    canvas.width = canvas.offsetWidth || 340;
    canvas.height = 180;

    this.drawCtx = canvas.getContext('2d');
    if (this.drawCtx) {
      this.drawCtx.lineCap = 'round';
      this.drawCtx.lineJoin = 'round';
      this.drawCtx.strokeStyle = this.currentTemplate.inkColor || '#000000';
      this.drawCtx.lineWidth = 3;
    }
  }

  startDrawing(event: MouseEvent | TouchEvent): void {
    event.preventDefault();
    if (!this.drawCtx || !this.drawCanvasRef?.nativeElement) return;

    this.isDrawing = true;
    const coords = this.getCanvasCoords(event);
    this.drawCtx.beginPath();
    this.drawCtx.moveTo(coords.x, coords.y);
  }

  draw(event: MouseEvent | TouchEvent): void {
    if (!this.isDrawing || !this.drawCtx) return;
    event.preventDefault();

    const coords = this.getCanvasCoords(event);
    this.drawCtx.lineTo(coords.x, coords.y);
    this.drawCtx.stroke();
  }

  stopDrawing(): void {
    if (!this.isDrawing || !this.drawCanvasRef?.nativeElement) return;
    this.isDrawing = false;
    this.drawnSignatureDataUrl = this.drawCanvasRef.nativeElement.toDataURL('image/png');
    this.currentTemplate.signatureImage = this.drawnSignatureDataUrl;
    this.currentTemplate.signatureSource = 'draw';
    this.refreshLiveStamp();
  }

  clearDrawing(): void {
    if (!this.drawCtx || !this.drawCanvasRef?.nativeElement) return;
    const canvas = this.drawCanvasRef.nativeElement;
    this.drawCtx.clearRect(0, 0, canvas.width, canvas.height);
    this.drawnSignatureDataUrl = null;
    this.currentTemplate.signatureImage = undefined;
    this.refreshLiveStamp();
  }

  private getCanvasCoords(event: MouseEvent | TouchEvent): { x: number; y: number } {
    const canvas = this.drawCanvasRef!.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;

    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  // ==========================================
  // Upload Tab Logic
  // ==========================================

  triggerUploadInput(inputEl: HTMLInputElement): void {
    inputEl.click();
  }

  async onSignatureUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.isProcessingUpload = true;
      this.cdr.markForCheck();

      try {
        const validatedFile = await this.appearanceService.validateImageFile(input.files[0], {
          maxSizeBytes: 5 * 1024 * 1024,
          maxWidth: 4096,
          maxHeight: 4096,
          allowedMimes: ['image/png', 'image/jpeg', 'image/jpg']
        });
        const transparentDataUrl = await this.appearanceService.prepareSignatureFromUpload(
          validatedFile,
          { autoCrop: true, transparentBg: true }
        );
        this.uploadedSignatureDataUrl = transparentDataUrl;
        this.currentTemplate.signatureImage = transparentDataUrl;
        this.currentTemplate.signatureSource = 'upload';
        await this.refreshLiveStamp();
        await Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      } catch (err: any) {
        console.error('Error preparing signature from upload:', err);
        await this.showToast(err?.message || 'Failed to process uploaded signature', 'danger');
      } finally {
        this.isProcessingUpload = false;
        this.cdr.markForCheck();
      }
    }
    input.value = '';
  }

  async onLogoUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      try {
        const dataUrl = await this.appearanceService.validateAndProcessLogo(input.files[0]);
        this.uploadedLogoDataUrl = dataUrl;
        this.currentTemplate.logoDataUrl = dataUrl;
        this.currentTemplate.includeLogo = true;
        await this.refreshLiveStamp();
        await Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
        await this.showToast('Organization logo uploaded successfully', 'success');
      } catch (err: any) {
        console.error('Error uploading logo:', err);
        await this.showToast(err?.message || 'Invalid logo image file', 'danger');
      }
    }
    input.value = '';
  }

  // ==========================================
  // Layout & Metadata Configuration
  // ==========================================

  setLayoutPreset(preset: SignatureLayoutPreset): void {
    this.currentTemplate.layoutPreset = preset;
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    this.refreshLiveStamp();
  }

  setReasonPreset(reason: string): void {
    this.currentTemplate.metadata.reason = reason;
    this.currentTemplate.metadata.includeReason = true;
    this.refreshLiveStamp();
  }

  async refreshLiveStamp(): Promise<void> {
    this.isRenderingStamp = true;
    this.cdr.markForCheck();

    try {
      this.liveStampResult = await this.appearanceService.renderCompositeStamp(this.currentTemplate);
    } catch (err) {
      console.error('Error rendering live stamp:', err);
    } finally {
      this.isRenderingStamp = false;
      this.cdr.markForCheck();
    }
  }

  // ==========================================
  // Template Persistence & Application
  // ==========================================

  async loadSavedTemplates(): Promise<void> {
    this.savedTemplates = await this.appearanceService.getTemplates();
    this.cdr.markForCheck();
  }

  applyTemplate(template: SignatureAppearanceTemplate): void {
    this.currentTemplate = {
      ...template,
      signer: { ...template.signer },
      metadata: { ...template.metadata }
    };
    if (this.currentTemplate.signatureSource) {
      this.activeTab = this.currentTemplate.signatureSource;
    }
    this.updateFontPreviews();
    this.refreshLiveStamp();
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  }

  async saveCurrentTemplate(): Promise<void> {
    try {
      if (!this.currentTemplate.name) {
        this.currentTemplate.name = `${this.currentTemplate.signer.fullName || 'Signature'} (${this.currentTemplate.layoutPreset})`;
      }
      this.currentTemplate.id = this.currentTemplate.id || `tmpl-${Date.now()}`;

      await this.appearanceService.saveTemplate(this.currentTemplate);
      await this.loadSavedTemplates();
      await Haptics.notification({ type: NotificationType.Success }).catch(() => {});
      await this.showToast('Signature template saved', 'success');
    } catch (err) {
      console.error('Error saving template:', err);
      await this.showToast('Failed to save template', 'danger');
    }
  }

  async deleteTemplate(templateId: string, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await this.appearanceService.deleteTemplate(templateId);
      await this.loadSavedTemplates();
      await this.showToast('Template removed', 'success');
    } catch (err) {
      console.error('Error deleting template:', err);
    }
  }

  useSignatureOnPdf(): void {
    if (this.liveStampResult?.dataUrl) {
      // Cache signature data URL in PdfSignService
      this.appearanceService.cacheSignature(this.liveStampResult.dataUrl);
      this.router.navigate(['/features/pdf/sign']);
    }
  }

  private async showToast(message: string, color: 'success' | 'warning' | 'danger'): Promise<void> {
    try {
      const toast = await this.toastCtrl.create({
        message,
        duration: 2500,
        position: 'bottom',
        color
      });
      await toast.present();
    } catch {
      // Mock / fallback
    }
  }
}
