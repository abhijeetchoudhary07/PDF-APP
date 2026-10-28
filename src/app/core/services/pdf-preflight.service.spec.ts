import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument, StandardFonts, PDFName, PDFString, degrees } from 'pdf-lib';
import { PdfPreflightService } from './pdf-preflight.service';
import { PdfLayoutService } from './pdf-layout.service';
import { PdfPrivacyService } from './pdf-privacy.service';
import { PdfService } from './pdf.service';
import { StorageService } from './storage.service';
import { PreflightProfile } from '../models/pdf-preflight.types';

describe('PdfPreflightService (G3: Preflight & Submission Check)', () => {
  let service: PdfPreflightService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PdfPreflightService,
        PdfLayoutService,
        PdfPrivacyService,
        {
          provide: PdfService,
          useValue: {
            compressPdfToExactKB: async (file: File, config: any) => {
              // Return a mocked smaller file blob
              const dummyBlob = new Blob([new Uint8Array(50 * 1024)], { type: 'application/pdf' });
              return { blob: dummyBlob, sizeBytes: 50 * 1024 };
            }
          }
        },
        {
          provide: StorageService,
          useValue: {
            saveFile: async () => 'mock://file-saved'
          }
        }
      ]
    });
    service = TestBed.inject(PdfPreflightService);
  });

  async function createFixture(options: {
    pageCount?: number;
    mixedSizes?: boolean;
    hasJs?: boolean;
    hasAttachment?: boolean;
    hasBlanks?: boolean;
    withText?: boolean;
  }): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const count = options.pageCount ?? 2;

    for (let i = 0; i < count; i++) {
      const isLandscape = options.mixedSizes && i === 1;
      const width = isLandscape ? 842 : 595.28;
      const height = isLandscape ? 595.28 : 841.89;

      if (options.hasBlanks && i === 1) {
        // Blank page: no content stream
        doc.addPage([595.28, 841.89]);
      } else {
        const page = doc.addPage([width, height]);
        if (options.withText !== false) {
          page.drawText(`Page ${i + 1} content with sufficient characters to pass searchable text rule.`, {
            x: 50,
            y: 700,
            size: 12,
            font
          });
        }
      }
    }

    if (options.hasJs) {
      const jsDict = doc.context.obj({
        Type: 'Action',
        S: 'JavaScript',
        JS: PDFString.of('console.log("Preflight JS Test");')
      });
      const jsRef = doc.context.register(jsDict);
      doc.catalog.set(PDFName.of('OpenAction'), jsRef);
    }

    if (options.hasAttachment) {
      await doc.attach(new Uint8Array([1, 2, 3]), 'sample.txt', { mimeType: 'text/plain' });
    }

    return await doc.save();
  }

  const strictProfile: PreflightProfile = {
    id: 'test_strict',
    name: '200 KB · 1-2 Pages · Uniform A4',
    maxSizeBytes: 200 * 1024,
    minPages: 1,
    maxPages: 2,
    requireUniformPageSize: true,
    requireUniformOrientation: true,
    disallowEncryption: true,
    disallowJavaScript: true,
    disallowAttachments: true,
    requireSearchableText: true,
    disallowBlankPages: true
  };

  it('evaluates passing fixture against strict profile', async () => {
    const passBytes = await createFixture({ pageCount: 2, mixedSizes: false, hasJs: false, withText: true });
    const report = await service.runPreflight(passBytes.buffer, strictProfile, 'pass.pdf');

    expect(report.passed).toBe(true);
    expect(report.failCount).toBe(0);
    const sizeRule = report.rules.find(r => r.id === 'max_file_size');
    expect(sizeRule?.status).toBe('pass');
    const pageCountRule = report.rules.find(r => r.id === 'page_count_range');
    expect(pageCountRule?.status).toBe('pass');
    const jsRule = report.rules.find(r => r.id === 'no_javascript');
    expect(jsRule?.status).toBe('pass');
  });

  it('detects page size uniformity failure and flips rule to pass upon auto-fix', async () => {
    const mixedBytes = await createFixture({ pageCount: 2, mixedSizes: true });
    const beforeReport = await service.runPreflight(mixedBytes.buffer, strictProfile, 'mixed.pdf');

    const sizeUniformityRuleBefore = beforeReport.rules.find(r => r.id === 'page_size_uniformity');
    expect(sizeUniformityRuleBefore?.status).toBe('fail');
    expect(sizeUniformityRuleBefore?.fixable).toBe(true);

    // Apply auto-fix
    const { updatedReport } = await service.applyFix(mixedBytes.buffer, 'page_size_uniformity', strictProfile);
    const sizeUniformityRuleAfter = updatedReport.rules.find(r => r.id === 'page_size_uniformity');
    expect(sizeUniformityRuleAfter?.status).toBe('pass');
  });

  it('detects JavaScript failure and flips rule to pass upon auto-fix', async () => {
    const jsBytes = await createFixture({ hasJs: true });
    const beforeReport = await service.runPreflight(jsBytes.buffer, strictProfile, 'with_js.pdf');

    const jsRuleBefore = beforeReport.rules.find(r => r.id === 'no_javascript');
    expect(jsRuleBefore?.status).toBe('fail');

    // Apply auto-fix (sanitization)
    const { updatedReport } = await service.applyFix(jsBytes.buffer, 'no_javascript', strictProfile);
    const jsRuleAfter = updatedReport.rules.find(r => r.id === 'no_javascript');
    expect(jsRuleAfter?.status).toBe('pass');
  });

  it('detects blank pages and flips rule to pass upon auto-fix', async () => {
    const blankBytes = await createFixture({ pageCount: 2, hasBlanks: true });
    const beforeReport = await service.runPreflight(blankBytes.buffer, strictProfile, 'with_blank.pdf');

    const blankRuleBefore = beforeReport.rules.find(r => r.id === 'no_blank_pages');
    expect(blankRuleBefore?.status).toBe('warn');

    // Apply auto-fix (remove blanks)
    const { updatedReport } = await service.applyFix(blankBytes.buffer, 'no_blank_pages', strictProfile);
    const blankRuleAfter = updatedReport.rules.find(r => r.id === 'no_blank_pages');
    expect(blankRuleAfter?.status).toBe('pass');
  });

  it('detects orientation failure and flips rule to pass upon auto-fix', async () => {
    const mixedBytes = await createFixture({ pageCount: 2, mixedSizes: true });
    const beforeReport = await service.runPreflight(mixedBytes.buffer, strictProfile, 'mixed_orientation.pdf');

    const orientationRuleBefore = beforeReport.rules.find(r => r.id === 'orientation_uniformity');
    expect(orientationRuleBefore?.status).toBe('fail');
    expect(orientationRuleBefore?.fixable).toBe(true);

    // The fix only sets /Rotate, so the rule has to read rotation to see it.
    const { updatedReport } = await service.applyFix(mixedBytes.buffer, 'orientation_uniformity', strictProfile);
    const orientationRuleAfter = updatedReport.rules.find(r => r.id === 'orientation_uniformity');
    expect(orientationRuleAfter?.status).toBe('pass');
  });

  it('measures a rotated page at the orientation it displays', async () => {
    // A landscape MediaBox turned a quarter turn displays as portrait, so a
    // document of portrait pages plus one rotated landscape page is uniform in
    // both size and orientation however the boxes are stored.
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);

    const portrait = doc.addPage([595.28, 841.89]);
    portrait.drawText('Portrait page with sufficient characters to pass searchable text rule.', {
      x: 50,
      y: 700,
      size: 12,
      font
    });

    const rotated = doc.addPage([841.89, 595.28]);
    rotated.drawText('Rotated page with sufficient characters to pass searchable text rule.', {
      x: 50,
      y: 500,
      size: 12,
      font
    });
    rotated.setRotation(degrees(90));

    const report = await service.runPreflight((await doc.save()).buffer, strictProfile, 'rotated.pdf');

    expect(report.rules.find(r => r.id === 'orientation_uniformity')?.status).toBe('pass');
    expect(report.rules.find(r => r.id === 'page_size_uniformity')?.status).toBe('pass');
  });

  it('exports and imports profile as JSON correctly', () => {
    const jsonStr = service.exportProfileAsJson(strictProfile);
    expect(jsonStr).toContain('200 KB · 1-2 Pages · Uniform A4');

    const imported = service.importProfileFromJson(jsonStr);
    expect(imported.name).toBe(strictProfile.name);
    expect(imported.maxSizeBytes).toBe(strictProfile.maxSizeBytes);
    expect(imported.requireUniformPageSize).toBe(true);
  });
});
