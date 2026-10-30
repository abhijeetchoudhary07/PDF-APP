import { Injectable, inject } from '@angular/core';
import { StorageService } from './storage.service';
import {
  BoundingBox,
  ClauseCategory,
  EntityClauseExportJson,
  EntityClauseExtractionResult,
  EntityClauseSummary,
  EntityType,
  ExtractedClause,
  ExtractedEntity,
  ExtractedWordToken,
  LEGAL_DISCLAIMER
} from '../models/entity-clause.types';

@Injectable({
  providedIn: 'root'
})
export class EntityClauseExtractionService {
  private storageService = inject(StorageService);

  readonly DISCLAIMER = LEGAL_DISCLAIMER;

  /**
   * Main entry point: Extracts entities and operative clauses from raw text and token coordinates.
   */
  extract(
    rawText: string,
    tokens: ExtractedWordToken[] = [],
    pageCount: number = 1,
    fileName?: string
  ): EntityClauseExtractionResult {
    const startTime = performance.now();

    const entities: ExtractedEntity[] = [];

    // 1. Extract Key Entities
    const dates = this.extractDates(rawText, tokens);
    const amounts = this.extractAmounts(rawText, tokens);
    const parties = this.extractParties(rawText, tokens);
    const deadlines = this.extractDeadlines(rawText, tokens);
    const references = this.extractReferences(rawText, tokens);

    entities.push(...dates, ...amounts, ...parties, ...deadlines, ...references);

    // 2. Extract Operative Contractual Clauses
    const clauses = this.extractClauses(rawText, tokens);

    // 3. Compute Summary Metrics
    const amountsCount = entities.filter(e => e.type === 'amount').length;
    const datesDeadlinesCount = entities.filter(e => e.type === 'date' || e.type === 'deadline').length;
    const partiesCount = entities.filter(e => e.type === 'party').length;

    const summary: EntityClauseSummary = {
      totalEntities: entities.length,
      totalClauses: clauses.length,
      amountsCount,
      datesDeadlinesCount,
      partiesCount,
      clausesCount: clauses.length
    };

    const executionTimeMs = Math.round(performance.now() - startTime);

    return {
      entities,
      clauses,
      pageCount: Math.max(1, pageCount),
      rawText,
      summary,
      metadata: {
        fileName,
        extractedAt: new Date().toISOString(),
        executionTimeMs,
        disclaimer: this.DISCLAIMER
      }
    };
  }

  /**
   * 1. Extract Dates
   * Finds standard date formats (ISO, DD/MM/YYYY, MM/DD/YYYY, Textual) and classifies context.
   */
  extractDates(text: string, tokens: ExtractedWordToken[]): ExtractedEntity[] {
    const results: ExtractedEntity[] = [];
    const seenValues = new Set<string>();

    const isoRegex = /\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\b/g;
    const slashRegex = /\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/g;
    const textualRegex1 = /\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember))[,\s]+\d{4})\b/gi;
    const textualRegex2 = /\b((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember))\s+\d{1,2}(?:st|nd|rd|th)?[,\s]+\d{4})\b/gi;

    const regexList = [textualRegex1, textualRegex2, isoRegex, slashRegex];
    const lines = text.split(/\r?\n/);

    lines.forEach((line, lineIdx) => {
      for (const regex of regexList) {
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(line)) !== null) {
          const rawDate = match[1].trim();
          const cleanKey = rawDate.toLowerCase();
          if (seenValues.has(cleanKey)) continue;
          seenValues.add(cleanKey);

          let label = 'Date';
          const lowerLine = line.toLowerCase();
          if (lowerLine.includes('effective date') || lowerLine.includes('effective as of')) {
            label = 'Effective Date';
          } else if (lowerLine.includes('execution date') || lowerLine.includes('signed date') || lowerLine.includes('agreement date')) {
            label = 'Execution Date';
          } else if (lowerLine.includes('termination date') || lowerLine.includes('expiration date')) {
            label = 'Expiration Date';
          } else if (lowerLine.includes('due date') || lowerLine.includes('payment due')) {
            label = 'Payment Due Date';
          } else if (lowerLine.includes('commencement date') || lowerLine.includes('start date')) {
            label = 'Commencement Date';
          }

          const bbox = this.locateBoundingBox(rawDate, tokens, lineIdx);
          results.push({
            id: `date-${results.length + 1}`,
            type: 'date',
            label,
            value: rawDate,
            normalizedValue: this.normalizeDate(rawDate),
            pageNumber: bbox.pageNumber,
            boundingBox: bbox,
            confidence: 94,
            contextSentence: line.trim()
          });
        }
      }
    });

    return results;
  }

  /**
   * 2. Extract Monetary Amounts
   * Captures currencies ($ € £ ₹ INR USD EUR GBP) and amounts with comma/decimal formats.
   */
  extractAmounts(text: string, tokens: ExtractedWordToken[]): ExtractedEntity[] {
    const results: ExtractedEntity[] = [];
    const seenValues = new Set<string>();

    const amountRegex = /(?:(\$|€|£|₹|Rs\.?|INR|USD|EUR|GBP)\s*([0-9]{1,3}(?:[,\s][0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)|([0-9]{1,3}(?:[,\s][0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\s*(USD|EUR|GBP|INR|dollars|rupees))/gi;

    const lines = text.split(/\r?\n/);

    lines.forEach((line, lineIdx) => {
      amountRegex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = amountRegex.exec(line)) !== null) {
        const fullMatch = match[0].trim();
        const numPart = (match[2] || match[3] || '').replace(/,/g, '').trim();
        const numericVal = parseFloat(numPart);
        if (isNaN(numericVal) || numericVal <= 0) continue;

        const cleanKey = fullMatch.toLowerCase().replace(/\s+/g, '');
        if (seenValues.has(cleanKey)) continue;
        seenValues.add(cleanKey);

        let label = 'Monetary Amount';
        const lowerLine = line.toLowerCase();
        if (lowerLine.includes('total') || lowerLine.includes('aggregate')) {
          label = 'Total Amount';
        } else if (lowerLine.includes('penalty') || lowerLine.includes('liquidated damages') || lowerLine.includes('fine')) {
          label = 'Penalty Amount';
        } else if (lowerLine.includes('fee') || lowerLine.includes('compensation') || lowerLine.includes('service fee')) {
          label = 'Fee';
        } else if (lowerLine.includes('deposit') || lowerLine.includes('security')) {
          label = 'Security Deposit';
        } else if (lowerLine.includes('rent')) {
          label = 'Rent';
        }

        const bbox = this.locateBoundingBox(fullMatch, tokens, lineIdx);
        results.push({
          id: `amount-${results.length + 1}`,
          type: 'amount',
          label,
          value: fullMatch,
          normalizedValue: numericVal,
          pageNumber: bbox.pageNumber,
          boundingBox: bbox,
          confidence: 95,
          contextSentence: line.trim()
        });
      }
    });

    return results;
  }

  /**
   * 3. Extract Contracting Parties
   * Captures agreement introductory clauses, defined roles (Employer, Contractor), and company suffixes.
   */
  extractParties(text: string, tokens: ExtractedWordToken[]): ExtractedEntity[] {
    const results: ExtractedEntity[] = [];
    const seenValues = new Set<string>();

    const addParty = (name: string, label: string, lineIdx: number, context: string) => {
      const cleanName = name.replace(/^[\s,;:"'()]+|[\s,;:"'()]+$/g, '').trim();
      if (!cleanName || cleanName.length < 3) return;
      if (/^(and|the|this|agreement|contract|between|by|party)$/i.test(cleanName)) return;

      const norm = cleanName.toLowerCase();
      if (seenValues.has(norm)) return;
      seenValues.add(norm);

      const bbox = this.locateBoundingBox(cleanName, tokens, lineIdx);
      results.push({
        id: `party-${results.length + 1}`,
        type: 'party',
        label,
        value: cleanName,
        pageNumber: bbox.pageNumber,
        boundingBox: bbox,
        confidence: 90,
        contextSentence: context.trim()
      });
    };

    const lines = text.split(/\r?\n/);

    // Pattern A: "between [Party A] and [Party B]" (strictly bounded to 80 chars to eliminate ReDoS)
    const betweenRegex = /(?:by\s+and\s+between|between|entered\s+into\s+between)\s+([A-Z0-9][A-Za-z0-9&.,\s]{1,80}?)\s+and\s+([A-Z0-9][A-Za-z0-9&.,\s]{1,80}?)(?:\s*\(|\.|,|$|\n)/i;

    lines.forEach((line, lineIdx) => {
      const bMatch = line.match(betweenRegex);
      if (bMatch) {
        if (bMatch[1]) addParty(bMatch[1], 'First Party', lineIdx, line);
        if (bMatch[2]) addParty(bMatch[2], 'Second Party', lineIdx, line);
      }

      // Pattern B: Role-based designations: "Client: Acme Corp", "Contractor: John Doe"
      const roleRegex = /(?:Party\s+[AB]|First\s+Party|Second\s+Party|Employer|Employee|Client|Contractor|Customer|Vendor|Licensor|Licensee|Lender|Borrower|Landlord|Tenant|Purchaser|Supplier|Buyer|Seller|Disclosing\s+Party|Receiving\s+Party)\s*[:=-]\s*([A-Za-z0-9&.,\s]{3,50})(?:[;\r\n]|$)/gi;
      let rMatch: RegExpExecArray | null;
      while ((rMatch = roleRegex.exec(line)) !== null) {
        const fullRoleStr = rMatch[0];
        const roleLabel = fullRoleStr.split(/[:=-]/)[0].trim();
        const partyName = rMatch[1].trim();
        addParty(partyName, roleLabel, lineIdx, line);
      }

      // Pattern C: Company entities ending with Inc, LLC, Ltd, Limited, Corp, Pvt Ltd, etc.
      const corpRegex = /\b([A-Z][A-Za-z0-9&.,\s]{1,40}\b(?:Inc\.?|LLC|Ltd\.?|Limited|Corp\.?|Corporation|Pvt\.?\s*Ltd\.?|Private\s+Limited|LLP|GmbH|PLC))\b/g;
      let cMatch: RegExpExecArray | null;
      while ((cMatch = corpRegex.exec(line)) !== null) {
        addParty(cMatch[1], 'Contracting Entity', lineIdx, line);
      }
    });

    return results;
  }

  /**
   * 4. Extract Deadlines
   * Captures operative timeframes, e.g. "within 30 days", "no later than...", "on or before...".
   */
  extractDeadlines(text: string, tokens: ExtractedWordToken[]): ExtractedEntity[] {
    const results: ExtractedEntity[] = [];
    const seenValues = new Set<string>();

    const deadlinePatterns = [
      /\b(within\s+(?:\d+|one|two|three|four|five|ten|fifteen|twenty|thirty|sixty|ninety)\s+(?:calendar\s+|business\s+)?(?:days|weeks|months|years|hours))\b/gi,
      /\b(no\s+later\s+than\s+[A-Za-z0-9\s,/-]{3,35}?)(?:\.|\;|\,|$|\n)/gi,
      /\b(on\s+or\s+before\s+[A-Za-z0-9\s,/-]{3,35}?)(?:\.|\;|\,|$|\n)/gi,
      /\b(due\s+(?:on|by|no\s+later\s+than)\s+[A-Za-z0-9\s,/-]{3,35}?)(?:\.|\;|\,|$|\n)/gi,
      /\b(notice\s+period\s+of\s+\d+\s+(?:days|weeks|months))\b/gi
    ];

    const lines = text.split(/\r?\n/);

    lines.forEach((line, lineIdx) => {
      for (const pattern of deadlinePatterns) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(line)) !== null) {
          const rawDeadline = match[1].trim();
          const cleanKey = rawDeadline.toLowerCase();
          if (seenValues.has(cleanKey)) continue;
          seenValues.add(cleanKey);

          let label = 'Deadline';
          const lower = rawDeadline.toLowerCase();
          if (lower.startsWith('within')) {
            label = 'Performance Window';
          } else if (lower.startsWith('notice period')) {
            label = 'Notice Period';
          } else if (lower.startsWith('due')) {
            label = 'Due Date / Deadline';
          }

          const bbox = this.locateBoundingBox(rawDeadline, tokens, lineIdx);
          results.push({
            id: `deadline-${results.length + 1}`,
            type: 'deadline',
            label,
            value: rawDeadline,
            pageNumber: bbox.pageNumber,
            boundingBox: bbox,
            confidence: 92,
            contextSentence: line.trim()
          });
        }
      }
    });

    return results;
  }

  /**
   * 5. Extract Reference and Account Numbers
   */
  extractReferences(text: string, tokens: ExtractedWordToken[]): ExtractedEntity[] {
    const results: ExtractedEntity[] = [];
    const seenValues = new Set<string>();

    const refRegex = /\b(?:(Account|Invoice|Contract|Agreement|Reference|Policy|Order)\s*(?:No|Number|ID|#)?[:.\s]+([A-Z0-9-]{4,30})|(GSTIN|PAN|Tax\s*ID)[:.\s]+([A-Z0-9-]{6,25}))\b/gi;

    const lines = text.split(/\r?\n/);

    lines.forEach((line, lineIdx) => {
      refRegex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = refRegex.exec(line)) !== null) {
        const typeLabel = match[1] || match[3] || 'Reference';
        const refVal = (match[2] || match[4] || '').trim();
        if (!refVal) continue;

        const cleanKey = refVal.toLowerCase();
        if (seenValues.has(cleanKey)) continue;
        seenValues.add(cleanKey);

        const bbox = this.locateBoundingBox(refVal, tokens, lineIdx);
        results.push({
          id: `ref-${results.length + 1}`,
          type: 'reference',
          label: `${typeLabel} Number`,
          value: refVal,
          pageNumber: bbox.pageNumber,
          boundingBox: bbox,
          confidence: 93,
          contextSentence: line.trim()
        });
      }
    });

    return results;
  }

  /**
   * Obligation-Bearing Clause Detection:
   * Heuristic detection of operative contractual clauses using linguistic modal markers:
   * "must", "shall", "agrees to", "within [N] days", "subject to", "penalty", "termination".
   * Categorizes into: Obligations, Deadlines, Penalties, Rights.
   */
  extractClauses(text: string, tokens: ExtractedWordToken[]): ExtractedClause[] {
    const clauses: ExtractedClause[] = [];
    const seenSentences = new Set<string>();

    // Split text into candidate contractual sentences or numbered clauses
    const sentences = this.segmentSentences(text);

    // Modal marker definitions and their primary associated category
    const markerDefinitions = [
      { regex: /\b(must)\b/i, marker: 'must', category: 'obligation' as ClauseCategory },
      { regex: /\b(shall(?:\s+not)?)\b/i, marker: 'shall', category: 'obligation' as ClauseCategory },
      { regex: /\b(agrees?\s+to|agreed\s+to)\b/i, marker: 'agrees to', category: 'obligation' as ClauseCategory },
      { regex: /\b(is\s+required\s+to|are\s+required\s+to)\b/i, marker: 'is required to', category: 'obligation' as ClauseCategory },
      { regex: /\b(covenants?\s+that|undertakes?\s+to)\b/i, marker: 'covenants', category: 'obligation' as ClauseCategory },
      { regex: /\b(within\s+(?:\d+|[a-z]+)\s+(?:calendar\s+|business\s+)?(?:days|weeks|months))\b/i, marker: 'within [N] days', category: 'deadline' as ClauseCategory },
      { regex: /\b(no\s+later\s+than|due\s+on|on\s+or\s+before)\b/i, marker: 'deadline marker', category: 'deadline' as ClauseCategory },
      { regex: /\b(penalt(?:y|ies)|liquidated\s+damages|fine)\b/i, marker: 'penalty', category: 'penalty' as ClauseCategory },
      { regex: /\b(terminat(?:ion|e|ed|ing))\b/i, marker: 'termination', category: 'penalty' as ClauseCategory },
      { regex: /\b(forfeit(?:ure)?|default|breach)\b/i, marker: 'default / breach', category: 'penalty' as ClauseCategory },
      { regex: /\b(subject\s+to)\b/i, marker: 'subject to', category: 'right' as ClauseCategory },
      { regex: /\b(entitled\s+to|has\s+(?:the\s+)?right\s+to)\b/i, marker: 'entitled to', category: 'right' as ClauseCategory },
      { regex: /\b(may\s+(?:at\s+its\s+discretion|elect\s+to)?|at\s+its\s+sole\s+discretion)\b/i, marker: 'discretion / right', category: 'right' as ClauseCategory }
    ];

    sentences.forEach((sentence, idx) => {
      const cleanSentence = sentence.trim().replace(/\s+/g, ' ');
      if (cleanSentence.length < 15) return;

      const norm = cleanSentence.toLowerCase();
      if (seenSentences.has(norm)) return;

      const detectedMarkers: string[] = [];
      const categoryScores: Record<ClauseCategory, number> = {
        obligation: 0,
        deadline: 0,
        penalty: 0,
        right: 0
      };

      for (const def of markerDefinitions) {
        const match = sentence.match(def.regex);
        if (match) {
          detectedMarkers.push(match[1] || def.marker);
          // Increase score for that category
          categoryScores[def.category] += (def.category === 'penalty' ? 30 : def.category === 'deadline' ? 25 : 20);
        }
      }

      // If at least one operative modal marker was detected, create a clause
      if (detectedMarkers.length > 0) {
        seenSentences.add(norm);

        // Determine winning category
        let bestCategory: ClauseCategory = 'obligation';
        let highestScore = -1;

        // Prioritize penalty, deadline, right if explicit markers are present
        const categories: ClauseCategory[] = ['penalty', 'deadline', 'right', 'obligation'];
        for (const cat of categories) {
          if (categoryScores[cat] > highestScore) {
            highestScore = categoryScores[cat];
            bestCategory = cat;
          }
        }

        const categoryLabels: Record<ClauseCategory, string> = {
          obligation: 'Obligations',
          deadline: 'Deadlines',
          penalty: 'Penalties',
          right: 'Rights'
        };

        const bbox = this.locateBoundingBox(cleanSentence, tokens, idx);

        clauses.push({
          id: `clause-${clauses.length + 1}`,
          category: bestCategory,
          categoryLabel: categoryLabels[bestCategory],
          text: cleanSentence,
          modalMarkers: detectedMarkers,
          pageNumber: bbox.pageNumber,
          boundingBox: bbox,
          confidence: Math.min(98, 80 + detectedMarkers.length * 5)
        });
      }
    });

    return clauses;
  }

  /**
   * Split text into coherent sentence clauses, respecting numbered lists (e.g. 1.1, (a)) and clause terminators.
   */
  private segmentSentences(text: string): string[] {
    const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const results: string[] = [];
    let current = '';

    for (const line of rawLines) {
      // Check if line starts a new numbered section (e.g. "1.", "Section 2", "Clause 3", "(b)")
      const isNewSection = /^(?:[0-9]+(?:\.[0-9]+)*\.?|\([a-z0-9]+\)|Section\s+[0-9]+|Article\s+[0-9]+)\b/i.test(line);

      if (isNewSection && current) {
        results.push(current);
        current = line;
      } else {
        if (current) current += ' ' + line;
        else current = line;

        // Check if line ends with a definitive sentence or clause terminator
        if (/[.;:]$/.test(line)) {
          results.push(current);
          current = '';
        }
      }
    }

    if (current) results.push(current);

    // Further split any overly long aggregated paragraphs on periods followed by capital letters
    const refined: string[] = [];
    for (const item of results) {
      const parts = item.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
      for (const p of parts) {
        if (p.trim().length > 10) refined.push(p.trim());
      }
    }

    // Safety guard against pathological ReDoS input: truncate or chunk excessive lengths
    const MAX_SENTENCE_LEN = 2000;
    const finalSentences: string[] = [];
    for (const item of refined) {
      if (item.length > MAX_SENTENCE_LEN) {
        for (let i = 0; i < item.length; i += MAX_SENTENCE_LEN) {
          const slice = item.slice(i, i + MAX_SENTENCE_LEN).trim();
          if (slice.length > 10) finalSentences.push(slice);
        }
      } else {
        finalSentences.push(item);
      }
    }

    return finalSentences;
  }

  /**
   * Computes exact page anchor & bounding box (x, y, width, height) in PDF points for extracted text.
   * Resolves token matches geometrically or synthesizes consistent page geometry when tokens are omitted.
   */
  locateBoundingBox(
    searchText: string,
    tokens: ExtractedWordToken[] = [],
    fallbackLineIndex: number = 0,
    pageFallback: number = 1
  ): BoundingBox {
    if (!searchText) {
      return {
        x: 72,
        y: 100 + fallbackLineIndex * 24,
        width: 120,
        height: 18,
        pageNumber: pageFallback
      };
    }

    if (tokens && tokens.length > 0) {
      const cleanSearch = searchText.toLowerCase().replace(/[^a-z0-9]/g, '');

      // Check for exact or high-fidelity substring matches in tokens (reject spurious 1-2 char word matches)
      const matchingTokens = tokens.filter(t => {
        const cleanT = t.text.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!cleanT) return false;
        if (cleanT === cleanSearch) return true;
        if ((cleanT.length >= 4 || (cleanT.length >= 2 && /\d/.test(cleanT))) && cleanSearch.includes(cleanT)) return true;
        if ((cleanSearch.length >= 4 || (cleanSearch.length >= 2 && /\d/.test(cleanSearch))) && cleanT.includes(cleanSearch)) return true;
        return false;
      });

      if (matchingTokens.length > 0) {
        // Group matches by page to avoid bounding box sprawl across multiple pages
        const pageBuckets = new Map<number, ExtractedWordToken[]>();
        for (const tok of matchingTokens) {
          const p = tok.pageNumber || 1;
          const bucket = pageBuckets.get(p) || [];
          bucket.push(tok);
          pageBuckets.set(p, bucket);
        }

        // Select the page with the highest cluster of matching tokens
        let bestPage = matchingTokens[0].pageNumber || 1;
        let maxCount = 0;
        for (const [p, bucket] of pageBuckets.entries()) {
          if (bucket.length > maxCount) {
            maxCount = bucket.length;
            bestPage = p;
          }
        }

        const pageTokens = pageBuckets.get(bestPage) || matchingTokens;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const tok of pageTokens) {
          if (tok.x < minX) minX = tok.x;
          if (tok.y < minY) minY = tok.y;
          if (tok.x + tok.width > maxX) maxX = tok.x + tok.width;
          if (tok.y + tok.height > maxY) maxY = tok.y + tok.height;
        }

        return {
          x: Math.max(0, Math.round(minX)),
          y: Math.max(0, Math.round(minY)),
          width: Math.min(600, Math.max(15, Math.round(maxX - minX))),
          height: Math.min(300, Math.max(12, Math.round(maxY - minY))),
          pageNumber: bestPage
        };
      }
    }

    // Deterministic fallback in standard PDF points (72 DPI)
    return {
      x: 72,
      y: Math.round(100 + fallbackLineIndex * 24),
      width: Math.min(450, Math.max(60, Math.round(searchText.length * 7.5))),
      height: 18,
      pageNumber: pageFallback
    };
  }

  /**
   * Helper to normalize date strings to ISO YYYY-MM-DD
   */
  private normalizeDate(dateStr: string): string {
    try {
      const parsed = Date.parse(dateStr);
      if (!isNaN(parsed)) {
        return new Date(parsed).toISOString().split('T')[0];
      }
    } catch {
      // ignore
    }
    return dateStr;
  }

  /**
   * Export extracted entities and clauses to JSON.
   * Strictly enforces the legal disclaimer.
   */
  async exportToJson(
    result: EntityClauseExtractionResult,
    filename: string = 'extracted-entities-clauses.json'
  ): Promise<{ file: File; jsonString: string; savedUri?: string }> {
    const exportData: EntityClauseExportJson = {
      metadata: {
        fileName: result.metadata.fileName,
        extractedAt: result.metadata.extractedAt,
        disclaimer: this.DISCLAIMER,
        totalEntities: result.entities.length,
        totalClauses: result.clauses.length
      },
      summary: result.summary,
      entities: result.entities,
      clauses: result.clauses
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const targetName = filename.endsWith('.json') ? filename : `${filename}.json`;

    const file = typeof File !== 'undefined'
      ? new File([blob], targetName, { type: 'application/json' })
      : ({ name: targetName, size: blob.size, type: 'application/json' } as unknown as File);

    const savedUri = await this.storageService.saveFile(file, 'entity-clause-json', undefined, {
      preserveName: true
    });

    return { file, jsonString, savedUri };
  }

  /**
   * Export extracted entities and clauses to RFC 4180 CSV.
   * Strictly enforces the legal disclaimer.
   */
  async exportToCsv(
    result: EntityClauseExtractionResult,
    filename: string = 'extracted-entities-clauses.csv'
  ): Promise<{ file: File; csvString: string; savedUri?: string }> {
    const rows: string[][] = [];

    // Disclaimer header row
    rows.push(['# Disclaimer:', this.DISCLAIMER]);
    rows.push([]);

    // Table Header
    rows.push([
      'Record Type',
      'Category / Type',
      'Value / Text',
      'Page Number',
      'Anchor X (pt)',
      'Anchor Y (pt)',
      'Anchor Width (pt)',
      'Anchor Height (pt)',
      'Confidence (%)',
      'Modal Markers / Context'
    ]);

    // Entities rows
    for (const entity of result.entities) {
      rows.push([
        'Entity',
        entity.label || entity.type,
        entity.value,
        entity.pageNumber.toString(),
        entity.boundingBox.x.toString(),
        entity.boundingBox.y.toString(),
        entity.boundingBox.width.toString(),
        entity.boundingBox.height.toString(),
        entity.confidence.toString(),
        entity.contextSentence || ''
      ]);
    }

    // Clauses rows
    for (const clause of result.clauses) {
      rows.push([
        'Clause',
        clause.categoryLabel,
        clause.text,
        clause.pageNumber.toString(),
        clause.boundingBox.x.toString(),
        clause.boundingBox.y.toString(),
        clause.boundingBox.width.toString(),
        clause.boundingBox.height.toString(),
        clause.confidence.toString(),
        clause.modalMarkers.join(', ')
      ]);
    }

    const csvContent = rows
      .map(row =>
        row
          .map(cell => {
            let val = cell || '';
            // CSV / Formula Injection Defense: Prefix formula execution triggers with a single quote
            if (/^[=+\-@\t\r]/.test(val)) {
              val = `'${val}`;
            }
            if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
              return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
          })
          .join(',')
      )
      .join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const targetName = filename.endsWith('.csv') ? filename : `${filename}.csv`;

    const file = typeof File !== 'undefined'
      ? new File([blob], targetName, { type: 'text/csv' })
      : ({ name: targetName, size: blob.size, type: 'text/csv' } as unknown as File);

    const savedUri = await this.storageService.saveFile(file, 'entity-clause-csv', undefined, {
      preserveName: true
    });

    return { file, csvString: csvContent, savedUri };
  }

  /**
   * Generates a printable HTML executive summary report with clean typography and layout.
   * Strictly enforces the legal disclaimer.
   */
  generatePrintableReport(result: EntityClauseExtractionResult): string {
    const entitiesHtml = result.entities
      .map(
        e => `<tr>
          <td><span class="badge ${e.type}">${e.label}</span></td>
          <td><strong>${this.escapeHtml(e.value)}</strong></td>
          <td>Page ${e.pageNumber} (${e.boundingBox.x}, ${e.boundingBox.y})</td>
          <td>${e.confidence}%</td>
        </tr>`
      )
      .join('');

    const clausesHtml = result.clauses
      .map(
        c => `<tr>
          <td><span class="badge ${c.category}">${c.categoryLabel}</span></td>
          <td>${this.escapeHtml(c.text)}</td>
          <td>${c.modalMarkers.map(m => `<span class="marker-tag">${this.escapeHtml(m)}</span>`).join(' ')}</td>
          <td>Page ${c.pageNumber}</td>
        </tr>`
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Entity &amp; Clause Extraction Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 40px; color: #1e293b; }
    h1 { margin-bottom: 4px; font-size: 24px; color: #0f172a; }
    .subtitle { color: #64748b; font-size: 14px; margin-bottom: 20px; }
    .disclaimer-box { background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; border-radius: 4px; margin-bottom: 24px; font-weight: 500; color: #991b1b; }
    .summary-grid { display: flex; gap: 16px; margin-bottom: 24px; }
    .summary-card { flex: 1; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; text-align: center; }
    .summary-card .num { font-size: 22px; font-weight: 700; color: #2563eb; }
    .summary-card .lbl { font-size: 12px; color: #64748b; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 13px; }
    th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
    th { background: #f8fafc; font-weight: 600; color: #475569; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; background: #e0f2fe; color: #0369a1; }
    .badge.obligation { background: #fef3c7; color: #b45309; }
    .badge.penalty { background: #fee2e2; color: #b91c1c; }
    .badge.deadline { background: #ffedd5; color: #c2410c; }
    .badge.right { background: #dcfce7; color: #15803d; }
    .marker-tag { display: inline-block; background: #f1f5f9; padding: 1px 6px; border-radius: 4px; font-size: 11px; color: #475569; }
    @media print {
      body { margin: 20px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <h1>Entity &amp; Clause Extraction Summary Report</h1>
  <div class="subtitle">Document: ${this.escapeHtml(result.metadata.fileName || 'Document')} · Extracted: ${result.metadata.extractedAt}</div>

  <div class="disclaimer-box">
    ⚠️ ${this.DISCLAIMER}
  </div>

  <div class="summary-grid">
    <div class="summary-card"><div class="num">${result.summary.totalEntities}</div><div class="lbl">Total Entities</div></div>
    <div class="summary-card"><div class="num">${result.summary.amountsCount}</div><div class="lbl">Amounts</div></div>
    <div class="summary-card"><div class="num">${result.summary.datesDeadlinesCount}</div><div class="lbl">Dates & Deadlines</div></div>
    <div class="summary-card"><div class="num">${result.summary.partiesCount}</div><div class="lbl">Parties</div></div>
    <div class="summary-card"><div class="num">${result.summary.clausesCount}</div><div class="lbl">Operative Clauses</div></div>
  </div>

  <h2>Extracted Entities</h2>
  <table>
    <thead>
      <tr><th>Type</th><th>Value</th><th>Page Anchor</th><th>Confidence</th></tr>
    </thead>
    <tbody>${entitiesHtml || '<tr><td colspan="4">No entities extracted</td></tr>'}</tbody>
  </table>

  <h2>Operative Contractual Clauses</h2>
  <table>
    <thead>
      <tr><th>Category</th><th>Clause Text</th><th>Modal Markers</th><th>Anchor</th></tr>
    </thead>
    <tbody>${clausesHtml || '<tr><td colspan="4">No clauses detected</td></tr>'}</tbody>
  </table>
</body>
</html>`;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
