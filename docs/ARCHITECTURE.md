# Indian Form Helper — Production Architecture Reference

## 1. System Overview
Indian Form Helper is an offline-first, client-side document processing suite built with **Angular (v22)** and **Ionic Framework (v9)** for Web, Android, and iOS (via Capacitor). The product enables candidates and professionals to compress, resize, edit, convert, organize, fill, sign, and protect documents for Indian government exams (UPSC, SSC, IBPS, State PSCs), job portals, and official filings without relying on cloud servers.

---

## 2. Feature Structure & Tool Discovery
Tools are categorized into 10 cohesive functional groups:

| Category | Primary Route | Tools Included | Offline Engine |
|---|---|---|---|
| **PHOTO** | `/features/photo` | Photo compress, exact KB, pixel resize, auto-crop, passport presets | Canvas 2D / `browser-image-compression` |
| **SIGNATURE** | `/features/signature` | Signature cleanup, thresholding, background transparency, exact KB | Canvas 2D / Pixel Manipulation |
| **PDF** | `/features/pdf` | PDF dashboard, exact KB compression, images to PDF, extract pages | `pdf-lib` + `pdfjs-dist` |
| **CONVERT** | `/features/pdf/conversion` | PDF to Word, Excel, PPT, PNG, PDF/A, TXT/OCR & Office to PDF | `docx`, `xlsx`, `pptxgenjs`, `mammoth` |
| **ORGANIZE** | `/features/pdf/organize` | Merge, Split, Rotate, Delete pages, Extract pages, Visual grid | `pdf-lib` |
| **EDIT** | `/features/pdf/editor` | PDF Reader, Annotations, Crop, Watermark, Page numbers, Redaction | `pdf-lib` + `pdfjs-dist` Canvas |
| **SIGN** | `/features/pdf/sign` | Sign PDF (draw, upload, reuse, position, rotate) & Signature Requests | `pdf-lib` + Canvas Drawing Pad |
| **PROTECT** | `/features/pdf/security` | Password protect, permission bitmasks, unlock, flatten | ISO 32000-1 Algorithm 2/3/4 + `pdf-lib` |
| **BATCH** | `/features/batch` | Batch photos & Batch PDFs | Web Workers + Sequential Processing |
| **PRESETS** | `/features/presets` | Pre-configured exam & job portals (SSC, UPSC, IBPS, State) | Local JSON Preset Store |

---

## 3. PDF Processing & Conversion Architecture

### 3.1 PDF Manipulation Pipeline (`pdf-lib`)
- **Document Loading & Saving**: Uses `PDFDocument.load(buffer, { ignoreEncryption: true })` for non-destructive vector manipulation.
- **Page Management**: Utilizes `pdfDoc.copyPages()` to preserve original vector content, fonts, and annotations during merge, split, and page rearrangement.
- **Form Filling & Flattening**: `pdfDoc.getForm()` exposes interactive AcroForm widgets. `form.flatten({ updateFieldAppearances: true })` permanently renders widget appearances into the page content stream and removes interactive form dictionaries.

### 3.2 PDF Rendering & Raster Pipeline (`pdfjs-dist`)
- **Rendering Engine**: Renders PDF pages to HTML5 Canvas at scalable viewports (1.0x to 3.0x for 300 DPI print quality).
- **Text & Structure Extraction**: Reads text layers and glyph bounding boxes for search, text selection, and OCR fallback.
- **True Redaction**: Rasterizes pages containing sensitive redactions at 300 DPI, destroying all underlying vector text and glyph streams to prevent binary extraction.

### 3.3 Office Document Conversion
- **PDF to DOCX**: Extracts text spans, font metadata, and line breaks using `pdfjs-dist` and writes native OpenXML `.docx` files via `docx`.
- **PDF to XLSX**: Identifies table grids, rows, and coordinate-aligned text cells, exporting to `.xlsx` via `xlsx`.
- **PDF to PPTX**: Renders slide pages or vector layouts into presentation slides using `pptxgenjs`.
- **Office to PDF**: Parses `.docx` (via `mammoth`) and `.xlsx` (via `xlsx`), rendering clean multipage PDFs using `pdf-lib`.

---

## 4. Security & Offline Architecture

### 4.1 Zero-Knowledge Privacy Guarantee
1. **Zero Document Uploads**: All image compression, PDF editing, and conversions execute in the client's browser/device JavaScript runtime.
2. **Ephemeral Memory Management**:
   - Decrypted document buffers are kept in volatile memory only for the duration of the active session.
   - Object URLs generated for previews are revoked immediately upon component destruction (`URL.revokeObjectURL`).
   - HTML5 Canvas elements have their dimensions set to 0 on teardown to release GPU/RAM allocations.
3. **No Password Persistence**: Passwords entered during Unlock or Protect workflows are never stored in `Preferences`, `localStorage`, analytics payloads, or `HistoryItem` records.

### 4.2 Standard PDF Encryption (`PdfSecurityService`)
- Implements ISO 32000-1 / Adobe PDF Standard Encryption (128-bit, V=2, R=3).
- Derives 128-bit document keys using standard 32-byte padding, MD5 iterations, Owner Key (O), User Key (U), and Permissions integer (P).
- Enforces granular permission bitmasks:
  - Bit 3 & 12: Printing (none, low-resolution, high-resolution)
  - Bit 4: Modifying contents
  - Bit 5: Copying/extracting text and graphics
  - Bit 6: Annotating and filling forms
  - Bit 9: Form field entry
  - Bit 10: Content accessibility extraction
  - Bit 11: Document assembly

---

## 5. Premium & Monetization Architecture

### 5.1 RevenueCat Integration (`MonetizationService`)
- Centralized entitlement verification via `@revenuecat/purchases-capacitor`.
- Single source of truth: `isPremium$` (RxJS `BehaviorSubject<boolean>`) and `isUserPremium` getter.
- Entitlement identifier: `'premium'`.

### 5.2 AdMob Lifecycle (`AdService`)
- Free users: Non-intrusive banner ads displayed on non-sensitive dashboard screens.
- Premium users: Banner ads and interstitials are completely suppressed when `isUserPremium === true`.
- Sensitive Workflows: Ads are suppressed during active editing, signing, and security sessions to prevent distraction.

---

## 6. History Architecture (`HistoryService`)
- Persistent history storage via `@capacitor/preferences` under key `IFH_HISTORY_V2`.
- Records:
  - `id`: Unique timestamped identifier
  - `operation`: `'photo'`, `'signature'`, `'pdf'`, `'batch'`, `'pdf_form'`, `'pdf_sign'`, `'pdf_unlock'`, `'pdf_protect'`, `'pdf_flatten'`, `'conversion'`
  - `originalFileName`, `outputFileName`
  - `originalSizeBytes`, `outputSizeBytes`
  - `date`: Epoch timestamp
  - `outputPath`: Local device URI (or `'web-download'`)
- FIFO queue capped at 100 entries to prevent storage bloat.

---

## 7. Supported & Unsupported Formats

### Supported Input & Output Formats
- **PDF**: PDF 1.3 through 1.7, PDF/A-1b.
- **Images**: JPEG, PNG, WebP.
- **Office**: DOCX (Word), XLSX (Excel), PPTX (PowerPoint).
- **Text/Data**: TXT, CSV, HTML.

### Unsupported Formats & Known Limitations
- **DRM Encrypted PDFs**: PDFs protected with proprietary Adobe LiveCycle DRM or third-party enterprise DRM cannot be decrypted without external server certificates.
- **Legacy PDF Portfolio Packages**: Embedded multi-file ZIP portfolios are not supported; individual PDFs must be processed.
- **Large Document Memory Bounds**: Files exceeding 150MB or 500+ pages may trigger browser memory limits on lower-end mobile devices (mitigated by page-by-page rendering and downsampled previews).

---

## 8. Accessibility Compliance
- Complies with WCAG 2.1 Level AA guidelines:
  - Minimum touch targets of 44x44px across all buttons and controls.
  - Visible focus indicators (`:focus-visible`) for full keyboard navigation.
  - Descriptive `aria-label` attributes on all icon-only buttons.
  - High-contrast typography and semantic color tokens.
