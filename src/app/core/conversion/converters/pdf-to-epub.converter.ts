import { Injectable, inject } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import { IConverter } from '../converter.interface';
import { ConverterMetadata, ConversionProgress, ConversionResult } from '../conversion.types';
import { PdfExtractorService } from '../../services/pdf-extractor.service';
import { PdfToEpubOptions } from '../../models/conversion-features.types';

interface ChapterData {
  id: string;
  filename: string;
  title: string;
  pageNumbers: number[];
  xhtmlContent: string;
}

@Injectable({
  providedIn: 'root'
})
export class PdfToEpubConverter implements IConverter {
  readonly id = 'pdf-to-epub';
  readonly metadata: ConverterMetadata = {
    id: 'pdf-to-epub',
    name: 'PDF to EPUB Converter',
    shortTitle: 'PDF to EPUB',
    description: 'Convert PDF documents into standard EPUB 3 e-books with chapter outline navigation and inline images.',
    sourceFormats: ['.pdf'],
    targetFormat: 'epub',
    category: 'pdf-to-format',
    icon: 'book',
    badge: 'EPUB 3',
    acceptMimeTypes: 'application/pdf',
    limitations: [
      'Generates fully conforming EPUB 3 archives compatible with Apple Books, Kindle, Kobo, and e-readers.',
      'Uses PDF bookmarks/outlines for chapter boundaries when available, or groups pages seamlessly.'
    ]
  };

  private extractor = inject(PdfExtractorService);

  async validate(file: File): Promise<{ valid: boolean; error?: string }> {
    if (!file || file.size === 0) {
      return { valid: false, error: 'File is empty or invalid.' };
    }
    const name = file.name.toLowerCase();
    if (file.type && file.type !== 'application/pdf' && !name.endsWith('.pdf')) {
      return { valid: false, error: 'Selected file is not a PDF document.' };
    }
    return { valid: true };
  }

  async convert(
    file: File,
    options: PdfToEpubOptions = {},
    onProgress?: (p: ConversionProgress) => void
  ): Promise<ConversionResult> {
    try {
      onProgress?.({
        percent: 15,
        stage: 'Analyzing document structure...',
        message: 'Reading PDF bookmarks and text flow...'
      });

      const arrayBuffer = await file.arrayBuffer();

      // Extract tables and images
      const extractedContent = await this.extractor.extractContent(
        arrayBuffer,
        {
          extractText: true,
          extractTables: true,
          extractImages: true,
          extractAttachments: false
        },
        (pct, msg) => {
          onProgress?.({
            percent: Math.round(15 + (pct / 100) * 35),
            stage: msg
          });
        }
      );

      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(arrayBuffer.slice(0))
      } as any);
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;

      onProgress?.({
        percent: 55,
        stage: 'Extracting chapters and outline...',
        message: 'Parsing bookmarks and page hierarchies...'
      });

      // Try reading outline / bookmarks
      let outline: any[] = [];
      try {
        outline = (await pdf.getOutline()) || [];
      } catch {
        outline = [];
      }

      // Build chapters
      const chapters = await this.buildChapters(pdf, outline, numPages, extractedContent);

      onProgress?.({
        percent: 75,
        stage: 'Generating EPUB 3 package...',
        message: 'Packaging container, OPF manifest, and navigation...'
      });

      // Build EPUB 3 zip archive
      const zip = new JSZip();

      // 1. mimetype: MUST BE FIRST and MUST BE UNCOMPRESSED (compression: 'STORE')
      zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

      // 2. META-INF/container.xml
      const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
      zip.file('META-INF/container.xml', containerXml);

      // 3. OEBPS/style.css
      const css = `body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.6;
  padding: 1rem;
  margin: 0;
  color: #1a1a1a;
}
h1, h2, h3, h4 { margin: 1.2em 0 0.5em; line-height: 1.3; }
p { margin-bottom: 1em; text-align: justify; }
table { width: 100%; border-collapse: collapse; margin: 1em 0; }
th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
th { background-color: #f5f5f5; }
img { max-width: 100%; height: auto; display: block; margin: 1em auto; }
.chapter-title { border-bottom: 1px solid #ccc; padding-bottom: 6px; }`;
      zip.file('OEBPS/style.css', css);

      // 4. Save images and track for manifest
      const imageManifestItems: Array<{ id: string; href: string; mediaType: string }> = [];
      for (let i = 0; i < extractedContent.images.length; i++) {
        const img = extractedContent.images[i];
        const filename = `images/img_${i + 1}.png`;
        zip.file(`OEBPS/${filename}`, img.blob);
        imageManifestItems.push({
          id: `img_${i + 1}`,
          href: filename,
          mediaType: 'image/png'
        });
      }

      // 5. Add chapter XHTML files
      for (const chap of chapters) {
        zip.file(`OEBPS/${chap.filename}`, chap.xhtmlContent);
      }

      // 6. Navigation Document: OEBPS/nav.xhtml
      const baseName = file.name.replace(/\.[^/.]+$/, '') || 'eBook';
      const navXhtml = this.buildNavDocument(baseName, chapters);
      zip.file('OEBPS/nav.xhtml', navXhtml);

      // 7. Package manifest: OEBPS/content.opf
      const opfXml = this.buildOpf(baseName, chapters, imageManifestItems);
      zip.file('OEBPS/content.opf', opfXml);

      onProgress?.({
        percent: 92,
        stage: 'Finalizing EPUB file...',
        message: 'Writing archive streams...'
      });

      const epubBlob = await zip.generateAsync({
        type: 'blob',
        mimeType: 'application/epub+zip'
      });
      const epubFile = new File([epubBlob], `${baseName}.epub`, {
        type: 'application/epub+zip'
      });
      const previewUrl = URL.createObjectURL(epubFile);

      return {
        success: true,
        file: epubFile,
        previewUrl,
        downloadName: epubFile.name,
        previewData: {
          chapterCount: chapters.length,
          pageCount: numPages,
          imageCount: imageManifestItems.length,
          fileSize: epubFile.size
        },
        metadata: {
          name: epubFile.name,
          type: 'application/epub+zip',
          sizeBytes: epubFile.size,
          lastModified: Date.now(),
          extension: 'epub'
        }
      };
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to convert PDF to EPUB: ${e?.message || e.toString()}`
      };
    }
  }

  private async buildChapters(
    pdf: any,
    outline: any[],
    totalPages: number,
    extracted: any
  ): Promise<ChapterData[]> {
    // Determine page groupings for chapters
    const chapterGroups: Array<{ title: string; startPage: number; endPage: number }> = [];

    if (outline && outline.length > 0) {
      // Map outline to pages
      for (let i = 0; i < outline.length; i++) {
        const item = outline[i];
        let pageIdx = 1;
        if (typeof item.dest === 'string') {
          try {
            const dest = await pdf.getDestination(item.dest);
            if (dest && dest[0]) {
              pageIdx = (await pdf.getPageIndex(dest[0])) + 1;
            }
          } catch {
            pageIdx = i + 1;
          }
        }
        chapterGroups.push({
          title: item.title || `Chapter ${i + 1}`,
          startPage: pageIdx,
          endPage: totalPages
        });
      }

      // Fix end pages
      for (let i = 0; i < chapterGroups.length - 1; i++) {
        chapterGroups[i].endPage = Math.max(
          chapterGroups[i].startPage,
          chapterGroups[i + 1].startPage - 1
        );
      }
    } else {
      // No outline: group every 5 pages or 1 page each if total <= 10
      const groupSize = totalPages <= 10 ? 1 : 5;
      for (let p = 1; p <= totalPages; p += groupSize) {
        const end = Math.min(p + groupSize - 1, totalPages);
        chapterGroups.push({
          title: p === end ? `Page ${p}` : `Pages ${p}–${end}`,
          startPage: p,
          endPage: end
        });
      }
    }

    // Build XHTML for each chapter
    const chapters: ChapterData[] = [];

    for (let c = 0; c < chapterGroups.length; c++) {
      const grp = chapterGroups[c];
      const chapId = `chapter_${c + 1}`;
      const filename = `${chapId}.xhtml`;
      const bodyParts: string[] = [];

      bodyParts.push(`<h2 class="chapter-title">${this.escapeXml(grp.title)}</h2>`);

      for (let p = grp.startPage; p <= grp.endPage; p++) {
        const page = await pdf.getPage(p);
        const textContent = await page.getTextContent();
        const items = (textContent.items as any[]).filter(
          it => typeof it.str === 'string' && it.str.trim().length > 0 && it.transform
        );

        // Sort items top-to-bottom
        items.sort((a, b) => {
          const yDiff = b.transform[5] - a.transform[5];
          if (Math.abs(yDiff) > 4) return yDiff;
          return a.transform[4] - b.transform[4];
        });

        // Group into lines
        const lines: string[] = [];
        let curr = '';
        let lastY = items[0]?.transform[5];

        for (const it of items) {
          if (lastY === undefined || Math.abs(it.transform[5] - lastY) <= 4) {
            curr += (curr ? ' ' : '') + it.str;
          } else {
            if (curr.trim()) lines.push(curr.trim());
            curr = it.str;
          }
          lastY = it.transform[5];
        }
        if (curr.trim()) lines.push(curr.trim());

        for (const line of lines) {
          bodyParts.push(`<p>${this.escapeXml(line)}</p>`);
        }

        // Tables for page
        const tables = extracted.tables.filter((t: any) => t.pageNumber === p);
        for (const tbl of tables) {
          bodyParts.push(this.renderTableXhtml(tbl.headers, tbl.rows));
        }

        // Images for page
        const images = extracted.images.filter((img: any) => img.pageNumber === p);
        for (const img of images) {
          const imgIdx = extracted.images.indexOf(img) + 1;
          bodyParts.push(
            `<p><img src="images/img_${imgIdx}.png" alt="Document Graphic"/></p>`
          );
        }
      }

      const xhtmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <meta charset="utf-8"/>
  <title>${this.escapeXml(grp.title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  ${bodyParts.join('\n  ')}
</body>
</html>`;

      chapters.push({
        id: chapId,
        filename,
        title: grp.title,
        pageNumbers: Array.from(
          { length: grp.endPage - grp.startPage + 1 },
          (_, idx) => grp.startPage + idx
        ),
        xhtmlContent
      });
    }

    return chapters;
  }

  private renderTableXhtml(headers: string[], rows: string[][]): string {
    let out = '<table>';
    if (headers.length > 0) {
      out += '<thead><tr>';
      for (const h of headers) out += `<th>${this.escapeXml(h)}</th>`;
      out += '</tr></thead>';
    }
    out += '<tbody>';
    for (const r of rows) {
      out += '<tr>';
      for (const c of r) out += `<td>${this.escapeXml(c)}</td>`;
      out += '</tr>';
    }
    out += '</tbody></table>';
    return out;
  }

  private buildNavDocument(bookTitle: string, chapters: ChapterData[]): string {
    const listItems = chapters
      .map(c => `      <li><a href="${c.filename}">${this.escapeXml(c.title)}</a></li>`)
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <meta charset="utf-8"/>
  <title>Table of Contents</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>${this.escapeXml(bookTitle)}</h1>
    <ol>
${listItems}
    </ol>
  </nav>
</body>
</html>`;
  }

  private buildOpf(
    title: string,
    chapters: ChapterData[],
    images: Array<{ id: string; href: string; mediaType: string }>
  ): string {
    const now = new Date().toISOString().replace(/\.[0-9]+Z$/, 'Z');
    const manifestItems = [
      `    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
      `    <item id="style" href="style.css" media-type="text/css"/>`,
      ...chapters.map(
        c => `    <item id="${c.id}" href="${c.filename}" media-type="application/xhtml+xml"/>`
      ),
      ...images.map(
        img => `    <item id="${img.id}" href="${img.href}" media-type="${img.mediaType}"/>`
      )
    ].join('\n');

    const spineRefs = chapters
      .map(c => `    <itemref idref="${c.id}"/>`)
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:pdf-to-epub-${Date.now()}</dc:identifier>
    <dc:title>${this.escapeXml(title)}</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${now}</meta>
  </metadata>
  <manifest>
${manifestItems}
  </manifest>
  <spine>
${spineRefs}
  </spine>
</package>`;
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
