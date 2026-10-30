import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import { PDFDocument, PDFName, PDFDict, PDFRawStream } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import * as pako from 'pako';
import {
  ApplyMetadataOptions,
  PdfMetadata,
  PdfMetadataComparisonItem,
  PdfMetadataInspectionResult
} from '../models/pdf-metadata.types';
import '../utilities/pdfjs-worker';

@Injectable({
  providedIn: 'root'
})
export class PdfMetadataEditorService {
  /**
   * Sanitizes text strings against null bytes, unprintable control characters,
   * XML entity injection (XXE/Billion Laughs), and CDATA wrappers,
   * while strictly preserving valid Unicode scripts (Hindi, Marathi, emojis, etc.).
   */
  sanitizeString(input?: string): string {
    if (!input) return '';
    return input
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/<!\[CDATA\[|\]\]>/gi, '') // Neutralize CDATA delimiters
      .replace(/<!DOCTYPE[^>]*>/gi, '')   // Strip XML DOCTYPE declarations (Billion Laughs / XXE)
      .replace(/<!ENTITY[^>]*>/gi, '')    // Strip XML ENTITY declarations
      .trim();
  }

  /**
   * Sanitizes single-line metadata fields (Title, Author, Creator, Producer)
   * by stripping newlines, carriage returns, and tabs in addition to control characters.
   */
  sanitizeSingleLineString(input?: string): string {
    if (!input) return '';
    return this.sanitizeString(input).replace(/[\r\n\t]+/g, ' ').trim();
  }

  /**
   * Formats a JavaScript Date into standard PDF date format:
   * D:YYYYMMDDHHmmSSOHH'mm'
   */
  formatPdfDate(date: Date = new Date()): string {
    const validDate = !date || isNaN(date.getTime()) ? new Date() : date;
    const pad = (n: number) => n.toString().padStart(2, '0');
    const year = validDate.getFullYear().toString().padStart(4, '0');
    const month = pad(validDate.getMonth() + 1);
    const day = pad(validDate.getDate());
    const hours = pad(validDate.getHours());
    const minutes = pad(validDate.getMinutes());
    const seconds = pad(validDate.getSeconds());

    const tzOffset = -validDate.getTimezoneOffset(); // in minutes
    const sign = tzOffset >= 0 ? '+' : '-';
    const absOffset = Math.abs(tzOffset);
    const offsetHours = pad(Math.floor(absOffset / 60));
    const offsetMinutes = pad(absOffset % 60);

    return `D:${year}${month}${day}${hours}${minutes}${seconds}${sign}${offsetHours}'${offsetMinutes}'`;
  }

  /**
   * Formats a JavaScript Date into ISO 8601 format for XMP metadata streams:
   * YYYY-MM-DDTHH:mm:ss+HH:mm
   */
  formatXmpDate(date: Date = new Date()): string {
    const validDate = !date || isNaN(date.getTime()) ? new Date() : date;
    const pad = (n: number) => n.toString().padStart(2, '0');
    const year = validDate.getFullYear().toString().padStart(4, '0');
    const month = pad(validDate.getMonth() + 1);
    const day = pad(validDate.getDate());
    const hours = pad(validDate.getHours());
    const minutes = pad(validDate.getMinutes());
    const seconds = pad(validDate.getSeconds());

    const tzOffset = -validDate.getTimezoneOffset();
    const sign = tzOffset >= 0 ? '+' : '-';
    const absOffset = Math.abs(tzOffset);
    const offsetHours = pad(Math.floor(absOffset / 60));
    const offsetMinutes = pad(absOffset % 60);

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}:${offsetMinutes}`;
  }

  /**
   * Parses standard PDF dates (D:YYYYMMDDHHmmSS...) or ISO strings into Date,
   * properly accounting for PDF timezone offsets.
   */
  parsePdfDate(str?: string): Date | undefined {
    if (!str || typeof str !== 'string') return undefined;
    const trimmed = str.trim();

    // Check PDF format: D:YYYYMMDDHHmmSS...
    const pdfDateMatch = trimmed.match(/^D:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([+\-Z])?(\d{2})?'?(\d{2})?'?/i);
    if (pdfDateMatch) {
      const year = parseInt(pdfDateMatch[1], 10);
      const month = pdfDateMatch[2] ? parseInt(pdfDateMatch[2], 10) - 1 : 0;
      const day = pdfDateMatch[3] ? parseInt(pdfDateMatch[3], 10) : 1;
      const hour = pdfDateMatch[4] ? parseInt(pdfDateMatch[4], 10) : 0;
      const min = pdfDateMatch[5] ? parseInt(pdfDateMatch[5], 10) : 0;
      const sec = pdfDateMatch[6] ? parseInt(pdfDateMatch[6], 10) : 0;

      let utcMillis = Date.UTC(year, month, day, hour, min, sec);
      const sign = pdfDateMatch[7];
      const tzHour = pdfDateMatch[8] ? parseInt(pdfDateMatch[8], 10) : 0;
      const tzMin = pdfDateMatch[9] ? parseInt(pdfDateMatch[9], 10) : 0;
      if (sign === '+') {
        utcMillis -= (tzHour * 60 + tzMin) * 60 * 1000;
      } else if (sign === '-') {
        utcMillis += (tzHour * 60 + tzMin) * 60 * 1000;
      }

      const date = new Date(utcMillis);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    // Fallback: standard ISO 8601
    const isoDate = new Date(trimmed);
    if (!isNaN(isoDate.getTime())) {
      return isoDate;
    }

    return undefined;
  }

  /**
   * Inspects and extracts metadata from both the Info dictionary and XMP stream.
   */
  async readMetadata(source: File | ArrayBuffer | Uint8Array): Promise<PdfMetadataInspectionResult> {
    const rawBytes = await this.toUint8Array(source);
    const fileName = source instanceof File ? source.name : 'document.pdf';
    const fileSizeBytes = rawBytes.byteLength;

    const pdfLibDoc = await PDFDocument.load(rawBytes.slice(0), {
      ignoreEncryption: true,
      updateMetadata: false
    });

    const pageCount = pdfLibDoc.getPageCount();
    const catalog = pdfLibDoc.catalog;

    // 1. Info dictionary read
    const title = pdfLibDoc.getTitle() || undefined;
    const author = pdfLibDoc.getAuthor() || undefined;
    const subject = pdfLibDoc.getSubject() || undefined;
    const creator = pdfLibDoc.getCreator() || undefined;
    const producer = pdfLibDoc.getProducer() || undefined;
    const keywords = pdfLibDoc.getKeywords();
    const creationDate = pdfLibDoc.getCreationDate() || undefined;
    const modificationDate = pdfLibDoc.getModificationDate() || undefined;

    let hasInfoDict = !!(title || author || subject || creator || producer || creationDate || modificationDate || (keywords && keywords.length > 0));

    // 2. Check XMP stream in catalog
    let hasXmpStream = false;
    let rawXmpXml: string | undefined;

    if (catalog.has(PDFName.of('Metadata'))) {
      const metadataRef = catalog.lookup(PDFName.of('Metadata'));
      if (metadataRef && typeof (metadataRef as any).getContents === 'function') {
        try {
          const streamBytes = (metadataRef as any).getContents();
          let decompressed: Uint8Array;
          try {
            const inflate = pako.inflate || (pako as any).default?.inflate;
            decompressed = inflate(streamBytes);
          } catch {
            decompressed = streamBytes;
          }
          rawXmpXml = new TextDecoder('utf-8').decode(decompressed);
          hasXmpStream = true;
        } catch {
          // XMP stream parsing fallback
        }
      }
    }

    // 3. Extract keywords from XMP bag or Info dictionary
    let xmpKeywords: string[] = [];
    if (rawXmpXml) {
      const subjectMatch = rawXmpXml.match(/<dc:subject>[\s\S]*?<rdf:Bag>([\s\S]*?)<\/rdf:Bag>[\s\S]*?<\/dc:subject>/i);
      if (subjectMatch && subjectMatch[1]) {
        const lis = Array.from(subjectMatch[1].matchAll(/<rdf:li[^>]*>([^<]+)<\/rdf:li>/gi));
        if (lis.length > 0) {
          xmpKeywords = lis.map(m => this.sanitizeString(m[1])).filter(Boolean);
        }
      }
    }

    if (xmpKeywords.length === 0 && keywords) {
      if (Array.isArray(keywords)) {
        xmpKeywords = (keywords as any[]).map(k => this.sanitizeString(String(k))).filter(Boolean);
      } else if (typeof keywords === 'string') {
        xmpKeywords = this.parseKeywordsString(keywords);
      }
    }

    // 4. pdfjs-dist verification / extraction fallback
    try {
      const pdfjsDoc = await pdfjsLib.getDocument({ data: rawBytes.slice(0) }).promise;
      const pdfjsMeta = await pdfjsDoc.getMetadata();
      if (pdfjsMeta) {
        if (!hasXmpStream && pdfjsMeta.metadata) {
          hasXmpStream = true;
        }
        const infoObj = pdfjsMeta.info as Record<string, any> | undefined;
        if (xmpKeywords.length === 0 && infoObj?.['Keywords']) {
          xmpKeywords = this.parseKeywordsString(infoObj['Keywords']);
        }
      }
    } catch {
      // pdfjs fallback
    }

    return {
      metadata: {
        title,
        author,
        subject,
        keywords: xmpKeywords,
        creator,
        producer,
        creationDate,
        modificationDate
      },
      rawCreationDate: creationDate ? this.formatPdfDate(creationDate) : undefined,
      rawModificationDate: modificationDate ? this.formatPdfDate(modificationDate) : undefined,
      hasXmpStream,
      hasInfoDict,
      rawXmpXml,
      pageCount,
      fileName,
      fileSizeBytes
    };
  }

  /**
   * Applies metadata attributes to the document, synchronizing BOTH the PDF Info dictionary
   * and the XMP metadata stream with full Unicode encoding support.
   */
  async applyMetadata(
    source: File | ArrayBuffer | Uint8Array,
    metadata: PdfMetadata,
    options?: ApplyMetadataOptions
  ): Promise<{ pdfBytes: Uint8Array; updatedFile: File; inspection: PdfMetadataInspectionResult }> {
    const rawBytes = await this.toUint8Array(source);
    const fileName = source instanceof File ? source.name : 'document.pdf';

    const pdfLibDoc = await PDFDocument.load(rawBytes.slice(0), {
      ignoreEncryption: true,
      updateMetadata: false
    });

    const catalog = pdfLibDoc.catalog;
    const context = pdfLibDoc.context;

    // Clean inputs
    const cleanTitle = this.sanitizeSingleLineString(metadata.title);
    const cleanAuthor = this.sanitizeSingleLineString(metadata.author);
    const cleanSubject = this.sanitizeString(metadata.subject);
    const cleanCreator = this.sanitizeSingleLineString(metadata.creator);
    const cleanProducer = this.sanitizeSingleLineString(metadata.producer);

    const cleanKeywords = Array.isArray(metadata.keywords)
      ? metadata.keywords.map(k => this.sanitizeSingleLineString(k)).filter(k => k.length > 0)
      : [];

    const creationDate = metadata.creationDate || new Date();
    const modificationDate = options?.updateModificationDate !== false
      ? (metadata.modificationDate || new Date())
      : (metadata.modificationDate || creationDate);

    // 1. Update Info Dictionary via pdf-lib
    pdfLibDoc.setTitle(cleanTitle);
    pdfLibDoc.setAuthor(cleanAuthor);
    pdfLibDoc.setSubject(cleanSubject);
    pdfLibDoc.setKeywords(cleanKeywords);
    pdfLibDoc.setCreator(cleanCreator);
    pdfLibDoc.setProducer(cleanProducer);
    pdfLibDoc.setCreationDate(creationDate);
    pdfLibDoc.setModificationDate(modificationDate);

    // 2. Generate and Synchronize XMP Metadata Packet
    const xmpString = this.generateXmpPacket({
      title: cleanTitle,
      author: cleanAuthor,
      subject: cleanSubject,
      keywords: cleanKeywords,
      creator: cleanCreator,
      producer: cleanProducer,
      creationDate,
      modificationDate
    });

    const xmpBytes = new TextEncoder().encode(xmpString);

    // 3. Embed or replace /Metadata entry in Catalog as uncompressed/raw stream
    const metadataDict = context.obj({
      Type: 'Metadata',
      Subtype: 'XML',
      Length: xmpBytes.length
    });
    const metadataStream = PDFRawStream.of(metadataDict, xmpBytes);
    const metadataRef = context.register(metadataStream);
    catalog.set(PDFName.of('Metadata'), metadataRef);

    // 4. Save updated document
    const pdfBytes = await pdfLibDoc.save({ useObjectStreams: false });
    const updatedBlob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const outputFileName = fileName.replace(/\.pdf$/i, '_updated_meta.pdf');
    const updatedFile = new File([updatedBlob], outputFileName, { type: 'application/pdf' });

    // 5. Read back inspection to verify dual-synchronization
    const inspection = await this.readMetadata(pdfBytes);

    return {
      pdfBytes,
      updatedFile,
      inspection
    };
  }

  /**
   * Generates a fully-formed, valid XMP packet containing Dublin Core, Adobe PDF,
   * and XMP schemas synchronized with the Info dictionary.
   */
  generateXmpPacket(meta: PdfMetadata): string {
    const esc = (text?: string) => this.escapeXml(text || '');
    const title = esc(meta.title);
    const author = esc(meta.author);
    const subject = esc(meta.subject);
    const creator = esc(meta.creator);
    const producer = esc(meta.producer);
    const keywordsArr = (meta.keywords || []).map(k => esc(k));
    const keywordsStr = keywordsArr.join(', ');

    const createDateIso = this.formatXmpDate(meta.creationDate || new Date());
    const modifyDateIso = this.formatXmpDate(meta.modificationDate || meta.creationDate || new Date());

    return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
        xmlns:xmp="http://ns.adobe.com/xap/1.0/">
      <dc:format>application/pdf</dc:format>
      <dc:title>
        <rdf:Alt>
          <rdf:li xml:lang="x-default">${title}</rdf:li>
        </rdf:Alt>
      </dc:title>
      <dc:creator>
        <rdf:Seq>
          <rdf:li>${author}</rdf:li>
        </rdf:Seq>
      </dc:creator>
      <dc:description>
        <rdf:Alt>
          <rdf:li xml:lang="x-default">${subject}</rdf:li>
        </rdf:Alt>
      </dc:description>
      <dc:subject>
        <rdf:Bag>
${keywordsArr.map(k => `          <rdf:li>${k}</rdf:li>`).join('\n')}
        </rdf:Bag>
      </dc:subject>
      <pdf:Keywords>${keywordsStr}</pdf:Keywords>
      <pdf:Producer>${producer}</pdf:Producer>
      <xmp:CreatorTool>${creator}</xmp:CreatorTool>
      <xmp:CreateDate>${createDateIso}</xmp:CreateDate>
      <xmp:ModifyDate>${modifyDateIso}</xmp:ModifyDate>
      <xmp:MetadataDate>${modifyDateIso}</xmp:MetadataDate>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
  }

  /**
   * Compares original inspected metadata against updated metadata to generate comparison items.
   */
  compareMetadata(original: PdfMetadata, updated: PdfMetadata): PdfMetadataComparisonItem[] {
    const fields: Array<{ key: keyof PdfMetadata; labelKey: string }> = [
      { key: 'title', labelKey: 'metadataEditor.fieldTitle' },
      { key: 'author', labelKey: 'metadataEditor.fieldAuthor' },
      { key: 'subject', labelKey: 'metadataEditor.fieldSubject' },
      { key: 'keywords', labelKey: 'metadataEditor.fieldKeywords' },
      { key: 'creator', labelKey: 'metadataEditor.fieldCreator' },
      { key: 'producer', labelKey: 'metadataEditor.fieldProducer' },
      { key: 'creationDate', labelKey: 'metadataEditor.fieldCreationDate' },
      { key: 'modificationDate', labelKey: 'metadataEditor.fieldModificationDate' }
    ];

    return fields.map(({ key, labelKey }) => {
      let origStr = '';
      let updStr = '';

      if (key === 'keywords') {
        origStr = (original.keywords || []).join(', ');
        updStr = (updated.keywords || []).join(', ');
      } else if (key === 'creationDate' || key === 'modificationDate') {
        const origDate = original[key] as Date | undefined;
        const updDate = updated[key] as Date | undefined;
        origStr = origDate ? this.formatPdfDate(origDate) : '';
        updStr = updDate ? this.formatPdfDate(updDate) : '';
      } else {
        origStr = (original[key] as string) || '';
        updStr = (updated[key] as string) || '';
      }

      return {
        fieldKey: key,
        labelKey,
        originalValue: origStr,
        updatedValue: updStr,
        isModified: origStr !== updStr
      };
    });
  }

  /**
   * Helper to parse comma or semicolon delimited keywords string into clean string array.
   */
  parseKeywordsString(str?: string): string[] {
    if (!str) return [];
    let items = str
      .split(/[,;\n]+/)
      .map(k => this.sanitizeString(k))
      .filter(k => k.length > 0);

    if (items.length === 1 && items[0].includes(' ') && !str.includes(',')) {
      items = items[0]
        .split(/\s+/)
        .map(k => this.sanitizeString(k))
        .filter(k => k.length > 0);
    }
    return items;
  }

  private escapeXml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private async toUint8Array(source: File | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
    if (source instanceof Uint8Array) return source;
    if (source instanceof ArrayBuffer) return new Uint8Array(source);
    const buffer = await source.arrayBuffer();
    return new Uint8Array(buffer);
  }
}
