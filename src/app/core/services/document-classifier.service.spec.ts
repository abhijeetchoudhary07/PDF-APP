import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentClassifierService, STOP_WORDS } from './document-classifier.service';
import { StorageService } from './storage.service';
import { HistoryService } from './history.service';
import { DocumentOrganizationProposal } from '../models/document-classifier.types';

describe('DocumentClassifierService (P5 — Auto-Tagging, Classification & Rename)', () => {
  let service: DocumentClassifierService;
  let mockStorageService: { saveFile: ReturnType<typeof vi.fn> };
  let mockHistoryService: { getHistory: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockStorageService = {
      saveFile: vi.fn().mockResolvedValue('file:///documents/renamed.pdf')
    };
    mockHistoryService = {
      getHistory: vi.fn().mockResolvedValue([])
    };

    TestBed.configureTestingModule({
      providers: [
        DocumentClassifierService,
        { provide: StorageService, useValue: mockStorageService },
        { provide: HistoryService, useValue: mockHistoryService }
      ]
    });

    service = TestBed.inject(DocumentClassifierService);
  });

  describe('Document Classification across all generic categories', () => {
    it('should classify Receipt fixtures accurately', () => {
      const text = `
        CASH RECEIPT
        Store #402 POS Terminal 3
        Cashier: Alex
        Items Purchased:
        Organic Milk $4.50
        Bread $2.50
        Subtotal: $7.00
        Total Tendered: $10.00
        Change Due: $3.00
        Card TXT Merchant Copy
        Thank you for shopping!
      `;
      const result = service.classifyDocument(text, { pageCount: 1 });
      expect(result.category).toBe('Receipt');
      expect(result.confidence).toBeGreaterThanOrEqual(75);
      expect(result.matchedSignals.some(s => s.toLowerCase().includes('receipt'))).toBe(true);
    });

    it('should classify Invoice fixtures accurately', () => {
      const text = `
        TAX INVOICE
        Invoice No: INV-2026-9921
        Invoice Date: 2026-10-24
        Due Date: 2026-11-24
        PO #: PO-88319
        Bill To: Acme Technologies Ltd
        GSTIN: 27AAAAA0000A1Z5
        Payment Terms: Net 30
        Total Amount Due: $15,400.00
        Remit To: Solutions Inc
      `;
      const result = service.classifyDocument(text);
      expect(result.category).toBe('Invoice');
      expect(result.confidence).toBeGreaterThanOrEqual(75);
    });

    it('should classify Utility Bill fixtures accurately', () => {
      const text = `
        ELECTRICITY BILL
        Power Distribution Corp
        Utility Bill for Billing Cycle: October 2026
        Consumer Number: 84920194
        Meter Reading:
        Previous Reading: 1200 kWh
        Current Reading: 1540 kWh
        Units Consumed: 340 kWh
        Tariff: Domestic
        Disconnection Date: 15 Nov 2026
        Total Amount Due: INR 3,450
      `;
      const result = service.classifyDocument(text);
      expect(result.category).toBe('Utility Bill');
      expect(result.confidence).toBeGreaterThanOrEqual(80);
    });

    it('should classify ID Document fixtures accurately', () => {
      const text = `
        NATIONAL IDENTITY CARD
        Identification Document
        Holder Name: Rahul Sharma
        Card Number: ID-9948-2819-001
        Date of Birth: 15/08/1995
        Gender: Male
        Nationality: Indian
        Blood Group: O+
        Valid Until: 2035-12-31
      `;
      const result = service.classifyDocument(text, { pageCount: 1 });
      expect(result.category).toBe('ID Document');
      expect(result.confidence).toBeGreaterThanOrEqual(80);
    });

    it('should classify Certificate fixtures accurately', () => {
      const text = `
        CERTIFICATE OF ACHIEVEMENT
        This is to certify that
        Priya Patel
        has successfully fulfilled all criteria for completion of
        Full Stack Web Engineering.
        Awarded to Priya Patel on 28th October 2026.
        Conferred upon by the Board of Directors.
        In Witness Whereof, Authorized Signatory.
      `;
      const result = service.classifyDocument(text, { pageCount: 1 });
      expect(result.category).toBe('Certificate');
      expect(result.confidence).toBeGreaterThanOrEqual(80);
    });

    it('should classify Official Letter fixtures accurately', () => {
      const text = `
        To Whom It May Concern:
        Dear Sir / Madam,
        Subject: Formal Request for Document Verification
        Office Memo Ref: HR/2026/091
        We are writing to provide official notice regarding employment records.
        Yours Faithfully,
        Director of Personnel
      `;
      const result = service.classifyDocument(text);
      expect(result.category).toBe('Official Letter');
      expect(result.confidence).toBeGreaterThanOrEqual(70);
    });

    it('should classify Financial Statement fixtures accurately', () => {
      const text = `
        ACCOUNT STATEMENT / BANK STATEMENT
        Financial Statement Period: 01 Oct 2026 to 28 Oct 2026
        Account Number: 009281729381
        Opening Balance: $12,450.00
        Total Debit: $4,200.00
        Total Credit: $8,900.00
        Closing Balance: $17,150.00
        Transaction History & Ledger Entries
      `;
      const result = service.classifyDocument(text);
      expect(result.category).toBe('Financial Statement');
      expect(result.confidence).toBeGreaterThanOrEqual(80);
    });

    it('should classify Notes fixtures accurately', () => {
      const text = `
        MEETING NOTES & AGENDA
        Minutes of Meeting - Sprint Planning Q4
        Attendees: John, Sarah, Kevin
        Key Takeaways:
        - Refactor offline storage architecture
        Action Items:
        - Sarah to review PR by Friday
        - Kevin to update API contracts
        Summary notes and brainstorming discussion points.
      `;
      const result = service.classifyDocument(text);
      expect(result.category).toBe('Notes');
      expect(result.confidence).toBeGreaterThanOrEqual(75);
    });

    it('should classify Contract fixtures accurately', () => {
      const text = `
        NON-DISCLOSURE AGREEMENT
        This Agreement is entered into by and between the parties:
        Party of the First Part (Disclosing Party) and Party of the Second Part (Receiving Party).
        Whereas the parties wish to exchange confidential information;
        Now Therefore, the parties hereby agree as follows:
        Terms and Conditions:
        1. Confidentiality obligations.
        2. Governing law: State of New York.
        3. Severability and Indemnification clauses.
        In Witness Whereof, the parties have executed this Contract.
      `;
      const result = service.classifyDocument(text, { pageCount: 5 });
      expect(result.category).toBe('Contract');
      expect(result.confidence).toBeGreaterThanOrEqual(85);
    });

    it('should return Other for unrecognized ambiguous documents', () => {
      const text = 'Random gibberish lorem ipsum dolor sit amet.';
      const result = service.classifyDocument(text);
      expect(result.category).toBe('Other');
      expect(result.confidence).toBeLessThan(30);
    });
  });

  describe('Filename Sanitizer', () => {
    it('should strip all filesystem-unsafe characters (/, \\, :, *, ?, ", <, >, |)', () => {
      const raw = 'Invoice/2026:Acme*Corp?_Due<Now>|.pdf';
      const sanitized = service.sanitizeFilename(raw);
      expect(sanitized).toBe('Invoice_2026_Acme_Corp_Due_Now.pdf');
      expect(/[\\/:*?"<>|]/.test(sanitized)).toBe(false);
    });

    it('should replace whitespace with underscores and collapse multiples', () => {
      const raw = '  Receipt   Store   Purchase   2026-10-28   .pdf';
      const sanitized = service.sanitizeFilename(raw);
      expect(sanitized).toBe('Receipt_Store_Purchase_2026-10-28.pdf');
    });

    it('should truncate base filename to max 60 characters and preserve .pdf', () => {
      const longName = 'Super_Extremely_Long_Document_Title_That_Exceeds_Sixty_Characters_In_The_Base_Name_Before_Extension.pdf';
      const sanitized = service.sanitizeFilename(longName, 60);
      const base = sanitized.replace(/\.pdf$/, '');
      expect(base.length).toBeLessThanOrEqual(60);
      expect(sanitized.endsWith('.pdf')).toBe(true);
    });

    it('should handle empty or whitespace-only names with safe fallback', () => {
      expect(service.sanitizeFilename('')).toBe('Document.pdf');
      expect(service.sanitizeFilename('   ')).toBe('Document.pdf');
      expect(service.sanitizeFilename(':::***???')).toBe('Document.pdf');
    });
  });

  describe('Semantic Auto-Tagging & Stop Words Filtering', () => {
    it('should strictly filter out common stop words and document noise words', () => {
      const words = ['the', 'is', 'at', 'which', 'on', 'for', 'Electricity', 'paid', 'page', 'document', 'Oct'];
      const filtered = service.filterStopWords(words);
      expect(filtered).not.toContain('the');
      expect(filtered).not.toContain('is');
      expect(filtered).not.toContain('at');
      expect(filtered).not.toContain('which');
      expect(filtered).not.toContain('on');
      expect(filtered).not.toContain('for');
      expect(filtered).not.toContain('page');
      expect(filtered).not.toContain('document');
      expect(filtered.map(w => w.toLowerCase())).toContain('electricity');
    });

    it('should extract 3 to 5 content tags including domain keywords and dates', () => {
      const text = `
        ELECTRICITY BILL
        Power Distribution Company
        Billing Cycle: October 2026
        Status: Paid
        Total Units: 320 kWh
        Consumer Number: 9948291
      `;
      const tags = service.extractTags(text, 'Utility Bill');
      expect(tags.length).toBeGreaterThanOrEqual(3);
      expect(tags.length).toBeLessThanOrEqual(5);
      expect(tags).toContain('Electricity');
      expect(tags).toContain('Paid');
      expect(tags.some(t => t.includes('October 2026') || t.includes('2026'))).toBe(true);

      // Verify no stop words slipped in
      for (const tag of tags) {
        expect(STOP_WORDS.has(tag.toLowerCase())).toBe(false);
      }
    });
  });

  describe('Suggested Rename-from-Content', () => {
    it('should synthesize clean, descriptive filename "{Category}_{Entity}_{Date}.pdf"', () => {
      const text = `
        CASH RECEIPT
        Vendor: PowerUtility
        Date: 2026-10-28
        Total: $45.00
      `;
      const proposal = service.suggestRename('Receipt', text, 'scan_raw.pdf');
      expect(proposal.proposedName).toBe('Receipt_PowerUtility_2026-10-28.pdf');
      expect(proposal.category).toBe('Receipt');
      expect(proposal.detectedDate).toBe('2026-10-28');
    });

    it('should convert Indian date format (DD/MM/YYYY) to ISO (YYYY-MM-DD)', () => {
      const text = `
        TAX INVOICE
        Company: Apex Logistics
        Date: 24/10/2026
        Amount Due: 14000
      `;
      const proposal = service.suggestRename('Invoice', text, 'unnamed.pdf');
      expect(proposal.proposedName).toContain('2026-10-24.pdf');
    });
  });

  describe('User Confirmation Safeguard', () => {
    it('should NEVER modify or save a file when status is pending or rejected', async () => {
      const mockFile = new File(['mock content'], 'test.pdf', { type: 'application/pdf' });
      const proposals: DocumentOrganizationProposal[] = [
        {
          id: '1',
          file: mockFile,
          originalFileName: 'test.pdf',
          fileSizeBytes: 1024,
          pageCount: 1,
          classification: { category: 'Invoice', confidence: 90, matchedSignals: [] },
          tags: ['Invoice', 'Tax', 'Paid'],
          proposedFileName: 'Invoice_Acme_2026-10-28.pdf',
          approvalStatus: 'pending' // Pending
        },
        {
          id: '2',
          file: mockFile,
          originalFileName: 'draft.pdf',
          fileSizeBytes: 2048,
          pageCount: 1,
          classification: { category: 'Receipt', confidence: 85, matchedSignals: [] },
          tags: ['Receipt', 'Store', 'Paid'],
          proposedFileName: 'Receipt_Store_2026-10-28.pdf',
          approvalStatus: 'rejected' // Rejected
        }
      ];

      const results = await service.applyBatchOrganization(proposals);

      // Crucial: No storage calls made!
      expect(mockStorageService.saveFile).not.toHaveBeenCalled();
      expect(results.length).toBe(2);
      expect(results[0].status).toBe('skipped');
      expect(results[1].status).toBe('skipped');
    });

    it('should save and rename ONLY explicitly approved files', async () => {
      const mockFile = new File(['mock content'], 'test.pdf', { type: 'application/pdf' });
      const proposals: DocumentOrganizationProposal[] = [
        {
          id: '1',
          file: mockFile,
          originalFileName: 'test.pdf',
          fileSizeBytes: 1024,
          pageCount: 1,
          classification: { category: 'Invoice', confidence: 90, matchedSignals: [] },
          tags: ['Invoice', 'Tax', 'Paid'],
          proposedFileName: 'Invoice_Acme_2026-10-28.pdf',
          approvalStatus: 'approved' // User explicitly approved
        },
        {
          id: '2',
          file: mockFile,
          originalFileName: 'draft.pdf',
          fileSizeBytes: 2048,
          pageCount: 1,
          classification: { category: 'Receipt', confidence: 85, matchedSignals: [] },
          tags: ['Receipt'],
          proposedFileName: 'Receipt_Store.pdf',
          approvalStatus: 'pending' // Still pending
        }
      ];

      const results = await service.applyBatchOrganization(proposals);

      expect(mockStorageService.saveFile).toHaveBeenCalledTimes(1);
      expect(results[0].status).toBe('renamed');
      expect(results[0].finalFileName).toBe('Invoice_Acme_2026-10-28.pdf');
      expect(results[1].status).toBe('skipped');
    });
  });

  describe('Batch Vault Mode', () => {
    it('should scan history vault and return proposal items with pending review status', async () => {
      const proposals = await service.scanHistoryVault();
      expect(proposals.length).toBeGreaterThan(0);
      for (const p of proposals) {
        expect(p.approvalStatus).toBe('pending');
        expect(p.tags.length).toBeGreaterThanOrEqual(3);
        expect(p.proposedFileName.endsWith('.pdf')).toBe(true);
      }
    });

    it('should propose batch organization from uploaded File list', async () => {
      const file1 = new File(['Electricity Bill units consumed 100 kwh Oct 2026'], 'scan1.pdf', { type: 'text/plain' });
      const file2 = new File(['Tax Invoice bill to Acme inv #102 due date 2026-10-28'], 'scan2.pdf', { type: 'text/plain' });

      const proposals = await service.proposeBatchFromFiles([file1, file2]);
      expect(proposals.length).toBe(2);
      expect(proposals[0].approvalStatus).toBe('pending');
      expect(proposals[1].approvalStatus).toBe('pending');
    });
  });

  describe('Step 2 Real Test Data Verification (5 Diverse Document Archetypes)', () => {
    it('1. Utility Bill Scan — high confidence, accurate domain tags, clean filename', () => {
      const text = `
        ELECTRICITY BILL
        Power Distribution Company
        Consumer No: 9948291
        Tariff: Residential
        Meter Reading: Current 1450 kWh Previous 1210 kWh
        Units Consumed: 240 kWh
        Billing Cycle: October 2026
        Due Date: 2026-11-15
        Total Amount Due: INR 2,450
      `;
      const proposal = service.suggestRename('Utility Bill', text, 'raw_scan_001.pdf');
      const classification = service.classifyDocument(text);
      const tags = service.extractTags(text, 'Utility Bill');

      expect(classification.category).toBe('Utility Bill');
      expect(classification.confidence).toBeGreaterThanOrEqual(80);
      expect(tags).toContain('Electricity');
      expect(proposal.proposedName).toMatch(/^UtilityBill_[A-Za-z0-9_\-]+_2026-11-15\.pdf$/);
    });

    it('2. University Degree Certificate — high confidence, academic tags, student/institution attribution', () => {
      const text = `
        CENTRAL UNIVERSITY DEGREE
        This is to certify that
        Awarded To: Priya Sharma
        has successfully completed the curriculum for
        Bachelor of Technology in Computer Science & Engineering.
        Conferred Upon on 2026-07-20 with First Class Distinction.
        In Witness Whereof, Authorized Signatory.
      `;
      const classification = service.classifyDocument(text, { pageCount: 1 });
      const tags = service.extractTags(text, 'Certificate');
      const rename = service.suggestRename(classification.category, text, 'unnamed_cert.pdf');

      expect(classification.category).toBe('Certificate');
      expect(classification.confidence).toBeGreaterThanOrEqual(80);
      expect(tags.some(t => t.includes('University') || t.includes('Degree') || t.includes('Certificate'))).toBe(true);
      expect(rename.proposedName).toMatch(/^Certificate_[A-Za-z0-9_\-]+_2026-07-20\.pdf$/);
    });

    it('3. Official Letter — formal tone, office memo signals, recipient attribution', () => {
      const text = `
        To Whom It May Concern:
        Dear Sir or Madam,
        Subject: Official Verification of Employment Records
        Office Memo Ref: HR/VERIF/2026-09
        We hereby provide formal notice regarding employee credentials.
        With reference to your formal request dated 2026-09-10.
        Yours Faithfully,
        Director of Operations
      `;
      const classification = service.classifyDocument(text);
      const tags = service.extractTags(text, 'Official Letter');
      const rename = service.suggestRename(classification.category, text, 'memo.pdf');

      expect(classification.category).toBe('Official Letter');
      expect(classification.confidence).toBeGreaterThanOrEqual(70);
      expect(tags.length).toBeGreaterThanOrEqual(3);
      expect(rename.proposedName).toMatch(/^OfficialLetter_[A-Za-z0-9_\-]+_2026-09-10\.pdf$/);
    });

    it('4. Medical Bill — classified as Invoice/Bill, hospital & patient tags, cost tracking', () => {
      const text = `
        MEDICAL BILL & HOSPITAL INVOICE
        Provider: Care Hospital
        Patient Name: Aarav Gupta
        Invoice No: MED-2026-8819
        Date: 2026-10-18
        Doctor Consultation Fee: INR 1,500
        Diagnostic Lab Charges: INR 3,200
        Pharmacy Bill: INR 1,800
        Total Amount Due: INR 6,500
        Payment Terms: Due upon receipt
      `;
      const classification = service.classifyDocument(text);
      const tags = service.extractTags(text, classification.category);
      const rename = service.suggestRename(classification.category, text, 'hospital_scan.pdf');

      expect(['Invoice', 'Receipt']).toContain(classification.category);
      expect(classification.confidence).toBeGreaterThanOrEqual(80);
      expect(tags.some(t => t.includes('Hospital') || t.includes('Medical') || t.includes('Patient'))).toBe(true);
      expect(rename.proposedName).toMatch(/^(Invoice|Receipt)_[A-Za-z0-9_\-]+_2026-10-18\.pdf$/);
    });

    it('5. Employment Contract — bilateral clauses, employment tags, multi-page agreement', () => {
      const text = `
        EMPLOYMENT CONTRACT & AGREEMENT
        This Employment Agreement is entered into between:
        Employer: TechCorp Solutions
        and
        Employee: Rohan Verma
        Terms and Conditions:
        1. Job Title: Principal Systems Architect
        2. Remuneration: Annual Base CTC with quarterly review
        3. Governing Law: State of Maharashtra
        4. Severability and Non-Disclosure covenant
        Hereby agree and executed on 2026-10-01
      `;
      const classification = service.classifyDocument(text, { pageCount: 3 });
      const tags = service.extractTags(text, 'Contract');
      const rename = service.suggestRename('Contract', text, 'draft_contract.pdf');

      expect(classification.category).toBe('Contract');
      expect(classification.confidence).toBeGreaterThanOrEqual(85);
      expect(tags.some(t => t.includes('Employment') || t.includes('Contract') || t.includes('Agreement'))).toBe(true);
      expect(rename.proposedName).toMatch(/^Contract_[A-Za-z0-9_\-]+_2026-10-01\.pdf$/);
    });
  });

  describe('Step 5 Cybersecurity Stress-Testing', () => {
    it('defends against Path Traversal / Directory Traversal attacks in proposed filenames', () => {
      const maliciousNames = [
        '../../../../etc/shadow',
        '..\\..\\..\\windows\\system32\\cmd.exe',
        '/var/log/../../app/config.json',
        '....//....//etc/passwd',
        'Invoice_../../secrets_2026-10-28.pdf'
      ];

      for (const raw of maliciousNames) {
        const sanitized = service.sanitizeFilename(raw);
        // Must never contain directory separators or relative traversal sequences
        expect(sanitized).not.toContain('..');
        expect(sanitized).not.toContain('/');
        expect(sanitized).not.toContain('\\');
        expect(sanitized.endsWith('.pdf')).toBe(true);
        expect(/^[A-Za-z0-9_\-]+\.pdf$/.test(sanitized)).toBe(true);
      }
    });

    it('defends against Null-byte injection attacks in proposed filenames', () => {
      const nullBytePayloads = [
        'Invoice_2026\0.exe',
        'Receipt_\0\0_Store.pdf',
        'Contract\x00.sh',
        'UtilityBill\u0000.bat.pdf'
      ];

      for (const raw of nullBytePayloads) {
        const sanitized = service.sanitizeFilename(raw);
        expect(sanitized).not.toContain('\0');
        expect(sanitized).not.toContain('\u0000');
        expect(sanitized).not.toContain('.exe');
        expect(sanitized).not.toContain('.sh');
        expect(sanitized.endsWith('.pdf')).toBe(true);
      }
    });

    it('neutralizes XSS payloads in extracted tags and entities', () => {
      const xssText = `
        TAX INVOICE
        Vendor: <script>alert("pwned")</script>
        Bill To: <img src=x onerror=stealCookies()>
        Date: 2026-10-28
        Total Amount: $500
      `;

      const rename = service.suggestRename('Invoice', xssText, 'scan.pdf');
      expect(rename.proposedName).not.toContain('<');
      expect(rename.proposedName).not.toContain('>');
      expect(rename.proposedName).not.toContain('script');

      const tags = service.extractTags(xssText, 'Invoice');
      for (const tag of tags) {
        expect(tag).not.toContain('<script>');
        expect(tag).not.toContain('<img');
      }
    });

    it('processes regional Indian text without stop-word crashes or regex errors', () => {
      const regionalText = `
        महाराष्ट्र राज्य विद्युत वितरण कंपनी (MSEDCL)
        ELECTRICITY BILL बिजली बिल
        ग्राहक क्रमांक (Consumer No): 10293847
        वापरलेले युनिट्स (Units Consumed): 180 kWh
        देय दिनांक (Due Date): 2026-10-25
        रक्कम (Total Amount): 1850 INR
      `;

      expect(() => {
        const classification = service.classifyDocument(regionalText);
        expect(classification.category).toBe('Utility Bill');
        const tags = service.extractTags(regionalText, 'Utility Bill');
        expect(tags.length).toBeGreaterThanOrEqual(3);
        const rename = service.suggestRename(classification.category, regionalText);
        expect(rename.proposedName.endsWith('.pdf')).toBe(true);
      }).not.toThrow();
    });
  });
});
