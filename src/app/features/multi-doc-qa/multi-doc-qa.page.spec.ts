import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { resolveAngularResources } from '../../../test-setup';
import { MultiDocQaPage } from './multi-doc-qa.page';
import { MultiDocumentQaService } from '../../core/services/multi-document-qa.service';
import { TranslationService } from '../../core/services/translation.service';
import { StorageService } from '../../core/services/storage.service';
import { LocalIntelligenceProvider } from '../../core/services/local-intelligence.provider';
import { RemoteAIProvider } from '../../core/services/remote-ai.provider';
import { MultiDocIndexedDocument } from '../../core/models/pdf-intelligence.types';

describe('MultiDocQaPage — Mobile Play Store UI / UX', () => {
  let component: MultiDocQaPage;
  let fixture: ComponentFixture<MultiDocQaPage>;
  let qaService: MultiDocumentQaService;
  let mockStorageService: { saveFile: any };

  const fixtureDoc1: MultiDocIndexedDocument = {
    id: 'doc-alpha',
    fileName: 'HR_Guidelines.pdf',
    fileSize: 12000,
    pageCount: 2,
    enabled: true,
    pages: [
      {
        pageNumber: 1,
        text: 'Employee Leave Policy. Standard annual vacation is 20 days per fiscal year.'
      },
      {
        pageNumber: 2,
        text: 'Parental Leave Benefits. Primary caregivers are entitled to 16 weeks of paid parental leave.'
      }
    ]
  };

  const fixtureDoc2: MultiDocIndexedDocument = {
    id: 'doc-beta',
    fileName: 'Security_Procedures.pdf',
    fileSize: 15000,
    pageCount: 1,
    enabled: true,
    pages: [
      {
        pageNumber: 1,
        text: 'Access Control and Building Security. Badge credentials must be worn visibly at all security checkpoints.'
      }
    ]
  };

  beforeEach(async () => {
    await resolveAngularResources();

    mockStorageService = {
      saveFile: vi.fn().mockResolvedValue('indexeddb://multi-doc-qa/transcript.pdf')
    };

    await TestBed.configureTestingModule({
      imports: [MultiDocQaPage],
      providers: [
        MultiDocumentQaService,
        LocalIntelligenceProvider,
        RemoteAIProvider,
        { provide: StorageService, useValue: mockStorageService },
        {
          provide: TranslationService,
          useValue: {
            translate: vi.fn().mockImplementation((key: string, params?: any) => {
              if (params?.active !== undefined && params?.total !== undefined) {
                return `${params.active} of ${params.total} active`;
              }
              if (params?.count !== undefined) {
                return `Searched ${params.count} document(s)`;
              }
              if (params?.name !== undefined) {
                return `Exported ${params.name} successfully`;
              }
              return key;
            }),
            currentLang$: {
              subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() })
            }
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MultiDocQaPage);
    component = fixture.componentInstance;
    qaService = TestBed.inject(MultiDocumentQaService);
    qaService.clearCorpus();

    // Ingest sample documents into service
    qaService.addDocumentDirect(fixtureDoc1);
    qaService.addDocumentDirect(fixtureDoc2);

    fixture.detectChanges();
  });

  afterEach(() => {
    qaService.clearCorpus();
  });

  it('should create the component and load corpus documents into carousel', () => {
    expect(component).toBeTruthy();
    expect(component.loadedDocs.length).toBe(2);
    expect(component.activeDocsCount).toBe(2);
    expect(component.messages.length).toBe(0);
  });

  it('should toggle document inclusion/exclusion in search scope', () => {
    expect(component.activeDocsCount).toBe(2);

    // Toggle off doc-alpha
    component.toggleDoc('doc-alpha');
    expect(component.activeDocsCount).toBe(1);

    const enabled = qaService.getEnabledDocuments();
    expect(enabled.length).toBe(1);
    expect(enabled[0].id).toBe('doc-beta');

    // Toggle back on
    component.toggleDoc('doc-alpha');
    expect(component.activeDocsCount).toBe(2);
  });

  it('should execute BM25 search across corpus and append grounded answer card with citations', async () => {
    await component.askQuestion('How many weeks of parental leave are provided?');

    // User message + Assistant answer message
    expect(component.messages.length).toBe(2);
    expect(component.messages[0].sender).toBe('user');
    expect(component.messages[0].text).toContain('parental leave');

    const assistantMsg = component.messages[1];
    expect(assistantMsg.sender).toBe('assistant');
    expect(assistantMsg.answerData).toBeDefined();
    expect(assistantMsg.answerData?.isAnswerable).toBe(true);
    expect(assistantMsg.answerData?.citations.length).toBeGreaterThan(0);

    const topCitation = assistantMsg.answerData!.citations[0];
    expect(topCitation.fileName).toBe('HR_Guidelines.pdf');
    expect(topCitation.pageNumber).toBe(2);
    expect(topCitation.formattedCitation).toBe('[HR_Guidelines.pdf, Page 2]');
    expect(topCitation.snippet).toContain('16 weeks of paid parental leave');
  });

  it('should open and close citation modal preview on citation badge click', () => {
    const citation = {
      documentId: 'doc-alpha',
      fileName: 'HR_Guidelines.pdf',
      pageNumber: 2,
      paragraphIndex: 1,
      snippet: 'Primary caregivers are entitled to 16 weeks of paid parental leave.',
      confidence: 95,
      formattedCitation: '[HR_Guidelines.pdf, Page 2]'
    };

    expect(component.activeCitationPreview).toBeNull();
    component.openCitationPreview(citation);
    expect(component.activeCitationPreview).toEqual(citation);

    component.closeCitationPreview();
    expect(component.activeCitationPreview).toBeNull();
  });

  it('should clear chat history and trigger transcript exports', async () => {
    await component.askQuestion('security badge policy');
    expect(component.messages.length).toBe(2);

    const pdfSpy = vi.spyOn(qaService, 'exportTranscriptPdf');
    const txtSpy = vi.spyOn(qaService, 'exportTranscriptTxt');

    await component.exportTranscriptPdf();
    expect(pdfSpy).toHaveBeenCalled();

    await component.exportTranscriptTxt();
    expect(txtSpy).toHaveBeenCalled();

    component.clearChatHistory();
    expect(component.messages.length).toBe(0);
  });
});
