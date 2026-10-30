import '../../core/utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ChangeDetectorRef } from '@angular/core';
import { ToastController } from '@ionic/angular';

import { SignTemplatesPage } from './sign-templates.page';
import { PdfSignatureAppearanceService } from '../../core/services/pdf-signature-appearance.service';
import {
  SignatureAppearanceTemplate,
  StampRenderResult
} from '../../core/models/signature-appearance.types';

describe('SignTemplatesPage', () => {
  let page: SignTemplatesPage;
  let mockAppearanceService: any;
  let mockRouter: any;
  let mockToastCtrl: any;

  const sampleTemplate: SignatureAppearanceTemplate = {
    id: 'default-standard',
    name: 'Standard Approval Stamp',
    signatureSource: 'type',
    typedFont: 'Caveat',
    inkColor: '#1e3a8a',
    layoutPreset: 'standard-horizontal',
    includeInitialsBadge: true,
    includeLogo: false,
    signer: {
      fullName: 'Dr. Jane Doe',
      titleOrRole: 'Manager',
      organization: 'Verified Signature'
    },
    metadata: {
      reason: 'Approved and Verified',
      location: 'Mumbai, India',
      includeReason: true,
      includeLocation: true,
      includeTimestamp: true,
      includeTimezone: true
    },
    createdAt: 1000,
    updatedAt: 1000
  };

  const sampleStampResult: StampRenderResult = {
    dataUrl: 'data:image/png;base64,mockstamp',
    width: 440,
    height: 130,
    layout: {
      totalWidth: 440,
      totalHeight: 130,
      signatureBox: { x: 12, y: 15, width: 160, height: 100 },
      signerDetailsBox: { x: 236, y: 15, width: 192, height: 45 },
      metadataBox: { x: 236, y: 62, width: 192, height: 55 },
      textLines: []
    }
  };

  beforeEach(() => {
    mockAppearanceService = {
      ensureFontsLoaded: vi.fn().mockResolvedValue(undefined),
      getDefaultTemplate: vi.fn().mockReturnValue({ ...sampleTemplate }),
      getTemplates: vi.fn().mockResolvedValue([{ ...sampleTemplate }]),
      saveTemplate: vi.fn().mockResolvedValue(undefined),
      deleteTemplate: vi.fn().mockResolvedValue(undefined),
      renderTypedSignature: vi.fn().mockReturnValue('data:image/png;base64,mockfont'),
      renderCompositeStamp: vi.fn().mockResolvedValue(sampleStampResult),
      prepareSignatureFromUpload: vi.fn().mockResolvedValue('data:image/png;base64,mockupload'),
      validateImageFile: vi.fn().mockImplementation(async (file: File) => file),
      validateAndProcessLogo: vi.fn().mockResolvedValue('data:image/png;base64,mocklogo'),
      cacheSignature: vi.fn()
    };

    mockRouter = {
      navigate: vi.fn()
    };

    mockToastCtrl = {
      create: vi.fn().mockResolvedValue({ present: vi.fn() })
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: PdfSignatureAppearanceService, useValue: mockAppearanceService },
        { provide: Router, useValue: mockRouter },
        { provide: ToastController, useValue: mockToastCtrl },
        { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn(), detectChanges: vi.fn() } }
      ]
    });

    page = TestBed.runInInjectionContext(() => new SignTemplatesPage());
  });

  it('initializes on type tab with default template and live stamp', async () => {
    await page.ngOnInit();

    expect(page.activeTab).toBe('type');
    expect(page.currentTemplate.signer.fullName).toBe('Dr. Jane Doe');
    expect(page.liveStampResult).toEqual(sampleStampResult);
    expect(mockAppearanceService.getTemplates).toHaveBeenCalled();
    expect(page.savedTemplates.length).toBe(1);
    expect(page.fontPreviews['Caveat']).toBe('data:image/png;base64,mockfont');
  });

  it('switches between Draw, Type, Upload, and Templates tabs', () => {
    page.setTab('draw');
    expect(page.activeTab).toBe('draw');
    expect(page.currentTemplate.signatureSource).toBe('draw');

    page.setTab('upload');
    expect(page.activeTab).toBe('upload');
    expect(page.currentTemplate.signatureSource).toBe('upload');

    page.setTab('templates');
    expect(page.activeTab).toBe('templates');

    page.setTab('type');
    expect(page.activeTab).toBe('type');
    expect(page.currentTemplate.signatureSource).toBe('type');
  });

  it('updates font selection and ink color', () => {
    page.selectFont('Dancing Script');
    expect(page.currentTemplate.typedFont).toBe('Dancing Script');

    page.selectInkColor('#881337');
    expect(page.currentTemplate.inkColor).toBe('#881337');
    expect(mockAppearanceService.renderTypedSignature).toHaveBeenCalled();
  });

  it('switches layout presets and sets quick reason presets', () => {
    page.setLayoutPreset('formal-seal');
    expect(page.currentTemplate.layoutPreset).toBe('formal-seal');

    page.setReasonPreset('Authorized');
    expect(page.currentTemplate.metadata.reason).toBe('Authorized');
    expect(page.currentTemplate.metadata.includeReason).toBe(true);
  });

  it('saves current template to storage via service', async () => {
    await page.saveCurrentTemplate();

    expect(mockAppearanceService.saveTemplate).toHaveBeenCalledWith(page.currentTemplate);
    expect(mockToastCtrl.create).toHaveBeenCalled();
  });

  it('applies a saved template configuration', () => {
    const custom: SignatureAppearanceTemplate = {
      ...sampleTemplate,
      id: 'custom-1',
      name: 'Custom Seal',
      layoutPreset: 'formal-seal'
    };

    page.applyTemplate(custom);
    expect(page.currentTemplate.id).toBe('custom-1');
    expect(page.currentTemplate.layoutPreset).toBe('formal-seal');
  });

  it('deletes a template', async () => {
    const mockEvent = { stopPropagation: vi.fn() } as any;
    await page.deleteTemplate('custom-1', mockEvent);

    expect(mockEvent.stopPropagation).toHaveBeenCalled();
    expect(mockAppearanceService.deleteTemplate).toHaveBeenCalledWith('custom-1');
  });

  it('uses signature on PDF by caching dataUrl and navigating', async () => {
    await page.ngOnInit();
    page.useSignatureOnPdf();

    expect(mockAppearanceService.cacheSignature).toHaveBeenCalledWith('data:image/png;base64,mockstamp');
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/features/pdf/sign']);
  });
});
