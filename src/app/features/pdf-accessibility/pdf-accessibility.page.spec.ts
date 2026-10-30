import { ComponentFixture, TestBed } from '@angular/core/testing';
import { resolveAngularResources } from '../../../test-setup';
import { PdfAccessibilityPage } from './pdf-accessibility.page';
import { PdfAccessibilityService } from '../../core/services/pdf-accessibility.service';
import { PdfReadAloudService } from '../../core/services/pdf-read-aloud.service';
import { StorageService } from '../../core/services/storage.service';
import { PageAccessibilityData, ReadingBlock, AccessibleImageItem } from '../../core/models/pdf-accessibility.types';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { BehaviorSubject } from 'rxjs';

describe('PdfAccessibilityPage', () => {
  let component: PdfAccessibilityPage;
  let fixture: ComponentFixture<PdfAccessibilityPage>;
  let mockAccessibilityService: Partial<PdfAccessibilityService>;
  let mockReadAloudService: Partial<PdfReadAloudService>;
  let mockStorageService: Partial<StorageService>;

  const mockBlocks: ReadingBlock[] = [
    {
      id: 'b1',
      pageNumber: 1,
      orderIndex: 1,
      tag: 'H1',
      text: 'Notification Title',
      bbox: { x: 50, y: 800, width: 300, height: 20 },
      confidence: 0.95
    },
    {
      id: 'b2',
      pageNumber: 1,
      orderIndex: 2,
      tag: 'P',
      text: 'Body paragraph text.',
      bbox: { x: 50, y: 750, width: 400, height: 15 },
      confidence: 0.88
    }
  ];

  const mockImages: AccessibleImageItem[] = [
    {
      id: 'img-1',
      pageNumber: 1,
      indexOnPage: 0,
      name: 'Logo.png',
      bbox: { x: 50, y: 700, width: 100, height: 100 },
      altText: '',
      hasUserAltText: false
    }
  ];

  const mockPageData: PageAccessibilityData = {
    pageNumber: 1,
    width: 595.28,
    height: 841.89,
    blocks: [...mockBlocks],
    images: [...mockImages],
    notices: [],
    hasMultiColumn: false
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await resolveAngularResources();

    mockAccessibilityService = {
      inferPageStructure: vi.fn().mockReturnValue(mockPageData),
      suggestAltText: vi.fn().mockReturnValue('Official departmental emblem'),
      createTaggedPdf: vi.fn().mockResolvedValue(new Blob(['tagged-pdf-data'], { type: 'application/pdf' })),
      generateAuditReport: vi.fn().mockReturnValue({
        fileName: 'test.pdf',
        pageCount: 1,
        totalBlocks: 2,
        totalImages: 1,
        imagesWithAltText: 1,
        inferredHeadingsCount: 1,
        inferredParagraphsCount: 1,
        inferredListsCount: 0,
        inferredTablesCount: 0,
        artifactsCount: 0,
        unconfidentInferences: [],
        honestyStatement: 'Enhanced with structure tags and image descriptions.',
        isTagged: true,
        hasRoleMap: true,
        hasParentTree: true
      }),
      HONESTY_STATEMENT: 'Enhanced with structure tags and image descriptions.'
    };

    const state$ = new BehaviorSubject<any>({ isPlaying: false });
    mockReadAloudService = {
      state$,
      playPage: vi.fn().mockImplementation((p, s, cb) => {
        state$.next({ isPlaying: true });
        if (cb) cb(p + 1);
      }),
      stop: vi.fn().mockImplementation(() => {
        state$.next({ isPlaying: false });
      }),
      isAvailable: vi.fn().mockReturnValue(true)
    };

    mockStorageService = {
      saveFile: vi.fn().mockResolvedValue('file:///path/saved_tagged.pdf')
    };

    await TestBed.configureTestingModule({
      imports: [PdfAccessibilityPage],
      providers: [
        { provide: PdfAccessibilityService, useValue: mockAccessibilityService },
        { provide: PdfReadAloudService, useValue: mockReadAloudService },
        { provide: StorageService, useValue: mockStorageService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(PdfAccessibilityPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('initializes in empty state on Step 1 (Structure Tags)', () => {
    expect(component).toBeTruthy();
    expect(component.activeStep).toBe(1);
    expect(component.currentPage).toBe(1);
    expect(component.selectedFile).toBeNull();
  });

  describe('3-Step Accessibility Mobile Stepper', () => {
    it('switches between Step 1 (Tags), Step 2 (Alt-Text), and Step 3 (Reading Order)', () => {
      component.setStep(2);
      expect(component.activeStep).toBe(2);

      component.setStep(3);
      expect(component.activeStep).toBe(3);

      component.setStep(1);
      expect(component.activeStep).toBe(1);
    });
  });

  describe('Step 1: Structure Tags Editing', () => {
    it('selects a block and updates its tag', () => {
      component.pagesData = [JSON.parse(JSON.stringify(mockPageData))];
      const targetBlock = component.currentBlocks[1];

      component.selectBlock(targetBlock);
      expect(component.selectedBlockId).toBe(targetBlock.id);

      component.updateBlockTag(targetBlock, 'H2');
      expect(targetBlock.tag).toBe('H2');
      expect(targetBlock.confidence).toBe(1.0);
    });

    it('marks block as Artifact when Artifact tag is chosen', () => {
      component.pagesData = [JSON.parse(JSON.stringify(mockPageData))];
      const targetBlock = component.currentBlocks[0];

      component.updateBlockTag(targetBlock, 'Artifact');
      expect(targetBlock.tag).toBe('Artifact');
      expect(targetBlock.isArtifact).toBe(true);
    });
  });

  describe('Step 2: Image Alt-Text Engine', () => {
    it('generates OCR / context suggestion for image alt-text', () => {
      component.pagesData = [JSON.parse(JSON.stringify(mockPageData))];
      const targetImg = component.currentImages[0];

      component.suggestOcrForImage(targetImg);

      expect(mockAccessibilityService.suggestAltText).toHaveBeenCalled();
      expect(targetImg.altText).toBe('Official departmental emblem');
      expect(targetImg.hasUserAltText).toBe(true);
    });

    it('toggles image decorative status', () => {
      component.pagesData = [JSON.parse(JSON.stringify(mockPageData))];
      const targetImg = component.currentImages[0];

      expect(targetImg.isDecorative).toBeFalsy();
      component.toggleImageDecorative(targetImg);
      expect(targetImg.isDecorative).toBe(true);
      component.toggleImageDecorative(targetImg);
      expect(targetImg.isDecorative).toBe(false);
    });
  });

  describe('Step 3: Visual Reading Order Editor', () => {
    it('moves block down and up, updating orderIndex sequentially', () => {
      component.pagesData = [JSON.parse(JSON.stringify(mockPageData))];

      // Initially b1 has orderIndex 1, b2 has orderIndex 2
      expect(component.currentBlocks[0].id).toBe('b1');
      expect(component.currentBlocks[1].id).toBe('b2');

      // Move first block down
      component.moveBlockDown(0);

      expect(component.currentBlocks[0].id).toBe('b2');
      expect(component.currentBlocks[0].orderIndex).toBe(1);
      expect(component.currentBlocks[1].id).toBe('b1');
      expect(component.currentBlocks[1].orderIndex).toBe(2);

      // Move it back up
      component.moveBlockUp(1);

      expect(component.currentBlocks[0].id).toBe('b1');
      expect(component.currentBlocks[0].orderIndex).toBe(1);
      expect(component.currentBlocks[1].id).toBe('b2');
      expect(component.currentBlocks[1].orderIndex).toBe(2);
    });

    it('reorders blocks via drag and drop', () => {
      component.pagesData = [JSON.parse(JSON.stringify(mockPageData))];

      const mockDragEvent = {
        dataTransfer: {
          effectAllowed: '',
          dropEffect: '',
          setData: vi.fn()
        },
        preventDefault: vi.fn()
      } as any;

      // Start dragging block at index 0 (b1)
      component.onDragStart(mockDragEvent, 0);
      expect(component.draggedBlockIndex).toBe(0);

      // Drag over target index 1
      component.onDragOver(mockDragEvent, 1);
      expect(mockDragEvent.preventDefault).toHaveBeenCalled();

      // Drop on target index 1
      component.onDrop(mockDragEvent, 1);

      expect(component.currentBlocks[0].id).toBe('b2');
      expect(component.currentBlocks[0].orderIndex).toBe(1);
      expect(component.currentBlocks[1].id).toBe('b1');
      expect(component.currentBlocks[1].orderIndex).toBe(2);
      expect(component.draggedBlockIndex).toBeNull();
    });
  });

  describe('Audio Preview Bar (Text-to-Speech Read-Aloud)', () => {
    it('starts and stops audio preview using PdfReadAloudService', () => {
      component.pagesData = [JSON.parse(JSON.stringify(mockPageData))];

      component.startAudioPreview();
      expect(mockReadAloudService.playPage).toHaveBeenCalled();

      component.stopAudio();
      expect(mockReadAloudService.stop).toHaveBeenCalled();
    });
  });

  describe('Saving Tagged Accessible PDF', () => {
    it('creates tagged PDF via PdfAccessibilityService and saves through StorageService', async () => {
      component.selectedFile = new File(['pdf-raw'], 'policy.pdf', { type: 'application/pdf' });
      component.sourcePdfBytes = new Uint8Array([1, 2, 3]);
      component.pagesData = [mockPageData];

      await component.saveTaggedPdf();

      expect(mockAccessibilityService.createTaggedPdf).toHaveBeenCalledWith(
        component.sourcePdfBytes,
        expect.objectContaining({
          fileName: 'policy.pdf',
          pages: component.pagesData
        })
      );
      expect(mockStorageService.saveFile).toHaveBeenCalledWith(
        expect.any(File),
        'accessible_pdf',
        undefined,
        { preserveName: true }
      );
    });
  });

  describe('Strict Honesty Gate & Certification Prohibition', () => {
    it('verifies honesty banner does not contain false certification claims', () => {
      const bannerStatement = component.accessibilityService.HONESTY_STATEMENT;
      expect(bannerStatement).not.toContain('WCAG Compliant');
      expect(bannerStatement).not.toContain('Section 508 Certified');
      expect(bannerStatement).toContain('Enhanced with structure tags');
    });
  });
});
