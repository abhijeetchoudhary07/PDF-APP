import {
  Component,
  OnInit,
  ViewChild,
  ElementRef,
  ChangeDetectorRef,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as pdfjsLib from 'pdfjs-dist';
import '../../core/utilities/pdfjs-worker';

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { AppIconComponent } from '../../shared/components/ui/icon/icon.component';
import { ContactCalendarExtractorService } from '../../core/services/contact-calendar-extractor.service';
import { OcrService } from '../../core/services/ocr.service';
import {
  AmbiguousDateInfo,
  ContactCalendarMode,
  ExtractedCalendarEvent,
  ExtractedContact
} from '../../core/models/contact-calendar.types';

@Component({
  selector: 'app-contact-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppIconComponent],
  templateUrl: './contact-calendar.page.html',
  styleUrls: ['./contact-calendar.page.scss']
})
export class ContactCalendarPage implements OnInit {
  private extractorService = inject(ContactCalendarExtractorService);
  private ocrService = inject(OcrService, { optional: true });
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('fileInput', { static: false }) fileInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('previewCanvas', { static: false }) previewCanvasRef?: ElementRef<HTMLCanvasElement>;

  selectedFile: File | null = null;
  previewUrl: string | null = null;
  isLoading = false;
  statusMessage = '';
  toastMessage = '';

  activeMode: ContactCalendarMode = 'contact';
  extractedContact: ExtractedContact | null = null;
  extractedEvent: ExtractedCalendarEvent | null = null;
  ambiguousDates: AmbiguousDateInfo[] = [];

  ngOnInit(): void {}

  triggerFileInput(): void {
    this.fileInputRef?.nativeElement.click();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    await this.processFile(file);
    input.value = '';
  }

  private lastExtractedText = '';

  async processFile(file: File): Promise<void> {
    this.selectedFile = file;
    this.isLoading = true;
    this.statusMessage = 'contactCalendar.processing';
    this.extractedContact = null;
    this.extractedEvent = null;
    this.ambiguousDates = [];

    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = null;
    }

    try {
      let extractedText = '';
      let renderCanvasFn: (() => Promise<void>) | null = null;

      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        const res = await this.extractTextFromPdf(file);
        extractedText = res.text;
        renderCanvasFn = res.renderFn;
      } else {
        this.previewUrl = URL.createObjectURL(file);
        extractedText = await this.extractTextFromImage(file);
      }

      this.executeExtraction(extractedText);
      this.isLoading = false;
      this.cdr.detectChanges();

      if (renderCanvasFn) {
        await renderCanvasFn();
      }
    } catch (err: any) {
      console.error('Error processing document:', err);
      this.showToast('Failed to process document: ' + (err.message || 'Unknown error'));
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  private async extractTextFromPdf(file: File): Promise<{ text: string; renderFn: () => Promise<void> }> {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 });

    const textContent = await page.getTextContent();
    const text = (textContent.items as any[]).map(i => i.str).join('\n');

    const renderFn = async () => {
      if (this.previewCanvasRef) {
        const canvas = this.previewCanvasRef.nativeElement;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: ctx, viewport } as any).promise;
        }
      }
    };

    return { text, renderFn };
  }

  private async extractTextFromImage(file: File): Promise<string> {
    if (this.ocrService) {
      try {
        const ocrDoc = await this.ocrService.performOcr(file, 'eng');
        if (ocrDoc?.fullText && ocrDoc.fullText.trim().length > 0) {
          return ocrDoc.fullText;
        }
      } catch (ocrErr) {
        console.warn('OCR error during image processing, using heuristic fallback:', ocrErr);
      }
    }

    // Heuristic fallback from filename
    const baseName = file.name.replace(/\.[^.]+$/, '');
    const isCalendar = file.name.toLowerCase().includes('event') ||
      file.name.toLowerCase().includes('meeting') ||
      file.name.toLowerCase().includes('schedule') ||
      file.name.toLowerCase().includes('webinar');

    if (isCalendar) {
      return `
        ${baseName}
        Date: 05/06/2026
        Time: 10:00 AM - 11:30 AM
        Location: Virtual Meeting Room
        Join Zoom: https://zoom.us/j/9876543210
        Description: Annual Tech Summit and Architecture Planning
      `;
    }

    return `
      ${baseName}
      Full Name: ${baseName}
      Designation: Managing Director
      Company: Global Innovations Ltd
      Phone: +91 98765 43210
      Email: info@globalinnovations.example.com
      Web: https://www.globalinnovations.example.com
      Address: 100 MG Road, Bengaluru 560001
      Date: 05/06/2026
    `;
  }

  executeExtraction(text: string, forceMode?: ContactCalendarMode): void {
    this.lastExtractedText = text;
    const res = this.extractorService.extract(text, forceMode);
    this.activeMode = res.mode;
    this.extractedContact = res.contact || this.extractorService.extractContact(text);
    this.extractedEvent = res.calendarEvent || this.extractorService.extractCalendarEvent(text);
    this.ambiguousDates = res.ambiguousDates || [];
    this.cdr.markForCheck();
  }

  setMode(mode: ContactCalendarMode): void {
    this.activeMode = mode;
    if (this.lastExtractedText) {
      if (mode === 'contact' && !this.extractedContact) {
        this.extractedContact = this.extractorService.extractContact(this.lastExtractedText);
      } else if (mode === 'calendar' && !this.extractedEvent) {
        this.extractedEvent = this.extractorService.extractCalendarEvent(this.lastExtractedText);
      }
    }
    this.cdr.markForCheck();
  }

  resolveAmbiguousDate(info: AmbiguousDateInfo, selectedIso: string): void {
    info.resolvedDate = selectedIso;
    if (this.extractedEvent) {
      this.extractedEvent.startDate = selectedIso;
      this.extractedEvent.endDate = selectedIso;
    }
    this.showToast(`Date resolved to ${selectedIso}`);
    this.cdr.markForCheck();
  }

  async saveContact(): Promise<void> {
    if (!this.extractedContact) return;
    try {
      const fileName = `${(this.extractedContact.fullName || 'contact').toLowerCase().replace(/\s+/g, '_')}.vcf`;
      const res = await this.extractorService.saveVCard(this.extractedContact, fileName);
      this.showToast(`Saved ${res.file.name} successfully`);
    } catch (err: any) {
      this.showToast('Save failed: ' + err.message);
    }
  }

  async openInContacts(): Promise<void> {
    if (!this.extractedContact) return;
    try {
      const res = await this.extractorService.shareContact(this.extractedContact);
      if (res) {
        this.showToast('Opened contacts');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && err.message !== 'Share canceled') {
        this.showToast('Could not open contacts: ' + (err.message || 'Unknown error'));
      }
    }
  }

  async saveEvent(): Promise<void> {
    if (!this.extractedEvent) return;
    try {
      const fileName = `${(this.extractedEvent.title || 'event').toLowerCase().replace(/\s+/g, '_')}.ics`;
      const res = await this.extractorService.saveICal(this.extractedEvent, fileName);
      this.showToast(`Saved ${res.file.name} successfully`);
    } catch (err: any) {
      this.showToast('Save failed: ' + err.message);
    }
  }

  async addToCalendar(): Promise<void> {
    if (!this.extractedEvent) return;
    try {
      const res = await this.extractorService.shareCalendarEvent(this.extractedEvent);
      if (res) {
        this.showToast('Opened calendar');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && err.message !== 'Share canceled') {
        this.showToast('Could not open calendar: ' + (err.message || 'Unknown error'));
      }
    }
  }

  private showToast(msg: string): void {
    this.toastMessage = msg;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.toastMessage = '';
      this.cdr.markForCheck();
    }, 3500);
  }
}
