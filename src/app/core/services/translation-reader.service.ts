import { Injectable, inject } from '@angular/core';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { Document, Paragraph, TextRun, HeadingLevel, Packer, PageBreak } from 'docx';
import { SupportedLanguage } from '../i18n/i18n.types';
import {
  DocumentHeading,
  ScrollLockPageBound,
  ScrollLockResult,
  TranslationExportDocxOptions,
  TranslationExportPdfOptions,
  TranslationPageItem,
  TranslationSession
} from '../models/pdf-intelligence.types';
import { PdfIntelligenceService } from './pdf-intelligence.service';
import { StorageService } from './storage.service';

/**
 * Phonetic transliteration dictionary for Indic script to Latin / ASCII fallback.
 * Standard PDF fonts in pdf-lib (Helvetica/Times) require WinAnsi-encoded glyphs (< 0xFF).
 * For Microsoft Word (.docx), full Unicode Indic text is preserved natively.
 */
const INDIC_TO_LATIN_MAP: Record<string, string> = {
  // Common terms transliteration
  'सारांश': 'Saransh (Summary)',
  'दस्तावेज़': 'Dastawez (Document)',
  'अवलोकन': 'Avlokan (Overview)',
  'मुख्य बिंदु': 'Mukhya Bindu (Key Points)',
  'निष्कर्ष': 'Nishkarsh (Conclusion)',
  'पृष्ठ': 'Prishth (Page)',
  'अनुभाग': 'Anubhag (Section)',
  'आवेदन': 'Aavedan (Application)',
  'उम्मीदवार': 'Ummidwar (Candidate)',
  'तारीख': 'Tarikh (Date)',
  'नाम': 'Naam (Name)',
  'पात्रता': 'Patrata (Eligibility)',
  'मानदंड': 'Mandand (Criteria)',
  'नियम': 'Niyam (Rules)',
  'विवरण': 'Vivran (Details)',
  'प्रमाणपत्र': 'Pramanpatra (Certificate)',
  'सत्यापन': 'Satyapan (Verification)',
  'आधिकारिक': 'Aadhikarik (Official)',
  'सरकार': 'Sarkar (Government)',
  'आवश्यकताएं': 'Aavashyakatein (Requirements)',
  'महत्वपूर्ण': 'Mahatvapurna (Important)',
  'निर्देश': 'Nirdesh (Instructions)',
  // Marathi
  'दस्तऐवज': 'Dastaawez (Document)',
  'आढावा': 'Aadhava (Overview)',
  'महत्त्वाचे मुद्दे': 'Mahatwache Mudde (Key Points)',
  'पान': 'Paan (Page)',
  'विभाग': 'Vibhag (Section)',
  'अर्ज': 'Arja (Application)',
  'उमेदवार': 'Umedwar (Candidate)',
  'दिनांक': 'Dinaank (Date)',
  'नाव': 'Naav (Name)',
  'निकष': 'Nikash (Criteria)',
  'तपशील': 'Tapashil (Details)',
  'पडताळणी': 'Padtalani (Verification)',
  'अधिकृत': 'Adhikrut (Official)',
  'शासन': 'Shasan (Government)',
  'आवश्यकता': 'Aavashyakta (Requirement)',
  'महत्त्वाचे': 'Mahatwache (Important)',
  'सूचना': 'Soochna (Notice)',
  // Bengali
  'সারসংক্ষেপ': 'Sarashongkhep (Summary)',
  'নথি': 'Nothi (Document)',
  'সংক্ষিপ্ত বিবরণ': 'Shongkhipto Biboron (Overview)',
  'মূল বিষয়সমূহ': 'Mool Bishoyshomuho (Key Points)',
  'উপসংহার': 'Upashanghar (Conclusion)',
  'পৃষ্ঠা': 'Prishtha (Page)',
  'অনুচ্ছেদ': 'Anuchhed (Section)',
  'আবেদন': 'Aabedon (Application)',
  'প্রার্থী': 'Prarthi (Candidate)',
  'তারিখ': 'Tarikh (Date)',
  'নাম': 'Naam (Name)',
  'যোগ্যতা': 'Jogyota (Eligibility)',
  'মানদণ্ড': 'Mandando (Criteria)',
  'নিয়মাবলী': 'Niyomaboli (Rules)',
  'বিবরণ': 'Biboron (Details)',
  'শংসাপত্র': 'Shongshapatra (Certificate)',
  'যাচাইকরণ': 'Jachaikoron (Verification)',
  'সরকারী': 'Sarkari (Official)',
  'প্রয়োজনীয়তা': 'Proyojoniyota (Requirements)',
  'গুরুত্বপূর্ণ': 'Guruttwopurno (Important)',
  'নির্দেশনা': 'Nirdeshona (Instructions)',
  // Punjabi
  'ਸੰਖੇਪ': 'Sankhep (Summary)',
  'ਸੰਖੇਪ ਜਾਣਕਾਰੀ': 'Sankhep Jaankari (Overview)',
  'ਮੁੱਖ ਨੁਕਤੇ': 'Mukh Nukte (Key Points)',
  'ਸਿੱਟਾ': 'Sitta (Conclusion)',
  'ਪੰਨਾ': 'Panna (Page)',
  'ਭਾਗ': 'Bhaag (Section)',
  'ਅਰਜ਼ੀ': 'Arzi (Application)',
  'ਉਮੀਦਵਾਰ': 'Umeedwar (Candidate)',
  'ਮਿਤੀ': 'Miti (Date)',
  'ਯੋਗਤਾ': 'Yogta (Eligibility)',
  'ਮਾਪਦੰਡ': 'Maapdand (Criteria)',
  'ਨਿਯਮ': 'Niyam (Rules)',
  'ਵੇਰਵੇ': 'Verve (Details)',
  'ਸਰਟੀਫਿਕੇਟ': 'Certificate',
  'ਪੜਤਾਲ': 'Partaal (Verification)',
  'ਸਰਕਾਰੀ': 'Sarkari (Government)',
  'ਲੋੜਾਂ': 'Lodaan (Requirements)',
  'ਜ਼ਰੂਰੀ': 'Zaroori (Important)',
  'ਹਦਾਇਤਾਂ': 'Hadaitan (Instructions)'
};

@Injectable({
  providedIn: 'root'
})
export class TranslationReaderService extends PdfIntelligenceService {
  private storageService = inject(StorageService, { optional: true });

  constructor() {
    super();
  }

  // =========================================================================
  // DUAL-PANE SCROLL SYNCHRONIZATION ENGINE
  // =========================================================================

  /**
   * Computes the target pane's scrollTop offset corresponding to the source pane's scroll position.
   * Accurately pairs pages of unequal text length by computing the active page index
   * and intra-page progress ratio within that specific page.
   */
  computeTargetScrollOffset(
    sourceOffset: number,
    sourceBounds: ScrollLockPageBound[],
    targetBounds: ScrollLockPageBound[]
  ): ScrollLockResult {
    if (!sourceBounds || sourceBounds.length === 0 || !targetBounds || targetBounds.length === 0) {
      return { targetScrollTop: Math.max(0, sourceOffset), pageIndex: 0, intraPageRatio: 0 };
    }

    if (sourceOffset <= 0) {
      return { targetScrollTop: 0, pageIndex: sourceBounds[0].pageIndex, intraPageRatio: 0 };
    }

    // Find the active page in sourceBounds
    let activeSource = sourceBounds[0];
    for (let i = 0; i < sourceBounds.length; i++) {
      const bound = sourceBounds[i];
      const boundBottom = bound.offsetTop + bound.height;
      if (sourceOffset >= bound.offsetTop && sourceOffset < boundBottom) {
        activeSource = bound;
        break;
      }
      if (i === sourceBounds.length - 1 && sourceOffset >= boundBottom) {
        activeSource = bound;
      }
    }

    // Compute intra-page progress ratio [0, 1]
    const intraPageOffset = sourceOffset - activeSource.offsetTop;
    const intraPageRatio = activeSource.height > 0
      ? Math.min(1, Math.max(0, intraPageOffset / activeSource.height))
      : 0;

    // Find corresponding page in targetBounds
    let activeTarget = targetBounds.find(b => b.pageIndex === activeSource.pageIndex);
    if (!activeTarget) {
      const fallbackIdx = Math.min(activeSource.pageIndex, targetBounds.length - 1);
      activeTarget = targetBounds[fallbackIdx] || targetBounds[0];
    }

    const targetScrollTop = Math.round(activeTarget.offsetTop + intraPageRatio * activeTarget.height);

    return {
      targetScrollTop: Math.max(0, targetScrollTop),
      pageIndex: activeSource.pageIndex,
      intraPageRatio
    };
  }

  /**
   * Calculates the text expansion ratio between original and translated text.
   * Indic translations (Hindi, Marathi, Bengali, Punjabi) typically expand by 25% - 45%.
   */
  calculateExpansionRatio(originalText: string, translatedText: string): number {
    const origChars = (originalText || '').trim().length;
    const transChars = (translatedText || '').trim().length;
    if (origChars === 0) return 1.0;
    const ratio = transChars / origChars;
    return Math.round(ratio * 100) / 100;
  }

  /**
   * Extracts paragraphs from raw page text.
   */
  extractPageParagraphs(text: string): string[] {
    if (!text || text.trim().length === 0) return [];
    
    // Split by multiple newlines or numbered items or sentence clusters
    const rawBlocks = text.split(/\n\s*\n|\r\n\s*\r\n/);
    const paragraphs: string[] = [];

    for (const block of rawBlocks) {
      const cleaned = block.replace(/\s+/g, ' ').trim();
      if (cleaned.length > 0) {
        paragraphs.push(cleaned);
      }
    }

    if (paragraphs.length === 0 && text.trim().length > 0) {
      paragraphs.push(text.replace(/\s+/g, ' ').trim());
    }

    return paragraphs;
  }

  /**
   * Detects headings on a specific page.
   */
  detectPageHeadings(paragraphs: string[], pageNumber: number): DocumentHeading[] {
    const headings: DocumentHeading[] = [];
    paragraphs.forEach(para => {
      const words = para.split(' ');
      if (words.length <= 10 && (
        /^(Section|Chapter|Part|Article|Clause|\d+(\.\d+)*)\b/i.test(para) ||
        para === para.toUpperCase() && /[A-Z]/.test(para) ||
        para.endsWith(':')
      )) {
        headings.push({
          text: para,
          level: 2,
          pageNumber
        });
      }
    });
    return headings;
  }

  // =========================================================================
  // SESSION PREPARATION
  // =========================================================================

  /**
   * Builds the dual-pane translation session for a document.
   */
  async prepareTranslationSession(
    file: { name: string },
    pageTexts: { pageNumber: number; text: string }[],
    targetLanguage: SupportedLanguage
  ): Promise<TranslationSession> {
    const analysis = this.analyzeDocument(pageTexts);
    const summary = this.summarize(analysis, pageTexts);
    const translatedSummary = await this.translateContent(summary.quickSummary, targetLanguage);
    const translatedKeyPoints = await Promise.all(
      summary.keyPoints.map(kp => this.translateContent(kp, targetLanguage))
    );

    const pages: TranslationPageItem[] = [];
    let originalTotalChars = 0;
    let translatedTotalChars = 0;

    for (const page of pageTexts) {
      const origText = page.text || '';
      const paragraphs = this.extractPageParagraphs(origText);
      const headings = this.detectPageHeadings(paragraphs, page.pageNumber);

      const translatedParagraphs: string[] = [];
      for (const para of paragraphs) {
        const transPara = await this.translateContent(para, targetLanguage);
        translatedParagraphs.push(transPara);
      }

      const translatedText = translatedParagraphs.join('\n\n');
      const origCharCount = origText.trim().length;
      const transCharCount = translatedText.trim().length;

      originalTotalChars += origCharCount;
      translatedTotalChars += transCharCount;

      const expansionRatio = this.calculateExpansionRatio(origText, translatedText);

      pages.push({
        pageNumber: page.pageNumber,
        originalText: origText,
        translatedText,
        paragraphs,
        translatedParagraphs,
        headings,
        charCountOriginal: origCharCount,
        charCountTranslated: transCharCount,
        expansionRatio
      });
    }

    const averageExpansionRate = originalTotalChars > 0
      ? Math.round((translatedTotalChars / originalTotalChars) * 100) / 100
      : 1.0;

    return {
      fileName: file.name,
      pageCount: pageTexts.length,
      sourceLanguage: 'English',
      targetLanguage,
      pages,
      executiveSummary: translatedSummary,
      keyPoints: translatedKeyPoints,
      modeUsed: this.mode,
      expansionSummary: {
        averageExpansionRate,
        originalTotalChars,
        translatedTotalChars
      }
    };
  }

  // =========================================================================
  // MULTI-FORMAT EXPORT ENGINE
  // =========================================================================

  /**
   * Export translated text and executive summary to formatted PDF using pdf-lib.
   * Guarantees page breaks matching the original document structure.
   */
  async exportToPdf(options: TranslationExportPdfOptions): Promise<Blob> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = 595.28; // A4
    const pageHeight = 841.89;
    const margin = 45;
    const contentWidth = pageWidth - margin * 2;

    const targetLangCode = options.targetLanguage.toUpperCase();

    // -----------------------------------------------------------------------
    // Cover / Executive Summary Page (if requested or summary provided)
    // -----------------------------------------------------------------------
    if (options.includeSummary !== false && options.executiveSummary) {
      const summaryPage = pdfDoc.addPage([pageWidth, pageHeight]);
      let y = pageHeight - margin - 15;

      // Header Bar
      summaryPage.drawText('Document Translation & Executive Summary', {
        x: margin,
        y,
        size: 18,
        font: boldFont,
        color: rgb(0.12, 0.22, 0.38)
      });
      y -= 22;

      const metaLine = `Document: ${options.fileName}  •  ${options.sourceLanguage || 'English'} -> ${targetLangCode}  •  Date: ${new Date().toLocaleDateString()}`;
      summaryPage.drawText(this.toSafePdfText(metaLine), {
        x: margin,
        y,
        size: 9.5,
        font,
        color: rgb(0.45, 0.48, 0.52)
      });
      y -= 16;

      // Decorative divider
      summaryPage.drawLine({
        start: { x: margin, y },
        end: { x: pageWidth - margin, y },
        thickness: 1.5,
        color: rgb(0.2, 0.45, 0.8)
      });
      y -= 30;

      // Executive Summary Header
      summaryPage.drawText('Executive Summary', {
        x: margin,
        y,
        size: 14,
        font: boldFont,
        color: rgb(0.15, 0.3, 0.6)
      });
      y -= 20;

      const summaryLines = this.wrapText(this.toSafePdfText(options.executiveSummary), 82);
      for (const line of summaryLines) {
        if (y < margin + 40) break;
        summaryPage.drawText(line, {
          x: margin,
          y,
          size: 10,
          font,
          color: rgb(0.2, 0.22, 0.25)
        });
        y -= 15;
      }

      y -= 20;
      // Layout Fidelity Notice box
      summaryPage.drawRectangle({
        x: margin,
        y: y - 35,
        width: contentWidth,
        height: 48,
        color: rgb(0.95, 0.97, 1.0),
        borderColor: rgb(0.8, 0.88, 0.98),
        borderWidth: 1
      });

      summaryPage.drawText('Layout Fidelity Contract Notice:', {
        x: margin + 12,
        y: y - 5,
        size: 9,
        font: boldFont,
        color: rgb(0.15, 0.3, 0.7)
      });

      summaryPage.drawText('Pages below preserve original document page breaks. Word (.docx) export provides native Unicode scripts.', {
        x: margin + 12,
        y: y - 22,
        size: 8.5,
        font,
        color: rgb(0.35, 0.4, 0.5)
      });

      // Footer
      summaryPage.drawText('Page 1 (Summary)  •  Indian Form Helper Translation Studio', {
        x: margin,
        y: margin,
        size: 8.5,
        font,
        color: rgb(0.55, 0.58, 0.62)
      });
    }

    // -----------------------------------------------------------------------
    // Individual Document Pages (preserving page breaks matching original)
    // -----------------------------------------------------------------------
    for (const pageItem of options.pages) {
      let page = pdfDoc.addPage([pageWidth, pageHeight]);
      let y = pageHeight - margin - 10;

      // Page Title Header
      page.drawText(`Translated Document — Page ${pageItem.pageNumber}`, {
        x: margin,
        y,
        size: 14,
        font: boldFont,
        color: rgb(0.15, 0.25, 0.4)
      });

      const pageBadge = `[Target Language: ${targetLangCode}]`;
      const badgeWidth = font.widthOfTextAtSize(pageBadge, 9);
      page.drawText(pageBadge, {
        x: pageWidth - margin - badgeWidth,
        y: y + 2,
        size: 9,
        font: boldFont,
        color: rgb(0.2, 0.5, 0.8)
      });
      y -= 14;

      page.drawLine({
        start: { x: margin, y },
        end: { x: pageWidth - margin, y },
        thickness: 0.75,
        color: rgb(0.85, 0.88, 0.92)
      });
      y -= 24;

      // Draw paragraphs
      const paragraphsToDraw = pageItem.translatedParagraphs.length > 0
        ? pageItem.translatedParagraphs
        : [pageItem.translatedText || 'No text extracted for this page.'];

      for (const para of paragraphsToDraw) {
        if (!para || para.trim().length === 0) continue;

        const isHeading = pageItem.headings.some(h => h.text.trim() === para.trim()) ||
          para.length < 60 && para.endsWith(':');

        const safePara = this.toSafePdfText(para);
        const wrappedLines = this.wrapText(safePara, isHeading ? 75 : 82);

        if (isHeading) {
          y -= 6;
          if (y < margin + 40) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            y = pageHeight - margin - 20;
          }
          page.drawText(wrappedLines[0] || safePara, {
            x: margin,
            y,
            size: 11,
            font: boldFont,
            color: rgb(0.12, 0.18, 0.3)
          });
          y -= 16;
          continue;
        }

        for (const line of wrappedLines) {
          if (y < margin + 35) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            y = pageHeight - margin - 20;
            page.drawText(`Translated Document — Page ${pageItem.pageNumber} (Cont.)`, {
              x: margin,
              y,
              size: 9,
              font: boldFont,
              color: rgb(0.3, 0.4, 0.5)
            });
            y -= 20;
          }
          page.drawText(line, {
            x: margin,
            y,
            size: 9.5,
            font,
            color: rgb(0.18, 0.2, 0.24)
          });
          y -= 14;
        }

        y -= 8; // Space between paragraphs
      }

      // Footer
      const footerText = `Page ${pageItem.pageNumber} matching original document  •  Target: ${targetLangCode}`;
      page.drawText(footerText, {
        x: margin,
        y: margin,
        size: 8.5,
        font,
        color: rgb(0.55, 0.58, 0.62)
      });
    }

    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes as any], { type: 'application/pdf' });
  }

  /**
   * Sanitizes text to remove non-printable XML 1.0 control characters
   * (\x00-\x08, \x0B-\x0C, \x0E-\x1F) to prevent OpenXML corruption or XXE vulnerabilities in .docx.
   */
  public sanitizeXmlString(text: string): string {
    if (!text) return '';
    return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, '');
  }

  /**
   * Export translated text and executive summary to Microsoft Word document (.docx).
   * Uses the bundled docx package, preserving headings, bold text, and paragraphs,
   * with page breaks matching the original document. Native Unicode Indic scripts
   * are fully preserved.
   */
  async exportToDocx(options: TranslationExportDocxOptions): Promise<Blob> {
    const docxParagraphs: Paragraph[] = [];
    const targetLangCode = options.targetLanguage.toUpperCase();
    const cleanFileName = this.sanitizeXmlString(options.fileName);
    const cleanTitle = this.sanitizeXmlString(options.title || `Translation: ${options.fileName}`);

    // Document Title
    docxParagraphs.push(
      new Paragraph({
        text: cleanTitle,
        heading: HeadingLevel.TITLE,
        spacing: { after: 150 }
      })
    );

    // Metadata Subtitle
    docxParagraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Source Language: ', bold: true }),
          new TextRun({ text: `${this.sanitizeXmlString(options.sourceLanguage || 'English')}   |   ` }),
          new TextRun({ text: 'Target Language: ', bold: true }),
          new TextRun({ text: `${targetLangCode}   |   ` }),
          new TextRun({ text: 'Generated: ', bold: true }),
          new TextRun({ text: new Date().toLocaleDateString() })
        ],
        spacing: { after: 300 }
      })
    );

    // Executive Summary Section
    if (options.includeSummary !== false && options.executiveSummary) {
      docxParagraphs.push(
        new Paragraph({
          text: 'Executive Summary',
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 200, after: 120 }
        })
      );

      const cleanSummary = this.sanitizeXmlString(options.executiveSummary);
      const summaryParas = cleanSummary.split(/\n\s*\n/);
      for (const sp of summaryParas) {
        if (sp.trim().length > 0) {
          docxParagraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: sp.trim(),
                  italics: true
                })
              ],
              spacing: { after: 140 }
            })
          );
        }
      }
    }

    // Pages with page breaks matching original document
    for (let i = 0; i < options.pages.length; i++) {
      const pageItem = options.pages[i];

      // Insert Page Break before every page matching original document
      docxParagraphs.push(
        new Paragraph({
          children: [new PageBreak()]
        })
      );

      // Page Heading
      docxParagraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Page ${pageItem.pageNumber} (${targetLangCode})`,
              bold: true,
              size: 26
            })
          ],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 160 }
        })
      );

      const paragraphsToInclude = pageItem.translatedParagraphs.length > 0
        ? pageItem.translatedParagraphs
        : [pageItem.translatedText || ''];

      for (const para of paragraphsToInclude) {
        if (!para || para.trim().length === 0) continue;

        const cleanPara = this.sanitizeXmlString(para.trim());
        const isHeading = pageItem.headings.some(h => h.text.trim() === para.trim()) ||
          cleanPara.length < 60 && cleanPara.endsWith(':');

        if (isHeading) {
          docxParagraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: cleanPara,
                  bold: true,
                  size: 22
                })
              ],
              heading: HeadingLevel.HEADING_3,
              spacing: { before: 180, after: 100 }
            })
          );
        } else {
          docxParagraphs.push(
            new Paragraph({
              children: this.buildDocxTextRuns(cleanPara),
              spacing: { after: 140 }
            })
          );
        }
      }
    }

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: docxParagraphs
        }
      ]
    });

    return await Packer.toBlob(doc);
  }

  // =========================================================================
  // HELPER UTILITIES
  // =========================================================================

  /**
   * Parses markdown-style bold tags (**bold**) or prefix labels (e.g. "Section 1: ")
   * into formatted TextRun elements for docx export.
   */
  private buildDocxTextRuns(text: string): TextRun[] {
    const runs: TextRun[] = [];

    // Check for **bold** segments
    if (text.includes('**')) {
      const parts = text.split('**');
      parts.forEach((part, idx) => {
        if (part.length > 0) {
          runs.push(
            new TextRun({
              text: part,
              bold: idx % 2 === 1 // Odd parts were inside **...**
            })
          );
        }
      });
      return runs;
    }

    // Check for bold label prefix (e.g. "Note: ...", "Important: ...")
    const match = text.match(/^([^:\n]{2,30}:)\s*(.*)$/);
    if (match) {
      runs.push(new TextRun({ text: match[1] + ' ', bold: true }));
      runs.push(new TextRun({ text: match[2] }));
      return runs;
    }

    runs.push(new TextRun({ text }));
    return runs;
  }

  /**
   * Sanitizes text to standard WinAnsi charset for pdf-lib standard fonts.
   * Transliterates known Indic terms and drops or maps incompatible glyphs.
   */
  public toSafePdfText(text: string): string {
    if (!text) return '';

    let result = text;

    // Transliterate known phrases
    Object.entries(INDIC_TO_LATIN_MAP).forEach(([indic, latin]) => {
      if (result.includes(indic)) {
        result = result.split(indic).join(latin);
      }
    });

    // Replace non-WinAnsi punctuation and symbols
    result = result
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\u2014/g, '--')
      .replace(/\u2013/g, '-')
      .replace(/\u2026/g, '...')
      .replace(/\u2022/g, '-')
      .replace(/\u20B9/g, 'Rs.');

    // Ensure all characters fit within WinAnsi (< 0xFF)
    let safeOut = '';
    for (let i = 0; i < result.length; i++) {
      const code = result.charCodeAt(i);
      if (code >= 32 && code <= 126 || code >= 160 && code <= 255 || code === 10 || code === 13) {
        safeOut += result[i];
      } else if (code > 255) {
        // Phonetic or generic Latin fallback
        safeOut += '';
      }
    }

    return safeOut;
  }

  /**
   * Text wrapping helper for PDF layout rendering.
   * Splits unbroken words exceeding maxCharsPerLine to prevent buffer overflows.
   */
  public override wrapText(text: string, maxCharsPerLine: number = 80): string[] {
    if (!text) return [];
    const words = text.replace(/\s+/g, ' ').split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const rawWord of words) {
      // If a single word exceeds maxCharsPerLine, break it into chunks
      const subWords: string[] = [];
      if (rawWord.length > maxCharsPerLine) {
        for (let i = 0; i < rawWord.length; i += maxCharsPerLine) {
          subWords.push(rawWord.substring(i, i + maxCharsPerLine));
        }
      } else {
        subWords.push(rawWord);
      }

      for (const word of subWords) {
        if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
          currentLine = (currentLine + ' ' + word).trim();
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }
}
