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
import { ReadabilityAnalysisService } from '../../core/services/readability-analysis.service';
import { ShareService } from '../../core/services/share.service';
import { ReadabilityReport } from '../../core/models/readability.types';

@Component({
  selector: 'app-readability',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppIconComponent],
  templateUrl: './readability.page.html',
  styleUrls: ['./readability.page.scss']
})
export class ReadabilityPage implements OnInit {
  private readabilityService = inject(ReadabilityAnalysisService);
  private shareService = inject(ShareService);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('fileInput', { static: false }) fileInputRef?: ElementRef<HTMLInputElement>;

  selectedFile: File | null = null;
  isLoading = false;
  statusMessage = 'readability.analyzing';
  toastMessage = '';

  report: ReadabilityReport | null = null;
  selectedSectionIndex = 0;
  expandedFormulaIndex: number | null = null;

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

  async processFile(file: File): Promise<void> {
    this.selectedFile = file;
    this.isLoading = true;
    this.statusMessage = 'readability.analyzing';
    this.cdr.markForCheck();

    try {
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        await this.processPdf(file);
      } else {
        const text = await file.text();
        this.report = this.readabilityService.analyze(text, undefined, file.name);
      }
    } catch (err: any) {
      console.error('Readability analysis error:', err);
      this.showToast('Failed to analyze document: ' + (err.message || 'Unknown error'));
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  private async processPdf(file: File): Promise<void> {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdfDoc.numPages;

    const pageSections: { id: string; title: string; text: string; pageNumber: number }[] = [];
    const fullTextParts: string[] = [];

    for (let p = 1; p <= numPages; p++) {
      const page = await pdfDoc.getPage(p);
      const textContent = await page.getTextContent();
      const pageText = (textContent.items as any[])
        .map(i => i.str || '')
        .filter(s => s.trim().length > 0)
        .join(' ');

      if (pageText.trim().length > 0) {
        fullTextParts.push(pageText);
        pageSections.push({
          id: `page-${p}`,
          title: `Page ${p}`,
          text: pageText,
          pageNumber: p
        });
      }
    }

    const fullText = fullTextParts.join('\n\n');
    this.report = this.readabilityService.analyze(fullText, pageSections, file.name);
  }

  loadSampleDocument(): void {
    const sampleText = `
# Executive Summary
The rapid evolution of digital document formats has transformed office productivity.
Users now require completely private, offline-first utilities to manage, analyze, and convert their files.

# Performance & Complexity Architecture
Algorithmic readability scoring models evaluate syntactic structures and vocabulary density.
By measuring average sentence length and syllable distributions, systems can classify texts into plain-language bands.
This enables content creators to tailor their writing for general audiences or technical specialists.

# Practical Recommendations
Keep sentences concise and avoid excessive passive voice.
Ensure key points are highlighted early so readers can comprehend critical information quickly.
    `;

    this.selectedFile = new File([sampleText], 'sample-document.md', { type: 'text/markdown' });
    this.report = this.readabilityService.analyze(sampleText, undefined, 'sample-document.md');
    this.cdr.markForCheck();
  }

  toggleFormula(index: number): void {
    this.expandedFormulaIndex = this.expandedFormulaIndex === index ? null : index;
    this.cdr.markForCheck();
  }

  async shareReport(): Promise<void> {
    if (!this.report) return;

    const formattedText = this.readabilityService.formatReportText(this.report);
    const title = `Readability Analysis — ${this.report.fileName || 'Document'}`;

    try {
      const shared = await this.shareService.share({
        title,
        text: formattedText
      });

      if (shared) {
        this.showToast('readability.shareSuccess');
      } else {
        await this.copyToClipboard(formattedText);
        this.showToast('readability.copySuccess');
      }
    } catch {
      await this.copyToClipboard(formattedText);
      this.showToast('readability.copySuccess');
    }
  }

  private async copyToClipboard(text: string): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch {
      // fallback
    }
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    } catch {
      // ignore
    }
  }

  getReadingEasePercent(score: number): number {
    if (isNaN(score)) return 0;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  getGradeLevelPercent(grade: number): number {
    if (isNaN(grade)) return 0;
    // Grade scale 1 to 16
    return Math.max(5, Math.min(100, Math.round((grade / 16) * 100)));
  }

  getWordCountPercent(words: number): number {
    if (isNaN(words)) return 0;
    // Normalizing up to 2000 words
    return Math.max(5, Math.min(100, Math.round((words / 2000) * 100)));
  }

  private showToast(msgKeyOrText: string): void {
    this.toastMessage = msgKeyOrText;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.toastMessage = '';
      this.cdr.markForCheck();
    }, 3500);
  }
}
