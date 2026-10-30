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

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TranslationService } from '../../core/services/translation.service';
import { AppIconComponent } from '../../shared/components/ui/icon/icon.component';
import { MultiDocumentQaService } from '../../core/services/multi-document-qa.service';
import {
  MultiDocChatMessage,
  MultiDocCitation,
  MultiDocIndexedDocument,
  MultiDocQaAnswer
} from '../../core/models/pdf-intelligence.types';

@Component({
  selector: 'app-multi-doc-qa',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AppIconComponent],
  templateUrl: './multi-doc-qa.page.html',
  styleUrls: ['./multi-doc-qa.page.scss']
})
export class MultiDocQaPage implements OnInit, OnDestroy {
  qaService = inject(MultiDocumentQaService);
  private translationService = inject(TranslationService);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('messagesContainer') messagesContainerRef?: ElementRef<HTMLDivElement>;
  @ViewChild('pdfFileInput') pdfFileInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('questionInput') questionInputRef?: ElementRef<HTMLInputElement>;

  loadedDocs: MultiDocIndexedDocument[] = [];
  messages: MultiDocChatMessage[] = [];
  currentQuestion = '';
  isSearching = false;
  isIngesting = false;
  activeCitationPreview: MultiDocCitation | null = null;
  toastMessage: string | null = null;
  private toastTimeout: any = null;

  ngOnInit(): void {
    this.refreshLoadedDocs();
  }

  ngOnDestroy(): void {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
  }

  refreshLoadedDocs(): void {
    this.loadedDocs = this.qaService.getLoadedDocuments();
    this.cdr.markForCheck();
  }

  get activeDocsCount(): number {
    return this.loadedDocs.filter(d => d.enabled).length;
  }

  // =========================================================================
  // DOCUMENT SCOPE & MANAGEMENT
  // =========================================================================

  triggerPdfUpload(): void {
    this.pdfFileInputRef?.nativeElement.click();
  }

  async onPdfFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const files = Array.from(input.files);
    this.isIngesting = true;
    this.cdr.markForCheck();

    try {
      for (const file of files) {
        if (this.loadedDocs.length >= this.qaService.MAX_DOCUMENTS) {
          this.showToast('multiDocQa.docLimitReached');
          break;
        }
        await this.qaService.ingestPdfFile(file);
      }
      this.refreshLoadedDocs();
    } catch (err: any) {
      this.showToast(err?.message || 'Error loading PDF document');
    } finally {
      this.isIngesting = false;
      input.value = '';
      this.cdr.markForCheck();
    }
  }

  toggleDoc(docId: string, event?: Event): void {
    if (event) event.stopPropagation();
    this.qaService.toggleDocument(docId);
    this.refreshLoadedDocs();
  }

  removeDoc(docId: string, event?: Event): void {
    if (event) event.stopPropagation();
    this.qaService.removeDocument(docId);
    this.refreshLoadedDocs();
  }

  // =========================================================================
  // CHAT STREAM & Q&A
  // =========================================================================

  async askQuestion(questionText?: string): Promise<void> {
    const query = (questionText !== undefined ? questionText : this.currentQuestion).trim();
    if (!query || this.isSearching) return;

    if (this.activeDocsCount === 0) {
      this.showToast('Please enable at least 1 document in the scope');
      return;
    }

    // Add user message
    const userMsg: MultiDocChatMessage = {
      id: `msg_u_${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: Date.now()
    };
    this.messages.push(userMsg);
    this.currentQuestion = '';
    this.isSearching = true;
    this.scrollToBottom();
    this.cdr.markForCheck();

    try {
      const answerData: MultiDocQaAnswer = await this.qaService.queryCorpus(query);
      const assistantMsg: MultiDocChatMessage = {
        id: `msg_a_${Date.now()}`,
        sender: 'assistant',
        text: answerData.answer,
        timestamp: Date.now(),
        answerData
      };
      this.messages.push(assistantMsg);
    } catch (err: any) {
      this.messages.push({
        id: `msg_err_${Date.now()}`,
        sender: 'assistant',
        text: 'An error occurred while searching the document corpus.',
        timestamp: Date.now()
      });
    } finally {
      this.isSearching = false;
      this.scrollToBottom();
      this.cdr.markForCheck();
    }
  }

  openCitationPreview(citation: MultiDocCitation): void {
    this.activeCitationPreview = citation;
    this.cdr.markForCheck();
  }

  closeCitationPreview(): void {
    this.activeCitationPreview = null;
    this.cdr.markForCheck();
  }

  clearChatHistory(): void {
    this.messages = [];
    this.cdr.markForCheck();
  }

  // =========================================================================
  // EXPORT TRANSCRIPT
  // =========================================================================

  async exportTranscriptPdf(): Promise<void> {
    if (this.messages.length === 0) return;
    try {
      const res = await this.qaService.exportTranscriptPdf(this.messages);
      this.showToast('multiDocQa.exportSuccess', { name: res.file.name });
    } catch (err: any) {
      this.showToast(err?.message || 'Export failed');
    }
  }

  async exportTranscriptTxt(): Promise<void> {
    if (this.messages.length === 0) return;
    try {
      const res = await this.qaService.exportTranscriptTxt(this.messages);
      this.showToast('multiDocQa.exportSuccess', { name: res.file.name });
    } catch (err: any) {
      this.showToast(err?.message || 'Export failed');
    }
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.messagesContainerRef?.nativeElement) {
        this.messagesContainerRef.nativeElement.scrollTop =
          this.messagesContainerRef.nativeElement.scrollHeight;
      }
    }, 60);
  }

  private showToast(messageKey: string, params?: Record<string, any>): void {
    this.toastMessage = this.translationService.translate(messageKey, params);
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toastMessage = null;
      this.cdr.markForCheck();
    }, 2800);
    this.cdr.markForCheck();
  }
}
