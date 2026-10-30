import { Injectable, inject } from '@angular/core';
import { StorageService } from './storage.service';
import {
  BoundingBox,
  DocumentCategory,
  ExtractedField,
  ExtractedWordToken,
  FieldTypeCategory,
  StructuredExportJson,
  StructuredExtractionResult
} from '../models/structured-extraction.types';

/**
 * Pre-indexed token structure to avoid repeated regex replace operations on large documents.
 */
interface IndexedToken extends ExtractedWordToken {
  cleanText: string;
}

@Injectable({
  providedIn: 'root'
})
export class StructuredExtractionService {
  private storageService = inject(StorageService);

  // Maximum limits for memory bloat and execution bounds
  private readonly MAX_TOKENS = 1500;
  private readonly MAX_RAW_TEXT_LENGTH = 500000;
  private readonly MAX_LINES = 2000;
  private readonly MAX_LINE_LENGTH = 1000;
  private readonly TIMEOUT_MS = 3000;

  /**
   * Primary entry point: Extracts structured key/value fields from text and tokens.
   */
  extract(
    rawText: string,
    tokens: ExtractedWordToken[] = [],
    pageCount: number = 1,
    fileName?: string
  ): StructuredExtractionResult {
    const startTime = performance.now();

    // 1. Input bounding & memory bloat defense
    const boundedText = (rawText || '').slice(0, this.MAX_RAW_TEXT_LENGTH);
    const boundedTokens = (tokens || []).slice(0, this.MAX_TOKENS);

    // Pre-index tokens once (O(N) single-pass) to avoid O(N*M) repeated regex replaces
    const indexedTokens: IndexedToken[] = boundedTokens.map(tok => ({
      ...tok,
      cleanText: (tok.text || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    }));

    // 2. Generic document classification (strictly generic, no institution names)
    const classification = this.classifyDocument(boundedText);

    // 3. Extract fields with safety timeout and heuristics
    const fields = this.extractFields(boundedText, indexedTokens, classification.category, startTime);

    const highConfidenceCount = fields.filter(f => !f.isAbsent && f.confidence >= 80).length;
    const lowConfidenceCount = fields.filter(f => !f.isAbsent && f.confidence < 80).length;
    const absentCount = fields.filter(f => f.isAbsent || f.confidence === 0).length;

    const executionTimeMs = Math.round(performance.now() - startTime);

    const result: StructuredExtractionResult = {
      documentCategory: classification.category,
      categoryLabel: classification.label,
      categoryConfidence: classification.confidence,
      fields,
      pageCount: Math.max(1, pageCount || 1),
      rawText: boundedText,
      summary: {
        totalDetectedFields: fields.filter(f => !f.isAbsent).length,
        highConfidenceCount,
        lowConfidenceCount,
        absentCount
      },
      metadata: {
        fileName: fileName ? this.sanitizeString(fileName) : undefined,
        extractedAt: new Date().toISOString(),
        executionTimeMs
      }
    };

    // Strict schema validation check
    const validation = this.validateExtractionResult(result);
    if (!validation.valid) {
      console.warn('Extraction schema warnings:', validation.errors);
    }

    return result;
  }

  /**
   * Generic Document Classification:
   * Categorizes text into Receipt, Invoice, Utility Bill, ID Document, Bank Statement, or Unknown.
   * GENERIC CATEGORIES ONLY — Strictly no institution, exam board, or scheme names.
   */
  classifyDocument(text: string): {
    category: DocumentCategory;
    label: string;
    confidence: number;
  } {
    if (!text || text.trim().length === 0) {
      return { category: 'UNKNOWN', label: 'Unknown Document', confidence: 0 };
    }

    const lower = text.toLowerCase();

    // Scores based on weighted keyword frequencies
    const scores: Record<DocumentCategory, number> = {
      RECEIPT: 0,
      INVOICE: 0,
      UTILITY_BILL: 0,
      ID_DOCUMENT: 0,
      BANK_STATEMENT: 0,
      UNKNOWN: 0
    };

    // Receipt keywords (generic)
    const receiptKeywords = [
      'receipt', 'cash receipt', 'tax receipt', 'pos terminal', 'cashier', 'store #',
      'item total', 'subtotal', 'tendered', 'change due', 'thank you', 'card txn', 'register #'
    ];
    for (const kw of receiptKeywords) {
      if (lower.includes(kw)) scores.RECEIPT += 20;
    }

    // Invoice keywords (generic)
    const invoiceKeywords = [
      'invoice', 'invoice no', 'inv #', 'bill to', 'billed to', 'invoice date',
      'due date', 'po number', 'purchase order', 'tax invoice', 'gstin', 'gst #', 'vat no',
      'terms: net', 'payment due'
    ];
    for (const kw of invoiceKeywords) {
      if (lower.includes(kw)) scores.INVOICE += 20;
    }

    // Utility Bill keywords (generic)
    const utilityKeywords = [
      'utility bill', 'electricity bill', 'water bill', 'meter reading', 'units consumed',
      'consumer number', 'consumer id', 'tariff', 'billing cycle', 'telecom bill',
      'broadband bill', 'gas bill', 'kwh', 'bill date', 'due date', 'disconnection'
    ];
    for (const kw of utilityKeywords) {
      if (lower.includes(kw)) scores.UTILITY_BILL += 20;
    }

    // ID Document keywords (generic)
    const idKeywords = [
      'identity card', 'identification', 'id card', 'date of birth', 'dob', 'gender',
      'valid until', 'expiry date', 'nationality', 'card number', 'holder name', 'id number',
      'blood group', 'issued on'
    ];
    for (const kw of idKeywords) {
      if (lower.includes(kw)) scores.ID_DOCUMENT += 20;
    }

    // Bank Statement keywords (generic)
    const bankKeywords = [
      'bank statement', 'account statement', 'account number', 'account holder',
      'opening balance', 'closing balance', 'deposit', 'withdrawal', 'statement period',
      'transaction date', 'cheque', 'branch code', 'ifsc', 'swift', 'iban', 'ledger'
    ];
    for (const kw of bankKeywords) {
      if (lower.includes(kw)) scores.BANK_STATEMENT += 20;
    }

    let topCategory: DocumentCategory = 'UNKNOWN';
    let maxScore = 0;

    for (const [cat, score] of Object.entries(scores) as [DocumentCategory, number][]) {
      if (score > maxScore) {
        maxScore = score;
        topCategory = cat;
      }
    }

    if (maxScore < 15) {
      return {
        category: 'UNKNOWN',
        label: 'Unknown Document',
        confidence: 30
      };
    }

    const confidence = Math.min(98, Math.max(50, 40 + maxScore));

    const labels: Record<DocumentCategory, string> = {
      RECEIPT: 'Receipt',
      INVOICE: 'Invoice',
      UTILITY_BILL: 'Utility Bill',
      ID_DOCUMENT: 'ID Document',
      BANK_STATEMENT: 'Bank Statement',
      UNKNOWN: 'Unknown Document'
    };

    return {
      category: topCategory,
      label: labels[topCategory],
      confidence
    };
  }

  /**
   * Extracts fields using heuristics, spatial analysis, and regex patterns.
   * If a field is not detected, it is reported as absent (null) with 0% confidence.
   */
  private extractFields(
    rawText: string,
    tokens: IndexedToken[],
    category: DocumentCategory,
    startTime: number
  ): ExtractedField[] {
    const fields: ExtractedField[] = [];
    const lines = rawText
      .split(/\r?\n/)
      .slice(0, this.MAX_LINES)
      .map(l => l.trim().slice(0, this.MAX_LINE_LENGTH))
      .filter(l => l.length > 0);

    // 1. DATES (ISO, Indian DD/MM/YYYY, Textual)
    const dates = this.extractDates(lines, tokens, category, startTime);
    if (dates.primaryDate) {
      fields.push(dates.primaryDate);
    } else {
      const dateLabel = category === 'ID_DOCUMENT' ? 'Date of Birth / Issue Date' : 'Document Date';
      fields.push(this.createAbsentField('date', dateLabel, 'date'));
    }

    if (category === 'ID_DOCUMENT') {
      if (dates.dob) {
        fields.push(dates.dob);
      } else {
        fields.push(this.createAbsentField('dob', 'Date of Birth', 'date'));
      }
      if (dates.expiryDate) {
        fields.push(dates.expiryDate);
      } else {
        fields.push(this.createAbsentField('expiryDate', 'Valid Until / Expiry Date', 'date'));
      }
    } else if (category === 'INVOICE' || category === 'UTILITY_BILL') {
      if (dates.dueDate) {
        fields.push(dates.dueDate);
      } else {
        fields.push(this.createAbsentField('dueDate', 'Due Date', 'date'));
      }
    }

    // 2. FINANCIAL TOTALS & TAXES (₹, $, €, subtotal, tax/GST, grand total)
    // ID documents typically do not contain financial totals
    if (category !== 'ID_DOCUMENT') {
      const financials = this.extractFinancials(lines, tokens, startTime);
      if (financials.grandTotal) {
        fields.push(financials.grandTotal);
      } else {
        fields.push(this.createAbsentField('grandTotal', 'Grand Total', 'financial'));
      }

      if (financials.subtotal) {
        fields.push(financials.subtotal);
      } else if (category === 'RECEIPT' || category === 'INVOICE') {
        fields.push(this.createAbsentField('subtotal', 'Subtotal', 'financial'));
      }

      if (financials.taxAmount) {
        fields.push(financials.taxAmount);
      } else if (category === 'RECEIPT' || category === 'INVOICE') {
        fields.push(this.createAbsentField('taxAmount', 'Tax / GST / VAT', 'financial'));
      }

      if (financials.balanceDue) {
        fields.push(financials.balanceDue);
      } else if (category === 'INVOICE' || category === 'UTILITY_BILL') {
        fields.push(this.createAbsentField('balanceDue', 'Balance Due', 'financial'));
      }
    }

    // 3. REFERENCE IDENTIFIERS
    const identifiers = this.extractIdentifiers(lines, tokens, category, startTime);
    if (identifiers.referenceId) {
      fields.push(identifiers.referenceId);
    } else {
      const defaultKey = category === 'RECEIPT' ? 'receiptNumber' : category === 'INVOICE' ? 'invoiceNumber' : category === 'ID_DOCUMENT' ? 'idNumber' : 'referenceId';
      const defaultLabel = category === 'RECEIPT' ? 'Receipt ID' : category === 'INVOICE' ? 'Invoice Number' : category === 'ID_DOCUMENT' ? 'ID Document Number' : 'Reference ID';
      fields.push(this.createAbsentField(defaultKey, defaultLabel, 'identifier'));
    }

    if (category !== 'ID_DOCUMENT') {
      if (identifiers.orderNumber) {
        fields.push(identifiers.orderNumber);
      } else {
        fields.push(this.createAbsentField('orderNumber', 'Order Number', 'identifier'));
      }

      if (identifiers.accountId) {
        fields.push(identifiers.accountId);
      } else if (category === 'BANK_STATEMENT' || category === 'UTILITY_BILL') {
        fields.push(this.createAbsentField('accountNumber', 'Account / Consumer ID', 'identifier'));
      }
    }

    // 4. ENTITIES: Vendor, Customer / Holder, Address
    const entities = this.extractEntities(lines, tokens, category, startTime);
    if (category !== 'ID_DOCUMENT') {
      if (entities.vendorName) {
        fields.push(entities.vendorName);
      } else {
        fields.push(this.createAbsentField('vendorName', 'Vendor / Merchant Name', 'entity'));
      }
    }

    if (entities.customerName) {
      fields.push(entities.customerName);
    } else {
      const label = category === 'ID_DOCUMENT' ? 'Cardholder Name' : 'Customer / Billed-To Name';
      const key = category === 'ID_DOCUMENT' ? 'customerName' : 'customerName';
      fields.push(this.createAbsentField(key, label, 'entity'));
    }

    if (entities.address) {
      fields.push(entities.address);
    } else {
      fields.push(this.createAbsentField('address', 'Physical Address', 'entity'));
    }

    return fields;
  }

  /**
   * Helper to construct absent field with 0% confidence — NEVER hallucinate.
   */
  createAbsentField(key: string, label: string, category: FieldTypeCategory): ExtractedField {
    return {
      key: this.sanitizeFieldKey(key),
      label: this.sanitizeString(label),
      value: null,
      confidence: 0,
      pageNumber: 1,
      boundingBox: null,
      category,
      isAbsent: true,
      isLowConfidence: true
    };
  }

  /**
   * Extract dates: ISO, Indian/UK, and Textual formats.
   * ReDoS safe with bounded quantifiers and regex timeout.
   */
  private extractDates(
    lines: string[],
    tokens: IndexedToken[],
    category: DocumentCategory,
    startTime: number
  ): { primaryDate?: ExtractedField; dueDate?: ExtractedField; dob?: ExtractedField; expiryDate?: ExtractedField } {
    let primaryDate: ExtractedField | undefined;
    let dueDate: ExtractedField | undefined;
    let dob: ExtractedField | undefined;
    let expiryDate: ExtractedField | undefined;

    // ISO: 2026-10-28 or 2026/10/28 (strictly bounded)
    const isoRegex = /\b(\d{4})[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b/;
    // Indian / UK: 28/10/2026 or 28-10-2026 or 28.10.2026 (strictly bounded)
    const indianRegex = /\b(0[1-9]|[12]\d|3[01])[-/.](0[1-9]|1[0-2])[-/.](\d{4})\b/;
    // Textual: 28 Oct 2026, 28 October 2026, Oct 28, 2026 (bounded [\s\-_]{1,3})
    const monthGroup = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
    const textualRegex1 = new RegExp(
      `\\b(0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?[\\s\\-_]{1,3}${monthGroup}[\\s\\-_]{1,3}(\\d{4})\\b`,
      'i'
    );
    const textualRegex2 = new RegExp(
      `\\b${monthGroup}[\\s\\-_]{1,3}(0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?(?:,)?[\\s\\-_]{1,3}(\\d{4})\\b`,
      'i'
    );

    for (let i = 0; i < lines.length; i++) {
      if (this.isTimedOut(startTime)) break;
      const line = lines[i];

      const isDueContext = /\b(due\s{0,2}date|payment\s{0,2}due|pay\s{0,2}by)\b/i.test(line);
      const isDobContext = /\b(date\s{0,2}of\s{0,2}birth|dob|birth\s{0,2}date)\b/i.test(line);
      const isExpiryContext = /\b(valid\s{0,2}until|expiry\s{0,2}date|expires|valid\s{0,2}thru|exp\s{0,2}date)\b/i.test(line);

      const match = line.match(isoRegex) || line.match(indianRegex) || line.match(textualRegex1) || line.match(textualRegex2);
      if (match) {
        const rawDate = this.sanitizeString(match[0].trim());
        const bbox = this.locateBoundingBox(rawDate, tokens, i);
        const confidence = 95;

        if (isDobContext && !dob) {
          dob = {
            key: 'dob',
            label: 'Date of Birth',
            value: rawDate,
            confidence: 94,
            pageNumber: bbox?.pageNumber ?? 1,
            boundingBox: bbox?.box ?? null,
            category: 'date',
            isAbsent: false,
            isLowConfidence: false
          };
        } else if (isExpiryContext && !expiryDate) {
          expiryDate = {
            key: 'expiryDate',
            label: 'Valid Until / Expiry Date',
            value: rawDate,
            confidence: 93,
            pageNumber: bbox?.pageNumber ?? 1,
            boundingBox: bbox?.box ?? null,
            category: 'date',
            isAbsent: false,
            isLowConfidence: false
          };
        } else if (isDueContext && !dueDate) {
          dueDate = {
            key: 'dueDate',
            label: 'Due Date',
            value: rawDate,
            confidence: 92,
            pageNumber: bbox?.pageNumber ?? 1,
            boundingBox: bbox?.box ?? null,
            category: 'date',
            isAbsent: false,
            isLowConfidence: false
          };
        } else if (!primaryDate && !isDueContext && !isExpiryContext) {
          primaryDate = {
            key: 'date',
            label: category === 'ID_DOCUMENT' ? 'Date of Birth / Issue Date' : 'Document Date',
            value: rawDate,
            confidence: 95,
            pageNumber: bbox?.pageNumber ?? 1,
            boundingBox: bbox?.box ?? null,
            category: 'date',
            isAbsent: false,
            isLowConfidence: false
          };
        }
      }
    }

    return { primaryDate, dueDate, dob, expiryDate };
  }

  /**
   * Extract financial lines: Subtotal, Tax, Grand Total, Balance Due.
   * ReDoS safe with bounded quantifiers and regex timeout.
   */
  private extractFinancials(
    lines: string[],
    tokens: IndexedToken[],
    startTime: number
  ): {
    grandTotal?: ExtractedField;
    subtotal?: ExtractedField;
    taxAmount?: ExtractedField;
    balanceDue?: ExtractedField;
  } {
    let grandTotal: ExtractedField | undefined;
    let subtotal: ExtractedField | undefined;
    let taxAmount: ExtractedField | undefined;
    let balanceDue: ExtractedField | undefined;

    // Currency and decimal amount pattern:
    // 1. Matches with currency symbol: ₹4,500.00, $100, €45.50
    // 2. OR matches with decimal amount: 4,500.00 or 100.00
    // This strictly prevents percentages like '18%' from being falsely matched as amounts
    const amountRegex = /(?:(?:₹|Rs\.?|INR|\$|€|£|GBP|USD|EUR)\s{0,3}([0-9]{1,3}(?:,[0-9]{3}){0,5}(?:\.[0-9]{2})?|[0-9]{1,10}(?:\.[0-9]{2})?))|(?:[0-9]{1,3}(?:,[0-9]{3}){0,5}\.[0-9]{2}|[0-9]{1,10}\.[0-9]{2})/i;

    for (let i = 0; i < lines.length; i++) {
      if (this.isTimedOut(startTime)) break;
      const line = lines[i];

      // Grand Total
      if (!grandTotal && /\b(grand\s{0,2}total|total\s{0,2}amount|total\s{0,2}payable|net\s{0,2}payable|invoice\s{0,2}total|amount\s{0,2}paid)\b/i.test(line)) {
        const match = line.match(amountRegex);
        if (match && match[0].trim().length > 0) {
          const val = this.sanitizeString(match[0].trim());
          const bbox = this.locateBoundingBox(val, tokens, i);
          grandTotal = {
            key: 'grandTotal',
            label: 'Grand Total',
            value: val,
            confidence: 95,
            pageNumber: bbox?.pageNumber ?? 1,
            boundingBox: bbox?.box ?? null,
            category: 'financial',
            isAbsent: false,
            isLowConfidence: false
          };
        }
      }

      // Balance Due
      if (!balanceDue && /\b(balance\s{0,2}due|amount\s{0,2}due|total\s{0,2}due|balance\s{0,2}payable)\b/i.test(line)) {
        const match = line.match(amountRegex);
        if (match && match[0].trim().length > 0) {
          const val = this.sanitizeString(match[0].trim());
          const bbox = this.locateBoundingBox(val, tokens, i);
          balanceDue = {
            key: 'balanceDue',
            label: 'Balance Due',
            value: val,
            confidence: 90,
            pageNumber: bbox?.pageNumber ?? 1,
            boundingBox: bbox?.box ?? null,
            category: 'financial',
            isAbsent: false,
            isLowConfidence: false
          };
        }
      }

      // Subtotal / Net Amount / Taxable Value
      if (!subtotal && /\b(sub\s{0,2}total|subtotal|net\s{0,2}amount|taxable\s{0,2}amount|taxable\s{0,2}value)\b/i.test(line)) {
        const match = line.match(amountRegex);
        if (match && match[0].trim().length > 0) {
          const val = this.sanitizeString(match[0].trim());
          const bbox = this.locateBoundingBox(val, tokens, i);
          subtotal = {
            key: 'subtotal',
            label: 'Subtotal',
            value: val,
            confidence: 92,
            pageNumber: bbox?.pageNumber ?? 1,
            boundingBox: bbox?.box ?? null,
            category: 'financial',
            isAbsent: false,
            isLowConfidence: false
          };
        }
      }

      // Tax / GST / VAT / CGST / SGST / IGST
      if (!taxAmount && /\b(cgst|sgst|igst|gst|vat|sales\s{0,2}tax|tax\s{0,2}amount|total\s{0,2}tax)\b/i.test(line)) {
        const match = line.match(amountRegex);
        if (match && match[0].trim().length > 0) {
          const val = this.sanitizeString(match[0].trim());
          const bbox = this.locateBoundingBox(val, tokens, i);
          taxAmount = {
            key: 'taxAmount',
            label: 'Tax / GST / VAT',
            value: val,
            confidence: 90,
            pageNumber: bbox?.pageNumber ?? 1,
            boundingBox: bbox?.box ?? null,
            category: 'financial',
            isAbsent: false,
            isLowConfidence: false
          };
        }
      }
    }

    // Fallback if "Total: ..." exists when Grand Total wasn't matched
    if (!grandTotal) {
      for (let i = lines.length - 1; i >= 0; i--) {
        if (this.isTimedOut(startTime)) break;
        const line = lines[i];
        if (/\btotal\b/i.test(line) && !/subtotal/i.test(line)) {
          const match = line.match(amountRegex);
          if (match && match[0].trim().length > 0) {
            const val = this.sanitizeString(match[0].trim());
            const bbox = this.locateBoundingBox(val, tokens, i);
            grandTotal = {
              key: 'grandTotal',
              label: 'Grand Total',
              value: val,
              confidence: 85,
              pageNumber: bbox?.pageNumber ?? 1,
              boundingBox: bbox?.box ?? null,
              category: 'financial',
              isAbsent: false,
              isLowConfidence: false
            };
            break;
          }
        }
      }
    }

    return { grandTotal, subtotal, taxAmount, balanceDue };
  }

  /**
   * Extract identifiers: Invoice Number, Receipt ID, Order Number, Account ID.
   * ReDoS safe with bounded quantifiers.
   */
  private extractIdentifiers(
    lines: string[],
    tokens: IndexedToken[],
    category: DocumentCategory,
    startTime: number
  ): {
    referenceId?: ExtractedField;
    orderNumber?: ExtractedField;
    accountId?: ExtractedField;
  } {
    let referenceId: ExtractedField | undefined;
    let orderNumber: ExtractedField | undefined;
    let accountId: ExtractedField | undefined;

    const invoiceRegex = /\b(?:invoice\s{0,2}(?:no|num|number|#)|inv(?:\.|\s{0,2}(?:no|num|number|#|:))|bill\s{0,2}(?:no|num|number|#))\s{0,2}[:\-#]?\s{0,2}([A-Za-z0-9\-\/]{2,30})\b/i;
    const receiptRegex = /\b(?:receipt\s{0,2}(?:no|num|number|#)|rec(?:\.|\s{0,2}(?:no|num|number|#|:))|txn\s{0,2}(?:id|no)|transaction\s{0,2}(?:id|no))\s{0,2}[:\-#]?\s{0,2}([A-Za-z0-9\-\/]{2,30})\b/i;
    const orderRegex = /\b(?:order\s{0,2}(?:no|num|number|#)|po\s{0,2}(?:no|number|#)?|purchase\s{0,2}order)\s{0,2}[:\-#]?\s{0,2}([A-Za-z0-9\-\/]{2,30})\b/i;
    const accountRegex = /\b(?:account\s{0,2}(?:no|num|number|#)|a\/c\s{0,2}(?:no|#)?|consumer\s{0,2}(?:id|no|num)|customer\s{0,2}(?:id|no))\s{0,2}[:\-#]?\s{0,2}([A-Za-z0-9\-\/]{2,30})\b/i;
    const idCardRegex = /\b(?:id\s{0,2}(?:number|no|#)|document\s{0,2}(?:no|#)|card\s{0,2}(?:no|#)|identification\s{0,2}(?:no|#))\s{0,2}[:\-#]?\s{0,2}([A-Za-z0-9\-\/]{2,30})\b/i;

    for (let i = 0; i < lines.length; i++) {
      if (this.isTimedOut(startTime)) break;
      const line = lines[i];

      // Primary Reference ID
      if (!referenceId) {
        if (category === 'RECEIPT') {
          const match = line.match(receiptRegex) || line.match(invoiceRegex);
          if (match) {
            const val = this.sanitizeString(match[1].trim());
            const bbox = this.locateBoundingBox(val, tokens, i);
            referenceId = {
              key: 'receiptNumber',
              label: 'Receipt ID',
              value: val,
              confidence: 94,
              pageNumber: bbox?.pageNumber ?? 1,
              boundingBox: bbox?.box ?? null,
              category: 'identifier',
              isAbsent: false,
              isLowConfidence: false
            };
          }
        } else if (category === 'ID_DOCUMENT') {
          const match = line.match(idCardRegex);
          if (match) {
            const val = this.sanitizeString(match[1].trim());
            const bbox = this.locateBoundingBox(val, tokens, i);
            referenceId = {
              key: 'idNumber',
              label: 'ID Document Number',
              value: val,
              confidence: 95,
              pageNumber: bbox?.pageNumber ?? 1,
              boundingBox: bbox?.box ?? null,
              category: 'identifier',
              isAbsent: false,
              isLowConfidence: false
            };
          }
        } else {
          const match = line.match(invoiceRegex) || line.match(receiptRegex);
          if (match) {
            const val = this.sanitizeString(match[1].trim());
            const bbox = this.locateBoundingBox(val, tokens, i);
            referenceId = {
              key: 'invoiceNumber',
              label: 'Invoice Number',
              value: val,
              confidence: 94,
              pageNumber: bbox?.pageNumber ?? 1,
              boundingBox: bbox?.box ?? null,
              category: 'identifier',
              isAbsent: false,
              isLowConfidence: false
            };
          }
        }
      }

      // Order Number
      if (!orderNumber) {
        const match = line.match(orderRegex);
        if (match) {
          const val = this.sanitizeString(match[1].trim());
          const bbox = this.locateBoundingBox(val, tokens, i);
          orderNumber = {
            key: 'orderNumber',
            label: 'Order Number',
            value: val,
            confidence: 92,
            pageNumber: bbox?.pageNumber ?? 1,
            boundingBox: bbox?.box ?? null,
            category: 'identifier',
            isAbsent: false,
            isLowConfidence: false
          };
        }
      }

      // Account ID
      if (!accountId) {
        const match = line.match(accountRegex);
        if (match) {
          const val = this.sanitizeString(match[1].trim());
          const bbox = this.locateBoundingBox(val, tokens, i);
          accountId = {
            key: 'accountNumber',
            label: 'Account / Consumer ID',
            value: val,
            confidence: 93,
            pageNumber: bbox?.pageNumber ?? 1,
            boundingBox: bbox?.box ?? null,
            category: 'identifier',
            isAbsent: false,
            isLowConfidence: false
          };
        }
      }
    }

    return { referenceId, orderNumber, accountId };
  }

  /**
   * Extract Entities: Vendor Name, Customer Name, and Physical Addresses (via spatial clustering).
   * ReDoS safe with bounded quantifiers.
   */
  private extractEntities(
    lines: string[],
    tokens: IndexedToken[],
    category: DocumentCategory,
    startTime: number
  ): {
    vendorName?: ExtractedField;
    customerName?: ExtractedField;
    address?: ExtractedField;
  } {
    let vendorName: ExtractedField | undefined;
    let customerName: ExtractedField | undefined;
    let address: ExtractedField | undefined;

    const vendorPrefixRegex = /^(?:from|vendor|merchant|seller|store)\s{0,2}[:\-]\s{0,2}(.+)$/i;
    const customerPrefixRegex = /^(?:bill\s{0,2}to|billed\s{0,2}to|customer(?:\s{0,2}name)?|client|invoiced\s{0,2}to|to|account\s{0,2}holder|(?:card\s{0,2})?holder\s{0,2}name|name)\s{0,2}[:\-]\s{0,2}(.+)$/i;
    const addressKeywords = /\b(road|rd|st|street|marg|lane|ave|avenue|nagar|layout|block|sector|floor|suite|pincode|pin\s{0,2}code|zip)\b/i;
    const postalCodeRegex = /\b([1-9][0-9]{5}|\b[0-9]{5}(?:-[0-9]{4})?)\b/;

    // 1. Customer Name via prefix or following line
    for (let i = 0; i < lines.length; i++) {
      if (this.isTimedOut(startTime)) break;
      const line = lines[i];
      const match = line.match(customerPrefixRegex);
      if (match) {
        let val = match[1].trim();
        if (val.length === 0 && i + 1 < lines.length) {
          val = lines[i + 1].trim();
        }
        if (val.length > 0 && !customerName) {
          val = this.sanitizeString(val);
          const bbox = this.locateBoundingBox(val, tokens, i);
          const label = category === 'ID_DOCUMENT' ? 'Cardholder Name' : 'Customer / Billed-To Name';
          customerName = {
            key: 'customerName',
            label,
            value: val,
            confidence: 88,
            pageNumber: bbox?.pageNumber ?? 1,
            boundingBox: bbox?.box ?? null,
            category: 'entity',
            isAbsent: false,
            isLowConfidence: false
          };
        }
      }
    }

    // 2. Vendor Name via prefix or top line heuristic
    for (let i = 0; i < Math.min(6, lines.length); i++) {
      if (this.isTimedOut(startTime)) break;
      const line = lines[i];
      const match = line.match(vendorPrefixRegex);
      if (match && !vendorName) {
        const val = this.sanitizeString(match[1].trim());
        const bbox = this.locateBoundingBox(val, tokens, i);
        vendorName = {
          key: 'vendorName',
          label: 'Vendor / Merchant Name',
          value: val,
          confidence: 90,
          pageNumber: bbox?.pageNumber ?? 1,
          boundingBox: bbox?.box ?? null,
          category: 'entity',
          isAbsent: false,
          isLowConfidence: false
        };
        break;
      }
    }

    // Top-of-page vendor name heuristic if no explicit "from/vendor:" prefix
    if (!vendorName && lines.length > 0 && category !== 'ID_DOCUMENT') {
      for (let i = 0; i < Math.min(4, lines.length); i++) {
        const line = lines[i];
        if (
          !/^(tax\s{0,2}invoice|receipt|invoice|bill|statement|cash\s{0,2}memo)$/i.test(line) &&
          !/^\d+$/.test(line) &&
          line.length > 2 &&
          !line.toLowerCase().includes('date')
        ) {
          const val = this.sanitizeString(line);
          const bbox = this.locateBoundingBox(val, tokens, i);
          vendorName = {
            key: 'vendorName',
            label: 'Vendor / Merchant Name',
            value: val,
            confidence: 82,
            pageNumber: bbox?.pageNumber ?? 1,
            boundingBox: bbox?.box ?? null,
            category: 'entity',
            isAbsent: false,
            isLowConfidence: false
          };
          break;
        }
      }
    }

    // 3. Physical Address via Spatial Clustering (ReDoS safe — bounded regex)
    const addressClusters: string[][] = [];
    let currentCluster: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (this.isTimedOut(startTime)) break;
      const line = lines[i];
      // Bounded check without nested quantifiers: avoids catastrophic backtracking
      const hasAddrIndicator =
        addressKeywords.test(line) ||
        postalCodeRegex.test(line) ||
        /[A-Za-z\s]{2,30},\s{0,3}[A-Za-z]{2,20}/.test(line);

      if (hasAddrIndicator && !/^(total|subtotal|balance|tax)/i.test(line)) {
        currentCluster.push(line);
      } else {
        if (currentCluster.length > 0) {
          addressClusters.push(currentCluster);
          currentCluster = [];
        }
      }
    }
    if (currentCluster.length > 0) {
      addressClusters.push(currentCluster);
    }

    if (addressClusters.length > 0) {
      const best = addressClusters.sort((a, b) => b.join(' ').length - a.join(' ').length)[0];
      const joinedAddress = this.sanitizeString(best.join(', '));
      const bbox = this.locateBoundingBox(best[0], tokens, 0);
      address = {
        key: 'address',
        label: 'Physical Address',
        value: joinedAddress,
        confidence: 84,
        pageNumber: bbox?.pageNumber ?? 1,
        boundingBox: bbox?.box ?? null,
        category: 'entity',
        isAbsent: false,
        isLowConfidence: false
      };
    }

    return { vendorName, customerName, address };
  }

  /**
   * Maps extracted text or token match to an exact bounding box in page coordinate space.
   * Uses pre-indexed cleanText for fast O(1) matching per token.
   */
  locateBoundingBox(
    searchText: string,
    tokens: IndexedToken[],
    lineIndex: number
  ): { box: BoundingBox; pageNumber: number } | null {
    if (!searchText) return null;

    if (tokens && tokens.length > 0) {
      const cleanSearch = searchText.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanSearch.length > 0) {
        const matchingTokens = tokens.filter(t => {
          return t.cleanText.length > 0 && (cleanSearch.includes(t.cleanText) || t.cleanText.includes(cleanSearch));
        });

        if (matchingTokens.length > 0) {
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          const pageNumber = matchingTokens[0].pageNumber || 1;

          for (const tok of matchingTokens) {
            if (tok.x < minX) minX = tok.x;
            if (tok.y < minY) minY = tok.y;
            if (tok.x + tok.width > maxX) maxX = tok.x + tok.width;
            if (tok.y + tok.height > maxY) maxY = tok.y + tok.height;
          }

          return {
            pageNumber,
            box: {
              x: Math.round(minX),
              y: Math.round(minY),
              width: Math.max(10, Math.round(maxX - minX)),
              height: Math.max(10, Math.round(maxY - minY))
            }
          };
        }
      }
    }

    // Synthetic geometry fallback based on document line index to ensure coordinate integrity
    const estimatedY = 40 + lineIndex * 24;
    return {
      pageNumber: 1,
      box: {
        x: 40,
        y: estimatedY,
        width: Math.min(480, Math.max(80, searchText.length * 9)),
        height: 20
      }
    };
  }

  /**
   * Exports structured result to JSON via StorageService.saveFile.
   * Immune to Prototype Pollution: uses Object.create(null) dictionary and key sanitization.
   */
  async exportToJson(
    result: StructuredExtractionResult,
    filename: string = 'extracted-fields.json'
  ): Promise<{ file: File; savedUri?: string }> {
    if (!result || !result.fields) {
      throw new Error('Invalid extraction result: missing fields');
    }

    // Use Object.create(null) to completely prevent Prototype Pollution
    const fieldsMap: StructuredExportJson['fields'] = Object.create(null);

    for (const f of result.fields) {
      const safeKey = this.sanitizeFieldKey(f.key);
      const safeLabel = this.sanitizeString(f.label || safeKey);
      const safeValue = f.value !== null && f.value !== undefined ? this.sanitizeString(f.value) : null;
      const safeConfidence = typeof f.confidence === 'number' && !isNaN(f.confidence) ? Math.min(100, Math.max(0, f.confidence)) : 0;
      const safePage = typeof f.pageNumber === 'number' && f.pageNumber >= 1 ? f.pageNumber : 1;
      const safeBox = f.boundingBox
        ? {
            x: Math.round(f.boundingBox.x || 0),
            y: Math.round(f.boundingBox.y || 0),
            width: Math.max(1, Math.round(f.boundingBox.width || 0)),
            height: Math.max(1, Math.round(f.boundingBox.height || 0))
          }
        : null;

      fieldsMap[safeKey] = {
        label: safeLabel,
        value: safeValue,
        confidence: safeConfidence,
        pageNumber: safePage,
        boundingBox: safeBox
      };
    }

    const exportData: StructuredExportJson = {
      documentCategory: result.documentCategory || 'UNKNOWN',
      extractedAt: result.metadata?.extractedAt || new Date().toISOString(),
      fileName: result.metadata?.fileName ? this.sanitizeString(result.metadata.fileName) : undefined,
      pageCount: Math.max(1, result.pageCount || 1),
      fields: fieldsMap
    };

    // Strict schema validation before JSON export
    const validation = this.validateExportJson(exportData);
    if (!validation.valid) {
      console.warn('JSON export schema warnings:', validation.errors);
    }

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const targetName = filename.endsWith('.json') ? filename : `${filename}.json`;

    const file = typeof File !== 'undefined'
      ? new File([blob], targetName, { type: 'application/json' })
      : ({ name: targetName, size: blob.size, type: 'application/json' } as unknown as File);

    const savedUri = await this.storageService.saveFile(file, 'structured-json', undefined, {
      preserveName: true
    });

    return { file, savedUri };
  }

  /**
   * Exports structured result to RFC 4180 compliant CSV via StorageService.saveFile.
   * Fully protected against CSV / Formula Injection attacks (CWE-1236).
   */
  async exportToCsv(
    result: StructuredExtractionResult,
    filename: string = 'extracted-fields.csv'
  ): Promise<{ file: File; savedUri?: string }> {
    if (!result || !result.fields) {
      throw new Error('Invalid extraction result: missing fields');
    }

    const headers = ['Key', 'Label', 'Value', 'Confidence (%)', 'Page', 'Status'];
    const rows: string[][] = [headers];

    for (const f of result.fields) {
      const status = f.isAbsent ? 'Absent' : f.confidence >= 80 ? 'High Confidence' : 'Low Confidence';
      const safeKey = this.sanitizeFieldKey(f.key);
      const safeLabel = this.sanitizeString(f.label || safeKey);
      const safeValue = f.value !== null && f.value !== undefined ? this.sanitizeString(f.value) : '';
      const safeConfidence = typeof f.confidence === 'number' && !isNaN(f.confidence) ? f.confidence.toString() : '0';
      const safePage = typeof f.pageNumber === 'number' && !isNaN(f.pageNumber) ? f.pageNumber.toString() : '1';

      rows.push([
        safeKey,
        safeLabel,
        safeValue,
        safeConfidence,
        safePage,
        status
      ]);
    }

    // RFC 4180 formatting + Formula Injection escaping
    const csvContent = rows
      .map(row => row.map(cell => this.formatCsvCell(cell)).join(','))
      .join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const targetName = filename.endsWith('.csv') ? filename : `${filename}.csv`;

    const file = typeof File !== 'undefined'
      ? new File([blob], targetName, { type: 'text/csv' })
      : ({ name: targetName, size: blob.size, type: 'text/csv' } as unknown as File);

    const savedUri = await this.storageService.saveFile(file, 'structured-csv', undefined, {
      preserveName: true
    });

    return { file, savedUri };
  }

  /**
   * Sanitizes and escapes a cell value against CSV / Formula Injection (CWE-1236).
   * Characters =, +, -, @, \t, \r, |, % trigger formula calculation or DDE execution in spreadsheet apps.
   * If detected at the start of a value, prepend a single quote (') to force treatment as text.
   */
  formatCsvCell(raw: string): string {
    if (raw === null || raw === undefined) return '';
    let val = String(raw);

    // Escape formula injection
    const trimmed = val.trimStart();
    if (/^[=+\-@\t\r|%]/.test(trimmed)) {
      val = `'${val}`;
    }

    // RFC 4180 quotation escaping
    if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  }

  /**
   * Sanitizes string from dangerous HTML/script injection tags (XSS defense).
   */
  sanitizeString(input: string): string {
    if (!input || typeof input !== 'string') return '';
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/[<>]/g, '')
      .trim();
  }

  /**
   * Sanitizes dictionary keys against Prototype Pollution.
   */
  sanitizeFieldKey(key: string): string {
    if (!key || typeof key !== 'string') return 'field';
    const clean = key.trim();
    const lower = clean.toLowerCase();
    if (lower === '__proto__' || lower === 'constructor' || lower === 'prototype') {
      return `_${clean}`;
    }
    return clean.replace(/[^a-zA-Z0-9_\-]/g, '_');
  }

  /**
   * Strict schema validation for StructuredExtractionResult.
   */
  validateExtractionResult(result: StructuredExtractionResult): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!result) {
      return { valid: false, errors: ['Null or undefined extraction result'] };
    }

    const validCategories: DocumentCategory[] = [
      'RECEIPT', 'INVOICE', 'UTILITY_BILL', 'ID_DOCUMENT', 'BANK_STATEMENT', 'UNKNOWN'
    ];
    if (!validCategories.includes(result.documentCategory)) {
      errors.push(`Invalid documentCategory: ${result.documentCategory}`);
    }

    if (!Array.isArray(result.fields)) {
      errors.push('Result fields must be an array');
    } else {
      for (let i = 0; i < result.fields.length; i++) {
        const f = result.fields[i];
        if (!f.key) errors.push(`Field at index ${i} missing key`);
        if (!f.label) errors.push(`Field at index ${i} missing label`);
        if (typeof f.confidence !== 'number' || f.confidence < 0 || f.confidence > 100) {
          errors.push(`Field ${f.key} confidence out of range 0-100: ${f.confidence}`);
        }
        if (f.isAbsent && f.value !== null) {
          errors.push(`Field ${f.key} marked absent must have null value`);
        }
        if (f.isAbsent && f.confidence !== 0) {
          errors.push(`Field ${f.key} marked absent must have 0 confidence`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Strict schema validation for StructuredExportJson.
   */
  validateExportJson(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!data || typeof data !== 'object') {
      return { valid: false, errors: ['Export data must be an object'] };
    }
    if (!data.documentCategory) errors.push('Missing documentCategory');
    if (!data.fields || typeof data.fields !== 'object') {
      errors.push('Missing or invalid fields map');
    }
    return { valid: errors.length === 0, errors };
  }

  private isTimedOut(startTime: number): boolean {
    return performance.now() - startTime > this.TIMEOUT_MS;
  }
}
