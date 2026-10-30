import { Injectable, inject } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';
import '../utilities/pdfjs-worker';

import { StorageService } from './storage.service';
import { HistoryService } from './history.service';
import {
  DocumentClassificationResult,
  DocumentMetadataInput,
  DocumentOrganizationProposal,
  DocumentRenameProposal,
  GenericDocumentCategory,
  OrganizationAppliedResult
} from '../models/document-classifier.types';

/**
 * Standard English & noise stop words to filter out during semantic auto-tagging.
 */
export const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are',
  'aren\'t', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both',
  'but', 'by', 'can', 'can\'t', 'cannot', 'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does',
  'doesn\'t', 'doing', 'don\'t', 'down', 'during', 'each', 'few', 'for', 'from', 'further',
  'had', 'hadn\'t', 'has', 'hasn\'t', 'have', 'haven\'t', 'having', 'he', 'he\'d', 'he\'ll',
  'he\'s', 'her', 'here', 'here\'s', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'how\'s',
  'i', 'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 'into', 'is', 'isn\'t', 'it', 'it\'s',
  'its', 'itself', 'let\'s', 'me', 'more', 'most', 'mustn\'t', 'my', 'myself', 'no', 'nor',
  'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves',
  'out', 'over', 'own', 'same', 'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s', 'should',
  'shouldn\'t', 'so', 'some', 'such', 'than', 'that', 'that\'s', 'the', 'their', 'theirs',
  'them', 'themselves', 'then', 'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll',
  'they\'re', 'they\'ve', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up',
  'very', 'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll', 'we\'re', 'we\'ve', 'were', 'weren\'t',
  'what', 'what\'s', 'when', 'when\'s', 'where', 'where\'s', 'which', 'while', 'who', 'who\'s',
  'whom', 'why', 'why\'s', 'with', 'won\'t', 'would', 'wouldn\'t', 'you', 'you\'d', 'you\'ll',
  'you\'re', 'you\'ve', 'your', 'yours', 'yourself', 'yourselves',
  // Document noise words
  'page', 'document', 'total', 'number', 'date', 'details', 'please', 'thank', 'thanks',
  'regards', 'sincerely', 'www', 'com', 'org', 'http', 'https', 'email', 'phone', 'tel',
  'fax', 'null', 'undefined', 'pdf', 'scanned', 'scan', 'copy', 'file', 'item', 'items'
]);

interface KeywordRule {
  term: string;
  weight: number;
}

@Injectable({
  providedIn: 'root'
})
export class DocumentClassifierService {
  private storageService = inject(StorageService);
  private historyService = inject(HistoryService);

  private readonly CATEGORY_KEYWORDS: Record<GenericDocumentCategory, KeywordRule[]> = {
    'Receipt': [
      { term: 'receipt', weight: 30 },
      { term: 'cash receipt', weight: 35 },
      { term: 'tax receipt', weight: 35 },
      { term: 'subtotal', weight: 20 },
      { term: 'tendered', weight: 25 },
      { term: 'change due', weight: 25 },
      { term: 'pos terminal', weight: 25 },
      { term: 'cashier', weight: 20 },
      { term: 'store #', weight: 20 },
      { term: 'items purchased', weight: 20 },
      { term: 'card txn', weight: 20 },
      { term: 'register #', weight: 20 },
      { term: 'merchant copy', weight: 25 },
      { term: 'customer copy', weight: 20 },
      { term: 'payment method', weight: 15 }
    ],
    'Invoice': [
      { term: 'invoice', weight: 30 },
      { term: 'tax invoice', weight: 35 },
      { term: 'bill to', weight: 25 },
      { term: 'billed to', weight: 25 },
      { term: 'invoice date', weight: 25 },
      { term: 'invoice no', weight: 25 },
      { term: 'inv #', weight: 25 },
      { term: 'due date', weight: 20 },
      { term: 'po #', weight: 20 },
      { term: 'purchase order', weight: 25 },
      { term: 'gstin', weight: 20 },
      { term: 'vat #', weight: 20 },
      { term: 'terms: net', weight: 25 },
      { term: 'amount due', weight: 20 },
      { term: 'balance due', weight: 20 },
      { term: 'remit to', weight: 20 },
      { term: 'payment terms', weight: 20 },
      { term: 'medical bill', weight: 35 },
      { term: 'hospital bill', weight: 35 },
      { term: 'patient name', weight: 25 },
      { term: 'consultation fee', weight: 25 },
      { term: 'pharmacy bill', weight: 25 }
    ],
    'Utility Bill': [
      { term: 'utility bill', weight: 35 },
      { term: 'electricity bill', weight: 35 },
      { term: 'water bill', weight: 35 },
      { term: 'gas bill', weight: 35 },
      { term: 'telecom bill', weight: 35 },
      { term: 'broadband bill', weight: 35 },
      { term: 'meter reading', weight: 30 },
      { term: 'units consumed', weight: 30 },
      { term: 'kwh', weight: 25 },
      { term: 'consumer number', weight: 25 },
      { term: 'consumer id', weight: 25 },
      { term: 'tariff', weight: 20 },
      { term: 'billing cycle', weight: 25 },
      { term: 'power distribution', weight: 25 },
      { term: 'disconnection date', weight: 25 },
      { term: 'previous reading', weight: 20 },
      { term: 'current reading', weight: 20 }
    ],
    'ID Document': [
      { term: 'identity card', weight: 35 },
      { term: 'identification', weight: 30 },
      { term: 'id card', weight: 35 },
      { term: 'national id', weight: 35 },
      { term: 'date of birth', weight: 30 },
      { term: 'dob', weight: 25 },
      { term: 'gender', weight: 20 },
      { term: 'valid until', weight: 25 },
      { term: 'expiry date', weight: 25 },
      { term: 'nationality', weight: 25 },
      { term: 'card number', weight: 25 },
      { term: 'holder name', weight: 25 },
      { term: 'blood group', weight: 25 },
      { term: 'id number', weight: 25 },
      { term: 'place of birth', weight: 20 }
    ],
    'Certificate': [
      { term: 'certificate', weight: 30 },
      { term: 'this is to certify', weight: 35 },
      { term: 'certifies that', weight: 35 },
      { term: 'awarded to', weight: 35 },
      { term: 'completion', weight: 20 },
      { term: 'achievement', weight: 25 },
      { term: 'authorized signatory', weight: 25 },
      { term: 'in witness whereof', weight: 20 },
      { term: 'conferred upon', weight: 35 },
      { term: 'diploma', weight: 30 },
      { term: 'degree', weight: 25 },
      { term: 'university degree', weight: 35 },
      { term: 'bachelor of', weight: 30 },
      { term: 'master of', weight: 30 },
      { term: 'doctor of', weight: 30 },
      { term: 'academic year', weight: 25 },
      { term: 'certificate of merit', weight: 35 },
      { term: 'in recognition of', weight: 25 }
    ],
    'Official Letter': [
      { term: 'to whom it may concern', weight: 35 },
      { term: 'dear sir', weight: 25 },
      { term: 'dear madam', weight: 25 },
      { term: 'formal request', weight: 25 },
      { term: 'memorandum', weight: 25 },
      { term: 'office memo', weight: 30 },
      { term: 'yours faithfully', weight: 30 },
      { term: 'letter of intent', weight: 30 },
      { term: 'with reference to', weight: 20 },
      { term: 'kindly request', weight: 20 },
      { term: 'formal notice', weight: 25 },
      { term: 'subject:', weight: 15 }
    ],
    'Financial Statement': [
      { term: 'financial statement', weight: 35 },
      { term: 'bank statement', weight: 35 },
      { term: 'balance sheet', weight: 35 },
      { term: 'income statement', weight: 35 },
      { term: 'profit and loss', weight: 35 },
      { term: 'cash flow', weight: 30 },
      { term: 'opening balance', weight: 30 },
      { term: 'closing balance', weight: 30 },
      { term: 'credit', weight: 15 },
      { term: 'debit', weight: 15 },
      { term: 'ledger', weight: 25 },
      { term: 'account statement', weight: 35 },
      { term: 'transaction history', weight: 30 },
      { term: 'assets and liabilities', weight: 30 }
    ],
    'Notes': [
      { term: 'meeting notes', weight: 35 },
      { term: 'minutes of meeting', weight: 35 },
      { term: 'action items', weight: 30 },
      { term: 'summary notes', weight: 30 },
      { term: 'lecture notes', weight: 35 },
      { term: 'brainstorming', weight: 25 },
      { term: 'key takeaways', weight: 30 },
      { term: 'memo notes', weight: 30 },
      { term: 'discussion points', weight: 25 },
      { term: 'attendees:', weight: 25 },
      { term: 'notes:', weight: 20 }
    ],
    'Contract': [
      { term: 'agreement', weight: 25 },
      { term: 'contract', weight: 25 },
      { term: 'terms and conditions', weight: 25 },
      { term: 'memorandum of understanding', weight: 35 },
      { term: 'non-disclosure agreement', weight: 35 },
      { term: 'between the parties', weight: 30 },
      { term: 'party of the first part', weight: 35 },
      { term: 'party of the second part', weight: 35 },
      { term: 'whereas', weight: 25 },
      { term: 'covenant', weight: 25 },
      { term: 'hereby agree', weight: 30 },
      { term: 'governing law', weight: 30 },
      { term: 'indemnification', weight: 25 },
      { term: 'severability', weight: 25 },
      { term: 'employment contract', weight: 35 },
      { term: 'employment agreement', weight: 35 },
      { term: 'employer', weight: 25 },
      { term: 'employee', weight: 25 },
      { term: 'remuneration', weight: 25 },
      { term: 'job title', weight: 20 }
    ],
    'Other': []
  };

  /**
   * Classify document text and metadata into one of the 9 generic categories.
   */
  classifyDocument(
    text: string,
    metadata?: DocumentMetadataInput
  ): DocumentClassificationResult {
    const normalizedText = (text || '').toLowerCase();
    const scores: Record<GenericDocumentCategory, number> = {
      'Receipt': 0,
      'Invoice': 0,
      'Utility Bill': 0,
      'ID Document': 0,
      'Certificate': 0,
      'Official Letter': 0,
      'Financial Statement': 0,
      'Notes': 0,
      'Contract': 0,
      'Other': 0
    };

    const matchedSignals: string[] = [];

    // Evaluate keyword frequency weights
    for (const [cat, rules] of Object.entries(this.CATEGORY_KEYWORDS) as [GenericDocumentCategory, KeywordRule[]][]) {
      for (const rule of rules) {
        if (normalizedText.includes(rule.term)) {
          scores[cat] += rule.weight;
          matchedSignals.push(`${cat}: "${rule.term}"`);
        }
      }
    }

    // Structural and Layout Cues
    const pageCount = metadata?.pageCount || 1;
    if (pageCount === 1 && scores['Receipt'] > 0) {
      scores['Receipt'] += 15;
    }
    if (pageCount === 1 && scores['ID Document'] > 0) {
      scores['ID Document'] += 15;
    }
    if (pageCount > 1 && scores['Contract'] > 0) {
      scores['Contract'] += 15;
    }

    // Metadata signals (filename, title, author)
    const fileHint = ((metadata?.fileName || '') + ' ' + (metadata?.title || '')).toLowerCase();
    for (const [cat, rules] of Object.entries(this.CATEGORY_KEYWORDS) as [GenericDocumentCategory, KeywordRule[]][]) {
      for (const rule of rules) {
        if (fileHint.includes(rule.term)) {
          scores[cat] += rule.weight * 0.8;
          matchedSignals.push(`Metadata: "${rule.term}"`);
        }
      }
    }

    // Find highest score
    let bestCategory: GenericDocumentCategory = 'Other';
    let highestScore = 0;

    const categories = Object.keys(scores) as GenericDocumentCategory[];
    for (const cat of categories) {
      if (scores[cat] > highestScore) {
        highestScore = scores[cat];
        bestCategory = cat;
      }
    }

    // Fallback if no confident match
    if (highestScore < 20) {
      return {
        category: 'Other',
        confidence: 15,
        matchedSignals: []
      };
    }

    // Compute normalized confidence (0 - 100)
    const confidence = Math.min(99, Math.round(55 + (highestScore / 130) * 44));

    // Secondary categories
    const secondaryCategories = categories
      .filter(c => c !== bestCategory && scores[c] >= 20)
      .map(c => ({
        category: c,
        confidence: Math.min(95, Math.round(45 + (scores[c] / 130) * 44))
      }))
      .sort((a, b) => b.confidence - a.confidence);

    return {
      category: bestCategory,
      confidence,
      secondaryCategories,
      matchedSignals
    };
  }

  /**
   * Filters stop words and noise words from token collection.
   */
  filterStopWords(words: string[]): string[] {
    return words.filter(word => {
      const clean = word.toLowerCase().trim();
      return clean.length >= 3 && !STOP_WORDS.has(clean) && !/^\d+$/.test(clean);
    });
  }

  /**
   * Semantic Auto-Tagging:
   * Extracts 3 to 5 content tags from high-frequency domain keywords, headings, and dates.
   */
  extractTags(
    text: string,
    category: GenericDocumentCategory,
    maxTags: number = 5
  ): string[] {
    const tagsSet = new Set<string>();

    // 1. Domain/Category specific high-value tags
    const lower = text.toLowerCase();
    const domainTagMap: Record<string, string> = {
      'electricity': 'Electricity',
      'water': 'Water',
      'gas': 'Gas',
      'broadband': 'Broadband',
      'telecom': 'Telecom',
      'paid': 'Paid',
      'unpaid': 'Unpaid',
      'due': 'Due',
      'pending': 'Pending',
      'overdue': 'Overdue',
      'confidential': 'Confidential',
      'agreement': 'Agreement',
      'tax': 'Tax',
      'gst': 'GST',
      'vat': 'VAT',
      'audit': 'Audit',
      'medical': 'Medical',
      'travel': 'Travel',
      'ticket': 'Ticket',
      'flight': 'Flight',
      'academic': 'Academic',
      'salary': 'Salary',
      'payroll': 'Payroll',
      'subscription': 'Subscription',
      'retail': 'Retail',
      'hardware': 'Hardware',
      'groceries': 'Groceries',
      'meeting': 'Meeting',
      'minutes': 'Minutes',
      'statement': 'Statement',
      'certificate': 'Certificate',
      'identity': 'Identity',
      'national': 'National',
      'employment': 'Employment',
      'contract': 'Contract',
      'hospital': 'Hospital',
      'patient': 'Patient',
      'university': 'University',
      'degree': 'Degree'
    };

    for (const [key, tagValue] of Object.entries(domainTagMap)) {
      if (lower.includes(key)) {
        tagsSet.add(tagValue);
        if (tagsSet.size >= 2) break;
      }
    }

    // 2. Extracted Dates (e.g. "October 2026", "2026-10-28", "Nov 2026")
    const dateTag = this.extractDateTag(text);
    if (dateTag) {
      tagsSet.add(dateTag);
    }

    // 3. Prominent Headings / Capitalized phrases (2-3 words)
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines.slice(0, 10)) {
      if (line.length >= 4 && line.length <= 35 && !line.includes('http') && !line.includes('@')) {
        // Check if line looks like a title or header (Title Case or UPPERCASE)
        const words = line.split(/\s+/);
        const filtered = this.filterStopWords(words);
        if (filtered.length >= 1 && filtered.length <= 3) {
          const phrase = filtered.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
          if (phrase.length > 3 && !STOP_WORDS.has(phrase.toLowerCase())) {
            tagsSet.add(phrase);
            if (tagsSet.size >= 4) break;
          }
        }
      }
    }

    // 4. Keyword frequency from document body (filtered tokens)
    const rawTokens = text.match(/[A-Za-z\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F]{3,}/g) || [];
    const validTokens = this.filterStopWords(rawTokens);
    const freq: Record<string, number> = {};
    for (const t of validTokens) {
      const cap = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
      freq[cap] = (freq[cap] || 0) + 1;
    }

    const sortedTokens = Object.keys(freq).sort((a, b) => freq[b] - freq[a]);
    for (const word of sortedTokens) {
      if (tagsSet.size >= maxTags) break;
      if (!tagsSet.has(word) && word.length >= 4) {
        tagsSet.add(word);
      }
    }

    // 5. Fallback guarantees at least 3 tags
    if (tagsSet.size < 3 && category !== 'Other') {
      tagsSet.add(category.replace(/\s+/g, ''));
    }
    if (tagsSet.size < 3) {
      tagsSet.add('Reviewed');
    }
    if (tagsSet.size < 3) {
      tagsSet.add('Document');
    }

    return Array.from(tagsSet).slice(0, Math.max(3, maxTags));
  }

  /**
   * Sanitizes filenames to be 100% filesystem-safe across Android, macOS, Linux, and Windows:
   * - Strips path traversal attempts (..) and extracts basename
   * - Strips null-byte injections (\0) and control characters
   * - Strips invalid characters: / \ : * ? " < > |
   * - Replaces whitespace with underscores
   * - Strict whitelisting: only allows alphanumeric, underscores, and hyphens
   * - Truncates base name to max 60 characters
   * - Ensures .pdf extension
   */
  sanitizeFilename(name: string, maxBaseLength: number = 60): string {
    if (!name) return 'Document.pdf';

    // Remove null bytes and directory traversal sequences (..) immediately
    let sanitized = name.replace(/\0/g, '').replace(/\.\.+/g, '');

    // Remove existing extension if present
    let base = sanitized.replace(/\.[^/.]+$/, '');

    // Replace unsafe filesystem characters (including slashes) with underscore
    base = base.replace(/[\\/:*?"<>|\x00-\x1f\x7f-\x9f]/g, '_');

    // Replace whitespace (spaces, tabs, newlines) with underscore
    base = base.replace(/[\s\t\n\r]+/g, '_');

    // Strict whitelisting: replace anything not alphanumeric, underscore, or hyphen
    base = base.replace(/[^A-Za-z0-9_\-]/g, '_');

    // Collapse multiple underscores or dashes
    base = base.replace(/_+/g, '_').replace(/-+/g, '-');

    // Trim leading/trailing underscores, hyphens, and dots
    base = base.replace(/^[_.\-]+|[_.\-]+$/g, '');

    // Fallback if empty
    if (!base) {
      base = 'Document';
    }

    // Truncate base name to maxBaseLength
    if (base.length > maxBaseLength) {
      base = base.slice(0, maxBaseLength).replace(/[_.\-]+$/, '');
    }

    return `${base}.pdf`;
  }

  /**
   * Synthesize clean, descriptive filename proposal: "{Category}_{Title/Entity}_{Date}.pdf"
   * e.g. "Receipt_PowerUtility_2026-10-28.pdf"
   */
  suggestRename(
    category: GenericDocumentCategory,
    text: string,
    originalName?: string,
    metadata?: DocumentMetadataInput
  ): DocumentRenameProposal {
    const cleanCategory = (category === 'Other' ? 'Document' : category).replace(/\s+/g, '');

    // Extract entity or title
    const entity = this.extractEntityOrTitle(text, metadata, originalName);

    // Extract ISO date
    const detectedDate = this.extractIsoDate(text, metadata);

    // Format: "{Category}_{Title/Entity}_{Date}.pdf"
    const rawProposal = detectedDate
      ? `${cleanCategory}_${entity}_${detectedDate}.pdf`
      : `${cleanCategory}_${entity}.pdf`;

    const proposedName = this.sanitizeFilename(rawProposal, 60);

    return {
      originalName: originalName || 'unnamed.pdf',
      proposedName,
      category,
      entityOrTitle: entity,
      detectedDate,
      sanitized: true
    };
  }

  /**
   * Complete proposal pipeline for a single document file or text.
   */
  async classifyAndPropose(
    file?: File,
    text?: string,
    metadata?: DocumentMetadataInput
  ): Promise<DocumentOrganizationProposal> {
    const id = 'prop_' + Math.random().toString(36).substring(2, 9);
    const fileName = file?.name || metadata?.fileName || 'Scanned_Document.pdf';
    const fileSizeBytes = file?.size || metadata?.fileSizeBytes || 1024 * 50;

    let docText = text || '';
    let pageCount = metadata?.pageCount || 1;

    // If text was not provided and a File is supplied, extract text via pdfjsLib
    if (!docText && file && file.type === 'application/pdf') {
      try {
        const extracted = await this.extractTextFromPdf(file);
        docText = extracted.text;
        pageCount = extracted.pageCount;
      } catch (err) {
        console.warn('PDF text extraction error, falling back to metadata:', err);
      }
    }

    const classification = this.classifyDocument(docText, {
      fileName,
      pageCount,
      ...metadata
    });

    const tags = this.extractTags(docText, classification.category);
    const rename = this.suggestRename(classification.category, docText, fileName, {
      fileName,
      pageCount,
      ...metadata
    });

    return {
      id,
      file,
      originalFileName: fileName,
      fileSizeBytes,
      pageCount,
      classification,
      tags,
      proposedFileName: rename.proposedName,
      approvalStatus: 'pending' // STRICT SAFEGUARD: Always starts in pending
    };
  }

  /**
   * User Confirmation Safeguard:
   * NEVER rename or tag a document without explicit user review and confirmation.
   * Only items with approvalStatus === 'approved' are processed and saved!
   */
  async applyBatchOrganization(
    proposals: DocumentOrganizationProposal[]
  ): Promise<OrganizationAppliedResult[]> {
    const results: OrganizationAppliedResult[] = [];

    for (const proposal of proposals) {
      // STRICT SAFEGUARD: unapproved items are skipped!
      if (proposal.approvalStatus !== 'approved') {
        results.push({
          id: proposal.id,
          originalFileName: proposal.originalFileName,
          finalFileName: proposal.originalFileName,
          tags: proposal.tags,
          category: proposal.classification.category,
          status: 'skipped',
          errorMessage: 'Skipped: Not approved by user'
        });
        continue;
      }

      try {
        const finalName = this.sanitizeFilename(proposal.proposedFileName);
        let savedUri: string | undefined;

        if (proposal.file) {
          // Construct file with approved name and save via StorageService
          const renamedFile = new File([proposal.file], finalName, {
            type: proposal.file.type || 'application/pdf',
            lastModified: Date.now()
          });

          savedUri = await this.storageService.saveFile(renamedFile, 'renamed', undefined, {
            preserveName: true
          });
        } else {
          // Create document with approved name and save via StorageService
          const docBlob = new Blob([`%PDF-1.4\n% Content-based organized PDF: ${finalName}\n`], { type: 'application/pdf' });
          const renamedFile = new File([docBlob], finalName, { type: 'application/pdf' });
          savedUri = await this.storageService.saveFile(renamedFile, 'renamed', undefined, {
            preserveName: true
          });
        }

        results.push({
          id: proposal.id,
          originalFileName: proposal.originalFileName,
          finalFileName: finalName,
          tags: proposal.tags,
          category: proposal.classification.category,
          status: 'renamed',
          savedUri
        });
      } catch (err: any) {
        results.push({
          id: proposal.id,
          originalFileName: proposal.originalFileName,
          finalFileName: proposal.originalFileName,
          tags: proposal.tags,
          category: proposal.classification.category,
          status: 'failed',
          errorMessage: err?.message || 'Failed to save renamed document'
        });
      }
    }

    return results;
  }

  /**
   * Batch Vault Mode: Scans history vault or creates proposals from existing saved records.
   */
  async scanHistoryVault(maxFiles: number = 20): Promise<DocumentOrganizationProposal[]> {
    const history = await this.historyService.getHistory();
    const proposals: DocumentOrganizationProposal[] = [];

    if (history.length > 0) {
      const targetItems = history
        .filter(item => item.outputFileName && (item.outputFileName.endsWith('.pdf') || item.operation === 'pdf'))
        .slice(0, maxFiles);

      for (const item of targetItems) {
        const sampleText = `Scanned document: ${item.outputFileName}. Operation: ${item.operation}.`;
        const proposal = await this.classifyAndPropose(undefined, sampleText, {
          fileName: item.outputFileName,
          fileSizeBytes: item.outputSizeBytes || 1024 * 40,
          creationDate: new Date(item.date).toISOString()
        });
        proposals.push(proposal);
      }
    }

    // If vault history is empty, populate realistic sample proposals so the user can immediately try it
    if (proposals.length === 0) {
      const mockVaultDocuments = [
        {
          name: 'IMG_20261028_001.pdf',
          size: 1024 * 85,
          text: 'ELECTRICITY BILL Consumer No: 8847291 Tariff: Residential Meter Reading kWh: 340 Units Consumed: 120 Total Amount Due: 1450 Due Date: 2026-11-15 Power Distribution Corp'
        },
        {
          name: 'scan_invoice_temp.pdf',
          size: 1024 * 120,
          text: 'TAX INVOICE Invoice No: INV-2026-042 Bill To: Acme Logistics Date: 2026-10-24 Payment Terms: Net 30 Amount Due: 18,500 GSTIN: 27AAAAA0000A1Z5'
        },
        {
          name: 'doc_receipt_store.pdf',
          size: 1024 * 45,
          text: 'CASH RECEIPT Store #402 Cashier: Alex Subtotal: 550 Tax: 25 Total Tendered: 600 Change Due: 25 Paid in Cash Thank you for shopping 2026-10-27'
        },
        {
          name: 'agreement_draft_v2.pdf',
          size: 1024 * 240,
          text: 'NON-DISCLOSURE AGREEMENT This Agreement is entered between Party A and Party B. Terms and Conditions: Governing law of Maharashtra. In Witness Whereof 2026-10-15'
        },
        {
          name: 'cert_participant.pdf',
          size: 1024 * 90,
          text: 'CERTIFICATE OF COMPLETION This is to certify that Rahul Sharma has successfully completed the Advanced Training. Awarded on 2026-10-20 Authorized Signatory'
        }
      ];

      for (const doc of mockVaultDocuments) {
        const prop = await this.classifyAndPropose(undefined, doc.text, {
          fileName: doc.name,
          fileSizeBytes: doc.size,
          pageCount: 1
        });
        proposals.push(prop);
      }
    }

    return proposals;
  }

  /**
   * Ingests multiple files and generates proposals for each.
   */
  async proposeBatchFromFiles(files: File[]): Promise<DocumentOrganizationProposal[]> {
    const proposals: DocumentOrganizationProposal[] = [];
    for (const file of files) {
      const proposal = await this.classifyAndPropose(file);
      proposals.push(proposal);
    }
    return proposals;
  }

  // --- Private Extraction Helpers ---

  private async extractTextFromPdf(file: File): Promise<{ text: string; pageCount: number }> {
    const buffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false
    });

    const pdfDoc = await loadingTask.promise;
    const pageCount = pdfDoc.numPages;
    let fullText = '';

    for (let p = 1; p <= Math.min(pageCount, 5); p++) {
      const page = await pdfDoc.getPage(p);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str || '')
        .join(' ');
      fullText += pageText + '\n';
    }

    return { text: fullText, pageCount };
  }

  private extractEntityOrTitle(
    text: string,
    metadata?: DocumentMetadataInput,
    originalName?: string
  ): string {
    // 1. Look for explicit entity patterns in text (stop at newline, comma, colon)
    const entityRegexes = [
      /(?:Vendor|Merchant|Company|Store|Billed From|From|Provider|Employer|Organization|Institution|University|College|Hospital|Clinic)\s*[:\-]\s*([A-Za-z0-9&'.\t ]{2,30})/i,
      /(?:Bill To|Billed To|Customer|Client|Issued To|Certifies That|Awarded To|Dear|Patient Name|Patient|Employee)\s*[:\-]?\s*([A-Za-z0-9&'.\t ]{2,30})/i,
      /(?:Power Distribution|Electricity|Water Board|Telecom|Bank|Hospital|University|Logistics)\s*([A-Za-z0-9&'.\t ]{0,25})/i
    ];

    for (const regex of entityRegexes) {
      const match = text.match(regex);
      if (match && match[1]) {
        let clean = match[1]
          .trim()
          .replace(/\0/g, '')
          .replace(/\.\.+/g, '')
          .replace(/[\\/:*?"<>|\n\r]/g, '')
          .replace(/\s+/g, '_')
          .replace(/^[_.\-]+|[_.\-]+$/g, '')
          .slice(0, 25);
        if (clean.length >= 2) return clean;
      }
    }

    // 2. Check metadata title
    if (metadata?.title && metadata.title.length >= 3) {
      const cleanTitle = metadata.title
        .trim()
        .replace(/[\\/:*?"<>|\s]/g, '_')
        .slice(0, 25);
      if (cleanTitle) return cleanTitle;
    }

    // 3. Fallback to prominent heading or first capitalized entity
    const words = this.filterStopWords(text.split(/\s+/));
    if (words.length > 0 && words[0].length >= 3) {
      return words[0].slice(0, 20);
    }

    // 4. Fallback based on original filename base
    if (originalName) {
      const cleanOrig = originalName
        .replace(/\.[^/.]+$/, '')
        .replace(/[^A-Za-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 20);
      if (cleanOrig.length >= 2) return cleanOrig;
    }

    return 'Document';
  }

  private extractIsoDate(text: string, metadata?: DocumentMetadataInput): string | undefined {
    // 1. Standard ISO date: YYYY-MM-DD
    const isoMatch = text.match(/\b(20\d\d[-/.](?:0[1-9]|1[0-2])[-/.](?:0[1-9]|[12]\d|3[01]))\b/);
    if (isoMatch) {
      return isoMatch[1].replace(/[./]/g, '-');
    }

    // 2. Indian date format: DD-MM-YYYY or DD/MM/YYYY
    const dmyMatch = text.match(/\b((?:0[1-9]|[12]\d|3[01])[-/.](?:0[1-9]|1[0-2])[-/.](?:20\d\d))\b/);
    if (dmyMatch) {
      const parts = dmyMatch[1].split(/[-/.]/);
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }

    // 3. Textual date (e.g. "28 Oct 2026" or "October 28, 2026")
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };

    const textDateMatch = text.match(/\b(\d{1,2})[\s\-]+([A-Za-z]{3,9})[\s\-]+(20\d\d)\b/);
    if (textDateMatch) {
      const day = textDateMatch[1].padStart(2, '0');
      const monthPrefix = textDateMatch[2].slice(0, 3).toLowerCase();
      const month = months[monthPrefix];
      const year = textDateMatch[3];
      if (month) return `${year}-${month}-${day}`;
    }

    // 4. Month and Year: e.g. "October 2026"
    const monthYearMatch = text.match(/\b([A-Za-z]{3,9})\s+(20\d\d)\b/);
    if (monthYearMatch) {
      const monthPrefix = monthYearMatch[1].slice(0, 3).toLowerCase();
      const month = months[monthPrefix];
      if (month) return `${monthYearMatch[2]}-${month}`;
    }

    // 5. Metadata creation date fallback
    if (metadata?.creationDate) {
      const d = new Date(metadata.creationDate);
      if (!isNaN(d.getTime())) {
        return d.toISOString().slice(0, 10);
      }
    }

    // 6. Default to current date
    return new Date().toISOString().slice(0, 10);
  }

  private extractDateTag(text: string): string | undefined {
    const monthYearMatch = text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(20\d\d)\b/i);
    if (monthYearMatch) {
      return `${monthYearMatch[1]} ${monthYearMatch[2]}`;
    }

    const isoMatch = text.match(/\b(20\d\d[-/.](?:0[1-9]|1[0-2])[-/.](?:0[1-9]|[12]\d|3[01]))\b/);
    if (isoMatch) {
      return isoMatch[1].replace(/[./]/g, '-');
    }

    return undefined;
  }
}
