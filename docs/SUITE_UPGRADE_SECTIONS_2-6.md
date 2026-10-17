# Image, Conversion, Editing, Security & Intelligence — Updated Feature List & Build Prompts

**Written:** 2026-10-14 · **Scope:** Sections II–VI of [APP_FEATURES.md](APP_FEATURES.md) · **Status:** planning document, not a store-facing claim

Companion to [PDF_MANAGEMENT_UPGRADE.md](PDF_MANAGEMENT_UPGRADE.md), which covers
Section I (PDF management, organizing and integrity). **Prompt 0 in that document
is the shared contract for both** — it carries the additive-only rule, the repo
conventions and the test gates. Prepend it to every build session, then add one
of Prompts 7–13 below.

Everything here is **additive**. The shipped engines keep working unchanged: the
RC4 Standard-128 encryption path, the drawn-signature burn-in, the 5-language OCR
flow, the 15 registered converters, the compression presets, the scanner's five
enhancement filters and the editor's fifteen tools.

> Same guard as the companion doc: **do not copy 🆕 rows into store listing text
> or `APP_FEATURES.md` until they ship.** The last Play rejection on this project
> was a Misleading Claims flag.

**Legend** — ✅ shipped · 🔶 shipped but thin · 📝 shipped and missing from your summary · 🆕 new

---

## Part 0 — Corrections to the current summary

Reading the code turned up capabilities the summary undersells. These need no
work; they need mentioning.

| 📝 Already shipped | Where |
| --- | --- |
| **HTML / webpage → PDF** | `html-to-pdf` converter |
| **EPUB → PDF** | `epub-to-pdf` converter |
| **RTF → PDF** | `rtf-to-pdf` converter |
| **OpenDocument → PDF** (`.odt`, `.ods`, `.odp`) | `opendocument-to-pdf` converter |
| **Apple Pages → PDF** | `pages-to-pdf` converter |
| **CSV → PDF** | `csv-to-pdf` converter |
| **ZIP archive → PDF** | `zip-to-pdf` converter |
| **Redaction tool** in the editor | `EditorTool: 'redact'`, with `ADD_REDACTION` / `APPLY_REDACTION` commands |
| **Crop tool** in the editor | `EditorTool: 'crop'`, `SET_CROP` / `RESET_CROP` commands |
| **Sticky notes** | `EditorTool: 'note'` |
| **Watermarking** | watermark modal + export pipeline |
| **High-contrast scan filter** | a fifth `EnhancementPreset`, alongside original/document/grayscale/bw |

So the converter count is **15**, not the eight the summary lists, and the editor
is a 15-tool editor. Worth saying out loud in the listing — it is already true.

---

## Part 1 — The updated feature list

### Section II — Image Processing, Optimization & Scanning

**Shipped** ✅ — Photo & Image Resizer/Compressor (exact KB, px/cm/mm/in, aspect
lock, crop, EXIF+GPS strip) · Signature & Ink Processor (luminosity thresholding,
ink contrast, auto-crop) · Images → PDF (page size, orientation, margins) ·
Mobile Document Scanner (corner detection, 4-point warp, 5 filters) · Batch Image
Suite (bulk compress, resize, convert, rename templates).

**Capture pipeline**

- 🆕 **Capture modes:** Document, Whiteboard, **Book** (two-page spread, auto-split down the gutter), **ID Card** (front and back captured in sequence, laid out on one page), Photo, Table. Microsoft Lens ships documents / whiteboards / photos / business cards as distinct modes; the ID-card layout is standard in CamScanner and Adobe Scan.
- 🆕 **Auto-capture and batch scanning:** fire the shutter when the page is steady, in frame and in focus; keep shooting without returning to the review screen between pages.
- 🆕 **Shadow and glare removal:** illumination normalization across the page, beyond the current global threshold — the single most common complaint about phone scans.
- 🆕 **Finger and edge removal:** detect the hand holding a page down and inpaint it out.
- 🆕 **Book curvature dewarping:** straighten curved text baselines on bound-book captures.
- 🆕 **Blur gate:** score each capture (variance of Laplacian) and prompt a retake *before* it becomes page 7 of a 20-page PDF.
- 🆕 **Auto-naming from content:** OCR the first lines and name the output accordingly (Stirling and Genius Scan both do this).

**Image tools**

- 🆕 **Passport / ID Photo Studio:** face detection, auto-crop to a head-and-shoulders ratio, background replacement to plain white or blue, exact mm/px and KB targets, and a print sheet (N copies tiled on 4×6 or A4). Given the presets this app already ships, this is the highest-value addition in Section II.
- 🆕 **Face and plate blur / region redaction for images** — iLoveIMG ships "Blur face" as its own tool.
- 🆕 **Background removal / subject cutout** — iLoveIMG ships this too. See the feasibility notes: a document-grade edge-and-threshold cutout is cheap, a true subject matte needs a model.
- 🆕 **Upscale and enhance low-resolution scans:** bicubic plus unsharp masking as the baseline; ML super-resolution is a model-size decision, not a given.
- 🆕 **Format reach:** HEIC/HEIF input (what iPhones and newer Androids actually produce), AVIF, multi-page TIFF in and out, BMP, SVG rasterization.
- 🆕 **Image metadata viewer and editor:** show EXIF, GPS and capture dates; fix wrong dates in batch. Today the app can only strip — `exifr` is already a dependency, so reading is nearly free.
- 🆕 **Image watermarking:** text or logo, opacity, tiling, batch.
- 🆕 **Photo sheet layout:** N images per A4/4×6 sheet with gutters and cut marks, for printing document photos.
- 🔶 **Batch suite additions:** per-file KB targets as well as a uniform ceiling, EXIF-date rename tokens, auto-rotate from EXIF orientation, one-PDF-per-file vs. one combined PDF, and skip-if-already-under-target.

### Section III — Document Conversion

**Shipped** ✅ — 15 converters: Word ↔ PDF, Excel ↔ PDF, PowerPoint ↔ PDF,
PDF → PNG, Text → PDF, plus the seven listed in Part 0.

**Reach**

- 🆕 **PDF → Markdown**, preserving headings, tables, lists and links. iLovePDF shipped this explicitly for notes and LLM workflows; it is cheap here because the content extractor already walks text with positions.
- 🆕 **PDF → HTML**, as one self-contained file with embedded images.
- 🆕 **PDF → EPUB**, for reflowable reading on a phone.
- 🆕 **Markdown / JSON / XML / YAML → PDF**, with monospace rendering and syntax highlighting.
- 🆕 **Email → PDF** (`.eml`, `.msg`), headers rendered and attachments appended.
- 🆕 **Images → Word / Excel**: OCR'd text into `.docx`, OCR'd tables into `.xlsx`.
- 🆕 **PDF ↔ multi-page TIFF** — still mandatory on a surprising number of government and legal upload portals.
- 🆕 **SVG → PDF** and **PDF → SVG**, vector preserved.
- 🆕 **PDF → structured JSON** (text with positions, tables, metadata) for developer and LLM pipelines.

**Fidelity — worth more than the eleventh format**

- 🆕 **Conversion controls applied across every converter:** layout-preserving vs. reflowable text mode · table detection on/off · header and footer detection and suppression · hyperlink and bookmark preservation · font substitution map · Indic and RTL script shaping verification · **a conversion report** listing what was approximated and what was dropped.
- 🔶 **Batch PDF tools additions** (today: compress, image archive, watermark, header/footer): batch OCR, batch convert-to-Word, batch protect/unprotect, batch metadata strip, batch rename-from-content, a mixed-input queue with per-file status and a CSV result log.

### Section IV — Viewing, Editing, Annotation & Signatures

**Shipped** ✅ — High-DPI reader (zoom, thumbnails, jump-to-page) · 15-tool editor
including redaction and crop (Part 0) · Digital Signature Studio (vector pad,
transparent import, drag/resize, date and initial placeholders, burn-in) ·
Signature requests and AcroForm filling + flattening · Header & Footer Studio ·
undo/redo command stack.

**Editing**

- 🆕 **Edit existing text.** Tap a paragraph and change it. This is the biggest single gap against Sejda and Acrobat. Scope it honestly: same-font, same-size, single-line edits first; full reflow later or never.
- 🆕 **Find and replace** across the document, including inside form fields.
- 🆕 **Link editor:** add, edit and delete hyperlinks (URL and jump-to-page), plus a list of every link in the document for review.
- 🆕 **Comment and review threads:** notes with replies, resolve state, author initials, and an exportable comment summary as PDF or CSV.
- 🆕 **Image tools in the editor:** insert, replace, delete, crop and mask page images; whiteout an arbitrary region.
- 🆕 **Shape recognition** for the pen tool (a wobbly circle snaps clean) and a **measurement tool** (distance and area against a calibrated scale) for plans and drawings.
- 🆕 **Annotation flatten and export:** flatten annotations only, or export the annotation layer as a standalone overlay PDF — pairs with the overlay tool in the companion doc.

**Forms**

- 🆕 **Form builder:** create fields, not only fill them — text, checkbox, radio group, dropdown, list, date and signature fields, with required flags, tab order and basic validation. iLovePDF added this as "PDF Forms"; Sejda sells it as "make existing PDFs fillable".
- 🆕 **Form data import/export:** FDF, XFDF, CSV and JSON round-trip.
- 🆕 **Form mail-merge:** fill one template from a CSV of rows to produce N finished documents in one pass.

**Signatures**

- 🆕 **Certificate-based signing (PKCS#12 / `.p12`)** with a visible signature appearance — a real cryptographic signature rather than a drawn image. The hardest item in this document; see feasibility. The existing drawn-signature flow stays exactly as it is.
- 🆕 **Signature appearance templates:** reason, location, date format, logo, "signed by" block; initials auto-generated from a typed name; a typed-signature font option alongside drawing.
- 🆕 **Multi-party signing order, on-device:** define signers and their fields, export a signing packet, and track which fields have come back filled. Builds on the existing signature-request placeholders.

**Reading**

- 🆕 **Reader upgrades:** text search with hit highlighting and a result list · text reflow for small screens · night and sepia reading modes · two-page spread · continuous vs. paged · a bookmarks sidebar (shared with the outline editor in the companion doc) · last-read position per document · **read-aloud via platform text-to-speech** · thumbnail scrubbing.

### Section V — Security, Privacy & Metadata Sanitization

**Shipped** ✅ — Hand-rolled Standard 128-bit encryption (V=2, R=3, RC4) with
user and owner passwords · 32-bit permissions integer per ISO 32000-1 ·
unlock/decrypt by reconstruction at 300 DPI · Privacy Sanitizer (metadata, XMP,
comments, scripts, attachments, hidden layers).

- 🆕 **AES-256 encryption (V=5, R=6)** and **AES-128 (V=4, R=4)**, with the existing RC4 path kept and relabelled "legacy (compatibility)". This is not a style preference: **RC4 is deprecated in PDF 2.0, and AES-256/R6 is the only value the PDF 2.0 spec does not deprecate** (QPDF's encryption documentation; PDFlib's encryption knowledge base; iText's note on `R = 6`). The app's current output is standard-conformant to ISO 32000-1 and opens everywhere — it is also the weakest option in the spec.
- 🆕 **Password strength meter and passphrase generator**, plus a warning when the owner password silently falls back to the user password (which the current code does by design).
- 🆕 **Batch protect / unprotect** across many files with one password.
- 🆕 **Verified redaction.** The editor can already draw and apply redactions; add a verification pass that searches the *output* for the redacted strings and reports whether removal is provable, with a rasterize-the-region fallback when it is not. That verification is the whole difference between a black rectangle and a redaction.
- 🆕 **Search-and-redact:** redact every occurrence of a pattern — phone numbers, account numbers, emails, a name — across all pages, with a reviewable match list before applying.
- 🆕 **Metadata editor**, not only a stripper: set Title, Author, Subject and Keywords. Sejda ships this as its own tool, because sometimes a submission needs metadata to be *correct* rather than absent.
- 🆕 **Hidden-content audit:** optional content groups (layers), off-page content, white-on-white text, clipped-but-present text, annotations outside the visible area. The sanitizer removes; this one shows you first.
- 🆕 **App-level privacy:** biometric or PIN lock for the app and the history vault, auto-clear of temp files on exit, and a one-tap clear of all history and caches.
- 🆕 **Per-document privacy report card:** a plain-language summary of what the file reveals about its author, software and device, exportable.

### Section VI — OCR, Extraction, Barcodes & Local AI

**Shipped** ✅ — `tesseract.js` OCR in English, Hindi, Marathi, Bengali and
Punjabi with dual-layer searchable PDF output · Content Extractor (images ZIP,
text, tables, attachments) · QR and barcode scanning (QR, Data Matrix, Aztec,
PDF417, Code 128, Code 39, EAN/UPC) and generation (WiFi, UPI, vCard, URL) ·
on-device summarization, grounded Q&A with page citations, and translation across
the five languages · sizing profiles and the specification validator.

**OCR**

- 🆕 **Language expansion:** Tamil, Telugu, Kannada, Malayalam, Gujarati, Odia, Assamese, Urdu, Sanskrit and Nepali, plus Arabic, Chinese, Spanish and French for travel documents. Tesseract ships Indic models, and the Indic-OCR project publishes better-trained replacements for Tamil, Malayalam, Odia, Gujarati, Kannada and Telugu.
  **Read the feasibility note before building this** — there is a live offline-claim problem in how models are currently loaded.
- 🆕 **Automatic script and language detection** before OCR, so the user does not have to pick.
- 🆕 **Handwriting mode** on a separate model path, with an honest accuracy expectation shown up front.
- 🆕 **OCR quality tools:** a confidence heatmap over the page, a low-confidence word list for fast correction, a persistent correction dictionary, and a re-OCR-this-region action.
- 🆕 **Table OCR → Excel** from photos and scans. The current table extractor works on digital PDFs; scanned tables need the OCR path.

**Extraction**

- 🆕 **Structured field extraction:** key/value pairs from receipts, invoices, bills and ID documents — dates, totals, tax numbers, document numbers, names — exportable to CSV or JSON, each field carrying a confidence and a human-review step. Generic document categories only; no institution or board names.
- 🆕 **Business card → vCard** and **document → calendar event** (`.ics`), reusing the vCard generator the QR toolkit already has.
- 🆕 **Barcode batch mode:** scan many codes in one session, dedupe, export to CSV; generate 1D codes (Code 128, EAN-13) as well as QR; bulk-generate from a CSV column.

**Local AI**

- 🆕 **Multi-document Q&A** — ask one question across a set of documents, with citations that name the file and page.
- 🆕 **Auto-tagging, classification and rename-from-content**, so a folder of scans sorts itself.
- 🆕 **Entity and clause extraction** with page anchors: dates, amounts, parties, deadlines, and the clauses that carry obligations.
- 🆕 **Reading time and readability scores.**
- 🆕 **Side-by-side translation view** that keeps the original layout, and summary export to PDF or DOCX. iLovePDF's Translate PDF sells exactly this ("keep fonts, layout, and formatting perfectly intact") and its AI Summarizer and PDF→Markdown tools confirm the demand — the difference here is that this runs on the device.
- 🆕 **Accessibility pass:** tagged-PDF structure generation, alt text for images, a reading-order check, and read-aloud. Honest note: a real tagged-PDF generator is a serious piece of work, and an untagged file labelled "accessible" is the same class of false claim as an unverified PDF/A badge.

**Presets & validator**

- 🔶 **Additions:** build a profile by OCR'ing a page of upload instructions · export and import profiles as JSON · a batch "check every document against this profile" mode · dimension and KB presets for photo, signature, thumb impression and document scans, **named by their numbers, never by an institution**.

---

## Part 2 — Where the additions came from

| Addition | Precedent | Source |
| --- | --- | --- |
| Capture modes (document / whiteboard / photo / card), extraction actions | Microsoft Lens ships these as distinct modes for documents, whiteboards, photos and business cards | support.microsoft.com — Microsoft Lens for Android / iOS |
| Auto-capture, batch scanning, text layer on export, page reordering in-app | Genius Scan: auto detection, perspective correction, colour enhancement, searchable text layer, add/move/merge pages | thegrizzlylabs.com/genius-scan |
| Upscale image, remove background, blur face, image watermark, HEIC/RAW input | iLoveIMG ships each as its own tool | iloveimg.com tool index |
| PDF → Markdown "for notes, docs, and LLMs" | iLovePDF shipped it as a named tool | ilovepdf.com/pdf-to-markdown |
| Translate PDF keeping fonts and layout intact; AI summarizer | iLovePDF, both marked New | ilovepdf.com tool index |
| Form builder (text fields, checkboxes, multiple choice, lists) | iLovePDF "PDF Forms"; Sejda "make existing PDF documents fillable" | ilovepdf.com/pdf-forms; sejda.com/pdf-forms |
| Redact, crop, compare, PDF/A, repair, page numbers, workflows | iLovePDF's Security / Organize / Intelligence groups | ilovepdf.com tool index |
| Metadata editor as a distinct tool from metadata stripping | Sejda "Change PDF Author, Title, Keywords, Subject" | sejda.com/edit-pdf-metadata |
| AES-256 (R6) over RC4 | RC4 is deprecated in PDF 2.0; R6/AES-256 is the only non-deprecated value | qpdf.readthedocs.io encryption page; pdflib.com encryption KB; itextpdf.com note on `R = 6` |
| Indic OCR language expansion | Tesseract ships Indic models; Indic-OCR publishes better-trained Tamil / Malayalam / Odia / Gujarati / Kannada / Telugu models | indic-ocr.github.io/tessdata |
| Deskew and OCR as discrete scan-repair tools | Sejda "Automatically straighten and deskew scanned PDF pages", "OCR PDF" | sejda.com/deskew-pdf; sejda.com/ocr-pdf |

---

## Part 3 — Engine feasibility, honestly

**The one that needs a decision before anything else**

**OCR models are fetched from the network today.** `OcrService` calls
`createWorker(langStr, 1, { logger })` with no `langPath`, so `tesseract.js`
resolves traineddata from its default public CDN on first use and caches it in
IndexedDB — while the progress message on screen reads "Loading OCR language
models (cached locally for offline use)". The five shipped languages therefore
need connectivity on their first run, on a device that may be offline, in an app
whose headline claim is that it works offline.

This is a finding, not a change — nothing in the code was touched. But it has to
be settled before language expansion, because adding ten more languages multiplies
it. Three options, in order of preference:

1. **Bundle the models** in the APK and point `langPath` at the local asset
   directory. Each `.traineddata` is roughly 1–15 MB, so bundling all five that
   ship today is realistic; fifteen is not, without an install-size argument.
2. **Opt-in download per language**, with the size shown and a clear "this needs
   internet once" prompt, and the UI copy corrected to match.
3. **Both:** bundle English plus the primary language, download the rest on
   request.

Whichever is chosen, the store-listing offline claim should be re-read against it.

**Straightforward with the current stack**

| Feature | How |
| --- | --- |
| Shadow/glare removal, dewarping, blur gate, finger detection | Canvas pixel work: local adaptive thresholding, baseline detection, variance of Laplacian, skin-tone plus edge heuristics. Same class of code as the existing scanner filters |
| Spread split, ID-card layout, photo sheet, collage | Canvas composition, then the existing images→PDF path |
| Passport photo crop | Face detection via `FaceDetector` where available, otherwise a Haar-cascade port or a manual guide overlay. Background replacement is tractable on a plain-background portrait |
| Face/plate blur, region redaction on images | Canvas blur over a user-drawn or detected region |
| EXIF viewing and date repair | `exifr` is already a dependency and already parses what is needed |
| HEIC, AVIF, TIFF | Browser-native where supported; HEIC on Android Chrome is the gap and needs a decoder — check before promising it |
| PDF → Markdown / HTML / JSON | The content extractor already yields text with positions and detected tables; this is a serialization layer over existing output |
| Markdown / JSON / XML → PDF | Same path as the shipped `text-to-pdf` converter plus a tokenizer |
| Find and replace, link listing, comment threads | `pdfjs` text content and annotation dictionaries for reading; `pdf-lib` annotation arrays for writing |
| Form builder, FDF/XFDF/CSV round-trip, mail-merge | `pdf-lib`'s `PDFForm` API creates and reads fields; mail-merge is a loop over the fill-and-save path that already exists |
| AES-128 / AES-256 encryption | WebCrypto provides AES-CBC and SHA-256/384/512 — exactly what Algorithms 2.A and 2.B need. The existing RC4 code already proves the surrounding dictionary work is understood |
| Search-and-redact, redaction verification | Pattern match over `pdfjs` text items for the match list; re-extract text from the output to prove removal |
| Hidden-content audit | Optional content groups, annotation rectangles outside the crop box, and text whose fill colour matches its background — all readable |
| Read-aloud | Web Speech API with platform voices; no model, no network |
| Barcode batch and 1D generation | `@zxing/library` already decodes; `qrcode` covers QR, and 1D generation is a small addition |

**Hard, and should be scoped as such**

- **Certificate-based signing (PKCS#12).** WebCrypto signs with RSA and SHA-256 happily. The work is the PKCS#7/CMS SignedData container, correct `/ByteRange` placeholder arithmetic, and incremental update so the signature covers the file. Budget it as its own project, keep the drawn-signature flow untouched, and do not ship a half-signature that viewers report as invalid — that is worse than no feature.
- **Editing existing text.** Extracting a text run, matching its font and metrics, and re-laying the line is genuinely hard; embedded subset fonts often lack the glyphs the new text needs. Ship single-line same-font edits, say that is the limit, and fall back to whiteout-and-retype.
- **True background removal / subject matte.** A document-grade cutout on a plain background is edge detection and thresholding. A person-against-clutter matte needs a segmentation model — tens of megabytes of WASM, a cold-start cost, and an install-size argument. Decide which one is being promised.
- **ML super-resolution.** Same calculus. Bicubic plus unsharp masking is free and is most of the perceived win on text.
- **Tagged PDF / accessibility.** Structure inference from a visual layout is a real research problem. Generate what can be verified, report what cannot, claim nothing further.
- **Layout-preserving translation.** Translating is the easy half; refitting text that grows by 30% into the original boxes without overflow is the hard half. Offer side-by-side first.

**Deliberately not proposed**

Cloud OCR, cloud translation, cloud conversion, server-side signing or a hosted
e-signature service. Also no certificate issuance, and no screenshot blocking in
the browser runtime, which cannot be enforced there.

---

## Part 4 — Build prompts

Prepend **Prompt 0** from [PDF_MANAGEMENT_UPGRADE.md](PDF_MANAGEMENT_UPGRADE.md)
— it carries the additive-only rule, the file layout, the i18n and icon
constraints, and the test gates. Then add one prompt below. Numbering continues
from that document's Prompts 1–6.

### Prompt 7 — Scanner & capture pipeline

```text
Extend the document scanner. The five existing EnhancementPresets
(original, document, grayscale, bw, high_contrast) keep working exactly as they
do — new processing is added alongside them, never in place of them.

Build:
1. Capture modes as a new ScanMode type: 'document' (current behaviour, the
   default), 'whiteboard', 'book', 'id_card', 'photo', 'table'. Document mode
   must behave identically to today when nothing else is selected.
   - book: detect the gutter and split the spread into two pages.
   - id_card: capture front then back, lay both out on one page with a labelled
     gap, at true card proportions.
   - whiteboard: glare suppression and colour-ink preservation.
   - table: hand off to the table-OCR path from Prompt 13.
2. Auto-capture: fire when the detected quad is stable for N frames, fills a
   minimum share of the frame, and passes the blur gate. Manual shutter stays.
3. Batch scanning: stay in the camera after each page, with a page counter and a
   filmstrip; review at the end rather than between pages.
4. Shadow and glare removal: local adaptive illumination normalization, as a
   toggle that defaults OFF so existing output is unchanged.
5. Finger and edge removal: detect a hand intruding on the page boundary and
   inpaint from surrounding paper. Always show a before/after and let the user
   decline it.
6. Book curvature dewarping: detect text baselines and resample to straighten
   them. Offer it only when curvature is actually detected.
7. Blur gate: variance-of-Laplacian score per capture, with a retake prompt
   above a configurable threshold, and an override.
8. Auto-naming from content: OCR the top region and propose a filename. Proposal
   only — never rename without the user seeing it.

Acceptance:
- Vitest on the pure functions: gutter detection on a synthetic spread, blur
  score ordering across a sharp/blurred pair, illumination normalization leaving
  an already-even page within tolerance of unchanged.
- A regression test asserting that document mode with all new toggles off
  produces byte-identical output to the current pipeline for a fixture image.
- Capture-to-PDF stays responsive on a mid-range Android device for 20 pages.
```

### Prompt 8 — Image suite

```text
Extend the image tools. The existing resizer/compressor, signature processor,
images-to-PDF and batch suite keep their current behaviour, defaults and output
naming.

Build:
1. Passport / ID Photo Studio at /features/photo/id-photo:
   - Face detection (FaceDetector API where available, manual guide overlay
     otherwise), auto-crop to a head-and-shoulders ratio with configurable head
     height percentage.
   - Background replacement to plain white or light blue for a plain-background
     portrait; refuse gracefully and say why on a cluttered background rather
     than producing a torn matte.
   - Exact output in mm or px plus a KB target, reusing the existing exact-KB
     compressor.
   - Print sheet: N copies tiled on 4x6 or A4 with cut marks.
   - Presets named by their dimensions and KB only — never by an institution.
2. Face and plate blur / region redaction for images: detected faces or a
   user-drawn region, gaussian or pixelate, with an intensity control.
3. Document-grade background cutout: edge plus threshold on a plain background,
   output as transparent PNG. Do NOT add a segmentation model in this prompt; if
   a true subject matte is wanted, raise it as its own decision with the model
   size and cold-start cost stated.
4. Upscale and enhance: bicubic plus unsharp masking, 2x and 4x, with a
   side-by-side preview. No ML model in this prompt.
5. Format reach: HEIC/HEIF input, AVIF, multi-page TIFF in and out, BMP, SVG
   rasterization. Probe support at runtime and hide what the runtime cannot do
   rather than failing at export. Report honestly which of these needed a
   decoder.
6. Image metadata viewer and editor using the exifr dependency that is already
   present: show EXIF, GPS and dates; edit or batch-shift capture dates. The
   existing strip-on-export behaviour is unchanged and stays the default.
7. Image watermarking: text or logo, opacity, rotation, position, tiling, batch.
8. Photo sheet layout: N images per sheet with gutters and cut marks.
9. Batch suite additions: per-file KB targets alongside the uniform ceiling,
   EXIF-date rename tokens, auto-rotate from EXIF orientation, one-PDF-per-file
   vs. one combined PDF, and skip-if-already-under-target.

Acceptance:
- Vitest: head-height ratio maths against known face boxes; exact-KB output
  within tolerance at passport dimensions; EXIF date shift round-trip; sheet
  layout produces the expected copy count and positions.
- Existing photo-tool specs pass unchanged.
```

### Prompt 9 — Conversion reach & fidelity

```text
Extend the conversion suite. All 15 registered converters keep their ids, their
options and their current output. New converters are added to the registry; none
are modified.

Build:
1. New converters: pdf-to-markdown, pdf-to-html (single self-contained file),
   pdf-to-epub, markdown-to-pdf, json-to-pdf, xml-to-pdf, eml-to-pdf,
   msg-to-pdf, pdf-to-tiff, tiff-to-pdf, svg-to-pdf, pdf-to-svg,
   pdf-to-json (text with positions, tables, metadata), images-to-word,
   images-to-excel. Each follows the existing Converter interface and registers
   through ConversionRegistryService exactly like the current ones.
2. Shared fidelity controls, as optional options with defaults that reproduce
   today's behaviour: layout-preserving vs reflowable text mode; table detection
   on/off; header and footer detection and suppression; hyperlink and bookmark
   preservation; font substitution map; Indic and RTL shaping verification.
3. A conversion report returned alongside every result: what was approximated,
   what was dropped, which fonts were substituted, how many tables were detected.
   Surface it in the converter page as an expandable panel.
4. Batch PDF tools additions, alongside the existing compress / image-archive /
   watermark / header-footer operations: batch OCR, batch convert-to-Word, batch
   protect and unprotect, batch metadata strip, batch rename-from-content, and a
   mixed-input queue with per-file status plus a CSV result log.

Acceptance:
- Vitest per new converter on a small fixture, asserting structure not bytes:
  markdown has the right heading levels and table pipes; epub opens as a valid
  zip with a spine; tiff is multi-page; json carries positions.
- The 15 existing converters' specs pass unchanged, and conversion.spec.ts still
  passes.
- Every new converter appears in the hub with translated title and description in
  all five languages.
```

### Prompt 10 — Editor & reader

```text
Extend the PDF editor and reader. All 15 existing EditorTools, the command stack,
the watermark and page-number modals and the export pipeline keep working
unchanged.

Build:
1. Edit existing text: select a text run, edit it in place, re-embed with the
   matched font. Scope deliberately — same font, same size, single line — and say
   so in the UI. Fall back to whiteout-and-retype when the embedded subset font
   lacks a needed glyph, and tell the user that is what happened. Add new editor
   commands rather than changing existing ones.
2. Find and replace across the document, including form field values, with a
   match list, per-match apply, and replace-all.
3. Link editor: add, edit and delete hyperlinks (URL and jump-to-page), plus a
   panel listing every link in the document.
4. Comment and review threads: replies, resolve state, author initials, and an
   exportable comment summary as PDF and CSV.
5. Editor image tools: insert, replace, delete, crop and mask existing page
   images; whiteout an arbitrary region.
6. Pen shape recognition (snap a drawn circle, rectangle, line or arrow to a
   clean vector) as an opt-in toggle, and a measurement tool for distance and
   area against a user-set scale.
7. Reader upgrades: text search with highlighting and a result list; text reflow
   for narrow screens; night and sepia modes; two-page spread; continuous vs
   paged; a bookmarks sidebar (share the outline model with the companion doc's
   Prompt 4); last-read position per document; read-aloud via the Web Speech API;
   thumbnail scrubbing.
8. Annotation flatten and export: flatten annotations only, or export the
   annotation layer as a standalone overlay PDF.

Acceptance:
- Vitest: find-and-replace hit counts on a fixture; link round-trip through
  pdfjs; comment summary export shape; shape-recognition snapping on synthetic
  stroke input.
- The existing pdf-editor spec suite passes unchanged, and redaction and crop
  behave exactly as before.
```

### Prompt 11 — Forms & signatures

```text
Extend forms and signing. The AcroForm filling and flattening flow and the drawn
signature burn-in keep working exactly as they do — this prompt adds beside them.

Build:
1. Form builder at /features/pdf/forms/build: create text, checkbox, radio group,
   dropdown, list, date and signature fields on any page via pdf-lib's PDFForm
   API; set required flags, tab order, default values and basic validation. The
   existing fill-and-flatten path must handle documents this builder produces.
2. Form data import/export: FDF, XFDF, CSV and JSON round-trip against the field
   set.
3. Form mail-merge: fill one template from a CSV of rows to produce N documents,
   with a naming template and a per-row result log. Each saved output goes
   through StorageService.saveFile, so show the quota cost before running.
4. Signature appearance templates: reason, location, date format, logo and a
   "signed by" block; initials auto-generated from a typed name; a typed-
   signature font option alongside drawing.
5. Multi-party signing order, on-device: define signers and their fields, export
   a signing packet, and track which fields return filled. Extends the existing
   signature-request placeholders rather than replacing them.
6. Certificate-based signing (PKCS#12/.p12) — BUILD THIS LAST AND SEPARATELY.
   Sign with WebCrypto, build a PKCS#7/CMS SignedData container, reserve a
   correct /ByteRange and write via incremental update so the signature covers
   the file. Verify in at least two strict viewers before considering it done.
   If it cannot be made to validate, ship nothing for this item and report why:
   a signature that viewers flag as invalid is worse than no signature feature.
   Never touch the drawn-signature path while doing this.

Acceptance:
- Vitest: created fields are readable back through pdfjs with the right types and
  flags; XFDF round-trip preserves every value; mail-merge over 3 rows yields 3
  documents and a complete log.
- The existing pdf-forms and pdf-sign specs pass unchanged.
- No UI text claims a signature is "verified" or "legally valid".
```

### Prompt 12 — Security & privacy

```text
Extend security. THE EXISTING RC4 STANDARD-128 PATH (V=2, R=3) STAYS, works
unchanged, and remains available — it is relabelled "Legacy (maximum
compatibility)", not removed, and its code is not refactored.

Build:
1. AES-256 (V=5, R=6) and AES-128 (V=4, R=4) encryption, added as an algorithm
   choice that defaults to AES-256 for new protection. Use WebCrypto for
   AES-CBC and SHA-256/384/512; implement the R6 hardened hash (Algorithm 2.B)
   and the /U, /O, /UE, /OE and /Perms entries correctly. Verify output opens in
   at least two independent viewers at every algorithm setting, and that the
   existing RC4 setting still produces what it produces today.
2. Password strength meter and passphrase generator. Warn explicitly when the
   owner password falls back to the user password, which the current code does
   by design — surface it rather than changing it.
3. Batch protect and unprotect across many files with one password, with a
   per-file result log.
4. Verified redaction: after applying the editor's existing redactions, re-extract
   text from the OUTPUT and prove the redacted strings are gone. Report
   provable/not provable per redaction, and offer a rasterize-the-region fallback
   when vector removal cannot be proven. Do not change how redactions are drawn
   or applied.
5. Search-and-redact: match a pattern (phone, account number, email, free text,
   regex) across all pages, show a reviewable match list, then apply through the
   existing redaction path and run the verification from step 4.
6. Metadata editor: set Title, Author, Subject, Keywords and dates. The Privacy
   Sanitizer's strip behaviour is untouched and stays the default elsewhere.
7. Hidden-content audit (report-only): optional content groups, off-page content,
   white-on-white text, clipped-but-present text, annotations outside the crop
   box.
8. App-level privacy: biometric or PIN lock for the app and for the history
   vault, auto-clear of temp files on exit, and a one-tap clear of history and
   caches. Build on the existing local-data-storage screen.
9. Per-document privacy report card: plain-language summary of what the file
   reveals, exportable.

Acceptance:
- Vitest: AES-256 R6 key derivation against the published test vectors; a
  round-trip encrypt-then-open for every algorithm; the RC4 path producing the
  same structure it produces today for a fixed input and document id.
- Redaction verification correctly reports a success and a deliberate failure.
- No UI text promises that redaction or encryption is unbreakable.
```

### Prompt 13 — OCR & local intelligence

```text
Extend OCR, extraction and the local AI features. The 5-language OCR flow and
the dual-layer searchable PDF output keep working unchanged.

READ THIS FIRST. OcrService calls createWorker(langStr, 1, {...}) with no
langPath, so tesseract.js fetches traineddata from its default public CDN on
first use and caches it in IndexedDB — while the on-screen message says "cached
locally for offline use". The current five languages already need network on
their first run. Settle model delivery BEFORE adding languages:
  (a) bundle .traineddata in the app and set langPath to the local assets, or
  (b) explicit opt-in per-language download with the size shown and the UI copy
      corrected, or
  (c) bundle English plus the primary language and download the rest on request.
State which you chose and why, correct the misleading progress message either
way, and flag that the store-listing offline claim needs re-reading against it.
Do not change the existing recognition behaviour for the five current languages.

Build:
1. Language expansion once model delivery is settled: Tamil, Telugu, Kannada,
   Malayalam, Gujarati, Odia, Assamese, Urdu, Sanskrit, Nepali, plus Arabic,
   Chinese, Spanish and French. Prefer the Indic-OCR trained models for the
   Indic scripts where they measurably beat upstream on a test page.
2. Automatic script and language detection before OCR, with the detected choice
   shown and overridable.
3. Handwriting mode on its own model path, with the accuracy expectation stated
   in the UI before the user commits to a long run.
4. OCR quality tools: a confidence heatmap overlay, a low-confidence word list
   for fast correction, a persistent correction dictionary, and re-OCR-this-region.
5. Table OCR to Excel from photos and scans, feeding the existing table export.
6. Structured field extraction: key/value pairs from receipts, invoices, bills
   and ID documents — dates, totals, tax numbers, document numbers, names —
   with a per-field confidence, a human-review step, and CSV/JSON export.
   Generic document categories only; no institution or board names anywhere.
7. Business card to vCard and document to calendar event (.ics), reusing the
   QR toolkit's existing vCard builder.
8. Barcode batch mode: many codes per session, deduped, CSV export; plus 1D
   generation (Code 128, EAN-13) and bulk generation from a CSV column.
9. Intelligence upgrades: multi-document Q&A with file-and-page citations;
   auto-tagging, classification and rename-from-content; entity and clause
   extraction with page anchors; reading time and readability; a side-by-side
   translation view that keeps the original layout; summary export to PDF/DOCX.
10. Accessibility pass: tagged-PDF structure generation, image alt text, a
    reading-order check, and read-aloud. Generate only what can be verified and
    report the rest — do not label an untagged file accessible.

Acceptance:
- Vitest: language detection on fixtures per script; confidence heatmap bucket
  maths; field extraction against a fixture receipt with expected key/values;
  vCard and .ics output validity.
- The existing ocr.spec.ts and pdf-intelligence.spec.ts pass unchanged.
- The chosen model-delivery decision is documented in this file, and no UI string
  claims offline availability for a language whose model has not been fetched.
```

---

## Part 5 — Suggested order and effort

| Phase | Prompt | Why here | Effort |
| --- | --- | --- | --- |
| 7 | Scanner & capture | Every scan flows through it; shadow removal and the blur gate improve output quality for free everywhere downstream | M |
| 8 | Image suite | The ID-photo studio is the highest-value single addition in these five sections, and it reuses the exact-KB compressor that already exists | M |
| 13a | OCR model delivery only | Blocks the offline claim and blocks language expansion. Small, and should not wait behind feature work | S |
| 9 | Conversion reach & fidelity | PDF→Markdown and the fidelity report are cheap on top of the existing extractor | M |
| 12 | Security & privacy | AES-256 is a correctness upgrade, not a feature; verified redaction closes a real gap between what the redact tool looks like and what it proves | M–L |
| 10 | Editor & reader | Find/replace, links and the reader upgrades are moderate; text editing is the long pole and can ship last within the phase | L |
| 13b | OCR & intelligence | Needs 13a settled; field extraction is the standout | L |
| 11 | Forms & signatures | Form builder is tractable; certificate signing is its own project and should be last of everything | L |

Two items are worth separating from the rest because they are not features:
**OCR model delivery** (an offline-claim problem that exists today) and **AES-256**
(the current RC4 output is the weakest option in the spec and deprecated in
PDF 2.0). Both are small, both are correctness, and neither changes anything a
user already relies on.
