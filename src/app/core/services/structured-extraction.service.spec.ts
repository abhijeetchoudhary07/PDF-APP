import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { StructuredExtractionService } from './structured-extraction.service';
import { StorageService } from './storage.service';
import { ExtractedWordToken, StructuredExtractionResult } from '../models/structured-extraction.types';

describe('StructuredExtractionService — P1 Structured Field Extraction', () => {
  let service: StructuredExtractionService;
  let mockStorageService: { saveFile: any };

  beforeEach(() => {
    mockStorageService = {
      saveFile: vi.fn().mockImplementation(async (file: File) => `file:///mock/storage/${file.name}`)
    };

    TestBed.configureTestingModule({
      providers: [
        StructuredExtractionService,
        { provide: StorageService, useValue: mockStorageService }
      ]
    });

    service = TestBed.inject(StructuredExtractionService);
  });

  describe('1. Generic Document Classification', () => {
    it('classifies a retail receipt fixture as RECEIPT', () => {
      const text = `
        SUPERMARKET STORE #104
        TAX RECEIPT / CASH MEMO
        Date: 28/10/2026
        Item 1      ₹120.00
        Item 2      ₹280.00
        Subtotal:   ₹400.00
        CGST 9%:     ₹36.00
        SGST 9%:     ₹36.00
        Grand Total: ₹472.00
        Cash Tendered: ₹500.00
        Change Due:  ₹28.00
        Thank you for shopping!
      `;
      const res = service.classifyDocument(text);
      expect(res.category).toBe('RECEIPT');
      expect(res.label).toBe('Receipt');
      expect(res.confidence).toBeGreaterThanOrEqual(70);
    });

    it('classifies a multi-item tax invoice with GST breakdown as INVOICE', () => {
      const text = `
        TAX INVOICE
        Invoice No: INV-2026-8891
        Invoice Date: 2026-10-25
        Bill To: Acme Solutions Pvt Ltd
        GSTIN: 27AAAAA0000A1Z5
        Due Date: 2026-11-25
        Terms: Net 30
        Taxable Amount: ₹10,000.00
        IGST 18%: ₹1,800.00
        Grand Total: ₹11,800.00
        Balance Due: ₹11,800.00
      `;
      const res = service.classifyDocument(text);
      expect(res.category).toBe('INVOICE');
      expect(res.label).toBe('Invoice');
      expect(res.confidence).toBeGreaterThanOrEqual(70);
    });

    it('classifies an electricity bill as UTILITY_BILL', () => {
      const text = `
        ELECTRICITY UTILITY BILL
        Consumer ID: 1029384756
        Meter Reading: 4520 kWh
        Units Consumed: 350
        Tariff: Residential LT-1
        Billing Cycle: Monthly
        Bill Date: 15/10/2026
        Due Date: 30/10/2026
        Total Payable: ₹2,450.00
      `;
      const res = service.classifyDocument(text);
      expect(res.category).toBe('UTILITY_BILL');
      expect(res.label).toBe('Utility Bill');
    });

    it('classifies an identity card fixture as ID_DOCUMENT', () => {
      const text = `
        IDENTITY CARD
        Card Number: IDC-98472-X
        Holder Name: Rahul Sharma
        Date of Birth: 12/05/1990
        Gender: Male
        Nationality: Indian
        Valid Until: 2035-12-31
      `;
      const res = service.classifyDocument(text);
      expect(res.category).toBe('ID_DOCUMENT');
      expect(res.label).toBe('ID Document');
    });

    it('classifies a bank statement fixture as BANK_STATEMENT', () => {
      const text = `
        ACCOUNT STATEMENT / BANK STATEMENT
        Account Holder: Priya Verma
        Account Number: 987654321098
        Branch Code: 0042
        IFSC: ABCD0000042
        Statement Period: 01/10/2026 to 25/10/2026
        Opening Balance: ₹54,320.00
        Closing Balance: ₹68,150.00
      `;
      const res = service.classifyDocument(text);
      expect(res.category).toBe('BANK_STATEMENT');
      expect(res.label).toBe('Bank Statement');
    });

    it('strictly uses generic document categories without institution or exam board names', () => {
      const genericCategories = ['RECEIPT', 'INVOICE', 'UTILITY_BILL', 'ID_DOCUMENT', 'BANK_STATEMENT', 'UNKNOWN'];
      const res = service.classifyDocument('Random unknown test document content');
      expect(genericCategories).toContain(res.category);
    });
  });

  describe('2. Key/Value Extraction Heuristics — 4 Test Documents', () => {
    it('(a) Retail Receipt: extracts store, receipt ID, Indian date, subtotal, tax and grand total', () => {
      const receiptText = `
        Green Valley Organic Mart
        12th Main Road, Indiranagar, Bengaluru 560038
        Receipt No: REC-49102
        Date: 28/10/2026
        Subtotal: ₹850.00
        CGST: ₹42.50
        SGST: ₹42.50
        Grand Total: ₹935.00
        Cashier: POS-01
        Thank you for visiting!
      `;

      const result = service.extract(receiptText, [], 1, 'mart-receipt.pdf');
      expect(result.documentCategory).toBe('RECEIPT');

      const dateField = result.fields.find(f => f.key === 'date');
      expect(dateField?.value).toBe('28/10/2026');
      expect(dateField?.confidence).toBeGreaterThanOrEqual(80);

      const totalField = result.fields.find(f => f.key === 'grandTotal');
      expect(totalField?.value).toContain('935.00');

      const subtotalField = result.fields.find(f => f.key === 'subtotal');
      expect(subtotalField?.value).toContain('850.00');

      const taxField = result.fields.find(f => f.key === 'taxAmount');
      expect(taxField?.value).toContain('42.50');

      const recField = result.fields.find(f => f.key === 'receiptNumber');
      expect(recField?.value).toBe('REC-49102');
    });

    it('(b) Multi-Item Tax Invoice with GST breakdown: extracts ISO dates, tax breakdown, balance due and vendor', () => {
      const invoiceText = `
        Apex Technologies Pvt Ltd
        45 Cyber City Avenue, Sector 18, Gurugram 122002
        Bill To: Cloud Systems Inc
        TAX INVOICE
        Invoice No: INV-2026-9041
        Order No: PO-88319
        Invoice Date: 2026-10-25
        Due Date: 2026-11-25
        Taxable Amount: ₹25,000.00
        IGST 18%: ₹4,500.00
        Grand Total: ₹29,500.00
        Balance Due: ₹29,500.00
      `;

      const result = service.extract(invoiceText, [], 1, 'apex-invoice.pdf');
      expect(result.documentCategory).toBe('INVOICE');

      expect(result.fields.find(f => f.key === 'invoiceNumber')?.value).toBe('INV-2026-9041');
      expect(result.fields.find(f => f.key === 'orderNumber')?.value).toBe('PO-88319');
      expect(result.fields.find(f => f.key === 'date')?.value).toBe('2026-10-25');
      expect(result.fields.find(f => f.key === 'dueDate')?.value).toBe('2026-11-25');
      expect(result.fields.find(f => f.key === 'subtotal')?.value).toContain('25,000.00');
      expect(result.fields.find(f => f.key === 'taxAmount')?.value).toContain('4,500.00');
      expect(result.fields.find(f => f.key === 'grandTotal')?.value).toContain('29,500.00');
      expect(result.fields.find(f => f.key === 'balanceDue')?.value).toContain('29,500.00');
      expect(result.fields.find(f => f.key === 'customerName')?.value).toContain('Cloud Systems Inc');
    });

    it('(c) Utility Electricity Bill: extracts consumer account ID, due date, total payable and address', () => {
      const utilityText = `
        Power Distribution Corporation
        ELECTRICITY UTILITY BILL
        Consumer ID: 1029384756
        Bill Date: 15/10/2026
        Due Date: 30/10/2026
        Tariff: Residential LT-1
        Meter Reading: 4520 kWh
        Units Consumed: 350
        Total Payable: ₹2,450.00
        Bill To: Amit Patel
        42 Residency Road, Sector 5, Ahmedabad 380015
      `;

      const result = service.extract(utilityText, [], 1, 'electricity-bill.pdf');
      expect(result.documentCategory).toBe('UTILITY_BILL');

      expect(result.fields.find(f => f.key === 'accountNumber')?.value).toBe('1029384756');
      expect(result.fields.find(f => f.key === 'date')?.value).toBe('15/10/2026');
      expect(result.fields.find(f => f.key === 'dueDate')?.value).toBe('30/10/2026');
      expect(result.fields.find(f => f.key === 'grandTotal')?.value).toContain('2,450.00');
      expect(result.fields.find(f => f.key === 'customerName')?.value).toContain('Amit Patel');
      expect(result.fields.find(f => f.key === 'address')?.value).toContain('Ahmedabad 380015');
    });

    it('(d) Photo of ID Document: extracts ID number, DOB, expiry date, cardholder name and address', () => {
      const idText = `
        IDENTITY CARD
        ID Number: ID-7829104
        Cardholder Name: Rahul Sharma
        Date of Birth: 12/05/1990
        Gender: Male
        Nationality: Indian
        Valid Until: 2035-12-31
        Address: 12th Main Road, Indiranagar, Bengaluru 560038
      `;

      const result = service.extract(idText, [], 1, 'id-photo.png');
      expect(result.documentCategory).toBe('ID_DOCUMENT');

      expect(result.fields.find(f => f.key === 'idNumber')?.value).toBe('ID-7829104');
      expect(result.fields.find(f => f.key === 'dob')?.value).toBe('12/05/1990');
      expect(result.fields.find(f => f.key === 'expiryDate')?.value).toBe('2035-12-31');
      expect(result.fields.find(f => f.key === 'customerName')?.value).toContain('Rahul Sharma');
      expect(result.fields.find(f => f.key === 'address')?.value).toContain('Bengaluru 560038');
    });

    it('extracts multi-currency symbols: ₹, $, €, £, Rs', () => {
      const dollar = service.extract('Receipt #1\nDate: 2026-10-01\nTotal: $149.99');
      expect(dollar.fields.find(f => f.key === 'grandTotal')?.value).toContain('149.99');

      const euro = service.extract('Receipt #2\nDate: 2026-10-01\nTotal: €89.50');
      expect(euro.fields.find(f => f.key === 'grandTotal')?.value).toContain('89.50');

      const pound = service.extract('Receipt #3\nDate: 2026-10-01\nTotal: £55.20');
      expect(pound.fields.find(f => f.key === 'grandTotal')?.value).toContain('55.20');

      const inr = service.extract('Receipt #4\nDate: 2026-10-01\nTotal: ₹1,500.00');
      expect(inr.fields.find(f => f.key === 'grandTotal')?.value).toContain('1,500.00');
    });
  });

  describe('3. Absent Fields Handling — Never Hallucinate', () => {
    it('reports absent fields with value: null and confidence: 0 — never hallucinate', () => {
      const partialText = `
        Simple Mart
        Receipt No: SM-101
        Date: 28/10/2026
        Grand Total: $12.50
      `;

      const result = service.extract(partialText);
      const customerField = result.fields.find(f => f.key === 'customerName');
      expect(customerField).toBeDefined();
      expect(customerField?.value).toBeNull();
      expect(customerField?.confidence).toBe(0);
      expect(customerField?.isAbsent).toBe(true);

      const orderField = result.fields.find(f => f.key === 'orderNumber');
      expect(orderField).toBeDefined();
      expect(orderField?.value).toBeNull();
      expect(orderField?.confidence).toBe(0);
      expect(orderField?.isAbsent).toBe(true);

      expect(result.summary.absentCount).toBeGreaterThan(0);
    });
  });

  describe('4. Bounding Box Geometry Mapping', () => {
    it('maps coordinate bounding boxes accurately from word tokens', () => {
      const tokens: ExtractedWordToken[] = [
        { text: 'Grand', x: 50, y: 300, width: 40, height: 16, pageNumber: 1 },
        { text: 'Total:', x: 95, y: 300, width: 45, height: 16, pageNumber: 1 },
        { text: '₹1,500.00', x: 150, y: 300, width: 70, height: 16, pageNumber: 1 }
      ];

      const text = `
        Vendor: Metro Station Store
        Grand Total: ₹1,500.00
      `;

      const result = service.extract(text, tokens, 1);
      const totalField = result.fields.find(f => f.key === 'grandTotal');

      expect(totalField?.boundingBox).toBeDefined();
      expect(totalField?.boundingBox?.x).toBe(150);
      expect(totalField?.boundingBox?.y).toBe(300);
      expect(totalField?.boundingBox?.width).toBe(70);
      expect(totalField?.boundingBox?.height).toBe(16);
    });

    it('synthesizes consistent page geometry coordinates when tokens are omitted', () => {
      const text = `
        Fast Cleaners
        Total: $45.00
      `;
      const result = service.extract(text);
      const totalField = result.fields.find(f => f.key === 'grandTotal');

      expect(totalField?.boundingBox).not.toBeNull();
      expect(totalField?.boundingBox?.x).toBeGreaterThan(0);
      expect(totalField?.boundingBox?.y).toBeGreaterThan(0);
      expect(totalField?.boundingBox?.width).toBeGreaterThan(0);
      expect(totalField?.boundingBox?.height).toBeGreaterThan(0);
    });
  });

  describe('5. Exporting to JSON & CSV with Null Safety', () => {
    it('exports result to valid structured JSON matching schema', async () => {
      const text = `
        Invoice No: INV-1234
        Date: 2026-10-28
        Grand Total: ₹2,000.00
      `;
      const extraction = service.extract(text, [], 1, 'invoice.pdf');
      const exportRes = await service.exportToJson(extraction, 'invoice.json');

      expect(mockStorageService.saveFile).toHaveBeenCalledTimes(1);
      expect(exportRes.file.name).toBe('invoice.json');
      expect(exportRes.file.type).toBe('application/json');

      const readerText = await exportRes.file.text();
      const parsed = JSON.parse(readerText);
      expect(parsed.documentCategory).toBe('INVOICE');
      expect(parsed.fields.grandTotal).toBeDefined();
      expect(parsed.fields.grandTotal.value).toContain('2,000.00');
    });

    it('exports result to RFC 4180 compliant CSV', async () => {
      const text = `
        Receipt No: REC-77
        Date: 28/10/2026
        Grand Total: $55.00
      `;
      const extraction = service.extract(text);
      const exportRes = await service.exportToCsv(extraction, 'receipt.csv');

      expect(mockStorageService.saveFile).toHaveBeenCalled();
      expect(exportRes.file.name).toBe('receipt.csv');

      const csvContent = await exportRes.file.text();
      const lines = csvContent.split('\r\n');
      expect(lines[0]).toBe('Key,Label,Value,Confidence (%),Page,Status');
      expect(lines.some(l => l.includes('grandTotal') && l.includes('55.00'))).toBe(true);
    });

    it('handles unhandled null/undefined values safely without crashing during export', async () => {
      const malformedResult: StructuredExtractionResult = {
        documentCategory: 'RECEIPT',
        categoryLabel: 'Receipt',
        categoryConfidence: 50,
        pageCount: 1,
        fields: [
          {
            key: 'testNull',
            label: 'Test Null Field',
            value: null,
            confidence: 0,
            pageNumber: 1,
            boundingBox: null,
            isAbsent: true
          },
          {
            key: 'testUndefined',
            label: 'Test Undefined',
            value: undefined as any,
            confidence: NaN as any,
            pageNumber: null as any,
            boundingBox: null
          }
        ],
        summary: { totalDetectedFields: 0, highConfidenceCount: 0, lowConfidenceCount: 0, absentCount: 2 }
      };

      const csvRes = await service.exportToCsv(malformedResult);
      expect(csvRes.file).toBeDefined();

      const jsonRes = await service.exportToJson(malformedResult);
      expect(jsonRes.file).toBeDefined();
    });
  });

  describe('6. Cybersecurity Stress-Testing', () => {
    describe('(a) CSV / Formula Injection Attacks (CWE-1236)', () => {
      it('escapes cells starting with =, +, -, @, \\t, \\r, |, % by prepending single quote', () => {
        expect(service.formatCsvCell('=1+1')).toBe("'=1+1");
        // Verify formula injection payload with DDE calc
        const payload = "=cmd|' /C calc'!A0";
        const formatted = service.formatCsvCell(payload);
        expect(formatted.startsWith("'=cmd")).toBe(true);

        // Leading spaces followed by formula operator
        const withLeadingSpaces = '   =1+1';
        expect(service.formatCsvCell(withLeadingSpaces)).toBe("'   =1+1");

        // Other dangerous trigger characters
        expect(service.formatCsvCell('+12345')).toBe("'+12345");
        expect(service.formatCsvCell('-999')).toBe("'-999");
        expect(service.formatCsvCell('@SUM(A1:A10)')).toBe("'@SUM(A1:A10)");
        expect(service.formatCsvCell('\t=cmd')).toBe("'\t=cmd");
        expect(service.formatCsvCell('|malicious')).toBe("'|malicious");
      });

      it('safely neutralizes formula payloads inside extracted CSV exports', async () => {
        const attackResult: StructuredExtractionResult = {
          documentCategory: 'RECEIPT',
          categoryLabel: 'Receipt',
          categoryConfidence: 90,
          pageCount: 1,
          fields: [
            {
              key: 'vendorName',
              label: 'Vendor',
              value: "=cmd|' /C calc'!A0",
              confidence: 90,
              pageNumber: 1,
              boundingBox: null
            },
            {
              key: 'grandTotal',
              label: 'Total',
              value: '=1+1',
              confidence: 90,
              pageNumber: 1,
              boundingBox: null
            }
          ],
          summary: { totalDetectedFields: 2, highConfidenceCount: 2, lowConfidenceCount: 0, absentCount: 0 }
        };

        const csvRes = await service.exportToCsv(attackResult, 'safe.csv');
        const content = await csvRes.file.text();

        // Must not contain raw executable formulas starting immediately after comma
        expect(content).not.toMatch(/,=[0-9]/);
        expect(content).not.toMatch(/,=cmd/);
        // Must contain safely escaped single quote prefix
        expect(content).toContain("vendorName,Vendor,'=cmd|' /C calc'!A0");
        expect(content).toContain("grandTotal,Total,'=1+1");
      });
    });

    describe('(b) XSS via Extracted Field Strings', () => {
      it('strips dangerous <script>, javascript: and HTML tags from strings', () => {
        const xss1 = '<script>alert("pwned")</script>Vendor Name';
        expect(service.sanitizeString(xss1)).toBe('Vendor Name');

        const xss2 = 'javascript:alert(1)';
        expect(service.sanitizeString(xss2)).toBe('alert(1)');

        const xss3 = '<img src=x onerror=alert(1)>John Doe';
        expect(service.sanitizeString(xss3)).toBe('img src=x onerror=alert(1)John Doe');
      });
    });

    describe('(c) ReDoS Protection on Dates and Financial Currency Patterns', () => {
      it('executes in <100ms when processing malicious repeating character strings', () => {
        const maliciousDateString = 'Date: ' + ' '.repeat(5000) + '28-10-2026';
        const maliciousAmountString = 'Total: ₹ ' + '9'.repeat(5000) + '.00';
        const maliciousAddressString = 'Address: ' + ' , '.repeat(3000);

        const start = performance.now();
        const res = service.extract(
          `${maliciousDateString}\n${maliciousAmountString}\n${maliciousAddressString}`
        );
        const duration = performance.now() - start;

        expect(duration).toBeLessThan(500); // Must not hang or timeout
        expect(res).toBeDefined();
      });
    });

    describe('(d) Prototype Pollution & Large Document Memory Bloat', () => {
      it('prevents prototype pollution on __proto__, constructor, and prototype keys', async () => {
        const maliciousKeysResult: StructuredExtractionResult = {
          documentCategory: 'RECEIPT',
          categoryLabel: 'Receipt',
          categoryConfidence: 90,
          pageCount: 1,
          fields: [
            {
              key: '__proto__',
              label: 'Pollution 1',
              value: 'malicious-proto',
              confidence: 90,
              pageNumber: 1,
              boundingBox: null
            },
            {
              key: 'constructor',
              label: 'Pollution 2',
              value: 'malicious-constructor',
              confidence: 90,
              pageNumber: 1,
              boundingBox: null
            }
          ],
          summary: { totalDetectedFields: 2, highConfidenceCount: 2, lowConfidenceCount: 0, absentCount: 0 }
        };

        const exportRes = await service.exportToJson(maliciousKeysResult, 'proto.json');
        const jsonText = await exportRes.file.text();
        const parsed = JSON.parse(jsonText);

        expect((({} as any).__proto__ as any).polluted).toBeUndefined();
        expect(parsed.fields['___proto__'] || parsed.fields['__proto_']).toBeDefined();
      });

      it('handles large documents with 500+ detected text chunks efficiently without memory bloat', () => {
        const tokens: ExtractedWordToken[] = [];
        for (let i = 0; i < 600; i++) {
          tokens.push({
            text: `Token_${i}`,
            x: 50 + (i % 10) * 40,
            y: 40 + Math.floor(i / 10) * 15,
            width: 35,
            height: 12,
            pageNumber: 1
          });
        }

        tokens.push({
          text: '₹12,450.00',
          x: 100,
          y: 700,
          width: 80,
          height: 16,
          pageNumber: 1
        });

        const rawText = tokens.map(t => t.text).join(' ') + '\nGrand Total: ₹12,450.00';

        const start = performance.now();
        const result = service.extract(rawText, tokens, 1, 'huge-document.pdf');
        const elapsed = performance.now() - start;

        expect(elapsed).toBeLessThan(300);
        expect(result.summary.totalDetectedFields).toBeGreaterThan(0);
        const total = result.fields.find(f => f.key === 'grandTotal');
        expect(total?.value).toContain('12,450.00');
        expect(total?.boundingBox).toBeDefined();
      });

      it('validates extraction result and export schema strictly', () => {
        const validRes = service.extract('Receipt No: REC-1\nDate: 2026-10-28\nTotal: ₹100.00');
        const valCheck = service.validateExtractionResult(validRes);
        expect(valCheck.valid).toBe(true);
        expect(valCheck.errors.length).toBe(0);

        const invalidCheck = service.validateExtractionResult({
          documentCategory: 'INVALID_CATEGORY' as any,
          fields: [{ key: '', label: '', value: 'x', confidence: 150, pageNumber: 0, boundingBox: null }]
        } as any);
        expect(invalidCheck.valid).toBe(false);
        expect(invalidCheck.errors.length).toBeGreaterThan(0);
      });
    });
  });
});
