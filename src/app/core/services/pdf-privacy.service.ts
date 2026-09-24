import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFStream } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import {
  PrivacyScanReport,
  PrivacyScanItem,
  SanitizationOptions,
  SanitizationResult
} from '../models/pdf-analysis.types';
import '../utilities/pdfjs-worker';

@Injectable({
  providedIn: 'root'
})
export class PdfPrivacyService {
  /**
   * Performs an in-depth privacy scan of a PDF document to inspect all removable items:
   * metadata, annotations/comments, embedded attachments, form data, scripts, and hidden layers.
   */
  async scanPdf(source: File | ArrayBuffer): Promise<PrivacyScanReport> {
    const arrayBuffer = source instanceof File ? await source.arrayBuffer() : source;

    const items: PrivacyScanItem[] = [];
    const metadataDetails: Record<string, string> = {};
    let attachmentCount = 0;
    let commentCount = 0;
    let formFieldCount = 0;
    let scriptCount = 0;
    let hiddenContentCount = 0;

    // 1. Scan with pdf-lib for structural objects
    let pdfLibDoc: PDFDocument | null = null;
    try {
      pdfLibDoc = await PDFDocument.load(arrayBuffer.slice(0), {
        ignoreEncryption: true,
        updateMetadata: false
      });
    } catch {
      // Document may be malformed or encrypted
    }

    if (pdfLibDoc) {
      // (a) Metadata Scan (Info dictionary & XMP stream)
      const title = pdfLibDoc.getTitle();
      const author = pdfLibDoc.getAuthor();
      const subject = pdfLibDoc.getSubject();
      const creator = pdfLibDoc.getCreator();
      const producer = pdfLibDoc.getProducer();
      const keywords = pdfLibDoc.getKeywords();
      const creationDate = pdfLibDoc.getCreationDate();
      const modDate = pdfLibDoc.getModificationDate();

      if (title && title.trim().length > 0) {
        metadataDetails['Title'] = title;
        items.push({
          id: 'meta_title',
          category: 'metadata',
          title: 'Document Title',
          detail: `Title: "${title}"`,
          severity: 'info',
          removable: true,
          selected: true
        });
      }
      if (author && author.trim().length > 0) {
        metadataDetails['Author'] = author;
        items.push({
          id: 'meta_author',
          category: 'metadata',
          title: 'Author Identifier',
          detail: `Author: "${author}"`,
          severity: 'warning',
          removable: true,
          selected: true
        });
      }
      if (creator && creator.trim().length > 0) {
        metadataDetails['Creator'] = creator;
        items.push({
          id: 'meta_creator',
          category: 'metadata',
          title: 'Creating Application',
          detail: `Creator: "${creator}"`,
          severity: 'info',
          removable: true,
          selected: true
        });
      }
      if (producer && producer.trim().length > 0) {
        metadataDetails['Producer'] = producer;
        items.push({
          id: 'meta_producer',
          category: 'metadata',
          title: 'PDF Producer Software',
          detail: `Producer: "${producer}"`,
          severity: 'info',
          removable: true,
          selected: true
        });
      }
      if (subject && subject.trim().length > 0) {
        metadataDetails['Subject'] = subject;
        items.push({
          id: 'meta_subject',
          category: 'metadata',
          title: 'Document Subject',
          detail: `Subject: "${subject}"`,
          severity: 'info',
          removable: true,
          selected: true
        });
      }
      if (keywords) {
        const kwStr = Array.isArray(keywords) ? keywords.join(', ') : String(keywords);
        if (kwStr.trim().length > 0) {
          metadataDetails['Keywords'] = kwStr;
          items.push({
            id: 'meta_keywords',
            category: 'metadata',
            title: 'Document Keywords',
            detail: `Keywords: "${kwStr}"`,
            severity: 'info',
            removable: true,
            selected: true
          });
        }
      }
      if (creationDate && creationDate.getTime() > 0) {
        metadataDetails['CreationDate'] = creationDate.toISOString();
        items.push({
          id: 'meta_creation_date',
          category: 'metadata',
          title: 'Creation Timestamp',
          detail: `Created: ${creationDate.toLocaleString()}`,
          severity: 'info',
          removable: true,
          selected: true
        });
      }
      if (modDate && modDate.getTime() > 0) {
        metadataDetails['ModDate'] = modDate.toISOString();
        items.push({
          id: 'meta_mod_date',
          category: 'metadata',
          title: 'Modification Timestamp',
          detail: `Modified: ${modDate.toLocaleString()}`,
          severity: 'info',
          removable: true,
          selected: true
        });
      }

      // Check XMP metadata stream in Catalog
      const catalog = pdfLibDoc.catalog;
      if (catalog.has(PDFName.of('Metadata'))) {
        items.push({
          id: 'meta_xmp',
          category: 'metadata',
          title: 'Embedded XMP XML Metadata',
          detail: 'Contains extended XML metadata schemas and system identifiers',
          severity: 'warning',
          removable: true,
          selected: true
        });
      }

      // (b) Annotations & Comments Scan
      const pages = pdfLibDoc.getPages();
      pages.forEach((page, idx) => {
        const pageNode = page.node;
        if (pageNode.has(PDFName.of('Annots'))) {
          const annots = pageNode.lookup(PDFName.of('Annots'));
          if (annots instanceof PDFArray) {
            const count = annots.size();
            if (count > 0) {
              commentCount += count;
              items.push({
                id: `annot_p${idx + 1}`,
                category: 'comments',
                title: `Annotations on Page ${idx + 1}`,
                detail: `${count} annotation(s) / comment(s) found`,
                page: idx + 1,
                severity: 'warning',
                removable: true,
                selected: true
              });
            }
          }
        }
      });

      // (c) Form Data Scan
      if (catalog.has(PDFName.of('AcroForm'))) {
        try {
          const form = pdfLibDoc.getForm();
          const fields = form.getFields();
          formFieldCount = fields.length;
          if (formFieldCount > 0) {
            items.push({
              id: 'forms_acroform',
              category: 'forms',
              title: 'Interactive Form Fields',
              detail: `${formFieldCount} form field(s) with entered user values`,
              severity: 'warning',
              removable: true,
              selected: true
            });
          }
        } catch {
          // If form parsing fails, still report presence of AcroForm
          formFieldCount = 1;
          items.push({
            id: 'forms_acroform',
            category: 'forms',
            title: 'Interactive Form Dictionary',
            detail: 'Document contains AcroForm structures',
            severity: 'warning',
            removable: true,
            selected: true
          });
        }
      }

      // (d) Embedded Attachments Scan (/Names -> /EmbeddedFiles or /AF)
      if (catalog.has(PDFName.of('Names'))) {
        const names = catalog.lookup(PDFName.of('Names'));
        if (names instanceof PDFDict && names.has(PDFName.of('EmbeddedFiles'))) {
          attachmentCount++;
          items.push({
            id: 'attach_embedded_files',
            category: 'attachments',
            title: 'Embedded File Attachments',
            detail: 'Document contains embedded files in Name tree',
            severity: 'alert',
            removable: true,
            selected: true
          });
        }
      }
      if (catalog.has(PDFName.of('AF'))) {
        items.push({
          id: 'attach_af',
          category: 'attachments',
          title: 'Associated Files (AF)',
          detail: 'Document contains PDF/A-3 Associated Files',
          severity: 'alert',
          removable: true,
          selected: true
        });
        attachmentCount++;
      }

      // (e) JavaScript & Actions Scan
      if (catalog.has(PDFName.of('OpenAction'))) {
        scriptCount++;
        items.push({
          id: 'script_openaction',
          category: 'scripts',
          title: 'Document OpenAction Script',
          detail: 'Script or automatic trigger executes when document opens',
          severity: 'alert',
          removable: true,
          selected: true
        });
      }
      if (catalog.has(PDFName.of('AA'))) {
        scriptCount++;
        items.push({
          id: 'script_aa',
          category: 'scripts',
          title: 'Document Additional Actions (AA)',
          detail: 'Document contains automatic trigger actions',
          severity: 'alert',
          removable: true,
          selected: true
        });
      }
      if (catalog.has(PDFName.of('Names'))) {
        const names = catalog.lookup(PDFName.of('Names'));
        if (names instanceof PDFDict && names.has(PDFName.of('JavaScript'))) {
          scriptCount++;
          items.push({
            id: 'script_names_js',
            category: 'scripts',
            title: 'Embedded JavaScript in Names Tree',
            detail: 'Executable JavaScript functions embedded in document',
            severity: 'alert',
            removable: true,
            selected: true
          });
        }
      }

      // (f) Hidden Content / Layers Scan (/OCProperties)
      if (catalog.has(PDFName.of('OCProperties'))) {
        hiddenContentCount++;
        items.push({
          id: 'hidden_ocproperties',
          category: 'hiddenContent',
          title: 'Optional Content Groups (Layers)',
          detail: 'Document contains layer definitions with potential hidden visibility',
          severity: 'warning',
          removable: true,
          selected: true
        });
      }
    }

    return {
      totalFound: items.length,
      items,
      hasMetadata: Object.keys(metadataDetails).length > 0 || items.some(i => i.category === 'metadata'),
      hasComments: commentCount > 0,
      hasAttachments: attachmentCount > 0,
      hasForms: formFieldCount > 0,
      hasScripts: scriptCount > 0,
      hasHiddenContent: hiddenContentCount > 0,
      metadataDetails,
      attachmentCount,
      commentCount,
      formFieldCount,
      scriptCount
    };
  }

  /**
   * Sanitizes a PDF document according to selected options.
   * Modifies document structure directly using pdf-lib to ensure real, verified removal.
   */
  async sanitizePdf(
    source: File | ArrayBuffer,
    options: SanitizationOptions,
    outputFileName = 'sanitized_document.pdf'
  ): Promise<SanitizationResult> {
    const arrayBuffer = source instanceof File ? await source.arrayBuffer() : source;

    // Scan before
    const beforeReport = await this.scanPdf(arrayBuffer);

    // Load document in pdf-lib
    const pdfDoc = await PDFDocument.load(arrayBuffer.slice(0), {
      ignoreEncryption: true,
      updateMetadata: false
    });

    const catalog = pdfDoc.catalog;

    // 1. Remove Metadata
    if (options.removeMetadata) {
      pdfDoc.setTitle('');
      pdfDoc.setAuthor('');
      pdfDoc.setSubject('');
      pdfDoc.setCreator('');
      pdfDoc.setProducer('');
      pdfDoc.setKeywords([]);

      // Reset creation & mod date
      const epoch = new Date(0);
      pdfDoc.setCreationDate(epoch);
      pdfDoc.setModificationDate(epoch);

      // Remove /Metadata stream from Catalog
      if (catalog.has(PDFName.of('Metadata'))) {
        catalog.delete(PDFName.of('Metadata'));
      }

      // Delete Info dictionary entries directly
      try {
        const infoDict = (pdfDoc as any).getInfoDict?.();
        if (infoDict instanceof PDFDict) {
          infoDict.delete(PDFName.of('Title'));
          infoDict.delete(PDFName.of('Author'));
          infoDict.delete(PDFName.of('Subject'));
          infoDict.delete(PDFName.of('Keywords'));
          infoDict.delete(PDFName.of('Creator'));
          infoDict.delete(PDFName.of('Producer'));
          infoDict.delete(PDFName.of('CreationDate'));
          infoDict.delete(PDFName.of('ModDate'));
        }
      } catch {}
    }

    // 2. Remove Comments & Annotations
    if (options.removeComments) {
      const pages = pdfDoc.getPages();
      for (const page of pages) {
        const pageNode = page.node;
        if (pageNode.has(PDFName.of('Annots'))) {
          pageNode.delete(PDFName.of('Annots'));
        }
      }
    }

    // 3. Remove Embedded Attachments
    if (options.removeAttachments) {
      if (catalog.has(PDFName.of('Names'))) {
        const names = catalog.lookup(PDFName.of('Names'));
        if (names instanceof PDFDict) {
          names.delete(PDFName.of('EmbeddedFiles'));
        }
      }
      if (catalog.has(PDFName.of('AF'))) {
        catalog.delete(PDFName.of('AF'));
      }
    }

    // 4. Remove Form Data
    if (options.removeForms) {
      if (catalog.has(PDFName.of('AcroForm'))) {
        catalog.delete(PDFName.of('AcroForm'));
      }
    }

    // 5. Remove Scripts & Actions
    if (options.removeScripts) {
      if (catalog.has(PDFName.of('OpenAction'))) {
        catalog.delete(PDFName.of('OpenAction'));
      }
      if (catalog.has(PDFName.of('AA'))) {
        catalog.delete(PDFName.of('AA'));
      }
      if (catalog.has(PDFName.of('Names'))) {
        const names = catalog.lookup(PDFName.of('Names'));
        if (names instanceof PDFDict) {
          names.delete(PDFName.of('JavaScript'));
        }
      }
    }

    // 6. Remove Hidden Content / Layers
    if (options.removeHiddenContent) {
      if (catalog.has(PDFName.of('OCProperties'))) {
        catalog.delete(PDFName.of('OCProperties'));
      }
    }

    // Save clean PDF
    const sanitizedBytes = await pdfDoc.save({ useObjectStreams: false });
    const sanitizedBlob = new Blob([sanitizedBytes as any], { type: 'application/pdf' });
    const sanitizedFile = new File([sanitizedBlob], outputFileName, { type: 'application/pdf' });

    // Re-scan sanitized buffer to generate authentic After report
    const afterReport = await this.scanPdf(await sanitizedBlob.arrayBuffer());
    const itemsRemovedCount = Math.max(0, beforeReport.totalFound - afterReport.totalFound);

    return {
      sanitizedFile,
      sanitizedBlob,
      sizeBytes: sanitizedFile.size,
      itemsRemovedCount,
      beforeReport,
      afterReport
    };
  }
}
