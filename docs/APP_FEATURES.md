# All-in-One PDF, Document & Image Suite — Features & Capabilities

**Application Type:** Cross-Platform Client-Side Document & Media Toolkit  
**Architecture:** Ionic 9 + Angular 22 (Standalone) + Capacitor 8  
**Core Processing Paradigm:** 100% On-Device, Client-Side Offline Processing (Zero Cloud Uploads)  
**Supported Media Types:** PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), Images (JPEG, PNG, WebP), Plain Text (.txt), Barcodes & QR Codes  

---

## 1. System Overview & Architecture Highlights

The application is an offline-first, client-side document and media processing workstation. It provides complete utility suites for manipulating, editing, converting, securing, and analyzing documents and images without sending any data over the internet.

### Key Architectural Strengths:
- **100% Client-Side Privacy:** All operations (compression, conversion, OCR, signing, encryption, editing) execute locally in memory using WebAssembly, HTML5 Canvas, and client-side JavaScript engines.
- **Offline First:** The full suite functions without active network connectivity.
- **Zero Mandatory Registration:** Every core tool is available to guest users without creating an account or signing in.
- **High-Performance Vector & Pixel Engines:** Powered by `pdf-lib`, `pdfjs-dist`, `tesseract.js`, `zxing`, `mammoth`, `xlsx`, `docx`, and `pptxgenjs`.

---

## 2. Quick Feature Directory

```
├── 1. PDF TOOLS (Management, Organizing & Integrity)
│   ├── PDF Studio (All-in-One Hub)
│   ├── Compress PDF (Target KB/MB & Presets)
│   ├── Merge PDF
│   ├── Split PDF (Ranges, Fixed Intervals, Burst)
│   ├── Extract Pages
│   ├── Organize Pages (Reorder, Rotate, Delete, Duplicate)
│   ├── Flatten PDF
│   ├── PDF Compare (Visual & Textual Diff)
│   └── PDF Repair & Recovery
│
├── 2. IMAGE TOOLS (Optimization, Scanning & Graphics)
│   ├── Photo & Image Resizer / Compressor (Exact KB, Px/Cm/Mm, EXIF Stripper)
│   ├── Signature & Ink Processor (Background Whitening, Contrast, Auto-Crop)
│   ├── Images to PDF Converter
│   ├── Document Scanner (Corner Detection, Perspective Warp, B&W Filters)
│   └── Batch Image Processor (Bulk Compress, Resize, Format & Rename)
│
├── 3. DOCUMENT CONVERSION TOOLS (Office & Formats)
│   ├── Word to PDF & PDF to Word (.docx)
│   ├── Excel to PDF & PDF to Excel / CSV (.xlsx)
│   ├── PowerPoint to PDF & PDF to PowerPoint (.pptx)
│   ├── PDF to Images & Images to PDF
│   ├── Text to PDF (.txt)
│   └── Batch PDF Converter / Compressor
│
├── 4. PDF EDITING, ANNOTATION & DIGITAL SIGNATURES
│   ├── PDF Reader & High-Fidelity Viewer
│   ├── PDF Editor & Annotator (Text, Shapes, Pen, Stamps, Highlights)
│   ├── Digital Signature Pad & Sign PDF (Draw, Image Import, Burn-In)
│   ├── Signature Request & Field Placeholders
│   ├── AcroForms Form Filler & Flattening
│   └── Header, Footer & Dynamic Page Numbering Studio
│
├── 5. SECURITY, PRIVACY & METADATA SANITIZATION
│   ├── PDF Password Protection & Encryption (User/Owner, ISO 32000-1)
│   ├── Granular Permissions Control (Print, Copy, Modify, Annotate)
│   ├── PDF Unlock & Decryption
│   ├── Privacy Sanitizer (Metadata Scrubbing, XMP, Comments, Scripts)
│   ├── PDF Metadata Editor (Dual Info Dict & XMP Stream Synchronizer)
│   ├── Verified Redaction Audit (Forensic Dual-Pass Purge & 300 DPI Raster Fallback)
│   ├── Hidden-Content Audit (Report-Only Forensic Concealment & Pre-Share Scanner)
│   ├── App Lock & Panic Clear (Biometric/PIN Security & Emergency Zero-Remnant Wipe)
│   └── Per-Document Privacy Report Card (Layman Grade A-F, Disclosure Breakdown & 1-Tap Sanitize)
│
└── 6. ADVANCED UTILITIES, OCR, EXTRACTION & AI
    ├── Smart OCR Engine (Searchable PDF, Multi-Lingual Text Extraction)
    ├── PDF Content Extractor (Extract Images ZIP, Plain Text, Tables)
    ├── QR Code & Barcode Toolkit (Scan & Generate 1D/2D Codes)
    ├── PDF Intelligence & Translation (Summarization, Q&A Citations, 5 Languages)
    ├── Standard Dimension & File Size Profiles
    └── File Specification & Compliance Validator (1-Click Auto-Fix)
```

---

## 3. Detailed Feature Breakdown

> **Shipped capabilities only.** Researched additions across all six sections — with
> competitor sourcing, client-side feasibility notes and ready-to-use build prompts —
> live in [PDF_MANAGEMENT_UPGRADE.md](PDF_MANAGEMENT_UPGRADE.md) (Section I) and
> [SUITE_UPGRADE_SECTIONS_2-6.md](SUITE_UPGRADE_SECTIONS_2-6.md) (Sections II–VI).
> Nothing from those documents belongs here, or in Play Store listing text, until it ships.
>
> Note on offline delivery: The converter count is 15 (Section III). OCR implements Option (c)
> Hybrid Bundled + On-Demand Local Cache: English (`eng.traineddata.gz`, ~4MB) is bundled directly
> in app assets, guaranteeing 100% offline OCR immediately upon install with zero network. Extended
> Indic languages (Hindi, Marathi, Bengali, Punjabi, Tamil) are downloaded once on-demand via the
> in-app OCR Language Manager and permanently cached on-device for 100% offline use.

---

### Section I: PDF Management, Organizing & Integrity

#### 1. PDF Studio (All-in-One Dashboard)
- **Central Navigation & Inspection Hub:** Instant overview of loaded PDF documents including page count, document dimensions, file size, encryption state, and embedded metadata.
- **Fast-Action Launchpad:** 1-tap handoff to compress, edit, convert, merge, split, organize, secure, or sign the loaded document.

#### 2. PDF Compression
- **Adaptive Compression Engine:** Balances visual image quality downsampling with crisp vector text preservation.
- **Three Preset Compression Levels:**
  - *Maximum Compression:* Aggressive downsampling for strict upload limits.
  - *Recommended:* Balanced file reduction with sharp readability.
  - *Lossless / Minimal:* Optimizes internal font streams and structure without visual degradation.
- **Target File Size (KB / MB):** Specify an exact target size (e.g. 500 KB or 2 MB); the engine iteratively tunes image quality parameters to reach the requested threshold.

#### 3. Merge PDF
- **Non-Destructive Vector Merging:** Combines multiple separate PDF documents into a single consolidated file using `pdf-lib`.
- **Drag-and-Drop Reordering:** Easily reorder source files before merging.
- **Structure Preservation:** Retains original vector graphics, outlines, and embedded fonts.

#### 4. Split PDF
- **Split by Custom Page Ranges:** Separate distinct sections into new documents (e.g., Pages 1–4 $\rightarrow$ Part A; Pages 5–10 $\rightarrow$ Part B).
- **Split by Fixed Intervals:** Divide large manuals or reports into uniform chunks of $N$ pages each.
- **Burst to Individual Pages:** Extracts every page into an individual standalone single-page PDF.

#### 5. Extract Pages
- **Interactive Thumbnail Selection:** Visually click and pick individual pages to extract.
- **Range Syntax Support:** Enter ranges directly (e.g., `1-3, 5, 8-11`).
- **Instant Clean PDF Generation:** Outputs only the chosen pages into a new, lightweight document.

#### 6. Organize & Rearrange Pages
- **Visual Thumbnail Grid:** High-resolution preview of every page in the document.
- **Drag-and-Drop Reordering:** Reorder pages to any position in the sequence.
- **Page Rotation:** Rotate individual pages or all pages simultaneously by 90°, 180°, or 270°.
- **Page Pruning & Deletion:** Delete unwanted, duplicate, or blank pages with a single tap.
- **Page Duplication:** Duplicate selected pages within the document stream.

#### 7. Flatten PDF
- **Tamper-Proof Freezing:** Converts interactive AcroForm inputs, digital signature widgets, annotations, comments, and graphic overlays directly into permanent vector page content.
- **Submission Ready:** Ensures the document cannot be edited, altered, or misrendered in legacy PDF viewers.

#### 8. PDF Compare
- **Side-by-Side Document Comparison:** Compare two versions of a document to audit changes, contract clauses, or drafts.
- **Visual Diff Overlay:** Highlights graphical modifications and image alterations.
- **Textual Diffing:** Line-by-line comparison highlighting additions, deletions, and edits.

#### 9. PDF Repair & Corrupted File Recovery
- **Diagnostic Inspection:** Detects malformed syntax, truncated file ends, and broken byte offsets.
- **XREF Table Rebuilder:** Reconstructs broken cross-reference tables and regenerates missing object catalogs.
- **Page Salvage:** Extracts readable pages and textual streams even from damaged documents that fail to open in standard viewers.

---

### Section II: Image Processing, Optimization & Scanning

#### 10. Photo & Image Resizer / Compressor
- **Exact Target File Size:** Compress single or multiple images down to an exact KB ceiling (e.g., precisely 20 KB to 100 KB) using dynamic binary search quality tuning.
- **Dimensional Resizing:** Resize images to exact specifications using pixels (px), millimeters (mm), centimeters (cm), or inches (in).
- **Aspect Ratio Locking:** Maintain original proportions or freely set custom aspect ratios (1:1 square, 3:4, 4:3, 16:9, passport sizes).
- **Interactive Cropping:** Pan, zoom, and crop with smooth canvas touch controls.
- **Format Conversion:** Convert seamlessly between JPEG, PNG, and WebP.
- **EXIF Privacy Stripping:** Automatically removes GPS coordinates, camera make/model, aperture, and timestamp metadata.

#### 11. Signature & Ink Processor
- **Background Whitening & Shadow Removal:** Uses adaptive luminosity thresholding to turn off-white, yellow, grey, or shadowed paper backgrounds into pure white (`#FFFFFF`) or transparent PNGs.
- **Ink Contrast Enhancement:** Deepens blue and black ink strokes for sharp lines and clear visibility.
- **Auto-Bounding Crop:** Scans pixel density to detect the bounding box of ink strokes, trimming away excess paper borders.
- **Standard Dimensions & Sizing:** Rapidly formats signatures to exact dimension ratios (e.g., 2:1, 7:3) and small file size targets (10–20 KB).

#### 12. Images to PDF Converter
- **Multi-Image Compilation:** Combine dozens of images (JPG, PNG, WebP) into a clean, paginated PDF.
- **Page Sizing:** Choose between Standard A4, US Letter, or auto-fitting page dimensions to match each image.
- **Layout & Margins:** Configure Portrait, Landscape, or Auto orientation, with selectable margins (None, Narrow, Normal).
- **Reordering:** Drag-and-drop image thumbnails to arrange the exact page sequence before compilation.

#### 13. Mobile Document Scanner
- **Camera & Gallery Capture:** Capture multi-page documents directly with the device camera or import from photos.
- **Automatic Corner Detection:** Intelligent edge recognition identifies document borders against contrasting backgrounds.
- **4-Point Perspective Warp / Deskew:** Corrects perspective distortion from angled photos, flattening pages into straight rectangular scans.
- **Enhancement Color Filters:**
  - *Magic Document B&W:* Strips shadows and creases, outputting high-contrast crisp black text on pure white paper.
  - *Clean Grayscale:* High-tonal monochrome scan suitable for photo IDs and official forms.
  - *Color Enhanced:* Vibrant document scan with balanced lighting.
  - *Original Photo:* Unaltered photo capture.
- **Direct PDF Export:** Compiles scanned pages directly into a compressed, multi-page PDF document.

#### 14. Batch Image Processing Suite
- **Mass Processing:** Process hundreds of images simultaneously.
- **Batch Compression:** Enforce a uniform maximum KB size limit across all selected images.
- **Batch Dimension Resizing:** Uniformly resize by scaling percentage (e.g., 50%, 75%) or fixed max width/height boundaries.
- **Batch Format Conversion:** Bulk convert entire photo libraries between JPG, PNG, and WebP.
- **Batch Renaming Templates:** Apply customizable naming templates with prefixes, suffixes, and auto-incrementing sequential numbering (e.g., `Doc_Scan_001.jpg`, `Doc_Scan_002.jpg`).

---

### Section III: Document Conversion (Office & Standard Formats)

#### 15. Bidirectional Document Converter Hub
Convert between PDF and industry-standard office document formats on-device:

- **PDF to Word (.docx):**
  - Extracts text structures, paragraph breaks, font styles, and layout flow from PDFs.
  - Exports directly into editable Microsoft Word `.docx` documents via `docx`.
- **Word to PDF (.docx to .pdf):**
  - Parses Word documents (.docx) via `mammoth` and renders cleanly formatted, paginated PDF documents.
- **PDF to Excel (.xlsx / .csv):**
  - Detects coordinate-aligned tabular grids and cell structures inside PDFs.
  - Exports extracted tables into native Microsoft Excel spreadsheets (`.xlsx`) or comma-separated values (`.csv`) via `xlsx`.
- **Excel to PDF (.xlsx to .pdf):**
  - Converts spreadsheet sheets, rows, and columns into paginated PDF pages.
- **PDF to PowerPoint (.pptx):**
  - Renders PDF pages or layout elements into editable presentation slides via `pptxgenjs`.
- **PowerPoint to PDF (.pptx to .pdf):**
  - Compiles slide presentations directly into unified PDF documents.
- **PDF to Image Archive (ZIP):**
  - Renders each page of a PDF as a high-resolution raster image (JPG / PNG) packaged into a downloadable `.zip` archive.
- **Text to PDF (.txt to .pdf):**
  - Converts plain text files into paginated, formatted PDF files with customizable fonts, margins, and headers.

#### 16. Batch PDF Tools
- Apply batch operations across multiple PDF documents at once:
  - Bulk PDF compression
  - Bulk conversion of multiple PDFs into image archives
  - Batch watermarking and header/footer placement

---

### Section IV: PDF Viewing, Editing, Annotation & Digital Signatures

#### 17. High-Fidelity PDF Reader & Viewer
- **Smooth Canvas Rendering:** Scalable rendering via `pdfjs-dist` with high-DPI retina display support.
- **Navigation Controls:** Continuous scrolling, single-page view, zoom controls (50% to 300%), fit-to-width, fit-to-page, and jump-to-page.
- **Thumbnail Sidebar:** Visual page strip for rapid navigation across long multi-page documents.

#### 18. PDF Editor & Annotation Studio
- **Custom Text Boxes:** Insert text anywhere on the page with configurable typography (font family, font size, text color, bold/italic, alignment, and background fill).
- **Freehand Pen & Stylus Tool:** Smooth drawing canvas for handwritten notes, sketches, and diagrams with custom stroke width and colors.
- **Vector Highlighting & Markup:** Text highlighter with customizable opacity, strikethrough, and underline tools.
- **Geometric Shapes:** Add clean vector rectangles, ellipses/circles, straight lines, and directional arrows.
- **Stamp Library:** Place pre-configured or custom stamps (`APPROVED`, `FINAL`, `CONFIDENTIAL`, `DRAFT`, `COPY`, `REVISED`).
- **History & Editing States:** Full multi-step Undo and Redo tracking.

#### 19. Digital Signature Studio
- **Interactive Vector Signature Pad:** Draw smooth digital signatures using finger, stylus, or mouse, with pressure-responsive vector smoothing.
- **Signature Image Import:** Upload an image of a handwritten signature; the tool automatically removes white paper background for transparent placement.
- **Interactive Drag & Resize:** Freely position, scale, and rotate signatures across any page of the PDF.
- **Initials & Date Placeholders:** Append instant date stamps and initials alongside signatures.
- **Burn-In Vector Embedding:** Embeds the signature directly into the PDF structure before saving.

#### 20. Signature Request & Field Placement
- Mark designated signature, initials, date, and text placeholder areas on documents before exporting or sharing.

#### 21. Interactive AcroForms Filling & Creation
- **Interactive Form Filling:** Automatically detects standard AcroForm fields in official documents, allowing users to fill text fields, toggle checkboxes, select radio buttons, and choose from dropdown menus.
- **Form Flattening:** Option to permanently bake form values into the PDF pages to prevent subsequent alteration.

#### 22. Header & Footer Studio
- **Dynamic Page Numbering:** Insert dynamic numbering patterns across pages:
  - `Page {n} of {total}`
  - `Page {n}`
  - `- {n} -`
- **Custom Headers & Footers:** Add document titles, author names, subject tags, timestamps, and confidentiality notices.
- **Granular Layout Controls:** Configure 9 anchor alignments (Top/Bottom, Left/Center/Right), custom margins, font styling, and font colors.
- **Page Targeting:** Apply across all pages, exclude cover/first pages, or configure different headers for odd/even pages.

---

### Section V: Security, Privacy & Metadata Sanitization

#### 23. PDF Password Protection & Encryption
- **ISO 32000-1 Standard 128-bit Encryption:** Client-side document encryption ensuring enterprise-grade protection.
- **Dual Password Model:**
  - *User Password (Open Password):* Required to decrypt and view document contents.
  - *Owner Password (Permissions Password):* Protects permissions and security policies.
- **Granular Permissions Bitmasks:**
  - Restrict printing (disallow or permit low-resolution only).
  - Restrict text, table, and graphics copying.
  - Disallow document content modifications.
  - Disable form field editing and annotating.
  - Prohibit page extraction and document assembly.

#### 24. PDF Unlock & Decryption
- Permanently decrypt and remove password restrictions from encrypted PDFs (when the authorized password is provided), producing a clean, unrestricted document.

#### 25. Privacy Sanitizer & Metadata Stripper
- **Metadata Eradication:** Completely scrubs embedded document metadata tags:
  - Document Title, Author, Subject, Keywords
  - Creator tool, PDF Producer, Software version
  - Creation date and Modification timestamp
- **Hidden Stream Sanitization:** Removes embedded XMP metadata streams, private edit histories, and cached document thumbnails.
- **Structural Deep-Clean:** Strips private comments, embedded file attachments, form data, JavaScript routines, and hidden vector layers.

#### 26. Verified Redaction & Post-Redaction Forensic Audit
- **Dual-Pass Forensic Verification:**
  - *Pass 1 (Text Layer Extraction):* Extracts complete page text via `pdfjs-dist` to verify zero residual strings match sensitive target snippets.
  - *Pass 2 (Content Stream Syntax Audit):* Decompresses and parses `/Contents` streams via `pdf-lib` to ensure no text-showing operators (`Tj`, `TJ`, `'`, `"`) contain target substrings, immediately flagging superficial blackout overlays.
- **Provable vs. Unprovable Reporting:**
  - Categorizes each redaction as "Verified Scrubbed" (proven vector removal) or "Vector Residual Risk" (complex fonts/clipping paths).
- **One-Tap Region Rasterization Fallback:**
  - Converts unprovable vector regions into flattened 300 DPI image patches directly on an off-screen canvas, removing underlying vector operators while preserving adjacent selectable text.
- **Claim Integrity Guarantee:** Never displays "Permanently Removed" unless verification passes 100%.

#### 27. PDF Metadata Editor
- **Dual Info Dict & XMP Stream Synchronization:** Sets and corrects metadata attributes (Title, Author, Subject, Keywords, Creator, Producer, Creation Date, Modification Date) simultaneously in both the legacy PDF Info dictionary and modern XMP stream (`dc:title`, `dc:creator`, `dc:description`, `dc:subject`, `pdf:Keywords`, `pdf:Producer`, `xmp:CreateDate`, `xmp:ModifyDate`).
- **Tag/Pill Keyword Management:** Intuitive tag-chip interface with comma-delimited input and tap-to-remove badges.
- **Date Standardization:** Supports setting timestamps to current device time or custom dates formatted to standard PDF specification (`D:YYYYMMDDHHmmSSOHH'mm'`) and ISO 8601.
- **Unicode & Non-Latin Script Integrity:** Complete UTF-8 encoding support for Indic scripts (Hindi, Marathi, etc.) with zero corruption.
- **Sanitizer Independence:** Complements the bulk Privacy Sanitizer without interfering with bulk strip workflows.

#### 28. Hidden-Content Audit (Forensic Pre-Share Risk Inspector)
- **5 Structural Concealment Detectors:**
  - **Hidden Layers (OCG):** Scans `/OCProperties` in the document catalog; detects hidden layers, disabled default states (`/OFF`), and print-only layers.
  - **Off-Page Content:** Inspects page content streams for text, line art, or image objects placed outside visible `/CropBox` or `/MediaBox` coordinates.
  - **Invisible / Low-Contrast Text:** Analyzes text operations where fill color matches the background (e.g. white text on white page via `1 1 1 rg` or `1 g`), opacity is zero (`/CA 0`), text rendering mode is invisible (`3 Tr`), or font size is below 0.5pt. Accurately preserves ordinary light-grey watermarks.
  - **Off-Page Annotations:** Inspects the `/Annots` array for sticky notes, comments, or form fields positioned beyond visible page boundaries.
  - **Embedded Scripts & Attachments:** Identifies embedded files (`/EmbeddedFiles`, `/AF`) and JavaScript actions (`/OpenAction`, `/AA`, `/JavaScript`).
- **Forensic Health Gauge Dashboard:**
  - Visual circular risk meter indicating Low, Moderate, or High Privacy Risk with total findings count and severity breakdowns.
- **Categorized Expandable Audit Cards:**
  - Expandable cards for each concealment category with badge counts, severity tags (High, Warning, Info), text snippet previews, and coordinate tags.
- **Remediation & Report Export:**
  - **PDF Forensic Audit Report:** Exports a formatted, downloadable forensic PDF audit report document with complete finding descriptions.
  - **1-Tap Sanitizer Handoff:** Seamlessly hands off the document to the Privacy Sanitizer via `DocumentBridgeService` to scrub flagged concealed structures before sharing.

#### 29. App Lock & Panic Clear (Biometric/PIN Security & Emergency Data Wipe)
- **Biometric & 4-Digit PIN Security:**
  - Secure hardware biometric authentication (Fingerprint, Face Unlock) with 4-digit PIN fallback.
  - Salted SHA-256 cryptographic hashing for PIN storage with brute-force lockout protection (30s lockout after 5 consecutive failed attempts).
- **Configurable Lock Targets:**
  - *Lock Entire App on Launch:* Requires authentication whenever the application opens or returns from background.
  - *Lock History Vault Only:* Restricts access to document history and saved vault without interrupting normal tool browsing.
- **Configurable Auto-Lock Timers:**
  - Lock immediately on backgrounding, after 1 minute, or after 5 minutes.
  - Default is OFF: Launch flow remains completely untouched until user explicitly enables it.
- **Temp Files Auto-Clear:**
  - Automated deletion of cached render canvases, temporary export files, and staging blobs upon app pause/exit or daily cleanup.
- **Emergency Panic Clear (Zero-Remnant Data Wipe):**
  - One-tap immediate purge of all local storage across IndexedDB databases (`keyval-store`, `pdf_cache`, etc.), Capacitor Preferences, LocalStorage, SessionStorage, and Filesystem Cache directories.
  - Two-step confirmation bottom sheet detailing exact storage breakdown before irreversible erasure.

#### 30. Per-Document Privacy Report Card (Layman Privacy Synthesis & Grade)
- **Privacy Synthesis Algorithm:**
  - Multi-service audit aggregator combining forensic scans from `PdfPrivacyService`, `PdfMetadataEditorService`, and `PdfHiddenContentAuditService`.
  - Calculates a unified Privacy Score (0–100) and Letter Grade (A+, A, B, C, D, F):
    - *Grade A+:* Score $\ge 95$ with zero personal metadata, no author traces, no software signatures, no EXIF/GPS, and no hidden layers.
    - *Deductions:* Personal Author name revealed (-15), Software/OS version traces (-10), Camera/device EXIF metadata (-15), Geolocation GPS coordinates in embedded images (-25), Hidden text or layers (-20), Embedded attachments or JavaScript actions (-30).
- **Plain-Language Translation Engine:**
  - Converts complex forensic PDF dictionary tags into conversational non-technical statements easily understood by non-technical users (e.g., *"This document tells anyone who receives it that it was created by 'John Doe' using 'Word 2024' on October 28."*, *"Contains 2 photos with embedded GPS locations showing where they were taken."*).
- **4 Layman Disclosure Cards:**
  - *Who Created It:* Identifies author names, contributor tags, and company references.
  - *Device & Software:* Flags editing software signatures, operating system footprints, and PDF producer identifiers.
  - *Time & Location:* Detects creation/modification dates, timezone offsets, and embedded image GPS coordinates.
  - *Concealed Content:* Highlights invisible text, hidden OCG layers, off-page elements, and active scripts.
- **Export & Remediation Handoff:**
  - *PDF Report Card Export:* Generates a clean, shareable single-page PDF report card with visual grade badge, score, plain-language summary, and itemized deduction ledger.
  - *1-Tap Sanitizer Handoff:* Seamlessly transports the document into the Privacy Sanitizer via `DocumentBridgeService` to scrub all flagged attributes in one tap.

---

### Section VI: Advanced Utilities, OCR, Extraction & Local AI

#### 26. Smart Optical Character Recognition (OCR) Engine
- **Client-Side Text Recognition:** Powered by on-device WebAssembly `tesseract.js`.
- **Searchable PDF Generation:** Generates a dual-layer PDF with an invisible, selectable text layer positioned precisely over original scanned images. Text can be searched, selected, copied, and highlighted while preserving original visual appearance.
- **Plain Text Extraction:** Export recognized text directly into `.txt` or markdown.
- **Multi-Language Support & Hybrid Offline Delivery (18 Languages):**
  - *Primary Bundled Model:* English (`eng.traineddata.gz`, ~4MB) bundled in app assets for zero-network 100% offline OCR on initial install.
  - *13 Indic Scripts:* Hindi (`hin`), Marathi (`mar`), Bengali (`ben`), Tamil (`tam`), Telugu (`tel`), Kannada (`kan`), Malayalam (`mal`), Gujarati (`guj`), Odia (`ori`), Assamese (`asm`), Urdu (`urd`), Sanskrit (`san`), Nepali (`nep`) with optimized high-accuracy Indic models.
  - *5 International Languages:* English (`eng`), Spanish (`spa`), French (`fra`), Arabic (`ara`), Chinese Simplified (`chi_sim`).
  - *Bilingual Multi-Language Combination Pass:* Multi-select up to 2 simultaneous languages (e.g. `hin+eng`, `tam+eng`) with visual primary/secondary badges.
  - *RTL Text Layer Support:* Right-to-Left coordinate mapping and text layer rendering for Urdu and Arabic scripts.
  - *In-App OCR Language Selector & Manager:* Bottom sheet to search by English or native script name, filter by Indian (13) vs International (5) tabs, inspect file sizes, manage storage, and free up space.

#### 27. PDF Content Extractor
- **Extract All Images:** Discovers every embedded raster image in a PDF and allows previewing and downloading individually or as a `.zip` archive.
- **Extract Text:** Strips all raw text content across pages into a formatted text file.
- **Extract Tables:** Automatically detects tabular grids and exports data into Excel (`.xlsx`) or `.csv` files.
- **Extract Attachments:** Detects and extracts embedded binary files and supplementary documents stored inside the PDF container.

#### 28. QR Code & Barcode Toolkit
- **Universal Code Scanner:** Reads and decodes 1D and 2D barcodes from camera feeds, uploaded image files, or pages of a PDF:
  - *Supported Formats:* QR Code, Data Matrix, Aztec, PDF417, Code 128, Code 39, EAN-13, EAN-8, UPC-A, UPC-E.
- **Custom QR Code Generator:**
  - *WiFi Network:* Formats SSID, password, and encryption type (WPA/WPA2/WEP) for 1-tap connection.
  - *UPI Payments:* Generates instant payment strings with Payee VPA, name, amount, and notes.
  - *Contact Card (vCard):* Encodes contact information (name, phone, email, address, company).
  - *URLs & Plain Text:* Fast encoding with selectable error correction levels (L, M, Q, H).

#### 29. PDF Intelligence & Local Document AI
- **100% On-Device AI:** Runs locally without transmitting document text to cloud APIs.
- **Document Summarization:** Generates executive summaries, section overviews, and bullet points from long reports and contracts.
- **Grounded Q&A with Page Citations:** Ask specific questions about the document and receive grounded answers with exact page number citations.
- **Multi-Lingual Translation:** Translates document passages between English, Hindi, Marathi, Bengali, and Punjabi.

#### 30. Specification Presets & Custom Format Profiles
- **Pre-Configured Sizing Profiles:** Quick 1-tap configurations for standard document, photo, and signature dimensions, file size ceilings, and aspect ratios.
- **Custom Profile Builder:** Create, name, save, and edit custom specification profiles (specifying min/max KB, exact width/height in px/cm/mm, and allowed formats).

#### 31. Document Specification Validator
- **Pre-Upload Verification:** Validates documents, photos, and signatures against target size specifications.
- **Rule Verification:** Checks file size limits (min/max KB), dimensions (width/height), aspect ratio, and file format.
- **1-Click Auto-Fix:** Automatically executes an automated resizing and recompression pipeline that brings non-compliant files into spec with a single tap.

#### 32. Entity & Clause Extraction with Page Anchors
- **Key Entity Extraction:** Extracts dates, monetary amounts, contracting parties, deadlines, and reference/account numbers with exact bounding box coordinates (PDF points) and page anchors.
- **Operative Clause Detection:** Linguistic modal markers ("must", "shall", "agrees to", "within [N] days", "subject to", "penalty", "termination") classify contractual provisions into Obligations, Deadlines, Penalties, and Rights.
- **Interactive Document Viewer:** Canvas-based interactive page viewer with touchable bounding boxes and popovers displaying passage metadata.
- **Bottom Sheet Drawer:** Segmented tab bar ([Amounts], [Dates & Deadlines], [Parties], [Clauses]) with card lists that jump the document canvas directly to the exact passage.
- **Strict Honesty Gate:** Explicitly displays the disclaimer: *"Information extraction only. This tool finds text patterns and does not provide legal advice."*
- **Export Capabilities:** One-tap export to CSV, structured JSON, and printable executive summary report.

#### 33. Reading Time & Readability Scores
- **Document Statistics:** Computes total word count, character count, sentence count, syllable count, and complex words count.
- **Pace-Based Time Estimates:** Calculates silent reading time based on 200 words per minute (wpm) and presentation/speaking time based on 130 wpm.
- **Standard Readability Indices:** Implements Flesch Reading Ease (0-100), Flesch-Kincaid Grade Level, and Gunning Fog Index.
- **Plain-Language Complexity Bands:** Classifies text into Easy / Conversational (Reading Ease >= 80, Grade <= 6), Moderate / Standard (Reading Ease 60-79, Grade 7-10), and Dense / Academic / Technical (Reading Ease < 60, Grade 11+).
- **Multi-Level Granularity:** Provides overall document scores plus per-page and per-section breakdowns.
- **Interactive Gauges & Explanations:** Mobile dials and educational explanation cards explaining formulas and score interpretations.
- **1-Tap Report Share:** Instant sharing or copying of readability analysis summaries via system share sheet.

#### 34. Side-by-Side Translation Reader & Multi-Format Summary Export
- **Dual-Pane Synchronized Scroll-Lock:** Left/top pane renders original PDF pages via `pdfjs-dist`, while right/bottom pane displays translated text with synchronized scroll-locking that accurately pairs pages across unequal text lengths.
- **Layout Fidelity Contract:** Translation is presented in a synchronized dual-pane view, preventing visual clipping or unreadable overflow caused by 30-40% translated text expansion in Indic languages.
- **Mobile Split View:** Dynamic vertically stacked split view in portrait orientation and side-by-side view in landscape orientation with a draggable touch divider handle (20% to 80% range).
- **Quick-Switch Pill Chips:** Instant source-to-target language switching across English, Hindi, Marathi, Bengali, and Punjabi.
- **Multi-Format Export:** Sticky bottom action bar with thumb-accessible buttons for exporting translated documents to formatted PDF (preserving page breaks matching the original document) and Microsoft Word (.docx with preserved headings, bold text, and paragraphs).

---

## 4. Cross-Cutting System Features & User Experience

### 4.1 Global Search & Command Palette (Ctrl+K)
- Indexed search across all tools, capabilities, actions, file extensions (`.pdf`, `.docx`, `.xlsx`, `.jpg`, `.png`), and keyword synonyms.

### 4.2 Recents & Starred Favorites
- **Recent Tools:** Automatically remembers recently used tools in local storage (`IFH_RECENT_TOOLS`) for quick access.
- **Starred Favorites:** Allows users to star their favorite tools to pin them directly at the top of the home screen (`IFH_FAVORITE_TOOLS`).

### 4.3 Local Output History & Storage Vault
- **Local Storage Management:** Saved files are stored on the device (`IFH_OUTPUT_HISTORY`).
- **File Actions:** Preview, re-download, trigger system share sheet, or delete files.
- **Cache Inspector:** Inspect exact cache sizes and clear temporary data with a single button (`/features/local-data-storage`).

### 4.4 Multi-Language Localization (i18n)
Full localization across 5 languages with instant, reload-free language switching:
- English
- Hindi (हिन्दी)
- Marathi (मराठी)
- Bengali (বাংলা)
- Punjabi (ਪੰਜਾਬੀ)

### 4.5 Theming & Display
- Adaptive **Light Mode**, **Dark Mode**, and **System Default** syncing with device OS settings.

### 4.6 Native Hardware & OS Integration (Capacitor 8)
- **Camera & Photos:** Native camera capture and gallery selection (`@capacitor/camera`).
- **Filesystem Access:** Direct device storage file read/write (`@capacitor/filesystem`).
- **System Share Sheet:** Share files directly to other apps (`@capacitor/share`).
- **Haptics:** Tactile feedback on actions and completions (`@capacitor/haptics`).

### 4.7 Optional Account & Entitlements
- **Zero Obligation:** Guest mode by default with full tool accessibility.
- **Cross-Device Sync:** Optional sign-in to sync entitlements across devices.
- **In-App Account Deletion:** Full self-service account removal (`DELETE /auth/me`).

---

## 5. Technology Stack Summary

| Domain | Underlying Technologies |
|---|---|
| **Framework & UI** | Ionic Framework 9, Angular 22 (Standalone Components, Signals, Zone.js) |
| **Native Bridge** | Capacitor 8 (Android SDK 34/35, Plugins for Camera, Filesystem, Share, Haptics) |
| **PDF Core Engine** | `pdf-lib` (Creation, merging, splitting, security, form filling, flattening), `pdfjs-dist` (Rendering, rasterization) |
| **Image & Graphics** | HTML5 Canvas 2D, `browser-image-compression`, `cropperjs` |
| **OCR & Vision** | `tesseract.js` (WebAssembly OCR engine), `@zxing/library` (1D/2D barcode & QR scanner), `qrcode` (QR generator) |
| **Document Formats** | `docx` (Word writer), `mammoth` (Word reader), `xlsx` (Excel reader/writer), `pptxgenjs` (PowerPoint creator), `jszip` |
| **Metadata & EXIF** | `exifr` (EXIF, GPS, camera metadata parsing and stripping) |
