import '../utilities/pdf-iterator-polyfill';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';

import { PdfMailMergeService } from './pdf-mail-merge.service';
import { StorageService } from './storage.service';

describe('PdfMailMergeService', () => {
  let service: PdfMailMergeService;
  let mockStorageService: any;

  // Helper to create a blank PDF with form fields
  async function createTemplatePdf(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 400]);
    const form = doc.getForm();

    const nameField = form.createTextField('fullName');
    nameField.addToPage(page, { x: 50, y: 300, width: 200, height: 30 });

    const emailField = form.createTextField('email');
    emailField.addToPage(page, { x: 50, y: 250, width: 200, height: 30 });

    const agreeCheck = form.createCheckBox('agreeTerms');
    agreeCheck.addToPage(page, { x: 50, y: 200, width: 20, height: 20 });

    return await doc.save();
  }

  beforeEach(() => {
    mockStorageService = {
      getQuotaStatus: vi.fn().mockResolvedValue({
        remaining: 10,
        isUnlimited: false,
        limit: 10,
        canStart: true
      })
    };

    TestBed.configureTestingModule({
      providers: [
        PdfMailMergeService,
        { provide: StorageService, useValue: mockStorageService }
      ]
    });

    service = TestBed.inject(PdfMailMergeService);
  });

  describe('CSV Ingestion & Parsing', () => {
    it('parses standard CSV with header and data rows', () => {
      const csv = `fullName,email,agreeTerms\nAlice Smith,alice@example.com,true\nBob Jones,bob@example.com,false`;
      const result = service.parseCsv(csv);

      expect(result.headers).toEqual(['fullName', 'email', 'agreeTerms']);
      expect(result.totalRows).toBe(2);
      expect(result.rows[0]).toEqual({
        fullName: 'Alice Smith',
        email: 'alice@example.com',
        agreeTerms: 'true'
      });
      expect(result.rows[1]).toEqual({
        fullName: 'Bob Jones',
        email: 'bob@example.com',
        agreeTerms: 'false'
      });
    });

    it('handles quotes, commas inside quotes, escaped quotes, and CRLF', () => {
      const csv = `"Full Name","Address, Line 1","Notes"\r\n"Dr. Jane ""The Boss"" Doe","123 Main St, Apt 4","Hello, World!"\r\n`;
      const result = service.parseCsv(csv);

      expect(result.headers).toEqual(['Full Name', 'Address, Line 1', 'Notes']);
      expect(result.totalRows).toBe(1);
      expect(result.rows[0]['Full Name']).toBe('Dr. Jane "The Boss" Doe');
      expect(result.rows[0]['Address, Line 1']).toBe('123 Main St, Apt 4');
      expect(result.rows[0]['Notes']).toBe('Hello, World!');
    });

    it('returns empty result for empty or whitespace-only input', () => {
      expect(service.parseCsv('')).toEqual({ headers: [], rows: [], totalRows: 0 });
      expect(service.parseCsv('   \n  \n  ')).toEqual({ headers: [], rows: [], totalRows: 0 });
    });
  });

  describe('Auto-Mapping Algorithm', () => {
    it('auto-maps fields with exact, normalized, and fuzzy similarity', () => {
      const fields = [
        { name: 'fullName', type: 'text' as const },
        { name: 'email', type: 'text' as const },
        { name: 'agreeTerms', type: 'checkbox' as const },
        { name: 'randomUnrelatedField', type: 'text' as const }
      ];

      const headers = ['Full Name', 'Email Address', 'Agree Terms', 'Invoice No'];
      const mappings = service.autoMapFields(fields, headers);

      const mapName = mappings.find(m => m.fieldName === 'fullName');
      expect(mapName?.isAutoMatched).toBe(true);
      expect(mapName?.csvColumn).toBe('Full Name');

      const mapEmail = mappings.find(m => m.fieldName === 'email');
      expect(mapEmail?.isAutoMatched).toBe(true);
      expect(mapEmail?.csvColumn).toBe('Email Address');

      const mapAgree = mappings.find(m => m.fieldName === 'agreeTerms');
      expect(mapAgree?.isAutoMatched).toBe(true);
      expect(mapAgree?.csvColumn).toBe('Agree Terms');

      const mapUnrelated = mappings.find(m => m.fieldName === 'randomUnrelatedField');
      expect(mapUnrelated?.isAutoMatched).toBe(false);
      expect(mapUnrelated?.csvColumn).toBeNull();
    });
  });

  describe('Tokenized File Naming', () => {
    it('replaces tokens, indices, and sanitizes filenames', () => {
      const row = { id: '101', name: 'John Doe/Special?' };
      const pattern = 'Cert_{id}_{name}_{index}.pdf';

      const fileName = service.generateTokenizedFileName(pattern, row, 0);
      expect(fileName).toBe('Cert_101_John Doe_Special_1.pdf');
    });

    it('ensures .pdf extension if omitted in pattern', () => {
      const row = { code: 'ABC' };
      const fileName = service.generateTokenizedFileName('file_{code}', row, 1);
      expect(fileName).toBe('file_ABC.pdf');
    });
  });

  describe('Batch Mail-Merge Execution', () => {
    it('generates 3 valid PDFs with correct field values from 3-row CSV', async () => {
      const template = await createTemplatePdf();
      const rows = [
        { 'Full Name': 'Alice Wonderland', 'Email': 'alice@wonder.com', 'Terms': 'yes' },
        { 'Full Name': 'Bob Builder', 'Email': 'bob@builder.com', 'Terms': 'no' },
        { 'Full Name': 'Charlie Chaplin', 'Email': 'charlie@silent.com', 'Terms': 'true' }
      ];

      const mappings = [
        { fieldName: 'fullName', fieldType: 'text' as const, csvColumn: 'Full Name', isAutoMatched: true, confidence: 1 },
        { fieldName: 'email', fieldType: 'text' as const, csvColumn: 'Email', isAutoMatched: true, confidence: 1 },
        { fieldName: 'agreeTerms', fieldType: 'checkbox' as const, csvColumn: 'Terms', isAutoMatched: true, confidence: 1 }
      ];

      const result = await service.executeMailMerge(template, rows, mappings, {
        namingPattern: 'Doc_{Full Name}.pdf',
        flatten: false,
        bundleAsZip: true
      });

      expect(result.totalRows).toBe(3);
      expect(result.successCount).toBe(3);
      expect(result.failedCount).toBe(0);
      expect(result.rowResults.length).toBe(3);

      // Verify each generated PDF has correct values
      for (let i = 0; i < 3; i++) {
        const item = result.rowResults[i];
        expect(item.status).toBe('success');
        expect(item.pdfBytes).toBeDefined();

        const reloaded = await PDFDocument.load(item.pdfBytes!);
        const form = reloaded.getForm();
        expect(form.getTextField('fullName').getText()).toBe(rows[i]['Full Name']);
        expect(form.getTextField('email').getText()).toBe(rows[i]['Email']);
        const isChecked = form.getCheckBox('agreeTerms').isChecked();
        expect(isChecked).toBe(rows[i]['Terms'] === 'yes' || rows[i]['Terms'] === 'true');
      }

      // Verify ZIP packaging contains all 3 files
      expect(result.zipBlob).toBeDefined();
      expect(result.zipFileName).toBe('mail_merge_bundle.zip');

      const zip = await JSZip.loadAsync(await result.zipBlob!.arrayBuffer());
      expect(zip.file('Doc_Alice Wonderland.pdf')).not.toBeNull();
      expect(zip.file('Doc_Bob Builder.pdf')).not.toBeNull();
      expect(zip.file('Doc_Charlie Chaplin.pdf')).not.toBeNull();
    });

    it('flattens form fields when flatten: true', async () => {
      const template = await createTemplatePdf();
      const rows = [{ 'Full Name': 'Flattened User', 'Email': 'flat@user.com' }];
      const mappings = [
        { fieldName: 'fullName', fieldType: 'text' as const, csvColumn: 'Full Name', isAutoMatched: true, confidence: 1 }
      ];

      const result = await service.executeMailMerge(template, rows, mappings, {
        namingPattern: 'Flat.pdf',
        flatten: true,
        bundleAsZip: false
      });

      expect(result.successCount).toBe(1);
      const reloaded = await PDFDocument.load(result.rowResults[0].pdfBytes!);
      const form = reloaded.getForm();
      // When flattened, getFields() returns 0 fields
      expect(form.getFields().length).toBe(0);
    });

    it('stops processing and marks remaining as skipped when quota limit is reached', async () => {
      mockStorageService.getQuotaStatus.mockResolvedValue({
        remaining: 2, // Only 2 remaining free operations
        isUnlimited: false,
        limit: 5,
        canStart: true
      });

      const template = await createTemplatePdf();
      const rows = [
        { 'Name': 'One' },
        { 'Name': 'Two' },
        { 'Name': 'Three' }
      ];
      const mappings = [
        { fieldName: 'fullName', fieldType: 'text' as const, csvColumn: 'Name', isAutoMatched: true, confidence: 1 }
      ];

      const result = await service.executeMailMerge(template, rows, mappings, {
        namingPattern: '{Name}.pdf',
        flatten: false,
        bundleAsZip: false
      });

      expect(result.totalRows).toBe(3);
      expect(result.successCount).toBe(2);
      expect(result.skippedCount).toBe(1);
      expect(result.rowResults[2].status).toBe('skipped');
      expect(result.rowResults[2].error).toContain('Daily free quota limit reached');
    });

    it('supports cancellation via AbortSignal', async () => {
      const template = await createTemplatePdf();
      const rows = [{ 'Name': 'One' }, { 'Name': 'Two' }];
      const controller = new AbortController();
      controller.abort(); // Cancel upfront

      const mappings = [
        { fieldName: 'fullName', fieldType: 'text' as const, csvColumn: 'Name', isAutoMatched: true, confidence: 1 }
      ];

      const result = await service.executeMailMerge(template, rows, mappings, {
        namingPattern: '{Name}.pdf',
        flatten: false,
        bundleAsZip: false,
        abortSignal: controller.signal
      });

      expect(result.skippedCount).toBe(2);
      expect(result.successCount).toBe(0);
      expect(result.rowResults[0].error).toContain('cancelled by user');
    });

    it('populates regional scripts (Hindi, Bengali) into PDF fields without WinAnsi errors', async () => {
      const template = await createTemplatePdf();
      const rows = [
        { 'Name': 'राहुल शर्मा (Hindi)', 'Email': 'rahul@bharat.in', 'Terms': 'true' },
        { 'Name': 'অভিজিৎ চৌধুরী (Bengali)', 'Email': 'abhijeet@bangla.in', 'Terms': 'yes' }
      ];

      const mappings = [
        { fieldName: 'fullName', fieldType: 'text' as const, csvColumn: 'Name', isAutoMatched: true, confidence: 1 },
        { fieldName: 'email', fieldType: 'text' as const, csvColumn: 'Email', isAutoMatched: true, confidence: 1 },
        { fieldName: 'agreeTerms', fieldType: 'checkbox' as const, csvColumn: 'Terms', isAutoMatched: true, confidence: 1 }
      ];

      const result = await service.executeMailMerge(template, rows, mappings, {
        namingPattern: 'Doc_{index}.pdf',
        flatten: false,
        bundleAsZip: true
      });

      expect(result.successCount).toBe(2);
      expect(result.failedCount).toBe(0);

      const reloadedHindi = await PDFDocument.load(result.rowResults[0].pdfBytes!);
      expect(reloadedHindi.getForm().getTextField('fullName').getText()).toBe('राहुल शर्मा (Hindi)');

      const reloadedBengali = await PDFDocument.load(result.rowResults[1].pdfBytes!);
      expect(reloadedBengali.getForm().getTextField('fullName').getText()).toBe('অভিজিৎ চৌধুরী (Bengali)');
    });

    it('processes a 100-row batch CSV with progress tracking and memory stability', async () => {
      mockStorageService.getQuotaStatus.mockResolvedValue({
        remaining: 200,
        isUnlimited: true,
        limit: 200,
        canStart: true
      });

      const template = await createTemplatePdf();
      const rows: Record<string, string>[] = [];
      for (let i = 1; i <= 100; i++) {
        rows.push({
          'ID': String(i),
          'Full Name': `User Number ${i}`,
          'Email': `user_${i}@corp.com`
        });
      }

      const mappings = [
        { fieldName: 'fullName', fieldType: 'text' as const, csvColumn: 'Full Name', isAutoMatched: true, confidence: 1 },
        { fieldName: 'email', fieldType: 'text' as const, csvColumn: 'Email', isAutoMatched: true, confidence: 1 }
      ];

      let lastReported = 0;
      const result = await service.executeMailMerge(template, rows, mappings, {
        namingPattern: 'Cert_{ID}.pdf',
        flatten: true,
        bundleAsZip: true,
        onProgress: (p) => {
          lastReported = p.current;
        }
      });

      expect(result.totalRows).toBe(100);
      expect(result.successCount).toBe(100);
      expect(result.failedCount).toBe(0);
      expect(lastReported).toBe(100);
      expect(result.zipBlob).toBeDefined();
    });

    it('gracefully handles missing/empty cells without crashing or column shifting', async () => {
      const template = await createTemplatePdf();
      const rows = [
        { 'Full Name': 'Only Name', 'Email': '' }, // Missing email
        { 'Full Name': '', 'Email': 'only_email@test.com' } // Missing name
      ];

      const mappings = [
        { fieldName: 'fullName', fieldType: 'text' as const, csvColumn: 'Full Name', isAutoMatched: true, confidence: 1 },
        { fieldName: 'email', fieldType: 'text' as const, csvColumn: 'Email', isAutoMatched: true, confidence: 1 }
      ];

      const result = await service.executeMailMerge(template, rows, mappings, {
        namingPattern: 'Doc_{index}.pdf',
        flatten: false,
        bundleAsZip: false
      });

      expect(result.successCount).toBe(2);
      const doc1 = await PDFDocument.load(result.rowResults[0].pdfBytes!);
      expect(doc1.getForm().getTextField('fullName').getText()).toBe('Only Name');
      expect(doc1.getForm().getTextField('email').getText() || '').toBe('');
    });
  });

  describe('Cybersecurity Stress-Testing', () => {
    it('blocks Zip Slip and Directory Traversal attacks via tokenized file patterns', async () => {
      const row = { id: '../../../../etc/shadow', name: '..\\..\\windows\\system32' };

      const pattern1 = 'User_{id}.pdf';
      const fileName1 = service.generateTokenizedFileName(pattern1, row, 0);
      expect(fileName1).not.toContain('..');
      expect(fileName1).not.toContain('/');
      expect(fileName1).toBe('User_etc_shadow.pdf');

      const pattern2 = '..\\..\\{name}.pdf';
      const fileName2 = service.generateTokenizedFileName(pattern2, row, 1);
      expect(fileName2).not.toContain('..');
      expect(fileName2).not.toContain('\\');
    });

    it('rejects massive CSV files exceeding 5,000 rows to prevent heap exhaustion / DoS', () => {
      let hugeCsv = 'Name,Email\n';
      for (let i = 0; i < 5005; i++) {
        hugeCsv += `User ${i},user${i}@test.com\n`;
      }

      expect(() => service.parseCsv(hugeCsv)).toThrow('exceeds maximum allowed batch size');
    });

    it('rejects oversized CSV files exceeding 10MB text size ceiling', () => {
      const oversizedText = 'A'.repeat(10 * 1024 * 1024 + 10);
      expect(() => service.parseCsv(oversizedText)).toThrow('exceeds maximum allowed size');
    });

    it('safely handles CSV formula injection tokens as literal strings in form fields', async () => {
      const template = await createTemplatePdf();
      const rows = [
        { 'Name': "=cmd|' /C calc'!A0", 'Email': '@SUM(A1:B10)' }
      ];

      const mappings = [
        { fieldName: 'fullName', fieldType: 'text' as const, csvColumn: 'Name', isAutoMatched: true, confidence: 1 },
        { fieldName: 'email', fieldType: 'text' as const, csvColumn: 'Email', isAutoMatched: true, confidence: 1 }
      ];

      const result = await service.executeMailMerge(template, rows, mappings, {
        namingPattern: 'Safe.pdf',
        flatten: false,
        bundleAsZip: false
      });

      expect(result.successCount).toBe(1);
      const reloaded = await PDFDocument.load(result.rowResults[0].pdfBytes!);
      expect(reloaded.getForm().getTextField('fullName').getText()).toBe("=cmd|' /C calc'!A0");
    });
  });
});
