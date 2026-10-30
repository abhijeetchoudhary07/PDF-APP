import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { PDFDocument } from 'pdf-lib';

import { PdfSignatureAppearanceService } from './pdf-signature-appearance.service';
import {
  SignatureAppearanceOptions,
  SignatureAppearanceTemplate,
  TypedSignatureFont,
  SignatureInkColor,
  SignatureLayoutPreset
} from '../models/signature-appearance.types';
import { ImageService } from './image.service';
import { SignatureProcessingService } from './signature-processing.service';

const preferencesStore = new Map<string, string>();

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: preferencesStore.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      preferencesStore.set(key, value);
    }),
    remove: vi.fn(async ({ key }: { key: string }) => {
      preferencesStore.delete(key);
    }),
  },
}));

describe('PdfSignatureAppearanceService', () => {
  let service: PdfSignatureAppearanceService;

  beforeEach(() => {
    preferencesStore.clear();

    TestBed.configureTestingModule({
      providers: [
        PdfSignatureAppearanceService,
        { provide: ImageService, useValue: { autoCropSignature: vi.fn() } },
        { provide: SignatureProcessingService, useValue: {} }
      ]
    });

    service = TestBed.inject(PdfSignatureAppearanceService);
  });

  describe('Initials Derivation Algorithm', () => {
    it('handles titles and formal prefixes (e.g. "Dr. Jane Doe" -> "JD")', () => {
      expect(service.deriveInitials('Dr. Jane Doe')).toBe('JD');
      expect(service.deriveInitials('Dr Jane Doe')).toBe('JD');
      expect(service.deriveInitials('Mr. John Smith')).toBe('JS');
      expect(service.deriveInitials('Mrs. Sarah Connor')).toBe('SC');
      expect(service.deriveInitials('Prof. Sir Arthur Conan Doyle')).toBe('ACD');
      expect(service.deriveInitials('Adv. Ramesh Kumar')).toBe('RK');
      expect(service.deriveInitials('Er. Vikram Malhotra')).toBe('VM');
      expect(service.deriveInitials('CA Ananya Roy')).toBe('AR');
    });

    it('handles single names, hyphenated names, and standard multi-part names', () => {
      // Single name & short names
      expect(service.deriveInitials('Bo')).toBe('B');
      expect(service.deriveInitials('Li')).toBe('L');
      expect(service.deriveInitials('Cher')).toBe('C');
      expect(service.deriveInitials('Madonna')).toBe('M');

      // Hyphenated names and titles ("Dr. Jane Doe-Smith" -> "JDS")
      expect(service.deriveInitials('Dr. Jane Doe-Smith')).toBe('JDS');
      expect(service.deriveInitials('Jean-Luc Picard')).toBe('JLP');
      expect(service.deriveInitials('Mary-Jane Watson')).toBe('MJW');
      expect(service.deriveInitials('Jane Doe-Smith, Ph.D.')).toBe('JDS');

      // Standard multi-part names
      expect(service.deriveInitials('Abhijeet Choudhary')).toBe('AC');
      expect(service.deriveInitials('Mohandas Karamchand Gandhi')).toBe('MKG');
      expect(service.deriveInitials('Capt. James T. Kirk')).toBe('JTK');
    });

    it('returns empty string for empty or whitespace-only input', () => {
      expect(service.deriveInitials('')).toBe('');
      expect(service.deriveInitials('   ')).toBe('');
    });
  });

  describe('Typed Signature Engine', () => {
    it('generates a valid transparent PNG data URL', () => {
      const dataUrl = service.renderTypedSignature('Jane Doe', 'Caveat', '#1e3a8a');
      expect(dataUrl).toBeDefined();
      expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    });

    it('renders across all 5 cursive font families', () => {
      const fonts = service.supportedFonts;
      expect(fonts.length).toBe(5);

      for (const font of fonts) {
        const dataUrl = service.renderTypedSignature('Alex Hamilton', font, '#000000');
        expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
      }
    });
  });

  describe('Appearance Layout Geometry & Composite Stamp', () => {
    const baseOptions: SignatureAppearanceOptions = {
      signatureSource: 'type',
      typedFont: 'Dancing Script',
      inkColor: '#1e3a8a',
      layoutPreset: 'standard-horizontal',
      includeInitialsBadge: true,
      includeLogo: false,
      signer: {
        fullName: 'Dr. Jane Doe',
        titleOrRole: 'Chief Medical Officer',
        organization: 'Apollo Hospitals'
      },
      metadata: {
        reason: 'Authorized and Approved',
        location: 'Mumbai, India',
        timestamp: '2026-10-28 14:30:00 IST',
        includeReason: true,
        includeLocation: true,
        includeTimestamp: true,
        includeTimezone: true
      }
    };

    it('computes exact relative coordinates for standard-horizontal preset', () => {
      const layout = service.computeStampLayout(baseOptions);

      expect(layout.totalWidth).toBe(440);
      expect(layout.totalHeight).toBe(130);
      expect(layout.signatureBox).toEqual({ x: 12, y: 15, width: 160, height: 100 });
      expect(layout.initialsBadgeBox).toEqual({ cx: 204, cy: 65, radius: 20, initials: 'JD' });
      expect(layout.signerDetailsBox.x).toBe(236);
      expect(layout.metadataBox.x).toBe(236);

      const nameLine = layout.textLines.find(l => l.text === 'Dr. Jane Doe');
      expect(nameLine).toBeDefined();
      expect(nameLine?.x).toBe(236);
      expect(nameLine?.isBold).toBe(true);

      const reasonLine = layout.textLines.find(l => l.text === 'Reason: Authorized and Approved');
      expect(reasonLine).toBeDefined();
      expect(reasonLine?.x).toBe(236);
    });

    it('computes exact relative coordinates for compact-stacked preset', () => {
      const stackedOpts: SignatureAppearanceOptions = {
        ...baseOptions,
        layoutPreset: 'compact-stacked',
        includeInitialsBadge: false
      };

      const layout = service.computeStampLayout(stackedOpts);
      expect(layout.totalWidth).toBe(260);
      expect(layout.totalHeight).toBe(160);
      expect(layout.signatureBox).toEqual({ x: 15, y: 10, width: 230, height: 65 });
      expect(layout.signerDetailsBox.y).toBe(80);
    });

    it('computes exact relative coordinates for formal-seal preset', () => {
      const sealOpts: SignatureAppearanceOptions = {
        ...baseOptions,
        layoutPreset: 'formal-seal',
        borderColor: '#0a2540'
      };

      const layout = service.computeStampLayout(sealOpts);
      expect(layout.totalWidth).toBe(460);
      expect(layout.totalHeight).toBe(160);
      expect(layout.sealBorder).toBeDefined();
      expect(layout.sealBorder?.borderWidth).toBe(2);
      expect(layout.initialsBadgeBox?.initials).toBe('JD');
    });

    it('renders composite stamp returning data URL, dimensions, and geometry', async () => {
      const result = await service.renderCompositeStamp(baseOptions);
      expect(result.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
      expect(result.width).toBe(440);
      expect(result.height).toBe(130);
      expect(result.layout.signatureBox).toBeDefined();
    });
  });

  describe('Template Persistence via Preferences', () => {
    it('round-trips custom templates through Preferences', async () => {
      const customTemplate: SignatureAppearanceTemplate = {
        id: 'tmpl-law-firm',
        name: 'Legal Seal Template',
        signatureSource: 'type',
        typedFont: 'Alex Brush',
        inkColor: '#0a2540',
        layoutPreset: 'formal-seal',
        includeInitialsBadge: true,
        includeLogo: false,
        signer: {
          fullName: 'Adv. Rajesh Sharma',
          titleOrRole: 'Senior Partner',
          organization: 'Apex Legal Chambers'
        },
        metadata: {
          reason: 'Verified and Notarized',
          location: 'New Delhi, India',
          includeReason: true,
          includeLocation: true,
          includeTimestamp: true,
          includeTimezone: true
        },
        createdAt: 1000,
        updatedAt: 2000
      };

      await service.saveTemplate(customTemplate);

      const templates = await service.getTemplates();
      expect(templates.length).toBeGreaterThanOrEqual(1);

      const retrieved = templates.find(t => t.id === 'tmpl-law-firm');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Legal Seal Template');
      expect(retrieved?.layoutPreset).toBe('formal-seal');
      expect(retrieved?.signer.fullName).toBe('Adv. Rajesh Sharma');
      expect(retrieved?.metadata.reason).toBe('Verified and Notarized');

      // Test delete
      await service.deleteTemplate('tmpl-law-firm');
      const afterDelete = await service.getTemplates();
      expect(afterDelete.find(t => t.id === 'tmpl-law-firm')).toBeUndefined();
    });
  });

  describe('Multi-Page Document Stamping', () => {
    const valid1x1Png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    it('stamps all 5 cursive fonts, 5 ink colors, and 3 layout presets onto a 3-page document', async () => {
      // 1. Create a 3-page blank PDF
      const pdfDoc = await PDFDocument.create();
      pdfDoc.addPage([600, 800]); // Page 1
      pdfDoc.addPage([600, 800]); // Page 2
      pdfDoc.addPage([600, 800]); // Page 3
      const pdfBytes = await pdfDoc.save();

      // Page 1: 5 distinct typed signatures across all 5 fonts
      const fonts: TypedSignatureFont[] = ['Caveat', 'Dancing Script', 'Alex Brush', 'Great Vibes', 'Sacramento'];
      const page1Signatures = fonts.map((font, idx) => ({
        id: `sig-font-${idx}`,
        pageNumber: 1,
        x: 50,
        y: 60 + idx * 80,
        width: 180,
        height: 60,
        dataUrl: valid1x1Png
      }));

      // Page 2: 5 distinct signatures across all 5 ink colors
      const colors: SignatureInkColor[] = ['#000000', '#0a2540', '#1e3a8a', '#881337', '#14532d'];
      const page2Signatures = colors.map((col, idx) => ({
        id: `sig-color-${idx}`,
        pageNumber: 2,
        x: 50,
        y: 60 + idx * 80,
        width: 180,
        height: 60,
        dataUrl: valid1x1Png
      }));

      // Page 3: 3 distinct layout presets stamped
      const presets: SignatureLayoutPreset[] = ['standard-horizontal', 'compact-stacked', 'formal-seal'];
      const page3Signatures = presets.map((preset, idx) => ({
        id: `sig-preset-${idx}`,
        pageNumber: 3,
        x: 50,
        y: 50 + idx * 160,
        width: 240,
        height: 100,
        dataUrl: valid1x1Png
      }));

      const allSignatures = [...page1Signatures, ...page2Signatures, ...page3Signatures];
      expect(allSignatures.length).toBe(13);

      const result = await service.embedSignatures(pdfBytes.buffer, allSignatures, 'multi_signed.pdf');
      expect(result.file).toBeDefined();
      expect(result.sizeBytes).toBeGreaterThan(pdfBytes.byteLength);

      // Verify the resulting signed document has 3 pages
      const signedDoc = await PDFDocument.load(await result.blob.arrayBuffer());
      expect(signedDoc.getPageCount()).toBe(3);
    });
  });

  describe('Stamp Layout Coordinates & Anti-Clipping Bounds', () => {
    it('prevents logo and text collision in standard-horizontal layout', () => {
      const optsWithLogo: SignatureAppearanceOptions = {
        signatureSource: 'type',
        layoutPreset: 'standard-horizontal',
        includeInitialsBadge: true,
        includeLogo: true,
        logoDataUrl: 'data:image/png;base64,mocklogo',
        signer: { fullName: 'Dr. Jane Doe-Smith', titleOrRole: 'Director' },
        metadata: { includeReason: true, reason: 'Approved', includeLocation: false, includeTimestamp: true, includeTimezone: true }
      };

      const layout = service.computeStampLayout(optsWithLogo);
      expect(layout.logoBox).toBeDefined();
      expect(layout.logoBox?.x).toBe(236);

      // Name line should be offset to 272 (236 + 36) so it never collides with the 28px logo
      const nameLine = layout.textLines.find(l => l.text === 'Dr. Jane Doe-Smith');
      expect(nameLine).toBeDefined();
      expect(nameLine?.x).toBe(272);
      expect(nameLine?.x).toBeGreaterThan(layout.logoBox!.x + layout.logoBox!.width);
    });

    it('places logo without overlapping in formal-seal layout', () => {
      const optsFormalLogo: SignatureAppearanceOptions = {
        signatureSource: 'type',
        layoutPreset: 'formal-seal',
        includeInitialsBadge: true,
        includeLogo: true,
        logoDataUrl: 'data:image/png;base64,mocklogo',
        signer: { fullName: 'Dr. Jane Doe-Smith', titleOrRole: 'Director' },
        metadata: { includeReason: false, includeLocation: false, includeTimestamp: true, includeTimezone: true }
      };

      const layout = service.computeStampLayout(optsFormalLogo);
      expect(layout.logoBox).toBeDefined();
      expect(layout.logoBox?.x).toBe(256);

      const nameLine = layout.textLines.find(l => l.text === 'Dr. Jane Doe-Smith');
      expect(nameLine).toBeDefined();
      expect(nameLine?.x).toBe(296); // 256 + 40
      expect(nameLine?.x).toBeGreaterThan(layout.logoBox!.x + layout.logoBox!.width);
    });

    it('ensures compact-stacked includes initials badge and centered text within bounds', () => {
      const optsCompact: SignatureAppearanceOptions = {
        signatureSource: 'type',
        layoutPreset: 'compact-stacked',
        includeInitialsBadge: true,
        signer: { fullName: 'Dr. Jane Doe-Smith' },
        metadata: { includeReason: false, includeLocation: false, includeTimestamp: true, includeTimezone: true }
      };

      const layout = service.computeStampLayout(optsCompact);
      expect(layout.initialsBadgeBox?.initials).toBe('JDS');
      expect(layout.initialsBadgeBox?.cx).toBe(234);

      for (const line of layout.textLines) {
        expect(line.x).toBe(130); // Centered
        expect(line.y).toBeLessThanOrEqual(layout.totalHeight);
      }
    });
  });

  describe('Timestamp Parsing, Timezone Formatting & Anti-Spoofing', () => {
    it('preserves and extracts valid timestamps with timezones', () => {
      const formattedWithTz = service.formatTimestamp('2026-10-28 14:30:00 IST', true);
      expect(formattedWithTz).toBe('2026-10-28 14:30:00 IST');

      const formattedWithoutTz = service.formatTimestamp('2026-10-28 14:30:00 IST', false);
      expect(formattedWithoutTz).toBe('2026-10-28 14:30:00');
    });

    it('detects and rejects spoofed timezone offsets, falling back safely', () => {
      // Spoofed UTC+99:99 timezone offset
      const sanitized = service.formatTimestamp('2026-10-28 14:30:00 UTC+99:99', true);
      expect(sanitized).not.toContain('UTC+99:99');
      expect(sanitized).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    });

    it('falls back safely when given an invalid date or injection string', () => {
      const result = service.formatTimestamp('<script>alert(1)</script>', true);
      expect(result).not.toContain('<script>');
      expect(result).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    });
  });

  describe('Cybersecurity Stress-Testing', () => {
    it('sanitizes XSS payloads from signer details, metadata, and roles', () => {
      const xssName = '<script>alert("pwned")</script>Dr. Jane Doe-Smith';
      const cleanName = service.sanitizeTextInput(xssName);
      expect(cleanName).toBe('Dr. Jane Doe-Smith');
      expect(cleanName).not.toContain('<script>');

      const xssReason = '<img src=x onerror=alert(1)>Approved by Legal';
      const cleanReason = service.sanitizeTextInput(xssReason);
      expect(cleanReason).toBe('Approved by Legal');

      const xssLocation = '<svg onload=alert(document.cookie)>Mumbai Office';
      const cleanLocation = service.sanitizeTextInput(xssLocation);
      expect(cleanLocation).toBe('Mumbai Office');

      // Directional override characters (\u202E RLO)
      const rtlOverride = 'Legal\u202EReviewed\u202D';
      const cleanRtl = service.sanitizeTextInput(rtlOverride);
      expect(cleanRtl).toBe('LegalReviewed');
    });

    it('sanitizes template data when saving to storage (stored XSS defense)', async () => {
      const maliciousTemplate: SignatureAppearanceTemplate = {
        id: '<script>evil()</script>tmpl-1',
        name: '<b onmouseover=alert(1)>Corporate Stamp</b>',
        signatureSource: 'type',
        signer: {
          fullName: '"><script>alert("name")</script>Chief Officer',
          titleOrRole: '<iframe src=evil.com>VP Engineering</iframe>',
          organization: 'Apex <script>alert(1)</script>Corp'
        },
        metadata: {
          reason: '<svg onload=alert(1)>Authorized',
          location: 'Delhi',
          includeReason: true,
          includeLocation: true,
          includeTimestamp: true,
          includeTimezone: true
        },
        layoutPreset: 'standard-horizontal',
        includeInitialsBadge: true,
        includeLogo: false,
        createdAt: 100,
        updatedAt: 200
      };

      await service.saveTemplate(maliciousTemplate);
      const saved = await service.getTemplates();
      const target = saved.find(t => t.id.includes('tmpl-1'));

      expect(target).toBeDefined();
      expect(target?.id).not.toContain('<script>');
      expect(target?.name).toBe('Corporate Stamp');
      expect(target?.signer.fullName).toBe('Chief Officer');
      expect(target?.signer.titleOrRole).toBe('VP Engineering');
      expect(target?.metadata.reason).toBe('Authorized');
    });

    it('rejects zero-byte uploaded image files', async () => {
      const zeroByteFile = new File([], 'empty.png', { type: 'image/png' });
      await expect(service.validateImageFile(zeroByteFile)).rejects.toThrow(/Zero-byte or empty file rejected/i);
    });

    it('rejects files exceeding the maximum file size limit', async () => {
      // Create a 6MB mock file
      const bigBuffer = new Uint8Array(6 * 1024 * 1024);
      const oversizedFile = new File([bigBuffer], 'giant.png', { type: 'image/png' });

      await expect(
        service.validateImageFile(oversizedFile, { maxSizeBytes: 5 * 1024 * 1024 })
      ).rejects.toThrow(/exceeds limit/i);
    });

    it('rejects files with spoofed MIME type and invalid magic bytes', async () => {
      // An HTML file claiming to be image/png
      const fakePng = new File([new TextEncoder().encode('<html><body>not an image</body></html>')], 'fake.png', {
        type: 'image/png'
      });

      await expect(service.validateImageFile(fakePng)).rejects.toThrow(/Invalid magic bytes/i);
    });

    it('detects and rejects malicious SVG polyglot scripts with active handlers', async () => {
      const maliciousSvgContent = `
        <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
          <script type="text/javascript">alert(document.cookie);</script>
          <circle cx="50" cy="50" r="40" stroke="green" stroke-width="4" fill="yellow" />
        </svg>
      `;

      const maliciousSvg = new File([maliciousSvgContent], 'logo.svg', { type: 'image/svg+xml' });

      // When SVG is disallowed (default for logos)
      await expect(service.validateImageFile(maliciousSvg, { allowSvg: false })).rejects.toThrow(/SVG images are not permitted/i);

      // When SVG is checked with allowSvg: true, script payload is rejected
      await expect(service.validateImageFile(maliciousSvg, { allowSvg: true })).rejects.toThrow(/Malicious active script/i);
    });

    it('accepts legitimate binary PNG files with valid magic bytes', async () => {
      // Valid PNG header with IHDR: width 100, height 100
      const validPngHeader = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d,
        0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x64, // 100
        0x00, 0x00, 0x00, 0x64, // 100
        0x08, 0x06, 0x00, 0x00, 0x00
      ]);
      const validFile = new File([validPngHeader], 'valid.png', { type: 'image/png' });

      const validated = await service.validateImageFile(validFile);
      expect(validated).toBeDefined();
      expect(validated.name).toBe('valid.png');
    });

    it('rejects PNG decompression bombs with oversized dimensions in IHDR', async () => {
      const bombPngHeader = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d,
        0x49, 0x48, 0x44, 0x52,
        0x00, 0x01, 0x86, 0xa0, // width: 100,000 px!
        0x00, 0x01, 0x86, 0xa0, // height: 100,000 px!
        0x08, 0x06, 0x00, 0x00, 0x00
      ]);
      const bombFile = new File([bombPngHeader], 'bomb.png', { type: 'image/png' });

      await expect(service.validateImageFile(bombFile, { maxWidth: 4096, maxHeight: 4096 })).rejects.toThrow(
        /exceed safe maximum limit/i
      );
    });
  });
});
