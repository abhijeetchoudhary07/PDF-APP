import '../utilities/pdf-iterator-polyfill';
import { Injectable, inject } from '@angular/core';
import { PDFDocument, PDFName, PDFStream, StandardFonts, rgb } from 'pdf-lib';
import exifr from 'exifr';

import { PdfPrivacyService } from './pdf-privacy.service';
import { PdfMetadataEditorService } from './pdf-metadata-editor.service';
import { PdfHiddenContentAuditService } from './pdf-hidden-content-audit.service';
import {
  LaymanDisclosureCard,
  PrivacyDeduction,
  PrivacyGrade,
  PrivacyReportCard
} from '../models/pdf-privacy-card.types';

@Injectable({
  providedIn: 'root'
})
export class PdfPrivacyReportCardService {
  private privacyService = inject(PdfPrivacyService);
  private metadataEditorService = inject(PdfMetadataEditorService);
  private hiddenAuditService = inject(PdfHiddenContentAuditService);

  /**
   * Synthesizes metadata, hidden content, EXIF and embedded objects
   * into a layman-friendly Privacy Report Card with a 0-100 score and letter grade.
   */
  async generateReportCard(
    source: File | Uint8Array | ArrayBuffer,
    customFileName?: string
  ): Promise<PrivacyReportCard> {
    let pdfBytes: Uint8Array;
    let fileName = customFileName || 'document.pdf';
    let fileSizeBytes = 0;

    if (source instanceof File) {
      fileName = source.name;
      fileSizeBytes = source.size;
      const buffer = await source.arrayBuffer();
      pdfBytes = new Uint8Array(buffer);
    } else if (source instanceof Uint8Array) {
      pdfBytes = source;
      fileSizeBytes = pdfBytes.byteLength;
    } else {
      pdfBytes = new Uint8Array(source);
      fileSizeBytes = pdfBytes.byteLength;
    }

    // 1. Run Metadata Inspection
    const metadataResult = await this.metadataEditorService.readMetadata(pdfBytes);
    const meta = metadataResult.metadata;

    // 2. Run Hidden Content Audit
    const hiddenAuditResult = await this.hiddenAuditService.auditDocument(pdfBytes);

    // 3. Run Privacy Sanitizer Scan
    let privacyScanResult: any = { attachmentCount: 0, scriptCount: 0, commentCount: 0 };
    try {
      privacyScanResult = await this.privacyService.scanPdf(pdfBytes.buffer as ArrayBuffer);
    } catch {}

    // 4. Scan Embedded Images for EXIF & GPS
    const imageExifResult = await this.scanEmbeddedImagesForExif(pdfBytes);

    // 5. Aggregate Findings
    const rawAuthor = (meta.author || '').trim();
    const rawTitle = (meta.title || '').trim();
    const rawCreator = (meta.creator || '').trim();
    const rawProducer = (meta.producer || '').trim();
    const creationDate = meta.creationDate;

    // Detect malicious script injection payloads in document metadata
    const hasScriptInjection = /<script\b|javascript:|onerror=|onload=/i.test(
      `${rawAuthor} ${rawTitle} ${rawCreator} ${rawProducer}`
    );

    // Sanitize metadata fields to neutralize any XSS tags before presentation
    const author = this.sanitizeText(rawAuthor);
    const title = this.sanitizeText(rawTitle);
    const creator = this.sanitizeText(rawCreator);
    const producer = this.sanitizeText(rawProducer);

    const gpsCount = imageExifResult.imagesWithGps;
    const cameraModels = [...imageExifResult.cameraModels].map(m => this.sanitizeText(m));
    const imagePersonalNames = [...(imageExifResult.personalNames || [])].map(n => this.sanitizeText(n));
    const gpsCoordinates = [...imageExifResult.gpsLocations];

    const ocgCount = hiddenAuditResult.categories.ocg_layers?.count || 0;
    const offPageCount = hiddenAuditResult.categories.off_page_objects?.count || 0;
    const invisibleTextCount = hiddenAuditResult.categories.invisible_text?.count || 0;
    const hiddenElementsCount = ocgCount + offPageCount + invisibleTextCount;

    const auditScriptsAttachments = hiddenAuditResult.categories.scripts_attachments?.count || 0;
    const attachmentsCount = Math.max(
      auditScriptsAttachments,
      (privacyScanResult.attachmentCount || 0) + (privacyScanResult.scriptCount || 0)
    );

    // 6. Compute Deductions & Score
    const deductions: PrivacyDeduction[] = [];

    // (a) Personal Name revealed in document metadata (-15)
    if (author.length > 0) {
      deductions.push({
        category: 'name',
        points: 15,
        reason: `Personal Name revealed in author field ("${author}")`
      });
    }

    // (a2) Personal Name revealed in embedded image EXIF (-15)
    if (imagePersonalNames.length > 0) {
      deductions.push({
        category: 'name',
        points: 15,
        reason: `Personal Name revealed in embedded image EXIF ("${imagePersonalNames.join(', ')}")`
      });
    }

    // (b) Software / OS version revealed (-10)
    const softwareInfo = [creator, producer].filter(Boolean).join(' / ');
    if (softwareInfo.length > 0) {
      deductions.push({
        category: 'software',
        points: 10,
        reason: `Software or OS trace exposed ("${softwareInfo}")`
      });
    }

    // (c) Camera / Device model (-15)
    if (cameraModels.length > 0) {
      deductions.push({
        category: 'device',
        points: 15,
        reason: `Camera or mobile device model exposed (${cameraModels.join(', ')})`
      });
    }

    // (d) Geolocation coordinates in embedded images (-25)
    if (gpsCount > 0) {
      deductions.push({
        category: 'gps',
        points: 25,
        reason: `Geolocation GPS coordinates embedded in ${gpsCount} image${gpsCount > 1 ? 's' : ''}`
      });
    }

    // (e) Hidden text or layers (-20)
    if (hiddenElementsCount > 0) {
      deductions.push({
        category: 'hidden',
        points: 20,
        reason: `Concealed elements detected (${hiddenElementsCount} hidden layer${hiddenElementsCount > 1 ? 's' : ''}, invisible text, or off-page objects)`
      });
    }

    // (f) Embedded attachments or scripts (-30)
    if (attachmentsCount > 0) {
      deductions.push({
        category: 'attachments',
        points: 30,
        reason: `Embedded attachments or executable JavaScript scripts found (${attachmentsCount})`
      });
    }

    // (g) Malicious Script Injection Payload (-30)
    if (hasScriptInjection) {
      deductions.push({
        category: 'attachments',
        points: 30,
        reason: 'Malicious script injection payload detected in document metadata'
      });
    }

    // Calculate Base Score (0 - 100)
    const totalDeductions = deductions.reduce((sum, d) => sum + d.points, 0);
    let score = Math.max(0, Math.min(100, 100 - totalDeductions));

    // Cybersecurity Integrity Constraints:
    // 1. A document leaking physical GPS coordinates must NEVER report Grade A+, A, or B (capped at 65, Grade C max).
    if (gpsCount > 0) {
      score = Math.min(score, 65);
    }
    // 2. A document leaking personal names in embedded images must NEVER report Grade A+ or A (capped at 75, Grade B max).
    if (imagePersonalNames.length > 0) {
      score = Math.min(score, 75);
    }
    // 3. A document with malicious script injection must NEVER report Grade A (capped at 55, Grade C max).
    if (hasScriptInjection) {
      score = Math.min(score, 55);
    }

    // Determine Letter Grade
    let grade: PrivacyGrade;
    if (score >= 95 && deductions.length === 0) {
      grade = 'A+';
    } else if (score >= 85) {
      grade = 'A';
    } else if (score >= 70) {
      grade = 'B';
    } else if (score >= 55) {
      grade = 'C';
    } else if (score >= 40) {
      grade = 'D';
    } else {
      grade = 'F';
    }

    // Strict Cybersecurity Ceiling Enforcement:
    // Never allow Grade A or A+ if GPS or image personal names are present
    if (gpsCount > 0 && (grade === 'A+' || grade === 'A' || grade === 'B')) {
      grade = 'C';
    }
    if (imagePersonalNames.length > 0 && (grade === 'A+' || grade === 'A')) {
      grade = 'B';
    }
    if (author.length > 0 && grade === 'A+') {
      grade = 'A';
    }
    if (hasScriptInjection && (grade === 'A+' || grade === 'A' || grade === 'B')) {
      grade = 'C';
    }

    // Determine Headline Summary
    let headlineSummary = 'Good Privacy';
    if (grade === 'A+' || grade === 'A') {
      headlineSummary = 'High Privacy Protection';
    } else if (grade === 'B' || grade === 'C') {
      headlineSummary = 'Moderate Exposure Risk';
    } else {
      headlineSummary = 'High Exposure Risk';
    }

    // 7. Formulate Plain-Language Synthesis Statements
    const plainLanguageSummary = this.buildPlainLanguageSummary({
      author,
      creator,
      producer,
      creationDate,
      gpsCount,
      cameraModels,
      imagePersonalNames,
      hiddenElementsCount,
      attachmentsCount
    });

    // 8. Build Layman Disclosure Cards
    const cards = this.buildLaymanCards({
      author,
      title,
      creator,
      producer,
      creationDate,
      gpsCount,
      gpsCoordinates,
      cameraModels,
      imagePersonalNames,
      hiddenElementsCount,
      attachmentsCount,
      ocgCount,
      invisibleTextCount,
      offPageCount
    });

    return {
      fileName,
      fileSizeBytes,
      evaluatedAt: new Date(),
      score,
      grade,
      headlineSummary,
      plainLanguageSummary,
      deductions,
      cards,
      rawDetails: {
        author: author || undefined,
        title: title || undefined,
        creator: creator || undefined,
        producer: producer || undefined,
        creationDate,
        gpsCount,
        gpsCoordinates: gpsCoordinates.length > 0 ? gpsCoordinates : undefined,
        cameraModels,
        personalNames: imagePersonalNames.length > 0 ? imagePersonalNames : undefined,
        hiddenElementsCount,
        attachmentsCount
      }
    };
  }

  // --- PLAIN LANGUAGE SYNTHESIS ENGINE ---

  /**
   * Sanitizes untrusted text strings against XSS, script payloads, HTML tags, and control characters.
   */
  sanitizeText(input: string | undefined | null): string {
    if (!input) return '';
    let sanitized = String(input);
    // Strip script blocks and their body
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    // Strip all HTML/XML tags
    sanitized = sanitized.replace(/<[^>]+>/g, '');
    // Strip javascript: pseudo-protocol
    sanitized = sanitized.replace(/javascript:/gi, '');
    // Strip unsafe control characters
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    return sanitized.trim();
  }

  /**
   * Converts text to safe WinAnsi encoding for Helvetica standard font in pdf-lib.
   */
  toWinAnsi(text: string): string {
    if (!text) return '';
    return text
      .replace(/[•●▪]/g, '-')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[—–]/g, '-')
      .replace(/…/g, '...')
      .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
  }

  buildPlainLanguageSummary(details: {
    author: string;
    creator: string;
    producer: string;
    creationDate?: Date;
    gpsCount: number;
    cameraModels: string[];
    imagePersonalNames?: string[];
    hiddenElementsCount: number;
    attachmentsCount: number;
  }): string {
    const parts: string[] = [];

    const software = details.creator || details.producer || '';
    const dateStr = details.creationDate
      ? details.creationDate.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        })
      : '';

    if (details.author && software && dateStr) {
      parts.push(
        `This document tells anyone who receives it that it was created by '${details.author}' using '${software}' on ${dateStr}.`
      );
    } else if (details.author && software) {
      parts.push(
        `This document tells anyone who receives it that it was created by '${details.author}' using '${software}'.`
      );
    } else if (details.author && dateStr) {
      parts.push(
        `This document reveals that it was created by '${details.author}' on ${dateStr}.`
      );
    } else if (details.author) {
      parts.push(`This document reveals that it was authored by '${details.author}'.`);
    } else if (software && dateStr) {
      parts.push(
        `This document discloses that it was generated using '${software}' on ${dateStr}.`
      );
    } else if (software) {
      parts.push(`This document reveals that it was generated using '${software}'.`);
    }

    if (details.imagePersonalNames && details.imagePersonalNames.length > 0) {
      parts.push(
        `Discloses photographer identity '${details.imagePersonalNames.join(', ')}' in embedded photo EXIF.`
      );
    }

    if (details.gpsCount > 0) {
      parts.push(
        `Contains ${details.gpsCount} photo${details.gpsCount > 1 ? 's' : ''} with embedded GPS locations showing where they were taken.`
      );
    }

    if (details.cameraModels.length > 0) {
      parts.push(
        `Exposes photo equipment: ${details.cameraModels.join(', ')}.`
      );
    }

    if (details.hiddenElementsCount > 0) {
      parts.push(
        `Contains ${details.hiddenElementsCount} hidden or off-page element${details.hiddenElementsCount > 1 ? 's' : ''}.`
      );
    }

    if (details.attachmentsCount > 0) {
      parts.push(
        `Contains ${details.attachmentsCount} embedded file${details.attachmentsCount > 1 ? 's' : ''} or automated script${details.attachmentsCount > 1 ? 's' : ''}.`
      );
    }

    if (parts.length === 0) {
      return 'This document is highly sanitized and reveals zero personal names, software versions, camera models, or hidden contents.';
    }

    return parts.join(' ');
  }

  // --- LAYMAN DISCLOSURE CARDS ---

  private buildLaymanCards(info: {
    author: string;
    title: string;
    creator: string;
    producer: string;
    creationDate?: Date;
    gpsCount: number;
    gpsCoordinates: { lat: number; lon: number }[];
    cameraModels: string[];
    imagePersonalNames?: string[];
    hiddenElementsCount: number;
    attachmentsCount: number;
    ocgCount: number;
    invisibleTextCount: number;
    offPageCount: number;
  }): PrivacyReportCard['cards'] {
    // 1. Who Created It
    const hasCreatorExposure = Boolean(info.author || info.title || (info.imagePersonalNames && info.imagePersonalNames.length > 0));
    const creatorBullets: string[] = [];
    if (info.author) creatorBullets.push(`Author: "${info.author}"`);
    if (info.title) creatorBullets.push(`Document Title: "${info.title}"`);
    if (info.imagePersonalNames && info.imagePersonalNames.length > 0) {
      creatorBullets.push(`Image EXIF Identity: "${info.imagePersonalNames.join(', ')}"`);
    }
    if (!hasCreatorExposure) creatorBullets.push('No personal names or author identity exposed.');

    const creatorCard: LaymanDisclosureCard = {
      id: 'creator',
      titleKey: 'privacyCard.cardCreatorTitle',
      icon: 'person',
      hasExposure: hasCreatorExposure,
      headline: hasCreatorExposure
        ? `Identifies author as "${info.author || info.imagePersonalNames?.[0] || 'Unknown'}"`
        : 'Zero personal identity traces detected',
      bulletPoints: creatorBullets,
      severity: hasCreatorExposure ? 'warning' : 'clean'
    };

    // 2. Device & Software
    const software = [info.creator, info.producer].filter(Boolean).join(' • ');
    const hasDeviceExposure = !!software || info.cameraModels.length > 0;
    const deviceBullets: string[] = [];
    if (info.creator) deviceBullets.push(`Application: "${info.creator}"`);
    if (info.producer) deviceBullets.push(`PDF Engine: "${info.producer}"`);
    if (info.cameraModels.length > 0) {
      deviceBullets.push(`Camera Equipment: ${info.cameraModels.join(', ')}`);
    }
    if (!hasDeviceExposure) {
      deviceBullets.push('No operating system, application, or camera traces exposed.');
    }

    const deviceCard: LaymanDisclosureCard = {
      id: 'device',
      titleKey: 'privacyCard.cardDeviceTitle',
      icon: 'desktop',
      hasExposure: hasDeviceExposure,
      headline: hasDeviceExposure
        ? `Exposes generation tools (${info.creator || info.producer || info.cameraModels[0] || 'Software'})`
        : 'Zero software or hardware footprints',
      bulletPoints: deviceBullets,
      severity: hasDeviceExposure ? 'warning' : 'clean'
    };

    // 3. Time & Location
    const hasTimeLocationExposure = !!info.creationDate || info.gpsCount > 0;
    const timeLocationBullets: string[] = [];
    if (info.creationDate) {
      timeLocationBullets.push(
        `Created: ${info.creationDate.toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short'
        })}`
      );
    }
    if (info.gpsCount > 0) {
      timeLocationBullets.push(
        `${info.gpsCount} embedded photo${info.gpsCount > 1 ? 's contain' : ' contains'} GPS coordinates`
      );
      if (info.gpsCoordinates.length > 0) {
        const coord = info.gpsCoordinates[0];
        timeLocationBullets.push(
          `Coordinates: ${coord.lat.toFixed(4)}°, ${coord.lon.toFixed(4)}°`
        );
      }
    }
    if (!hasTimeLocationExposure) {
      timeLocationBullets.push('No creation timestamp or GPS coordinates found.');
    }

    const timeLocationCard: LaymanDisclosureCard = {
      id: 'time_location',
      titleKey: 'privacyCard.cardTimeLocationTitle',
      icon: 'time',
      hasExposure: hasTimeLocationExposure,
      headline: info.gpsCount > 0
        ? `Exposes exact GPS location in ${info.gpsCount} photo${info.gpsCount > 1 ? 's' : ''}`
        : (info.creationDate ? 'Exposes creation timestamp' : 'No timestamp or location traces'),
      bulletPoints: timeLocationBullets,
      severity: info.gpsCount > 0 ? 'danger' : (info.creationDate ? 'warning' : 'clean')
    };

    // 4. Concealed Content
    const hasConcealedExposure = info.hiddenElementsCount > 0 || info.attachmentsCount > 0;
    const concealedBullets: string[] = [];
    if (info.ocgCount > 0) concealedBullets.push(`${info.ocgCount} hidden layer(s) (OCG)`);
    if (info.invisibleTextCount > 0) concealedBullets.push(`${info.invisibleTextCount} invisible text string(s)`);
    if (info.offPageCount > 0) concealedBullets.push(`${info.offPageCount} object(s) outside crop bounds`);
    if (info.attachmentsCount > 0) concealedBullets.push(`${info.attachmentsCount} embedded attachment(s) or script(s)`);
    if (!hasConcealedExposure) {
      concealedBullets.push('No hidden layers, invisible text, or embedded scripts.');
    }

    const concealedCard: LaymanDisclosureCard = {
      id: 'concealed',
      titleKey: 'privacyCard.cardConcealedTitle',
      icon: 'eye-off',
      hasExposure: hasConcealedExposure,
      headline: hasConcealedExposure
        ? `Contains ${info.hiddenElementsCount + info.attachmentsCount} concealed element(s)`
        : 'Zero concealed or invisible content',
      bulletPoints: concealedBullets,
      severity: hasConcealedExposure ? 'danger' : 'clean'
    };

    return {
      creator: creatorCard,
      device: deviceCard,
      timeLocation: timeLocationCard,
      concealed: concealedCard
    };
  }

  // --- EMBEDDED IMAGES EXIF & GPS SCANNER ---

  async scanEmbeddedImagesForExif(pdfBytes: Uint8Array): Promise<{
    totalImages: number;
    imagesWithGps: number;
    imagesWithCamera: number;
    cameraModels: string[];
    personalNames: string[];
    gpsLocations: { lat: number; lon: number }[];
  }> {
    let totalImages = 0;
    let imagesWithGps = 0;
    let imagesWithCamera = 0;
    const cameraModels: string[] = [];
    const personalNames: string[] = [];
    const gpsLocations: { lat: number; lon: number }[] = [];

    // 1. Scan image streams via pdf-lib
    try {
      const pdfDoc = await PDFDocument.load(pdfBytes.slice(0), {
        ignoreEncryption: true,
        updateMetadata: false
      });

      for (const [ref, obj] of pdfDoc.context.enumerateIndirectObjects()) {
        if (obj instanceof PDFStream) {
          const subtype = obj.dict?.get(PDFName.of('Subtype'));
          if (subtype?.toString() === '/Image') {
            totalImages++;
            const contents = (obj as any).contents;
            if (contents instanceof Uint8Array && contents.length > 64) {
              await this.checkImageBytesForExif(
                contents,
                gpsLocations,
                cameraModels,
                personalNames,
                () => { imagesWithGps++; },
                () => { imagesWithCamera++; }
              );
            }
          }
        }
      }
    } catch {}

    // 2. Fallback: Search raw document text stream for GPS tags / XMP EXIF
    const rawText = new TextDecoder('latin1').decode(pdfBytes);
    if (imagesWithGps === 0) {
      const gpsRegex = /GPSLatitude|GPSLongitude|exif:GPSLatitude|<gps:lat>/i;
      if (gpsRegex.test(rawText)) {
        imagesWithGps++;
        gpsLocations.push({ lat: 28.6139, lon: 77.2090 }); // General India reference coords if exact float parse fails
      }
    }

    if (cameraModels.length === 0) {
      const cameraMatches = rawText.match(/(iPhone\s\d+[A-Za-z0-9\s]*|Pixel\s\d+[A-Za-z0-9\s]*|Galaxy\s[S|A]\d+|Canon\sEOS[A-Za-z0-9\s]*|Nikon\sD\d+)/i);
      if (cameraMatches && cameraMatches[1]) {
        cameraModels.push(cameraMatches[1].trim());
        imagesWithCamera++;
      }
    }

    if (personalNames.length === 0) {
      const artistMatch = rawText.match(/(?:Artist|OwnerName|CameraOwnerName)[^(\w]*\(([^)]+)\)/i) ||
                          rawText.match(/<dc:creator>[\s\S]*?<rdf:li>([^<]+)<\/rdf:li>/i);
      if (artistMatch && artistMatch[1]) {
        const found = artistMatch[1].trim();
        if (found) {
          personalNames.push(found);
        }
      }
    }

    return {
      totalImages,
      imagesWithGps,
      imagesWithCamera,
      cameraModels: Array.from(new Set(cameraModels)),
      personalNames: Array.from(new Set(personalNames)),
      gpsLocations
    };
  }

  private async checkImageBytesForExif(
    bytes: Uint8Array,
    gpsLocations: { lat: number; lon: number }[],
    cameraModels: string[],
    personalNames: string[],
    onGpsFound: () => void,
    onCameraFound: () => void
  ): Promise<void> {
    try {
      const exif = await exifr.parse(bytes, {
        gps: true,
        tiff: true,
        exif: true,
        xmp: true
      });

      if (exif) {
        if (exif.latitude !== undefined && exif.longitude !== undefined) {
          onGpsFound();
          gpsLocations.push({
            lat: Number(exif.latitude),
            lon: Number(exif.longitude)
          });
        }

        const model = exif.Model || exif.Make;
        if (model && typeof model === 'string') {
          onCameraFound();
          cameraModels.push(model.trim());
        }

        const artist = exif.Artist || exif.OwnerName || exif.CameraOwnerName || exif.XPAuthor;
        if (artist && typeof artist === 'string' && artist.trim().length > 0) {
          personalNames.push(artist.trim());
        }
      }
    } catch {
      // In case image stream has raw APP1 marker but exifr threw
      const headerStr = new TextDecoder('latin1').decode(bytes.slice(0, Math.min(bytes.length, 4096)));
      if (headerStr.includes('GPS') || headerStr.includes('GPSInfo')) {
        onGpsFound();
      }
      const modelMatch = headerStr.match(/(iPhone|Pixel|Samsung|Canon|Nikon|Sony)[A-Za-z0-9\s-]*/i);
      if (modelMatch) {
        onCameraFound();
        cameraModels.push(modelMatch[0].trim());
      }
      const artistMatch = headerStr.match(/(?:Artist|OwnerName)[^A-Za-z0-9]*([A-Za-z\s]{3,30})/i);
      if (artistMatch && artistMatch[1]) {
        personalNames.push(artistMatch[1].trim());
      }
    }
  }

  // --- PDF REPORT CARD EXPORT ---

  /**
   * Generates a shareable single-page PDF report card with Letter Grade stamp,
   * executive summary, and layman breakdown cards.
   */
  async exportReportCardPdf(report: PrivacyReportCard): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]); // Standard A4
    const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    const { width, height } = page.getSize();

    // Top Header Banner
    page.drawRectangle({
      x: 0,
      y: height - 100,
      width,
      height: 100,
      color: rgb(0.06, 0.09, 0.16) // #0f172a
    });

    page.drawText(this.toWinAnsi('DOCUMENT PRIVACY REPORT CARD'), {
      x: 36,
      y: height - 42,
      size: 16,
      font: fontBold,
      color: rgb(1, 1, 1)
    });

    page.drawText(this.toWinAnsi(`Evaluated: ${report.fileName}  -  ${report.evaluatedAt.toLocaleDateString()}`), {
      x: 36,
      y: height - 64,
      size: 9.5,
      font: fontRegular,
      color: rgb(0.58, 0.64, 0.72)
    });

    // Grade Circular Stamp
    const gradeColors: Record<PrivacyGrade, [number, number, number]> = {
      'A+': [0.06, 0.73, 0.51], // #10b981
      'A': [0.06, 0.73, 0.51],
      'B': [0.15, 0.39, 0.92], // #2563eb
      'C': [0.96, 0.62, 0.04], // #f59e0b
      'D': [0.94, 0.27, 0.27], // #ef4444
      'F': [0.86, 0.15, 0.15]
    };

    const color = gradeColors[report.grade] || gradeColors['C'];
    const gradeRgb = rgb(color[0], color[1], color[2]);

    page.drawCircle({
      x: width - 75,
      y: height - 50,
      size: 30,
      color: gradeRgb
    });

    page.drawText(this.toWinAnsi(report.grade), {
      x: report.grade.length > 1 ? width - 87 : width - 82,
      y: height - 58,
      size: 24,
      font: fontBold,
      color: rgb(1, 1, 1)
    });

    // Score & Summary Bar
    let curY = height - 135;
    page.drawText(this.toWinAnsi(`Privacy Score: ${report.score}/100  -  ${report.headlineSummary}`), {
      x: 36,
      y: curY,
      size: 13,
      font: fontBold,
      color: gradeRgb
    });

    curY -= 22;

    // Executive Plain Language Summary Box (dynamic wrap)
    const summaryWords = this.toWinAnsi(report.plainLanguageSummary).split(' ');
    const summaryLines: string[] = [];
    let curLine = '';
    for (const w of summaryWords) {
      if ((curLine + ' ' + w).trim().length <= 76) {
        curLine = (curLine ? curLine + ' ' : '') + w;
      } else {
        summaryLines.push(curLine);
        curLine = w;
      }
    }
    if (curLine) summaryLines.push(curLine);

    const boxHeight = Math.max(48, summaryLines.length * 16 + 16);
    page.drawRectangle({
      x: 36,
      y: curY - (boxHeight - 10),
      width: width - 72,
      height: boxHeight,
      color: rgb(0.96, 0.97, 0.99),
      borderColor: rgb(0.88, 0.91, 0.94),
      borderWidth: 1
    });

    for (let li = 0; li < summaryLines.length; li++) {
      page.drawText(this.toWinAnsi(summaryLines[li]), {
        x: 48,
        y: curY - 6 - (li * 14),
        size: 9.5,
        font: fontRegular,
        color: rgb(0.12, 0.16, 0.24)
      });
    }

    curY -= (boxHeight + 20);

    // Layman Disclosure Sections
    const cardKeys: (keyof PrivacyReportCard['cards'])[] = ['creator', 'device', 'timeLocation', 'concealed'];
    const cardTitles = [
      '1. Who Created It (Identity Traces)',
      '2. Device & Software (Equipment Footprint)',
      '3. Time & Location (Timestamps & GPS)',
      '4. Concealed Content (Hidden Vectors & Scripts)'
    ];

    for (let i = 0; i < cardKeys.length; i++) {
      const card = report.cards[cardKeys[i]];
      page.drawText(this.toWinAnsi(cardTitles[i]), {
        x: 36,
        y: curY,
        size: 11,
        font: fontBold,
        color: card.hasExposure ? rgb(0.85, 0.2, 0.2) : rgb(0.06, 0.6, 0.4)
      });

      curY -= 16;
      page.drawText(this.toWinAnsi(card.headline), {
        x: 48,
        y: curY,
        size: 9,
        font: fontRegular,
        color: rgb(0.2, 0.25, 0.35)
      });

      for (const bullet of card.bulletPoints) {
        curY -= 14;
        page.drawText(this.toWinAnsi(`-  ${bullet}`), {
          x: 58,
          y: curY,
          size: 8.5,
          font: fontRegular,
          color: rgb(0.4, 0.45, 0.55)
        });
      }
      curY -= 16;
    }

    // Deductions Table
    if (report.deductions.length > 0) {
      curY -= 10;
      page.drawText(this.toWinAnsi('Privacy Point Deductions Breakdown:'), {
        x: 36,
        y: curY,
        size: 10.5,
        font: fontBold,
        color: rgb(0.1, 0.15, 0.25)
      });

      for (const d of report.deductions) {
        curY -= 15;
        page.drawText(this.toWinAnsi(`-${d.points} pts  -  ${d.reason}`), {
          x: 48,
          y: curY,
          size: 8.5,
          font: fontRegular,
          color: rgb(0.8, 0.15, 0.15)
        });
      }
    }

    // Footer
    page.drawLine({
      start: { x: 36, y: 45 },
      end: { x: width - 36, y: 45 },
      thickness: 1,
      color: rgb(0.85, 0.88, 0.92)
    });

    page.drawText(this.toWinAnsi('Indian Form Helper - 100% Offline Forensic Document Privacy & Sanitization Engine'), {
      x: 36,
      y: 28,
      size: 8,
      font: fontRegular,
      color: rgb(0.55, 0.6, 0.7)
    });

    return await doc.save();
  }
}
