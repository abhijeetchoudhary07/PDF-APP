import { describe, it, expect, beforeEach } from 'vitest';
import { QrBarcodeService } from './qr-barcode.service';
import { QrGeneratorOptions, BarcodeScanResult } from '../models/qr-barcode.types';

describe('QrBarcodeService', () => {
  let service: QrBarcodeService;

  beforeEach(() => {
    service = new QrBarcodeService();
  });

  describe('URL detection and formatting', () => {
    it('should correctly identify valid URLs', () => {
      expect(service.checkIsUrl('https://example.com')).toBe(true);
      expect(service.checkIsUrl('http://sub.domain.org/path?q=1')).toBe(true);
      expect(service.checkIsUrl('not a url')).toBe(false);
      expect(service.checkIsUrl('ftp://invalid.com')).toBe(false);
      expect(service.checkIsUrl('')).toBe(false);
    });

    it('should extract hostname domain from valid URLs', () => {
      expect(service.extractDomain('https://example.com/page')).toBe('example.com');
      expect(service.extractDomain('http://portal.gov.in/app')).toBe('portal.gov.in');
      expect(service.extractDomain('invalid-url')).toBe('');
    });
  });

  describe('Payload formatting for QR types', () => {
    it('should format URL payload', () => {
      const opts: QrGeneratorOptions = {
        contentType: 'url',
        content: 'https://test.com',
        urlPayload: 'https://test.com/login',
        size: 200,
        margin: 2,
        errorCorrectionLevel: 'M',
        foregroundColor: '#000000',
        backgroundColor: '#ffffff'
      };
      expect(service.formatPayload(opts)).toBe('https://test.com/login');
    });

    it('should format Wi-Fi payload according to standard schema', () => {
      const opts: QrGeneratorOptions = {
        contentType: 'wifi',
        content: '',
        wifiPayload: {
          ssid: 'MyHomeWiFi',
          password: 'SecretPassword123',
          encryption: 'WPA',
          hidden: false
        },
        size: 200,
        margin: 2,
        errorCorrectionLevel: 'M',
        foregroundColor: '#000000',
        backgroundColor: '#ffffff'
      };
      expect(service.formatPayload(opts)).toBe('WIFI:S:MyHomeWiFi;T:WPA;P:SecretPassword123;H:false;;');
    });

    it('should format Email payload with mailto schema', () => {
      const opts: QrGeneratorOptions = {
        contentType: 'email',
        content: '',
        emailPayload: {
          address: 'support@example.com',
          subject: 'Help Needed',
          body: 'Hello Support'
        },
        size: 200,
        margin: 2,
        errorCorrectionLevel: 'M',
        foregroundColor: '#000000',
        backgroundColor: '#ffffff'
      };
      const formatted = service.formatPayload(opts);
      expect(formatted).toContain('mailto:support@example.com');
      expect(formatted).toContain('subject=Help+Needed');
    });

    it('should format Phone payload with tel schema', () => {
      const opts: QrGeneratorOptions = {
        contentType: 'phone',
        content: '',
        phonePayload: '+919876543210',
        size: 200,
        margin: 2,
        errorCorrectionLevel: 'M',
        foregroundColor: '#000000',
        backgroundColor: '#ffffff'
      };
      expect(service.formatPayload(opts)).toBe('tel:+919876543210');
    });

    it('should format vCard payload with standard vCard fields', () => {
      const opts: QrGeneratorOptions = {
        contentType: 'vcard',
        content: '',
        vcardPayload: {
          name: 'John Doe',
          phone: '+1234567890',
          email: 'john@example.com',
          org: 'Acme Corp',
          title: 'Engineer'
        },
        size: 200,
        margin: 2,
        errorCorrectionLevel: 'M',
        foregroundColor: '#000000',
        backgroundColor: '#ffffff'
      };
      const formatted = service.formatPayload(opts);
      expect(formatted).toContain('BEGIN:VCARD');
      expect(formatted).toContain('FN:John Doe');
      expect(formatted).toContain('TEL:+1234567890');
      expect(formatted).toContain('EMAIL:john@example.com');
      expect(formatted).toContain('ORG:Acme Corp');
      expect(formatted).toContain('END:VCARD');
    });
  });

  describe('QR Generation', () => {
    it('should generate valid PNG data URL', async () => {
      const opts: QrGeneratorOptions = {
        contentType: 'text',
        content: 'Hello World QR Test',
        size: 200,
        margin: 2,
        errorCorrectionLevel: 'M',
        foregroundColor: '#000000',
        backgroundColor: '#ffffff'
      };

      const dataUrl = await service.generateQrDataUrl(opts);
      expect(dataUrl).toBeDefined();
      expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    });

    it('should generate valid SVG string', async () => {
      const opts: QrGeneratorOptions = {
        contentType: 'url',
        content: 'https://example.com',
        urlPayload: 'https://example.com',
        size: 200,
        margin: 2,
        errorCorrectionLevel: 'H',
        foregroundColor: '#000000',
        backgroundColor: '#ffffff'
      };

      const svg = await service.generateQrSvg(opts);
      expect(svg).toBeDefined();
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
    });

    it('should generate a PDF document containing the QR code', async () => {
      const opts: QrGeneratorOptions = {
        contentType: 'url',
        content: 'https://gov.in',
        urlPayload: 'https://gov.in',
        size: 200,
        margin: 2,
        errorCorrectionLevel: 'M',
        foregroundColor: '#000000',
        backgroundColor: '#ffffff'
      };

      const pdfBlob = await service.generateQrPdf(opts, 'Test QR Document');
      expect(pdfBlob).toBeDefined();
      expect(pdfBlob.type).toBe('application/pdf');
      expect(pdfBlob.size).toBeGreaterThan(500);
    });
  });

  describe('Report Export', () => {
    const mockResults: BarcodeScanResult[] = [
      {
        id: 'c1',
        rawContent: 'https://example.com',
        format: 'QR_CODE',
        timestamp: 1700000000000,
        pageNumber: 1,
        isUrl: true,
        urlDomain: 'example.com'
      },
      {
        id: 'c2',
        rawContent: '987654321012',
        format: 'EAN_13',
        timestamp: 1700000000000,
        pageNumber: 2,
        isUrl: false
      }
    ];

    it('should export TXT report', async () => {
      const blob = service.exportReport(mockResults, 'txt');
      expect(blob.type).toBe('text/plain');
      const text = await blob.text();
      expect(text).toContain('QR CODE & BARCODE SCAN REPORT');
      expect(text).toContain('https://example.com');
      expect(text).toContain('EAN_13');
    });

    it('should export CSV report with headers', async () => {
      const blob = service.exportReport(mockResults, 'csv');
      expect(blob.type).toBe('text/csv');
      const csv = await blob.text();
      expect(csv).toContain('ID,Format,Content,Page,Is URL,Domain,Timestamp');
      expect(csv).toContain('"QR_CODE"');
      expect(csv).toContain('"EAN_13"');
    });

    it('should export JSON report', async () => {
      const blob = service.exportReport(mockResults, 'json');
      expect(blob.type).toBe('application/json');
      const json = JSON.parse(await blob.text());
      expect(json.length).toBe(2);
      expect(json[0].format).toBe('QR_CODE');
    });
  });
});
