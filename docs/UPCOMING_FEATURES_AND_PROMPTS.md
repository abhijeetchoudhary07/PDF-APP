# Upcoming Features — Complete List & Build Prompts

**Written:** 2026-10-14 · **Status:** planning document, not a store-facing claim

Every planned feature for the app, one small build prompt each. Nothing here ships
today. The research, competitor sourcing and full feasibility analysis behind these
live in [PDF_MANAGEMENT_UPGRADE.md](PDF_MANAGEMENT_UPGRADE.md) (Section I) and
[SUITE_UPGRADE_SECTIONS_2-6.md](SUITE_UPGRADE_SECTIONS_2-6.md) (Sections II–VI);
this file is the one to build from.

**How to use it:** paste **Prompt 0** (Part 0), then **one** numbered prompt. Each
prompt is deliberately one feature — two only where they are the same code path.
Don't batch them; a prompt that touches six features is how existing behaviour
gets broken by accident.

> **Do not copy anything from this file into Play Store listing text or
> `APP_FEATURES.md` until it ships.** The last Play rejection on this project was
> a Misleading Claims flag.

**Effort** — S: a sitting · M: a day or two · L: a week or more, or needs a decision first

---

## Index — every upcoming feature

| ID | Feature | Effort |
| --- | --- | --- |
| **Part 0** | **Shared contract — prepend to every prompt** | — |
| A1 | Page-order expressions (`1,3,2,4-6`, `2n-1`, reverse) | S |
| A2 | One-tap modes: reverse, odd-even split, odd-even merge, duplex sort | M |
| A3 | Blank page detection & removal | M |
| A4 | Duplicate page finder | M |
| A5 | Auto-rotate upright | M |
| A6 | Mirror / flip pages | S |
| A7 | Selection helpers (blank, duplicate, landscape, portrait, by size) | S |
| A8 | Multi-document tray in the organizer | M |
| B1 | Split by output file size | M |
| B2 | Split by document count | S |
| B3 | Split by bookmarks / chapters | M |
| B4 | Split at blank pages or QR divider sheets | M |
| B5 | Split by text pattern | M |
| B6 | Spread split & page sectioning (grid, gutter detection) | M |
| B7 | Poster tiling / printable chunks | M |
| C1 | Alternate & Mix (interleave two or more documents) | S |
| C2 | Insert pages (PDF, image, or blank) at a position | S |
| C3 | Merge: per-file page subsets and sorting | S |
| C4 | Merge: generated bookmarks, TOC page, cover & separators | M |
| C5 | Merge: AcroForm collision handling and signature warning | M |
| C6 | Overlay / underlay PDF | M |
| D0 | Shared draw-page helper (`embedPage` / `drawPage`) | S |
| D1 | Normalize page size & scale | M |
| D2 | Crop / trim margins with auto-crop whitespace | M |
| D3 | Add margins & padding | S |
| D4 | N-up multi-page layout | M |
| D5 | Booklet imposition | M |
| D6 | Single long page | S |
| D7 | Tone passes: grayscale, invert, high contrast | S |
| E1 | Bookmarks & outline editor | L |
| E2 | Page labels (`i, ii, iii`, `A-1`, restart-at-N) | M |
| E3 | Bates numbering across a batch | S |
| F1 | Compression: DPI ceiling & per-image downsample report | M |
| F2 | Compression: grayscale and 1-bit mono paths | M |
| F3 | Compression: identical-image dedupe | L |
| F4 | Compression: before/after proof view | S |
| F5 | "Fit the upload limit" chain | M |
| F6 | Structure optimizer & Fast-Web-View pass | L |
| G1 | Document fingerprint & integrity receipt | M |
| G2 | PDF Studio health strip & byte audit | M |
| G3 | Preflight & submission check | L |
| G4 | Embedded object inspector | M |
| G5 | Signature status panel (report-only) | M |
| G6 | Archival conversion (PDF/A-2b, best effort) + readiness report | L |
| G7 | Selective flatten & flatten report | S |
| G8 | Compare: word-level inline diff & ignore options | M |
| G9 | Compare: metadata/geometry diff & exportable PDF report | M |
| G10 | Repair: stream salvage, encrypted-vs-damaged, log export | M |
| H1 | Capture modes: book spread & ID card | M |
| H2 | Capture modes: whiteboard, photo, table hand-off | M |
| H3 | Auto-capture & batch scanning | M |
| H4 | Blur gate | S |
| H5 | Shadow & glare removal | M |
| H6 | Finger & edge removal | L |
| H7 | Book curvature dewarping | L |
| H8 | Auto-naming from content | S |
| I1 | ID photo studio: face detection & head-ratio crop | M |
| I2 | ID photo studio: background replace & print sheet | M |
| I3 | Face & plate blur / image region redaction | S |
| I4 | Document background cutout (transparent PNG) | M |
| I5 | Upscale & enhance (bicubic + unsharp) | S |
| I6 | Format reach: HEIC, AVIF, TIFF, BMP, SVG | M |
| I7 | Image metadata viewer & date repair | S |
| I8 | Image watermarking | S |
| I9 | Photo sheet layout | S |
| I10 | Batch image suite additions | M |
| J1 | PDF → Markdown | M |
| J2 | PDF → HTML (self-contained) | M |
| J3 | PDF → EPUB | M |
| J4 | Markdown / JSON / XML / YAML → PDF | M |
| J5 | Email (.eml / .msg) → PDF | M |
| J6 | Images → Word / Excel (via OCR) | M |
| J7 | PDF ↔ multi-page TIFF | M |
| J8 | SVG → PDF and PDF → SVG | M |
| J9 | PDF → structured JSON | S |
| J10 | Shared conversion fidelity controls & conversion report | L |
| J11 | Batch PDF tool additions | M |
| K1 | Editor: find & replace | M |
| K2 | Editor: link editor | M |
| K3 | Editor: comment & review threads | M |
| K4 | Editor: image insert, replace, delete, mask, whiteout | M |
| K5 | Editor: pen shape recognition & measurement tool | M |
| K6 | Editor: edit existing text | L |
| K7 | Editor: annotation flatten & overlay export | S |
| L1 | Reader: text search with highlighting | M |
| L2 | Reader: night, sepia, two-page, continuous modes | S |
| L3 | Reader: text reflow for narrow screens | M |
| L4 | Reader: bookmarks sidebar & last-read position | S |
| L5 | Reader: read-aloud (platform TTS) | S |
| L6 | Reader: thumbnail scrubbing | S |
| M1 | Form builder (create fields) | L |
| M2 | Form data import / export (FDF, XFDF, CSV, JSON) | M |
| M3 | Form mail-merge from CSV | M |
| M4 | Signature appearance templates & typed signatures | S |
| M5 | Multi-party signing order (on-device packet) | M |
| M6 | Certificate-based signing (PKCS#12) | L |
| N1 | AES-256 (R6) and AES-128 (R4) encryption | L |
| N2 | Password strength meter & owner-password warning | S |
| N3 | Batch protect / unprotect (completed) | S |
| N4 | Verified redaction (completed) | M |
| N5 | Search-and-redact by pattern | M |
| N6 | Metadata editor (set, not only strip) (completed) | S |
| N7 | Hidden-content audit (report-only) (completed) | M |
| N8 | App lock & panic clear (completed) | M |
| N9 | Per-document privacy report card (completed) | S |
| O0 | **OCR model delivery decision — blocks O1** (completed) | M |
| O1 | OCR language expansion (completed) | M |
| O2 | Automatic script & language detection (completed) | M |
| O3 | Handwriting mode | M |
| O4 | OCR confidence tools & correction dictionary | M |
| O5 | Table OCR → Excel from scans | M |
| P1 | Structured field extraction (receipts, invoices, IDs) | L |
| P2 | Business card → vCard, document → .ics | S |
| P3 | Barcode batch mode & 1D generation | M |
| P4 | Multi-document Q&A | M |
| P5 | Auto-tagging, classification, rename-from-content | M |
| P6 | Entity & clause extraction with page anchors | M |
| P7 | Reading time & readability scores | S |
| P8 | Side-by-side translation & summary export | M |
| P9 | Accessibility pass (tagged PDF, alt text, reading order) | L |
| Q1 | Preset builder from OCR'd instructions | M |
| Q2 | Profile export / import as JSON | S |
| Q3 | Batch check against a profile | M |
| Q4 | Recipes: pipeline engine | M |
| Q5 | Recipes: batch run, quota preview, starter recipes | M |
| R0 | Shell Master: handy flexible UI, responsive buttons & icons, auto-sliding header rail | L |
| R1 | Shell: fluid control scale for every button, icon and tap target (completed) | M |
| R2 | Shell: auto-sliding header option rail (all options animated left-to-right) (completed) | M |
| R3 | Shell: handy & flexible layout — reachable actions, fluid grids, nothing clipped (completed) | M |
| R4 | Shell: responsive proof pass — one script, every width, committed images (completed) | S |

**123 features, two groundwork prompts (D0, O0) and five shell prompts (R0-R4),
across 18 parts.** Two are not features and should go first because
they are correctness: **O0** (OCR model delivery — an offline-claim problem that
exists today) and **N1** (the shipped RC4 encryption is the weakest option in the
spec and is deprecated in PDF 2.0).

---

## Part 0 — Shared contract

Prepend this to every prompt in this file. Nothing else in this document repeats it.

```text
You are working in the PDF APP repo: Ionic 9 + Angular 22 standalone components,
Capacitor 8, Android + browser. Every feature is 100% on-device: no network calls,
no cloud services, no new runtime dependency unless you state it and justify it.
Writing is pdf-lib; rendering and text extraction are pdfjs-dist.

ADDITIVE ONLY — existing behaviour must not change:
- This is a NEW capability alongside what ships today. Do not modify, re-route or
  "clean up" an existing tool's behaviour, defaults, output format, file naming or
  public service method signatures while building it.
- Extend services by ADDING methods, or by adding optional parameters whose
  defaults reproduce today's behaviour exactly. No renamed method, no changed
  default, no altered return shape.
- New screens get new routes. Every existing route, alias and redirect keeps
  working.
- These shipped engines are not to be replaced, only extended alongside: the RC4
  Standard-128 encryption path, the drawn-signature burn-in, the 5-language OCR
  flow, the 15 registered converters, the compression presets, the scanner's 5
  enhancement filters, and the editor's existing 15 tools.
- Before finishing: record the `npm run test:unit` pass/fail counts BEFORE you
  start, and show no new failures at the end. Existing Playwright specs covering
  the tools you touched must still pass.
- If this feature genuinely cannot be added without changing existing behaviour,
  stop and report it rather than making the change.

Where code goes:
- Engine: src/app/core/services/<name>.service.ts, with a Vitest spec beside it.
- Types: src/app/core/models/<area>.types.ts (see pdf-organization.types.ts and
  pdf-analysis.types.ts for the house style).
- Screen: src/app/features/<feature>/<feature>.page.{ts,html,scss}, standalone.
- Route: a lazy loadComponent entry in src/app/app.routes.ts, keeping the existing
  /features/pdf/* shape.
- Tool entry: TOOL_CATALOGUE in src/app/core/services/tool-registry.service.ts —
  id, category, title, description, route, icon, color, keywords, relatedIds.

Reuse, do not re-implement:
- PdfPageManagerService — load/multi-load, select, reorder, rotate, delete,
  duplicate, undo/redo, thumbnail and high-res render, single and split export.
- PdfRenderService, PdfService, CompressionService, PdfRepairService,
  PdfCompareService, PdfExtractorService, PdfPrivacyService, OcrService,
  QrBarcodeService, ImageService, DocumentScannerService, ConversionService.
- DocumentBridgeService for tool-to-tool hand-off, HistoryService for outputs,
  ToastService and AppErrorService for user-facing outcomes.
- StorageService.saveFile for every saved output — the free-tier daily quota is
  enforced there, so bypassing it bypasses monetization.

Hard constraints the test suite enforces:
- i18n: every user-visible string goes through the translate pipe, and a new tool
  id needs tools.<id>.title and tools.<id>.description in ALL FIVE dictionaries
  (en, hi, mr, bn, pa). src/app/core/i18n/i18n.spec.ts asserts full key parity.
- src/app/core/i18n/template-titles.spec.ts forbids literal title="..." in
  templates and [title] bound to a bare string — use the pipe.
- Icons are inline SVG in src/app/shared/components/ui/icon/icon.registry.ts
  (24x24 grid, currentColor). ion-icon's runtime sprite fetch fails offline, so a
  new icon must be added to that registry.
- Unit tests: `npm run test:unit` (vitest run --dir src). A bare `vitest run`
  collects the Playwright e2e specs and fails.
- Lint: `npm run lint` only works on the nvm Node (v24.21.0). On the wrong Node
  the Angular CLI aborts with exit 0 and fakes a pass — check the version first.

UX requirements:
- Long jobs: progress callback, cancellable, chunked page-by-page so the UI stays
  responsive on a mid-range Android device.
- Dark mode and responsive layout. Size controls from the fluid control scale in
  src/theme/variables.scss rather than fixed pixels, keep every tap target at or
  above --min-touch-target (44px) on a phone, and give any row that overflows the
  appAutoScroll treatment or let it wrap — it must never clip. Part R is the
  prompt set for the shell itself.
- Never silently produce a lossy or partial result: report what changed and what
  could not be done.
- Presets and profiles are named by dimensions and sizes, never by exam board or
  institution name.
- Claim nothing the code cannot prove. No "compliant", "verified", "certified" or
  "unbreakable" in any UI string.
```

---

## Part A — Page organizing

Extends `PdfPageManagerService` and the organizer screen. A1 and A2 first; the
rest are independent.

### A1 — Page-order expressions
**Depends on:** nothing · **Effort:** S

```text
Add page-order expressions to PdfPageManagerService as a new method, leaving the
existing reorder methods untouched.

Build:
- Parse and apply: "1,3,2,4-6" (explicit order), "2n-1" and "2n" (odd/even
  arithmetic), "reverse", and combinations.
- Validate before applying and show a live preview of the resulting page order.
- An invalid expression explains what is wrong and where — never just "invalid".
- Applying it is one undoable operation in the existing undo/redo stack.

Acceptance:
- Vitest per expression form against a 6-page fixture, including out-of-range and
  duplicate-page cases.
- Preview matches the applied result exactly.
```

### A2 — One-tap arrangement modes
**Depends on:** A1 (shares the reorder path) · **Effort:** M

```text
Add four one-tap arrangement modes to the organizer.

Build:
- Reverse: last page first.
- Odd-Even Split: all odd pages, then all even pages.
- Odd-Even Merge: the inverse — interleave the first half with the second half.
- Duplex Sort: the document is all fronts in order followed by all backs (often
  in reverse). Interleave to true reading order, with a toggle for whether the
  backs are reversed.
- Each is one undoable operation, with a preview before applying.

Engine: a pure index-permutation function per mode, then the existing reorder path.

Acceptance:
- Vitest on each permutation for even and odd page counts.
- Duplex Sort on a 6-page fixture (1,3,5 then 6,4,2) yields 1..6.
```

### A3 — Blank page detection & removal
**Depends on:** nothing · **Effort:** M

```text
New BlankPageService plus a screen action in the organizer.

Build:
- Render each page at ~0.2 scale, compute the non-white pixel ratio, and
  cross-check whether the text layer is empty.
- An adjustable sensitivity threshold with a live count of what would be removed.
- Removal ALWAYS also emits a review PDF containing the removed pages, so a
  faint-but-real page is recoverable.
- Show thumbnails of the candidates before removal, individually deselectable.

Acceptance:
- Vitest: a faint-text fixture must NOT be flagged at default sensitivity; a truly
  empty page must be; a scanned page with speckle noise must not be.
- Progress and cancel work on a 100-page document.
```

### A4 — Duplicate page finder
**Depends on:** nothing · **Effort:** M

```text
New DuplicatePageService plus an organizer action.

Build:
- dHash (difference hash) of a downscaled render, plus a normalized text hash for
  exact matches.
- Group exact duplicates and near-duplicates separately, with a Hamming-distance
  threshold the user can adjust.
- Side-by-side confirm step per group before anything is removed; keep-first is
  the default.

Acceptance:
- Vitest: a duplicated page is grouped; a visually similar but different page is
  not grouped at default threshold; grouping is order-independent.
```

### A5 — Auto-rotate upright
**Depends on:** nothing · **Effort:** M

```text
New PageOrientationService plus an organizer action.

Build:
- Detect each page's text orientation from pdfjs text-item transforms.
- Fall back to tesseract.js orientation detection for pages with no text layer.
- Apply the correction through the existing rotatePages path.
- Emit a per-page report: what was rotated, by how much, at what confidence.
- Group low-confidence and near-blank pages for MANUAL review instead of rotating
  them — a wrong silent rotation is worse than no rotation.

Acceptance:
- Vitest on the angle-decision function for 0/90/180/270 fixtures.
- A blank page lands in the manual-review group, not the rotated set.
```

### A6 — Mirror / flip pages
**Depends on:** nothing · **Effort:** S

```text
Add horizontal and vertical page flipping.

Build:
- Flip the selected pages or the whole document.
- Preserve vector content via a content-stream transform rather than rasterizing.
- One undoable operation; a preview of page 1 before applying.

Acceptance:
- Vitest asserting the transform matrix per direction.
- Text in the output is still selectable (not rasterized).
```

### A7 — Selection helpers
**Depends on:** A3 and A4 for two of the predicates · **Effort:** S

```text
Extend the organizer's existing selection helpers (odd, even, range, invert, all).

Build:
- Add: select blank, select duplicates, select landscape, select portrait, select
  by page size (group pages by their dimensions and pick a group).
- Blank and duplicate reuse BlankPageService and DuplicatePageService.
- Each helper shows how many pages it matched before it changes the selection.

Acceptance:
- Vitest per predicate on a mixed fixture (portrait + landscape + A4 + Letter).
- The existing selection helpers behave exactly as before.
```

### A8 — Multi-document tray
**Depends on:** nothing · **Effort:** M

```text
Expose the multi-document capability that already exists but no screen uses:
PdfPageManagerService.loadMultipleDocuments.

Build:
- Let the organizer hold pages from several PDFs on one canvas.
- A per-page source badge (file name, colour-coded by source document).
- Export as one merged document, or split back out by source.
- The single-document organizer flow is unchanged when only one file is loaded.

Acceptance:
- Vitest: pages from three documents keep correct sourceDocId and sourcePageIndex
  through reorder, rotate and export.
- Loading one file behaves identically to today.
```

---

## Part B — Splitting

Each prompt is a new split method registered alongside the four that ship
(`extract`, `every-n`, `after-selected`, `individual`). None of those change.

### B1 — Split by output file size
**Depends on:** nothing · **Effort:** M

```text
Add a 'max-size' split mode: every output part under a user-set ceiling.

Build:
- Binary-search the chunk boundary: add pages, serialize, measure, adjust. Same
  loop shape as the existing target-KB compressor.
- Ceiling input in KB or MB, with common presets.
- When a single page alone exceeds the ceiling, say so by page number and offer a
  hand-off to the compressor rather than failing the whole job.
- Progress reports parts completed, not pages.

Acceptance:
- Vitest: every part of a split fixture is under the ceiling; the oversized-single-
  page case reports instead of looping.
```

### B2 — Split by document count
**Depends on:** nothing · **Effort:** S

```text
Add a 'doc-count' split mode: divide into exactly N files.

Build:
- Pages distributed as evenly as possible, remainder to the earliest parts.
- Validate N against the page count with a clear message when N is too large.

Acceptance:
- Vitest: 10 pages into 3 files gives 4/3/3; N equal to the page count gives
  single-page files; N greater than the page count is rejected with a reason.
```

### B3 — Split by bookmarks / chapters
**Depends on:** E1 is NOT required — reading the outline is enough · **Effort:** M

```text
Add a 'chapters' split mode driven by the document outline.

Build:
- Read the outline with pdfjs getOutline() and resolve each destination to a page
  index via getDestination/getPageIndex.
- Let the user choose which outline level to split at.
- Name each output from its bookmark title, sanitized for the filesystem.
- When the document has no outline, say so and point at the organizer's other
  split modes — do not show an empty screen.

Acceptance:
- Vitest: boundaries match the resolved destinations on an outlined fixture; a
  document with no outline reports cleanly.
```

### B4 — Split at blank pages or divider sheets
**Depends on:** A3 (blank detection) · **Effort:** M

```text
Add a 'divider' split mode for batch-scanned stacks.

Build:
- Split at detected blank pages (reuse BlankPageService), or at pages carrying a
  QR/barcode divider (reuse QrBarcodeService as a page classifier).
- The divider page itself is dropped from the output.
- Optionally name each output from the divider's decoded payload.
- A preview listing detected boundaries before splitting.

Acceptance:
- Vitest: a 9-page fixture with dividers at 4 and 7 yields three documents without
  the divider pages; naming from payload works.
```

### B5 — Split by text pattern
**Depends on:** nothing · **Effort:** M

```text
Add a 'text-pattern' split mode.

Build:
- Extract per-page text with pdfjs getTextContent().
- Start a new document whenever a regex match (optionally restricted to a page
  region, e.g. the top 20%) changes value.
- Name each output from the captured text.
- Show the detected value per page in a preview table before splitting.

Acceptance:
- Vitest: a fixture with an invoice number changing on pages 1/4/7 yields three
  documents named from the captures; no match anywhere reports instead of
  producing one giant file silently.
```

### B6 — Spread split & page sectioning
**Depends on:** nothing · **Effort:** M

```text
Add page sectioning: cut each page into a grid.

Build:
- Rows x columns, with presets for halves (A3 spread -> 2x A4) and quarters.
- Automatic gutter detection for book scans: find the vertical whitespace valley
  near the centre and cut there rather than at exactly 50%.
- Output order configurable (left-to-right, top-to-bottom).

Engine: copy the page R*C times and set a different setCropBox on each copy —
setCropBox is already used in the export pipeline, follow that precedent.

Acceptance:
- Vitest: an A3 landscape page becomes two A4 portrait pages with correct crop
  boxes; gutter detection picks the whitespace valley, not the midpoint, on a
  fixture with an off-centre gutter.
```

### B7 — Poster tiling
**Depends on:** B6 (same crop-box technique) · **Effort:** M

```text
Add poster tiling: slice an oversized page into printable tiles.

Build:
- Target paper size (A4, Letter), configurable overlap in mm, optional crop marks
  and tile numbering.
- Show the tile grid over a preview before exporting.
- Report the resulting sheet count up front.

Acceptance:
- Vitest: an A1 page at A4 with 5mm overlap produces the expected tile count and
  each tile's crop box overlaps its neighbour by the set amount.
```

---

## Part C — Combining

> **Status — built, not yet released.** C1–C5 ship as the Combine Studio
> (`/features/pdf/combine`, with `/interleave` and `/insert` route modes) and
> C6 as Overlay & Underlay (`/features/pdf/overlay`). Engines:
> `pdf-combine.service.ts`, `pdf-merge-preflight.service.ts`,
> `pdf-overlay.service.ts`. The organizer's own merge is untouched and is still
> the quick path. Nothing here is in the store listing or `APP_FEATURES.md`.

### C1 — Alternate & Mix (interleave)
**Depends on:** nothing · **Effort:** S

```text
New combine mode: interleave pages from two or more documents.

Build:
- Take one page from each document in turn until all are exhausted; documents of
  unequal length append their remainder.
- A reverse toggle per document — the front/back phone-scanning case.
- Preview the resulting order before export.

Acceptance:
- Vitest: 3-page A and 3-page B give A1,B1,A2,B2,A3,B3; with B reversed give
  A1,B3,A2,B2,A3,B1; unequal lengths append correctly.
```

### C2 — Insert pages
**Depends on:** nothing · **Effort:** S

```text
New action: insert content at an exact position without rebuilding in the organizer.

Build:
- Insert another PDF, an image, or N blank pages, before or after a chosen page.
- Blank pages match the neighbouring page's size by default, with an override.
- Images are fitted using the existing images-to-PDF sizing logic.

Acceptance:
- Vitest: page count and order after inserting at the start, middle and end;
  inserted blanks match the neighbour's dimensions.
```

### C3 — Merge: page subsets and sorting
**Depends on:** nothing · **Effort:** S

```text
Extend the merge screen. Existing merge behaviour is the default when these are
left alone.

Build:
- Per-file page subsets: take "1-3" from file A and all of file B, entered per row.
- Sort the file list by name, date modified or size, ascending or descending.
- Show the total output page count as the selection changes.

Acceptance:
- Vitest: subsets are respected and ordered correctly; sorting is stable; merging
  with no subsets and no sort produces today's exact output.
```

### C4 — Merge: bookmarks, TOC, cover & separators
**Depends on:** C3 · **Effort:** M

```text
Add navigation and structure options to merge.

Build:
- Generate a bookmark per source file, named after the file, pointing at its first
  page. (Writing an outline needs low-level pdf-lib dictionary work — see E1 if
  that lands first and share the code.)
- Optionally generate a table-of-contents page listing sources and page numbers.
- Optional cover page (from a file or generated with a title) and separator sheets
  between sources.
- All four default to OFF.

Acceptance:
- Vitest: generated outline reopens through pdfjs with the right titles and page
  targets; TOC page numbers match the actual merged positions.
```

### C5 — Merge: form fields and signatures
**Depends on:** C3 · **Effort:** M

```text
Handle the two things that silently break when merging.

Build:
- Detect duplicate AcroForm field names across sources before merging. Offer:
  rename with a per-file suffix, flatten the fields, or cancel. Never merge two
  same-named fields into one silently.
- Detect existing digital signatures and warn that merging invalidates them.
  Offer strip-then-merge or cancel — never produce a quietly invalid signature.
- Both checks run as a pre-merge report; a clean document skips straight through.

Acceptance:
- Vitest: colliding field names are detected and renaming produces unique names
  with values preserved; a signed fixture triggers the warning.
```

### C6 — Overlay / underlay PDF
**Depends on:** D0 · **Effort:** M

```text
New tool at /features/pdf/overlay: lay one or more PDFs over or under a base
document. Letterhead, pre-printed forms, watermark sheets, stamp pages.

Build:
- Page mapping modes: sequential (use overlay pages in order, then the next
  overlay), interleaved (one page from each in turn), fixed-repeat (N pages from
  each, user-entered).
- Position: foreground or background. Per-overlay opacity and scale-to-fit.
- Presets for letterhead, pre-printed form and watermark sheet.
- Preview page 1 of the composite before export.

Acceptance:
- Vitest on the page-mapping function for each mode, including overlays shorter
  than the base.
- Output opens correctly in the in-app pdfjs reader.
```

---

## Part D — Page geometry

> **Status — built, not yet released.** D0 is
> `src/app/core/utilities/pdf-draw-page.util.ts`; D1–D6 are
> `pdf-layout.service.ts` and D7 is `pdf-tone.service.ts`, all behind the Page
> Size & Layout Studio (`/features/pdf/layout`, one route per mode). Nothing
> here is in the store listing or `APP_FEATURES.md`.

**D0 first** — every other prompt in this part uses its helper.

### D0 — Shared draw-page helper
**Depends on:** nothing · **Effort:** S

```text
Build the helper the rest of Part D and C6 need. pdf-lib's embedPage/drawPage are
not used anywhere in this repo yet.

Build:
- A small utility: draw a source page onto a target page with a given scale,
  rotation, offset and clip, using pdfDoc.embedPage() and page.drawPage().
- Handle pages whose MediaBox origin is not (0,0) and pages with existing /Rotate.
- Unit-tested on its own, with no UI.

Acceptance:
- Vitest: a page drawn at 50% into a quadrant lands at the expected coordinates;
  a page with /Rotate 90 and a non-zero origin renders upright and in place.
```

### D1 — Normalize page size & scale
**Depends on:** D0 · **Effort:** M

```text
New Page Size & Layout Studio at /features/pdf/layout, starting with normalization.

Build:
- Target size A0-A6, Letter, Legal, or keep-original; scale factor; portrait or
  landscape; centering.
- Flag documents with mixed page sizes when they load and offer this as the fix.
- Preview page 1 before export.

Acceptance:
- Vitest: output page dimensions match the target exactly; content is centred and
  scaled without distortion; keep-original is a no-op.
```

### D2 — Crop / trim margins
**Depends on:** D1 (same screen) · **Effort:** M

```text
Add cropping to the Layout Studio.

Build:
- Drag a crop region on a live preview; apply to one page, a range, or all pages.
- Auto-crop whitespace: detect the content bounding box per page and trim to it,
  with a configurable padding.
- Uniform mode (one crop box for every page) vs per-page mode.

Engine: setCropBox — already used in the export pipeline.

Acceptance:
- Vitest: auto-crop finds the content box on a fixture with known margins; a
  crop applied to all pages leaves page count unchanged and text selectable.
```

### D3 — Add margins & padding
**Depends on:** D0 · **Effort:** S

```text
Add the inverse of cropping: grow the page and inset the content.

Build:
- Margins in mm or pt, per edge or uniform, for binding or annotation space.
- Optionally grow to the next standard paper size instead of by a measurement.

Acceptance:
- Vitest: output dimensions equal original plus margins; content position shifts
  by exactly the inset.
```

### D4 — N-up multi-page layout
**Depends on:** D0 · **Effort:** M

```text
Add N-up to the Layout Studio.

Build:
- 2, 4, 6 and 9 pages per sheet; row-major or column-major order; borders and
  gutters; target sheet size and orientation.
- Report the resulting sheet count before exporting.

Acceptance:
- Vitest: 9 pages at 4-up gives 3 sheets with the last partially filled; cell
  positions and scale match the grid.
```

### D5 — Booklet imposition
**Depends on:** D4 · **Effort:** M

```text
Add saddle-stitch booklet imposition.

Build:
- Reorder and lay out two pages per sheet side so that printing double-sided and
  folding reads in order.
- Pad to a multiple of 4 with blank pages.
- Optional creep/shift compensation for thick booklets, and a short printing note
  in the UI (duplex, flip on short edge).

Acceptance:
- Vitest: a 6-page document pads to 8 and imposes as 8,1,2,7,6,3,4,5.
```

### D6 — Single long page
**Depends on:** D0 · **Effort:** S

```text
Stack every page into one tall page, for scroll reading and chat sharing.

Build:
- Vertical stacking with an optional gap and a width cap (scale all pages to the
  narrowest or widest).
- Enforce the PDF 14,400-unit page limit: warn and offer splitting into several
  long pages BEFORE exporting, rather than letting the user discover it.

Acceptance:
- Vitest: output is one page of the summed height; the 14,400 limit is enforced
  and the split-into-N fallback produces valid pages.
```

### D7 — Tone passes
**Depends on:** nothing · **Effort:** S

```text
Add grayscale, invert and high-contrast rendering of a whole PDF.

Build:
- Grayscale, invert (dark-mode copy), and a high-contrast preset.
- Warn clearly that these rasterize the page and text will no longer be
  selectable, with the resulting file size shown before export.
- Offer the DPI choice from F1 if that has landed.

Acceptance:
- Vitest: pixel checks on a rendered fixture per mode.
- The warning appears before any output is produced.
```

---

## Part E — Navigation & numbering

### E1 — Bookmarks & outline editor
**Depends on:** nothing (B3 and C4 benefit from it) · **Effort:** L

```text
New tool at /features/pdf/bookmarks. This is the low-level dictionary work in this
part — budget it accordingly.

Build:
- Read the existing outline with pdfjs getOutline().
- Add, rename, nest, reorder and delete entries in a tree UI.
- Write back a correct /Outlines tree built from PDFDict / PDFName /
  context.register: /First, /Last, /Count (negative for collapsed), /Parent,
  /Prev, /Next and /Dest all consistent.
- Auto-generate an outline from detected headings (font-size heuristic), or from
  OCR output when there is no text layer.

Acceptance:
- Vitest asserting the written object graph, including negative /Count.
- Round-trip: write an outline, reopen with pdfjs, get the same tree.
- The output opens in a strict third-party viewer without repair prompts.
```

### E2 — Page labels
**Depends on:** nothing · **Effort:** M

```text
Add logical page labels, distinct from physical page order.

Build:
- Write the /PageLabels number tree: decimal, lowercase roman, uppercase roman,
  letters; per-range prefix; restart-at-N.
- A range editor UI ("pages 1-4: i,ii,iii,iv; pages 5-end: 1,2,3...").
- Show the resulting label beside each page number in the preview.
- No high-level pdf-lib API exists — build it from PDFDict/PDFName/context.register.

Acceptance:
- Vitest on the written number tree, including multiple ranges and a restart.
- pdfjs reports the expected labels after a round-trip.
```

### E3 — Bates numbering
**Depends on:** nothing · **Effort:** S

```text
Extend the existing Header & Footer Studio. Its current behaviour is unchanged.

Build:
- Zero-padded numbering to a fixed width, with prefix and suffix.
- A counter that runs CONTINUOUSLY across a batch of files rather than restarting
  per document, with a visible starting number and a preview of the first and last
  stamp.

Acceptance:
- Vitest: a 3-file batch of 4/3/5 pages starting at 1 ends at 012 with width 3.
- Existing header/footer specs pass unchanged.
```

---

## Part F — Size & output control

Extends `CompressionService` and `PdfService.compressPdfToExactKB`. The three
existing presets and the target-KB behaviour stay exactly as they are.

### F1 — DPI ceiling & downsample report
**Depends on:** nothing · **Effort:** M

```text
Add explicit image-resolution control to compression.

Build:
- A DPI ceiling choice: 72, 96, 150, 200, 300, or no limit (today's behaviour,
  the default).
- Downsample embedded images above the ceiling, leaving vector content alone.
- A per-image report: page, original DPI and pixel size, new DPI, bytes saved.

Acceptance:
- Vitest: an image at 600 DPI is halved at a 300 ceiling; vector text is byte-
  identical in the output; no-limit produces today's exact result.
```

### F2 — Grayscale & mono compression paths
**Depends on:** F1 · **Effort:** M

```text
Add the two biggest size wins for scanned documents, as opt-in paths.

Build:
- Grayscale conversion, and 1-bit mono (adaptive threshold) for text-only scans.
- Both OFF by default.
- Detect whether the document has a real text layer and warn explicitly that these
  paths rasterize the page and lose vector sharpness — gate behind a "this is a
  scan" confirmation when a text layer is present.
- Show the predicted size before committing.

Acceptance:
- Vitest: a colour scan fixture shrinks substantially in both modes; the warning
  fires on a digital-text fixture.
```

### F3 — Identical-image dedupe
**Depends on:** nothing · **Effort:** L

```text
Reference each repeated image once instead of embedding it per page. Low-level
pdf-lib work.

Build:
- Hash image XObject streams, find duplicates, rewrite resource references to a
  single object, drop the orphans.
- Report how many duplicates were collapsed and the bytes saved.
- Verify page-by-page that rendering is unchanged before saving — if any page
  renders differently, abort and report rather than shipping a broken file.

Acceptance:
- Vitest: a fixture with the same logo on 10 pages ends with one image object and
  renders identically; a document with no duplicates is a no-op.
```

### F4 — Before/after proof view
**Depends on:** nothing · **Effort:** S

```text
Show the user what compression actually cost them.

Build:
- Side-by-side render of the same page at the same zoom, before and after.
- KB delta and percentage, plus a per-page worst-case indicator.
- An explicit flag when text was rasterized.

Acceptance:
- Vitest on the size-delta and worst-page maths.
- Rendering both versions of a 50-page document stays responsive.
```

### F5 — "Fit the upload limit" chain
**Depends on:** F1, F2 · **Effort:** M

```text
One action that gets a file under a hard ceiling, with each step visible.

Build:
- Chain, stopping as soon as the target is met: strip metadata -> downsample to a
  DPI ceiling -> grayscale -> mono.
- If still over, offer the size-based split from B1 rather than degrading further.
- Show every step taken, what it saved, and what it cost in quality.
- Never silently exceed the quality trade-off the user agreed to.

Acceptance:
- Vitest: a fixture reaches the target at the earliest sufficient step and stops;
  an unreachable target reports honestly instead of looping.
```

### F6 — Structure optimizer & Fast-Web-View pass
**Depends on:** nothing · **Effort:** L

```text
A lossless size-and-speed pass. Separate from compression, which is lossy.

Build:
- Drop orphaned and unreferenced objects, rewrite with object streams, dedupe
  repeated fonts, order pages for faster first-page render.
- Report the byte saving.
- LABEL IT "Optimize structure". Do NOT print "Fast Web View" or "linearized" as a
  guarantee: pdf-lib has no linearizing writer, so this is approximate. Say
  "optimized for faster first-page loading" and nothing stronger.

Acceptance:
- Vitest: output renders identically page-by-page to the input; object count drops
  on a fixture with orphans; no UI string claims linearization.
```

---

## Part G — Integrity & verification

### G1 — Document fingerprint & integrity receipt
**Depends on:** nothing · **Effort:** M

```text
New tool at /features/pdf/fingerprint.

Build:
- SHA-256 of the whole file via WebCrypto, plus a per-page content hash.
- Save a receipt (file name, size, page count, hashes, timestamp) locally.
- Verify a file against a saved receipt and report page-level drift: which pages
  changed, which were added or removed.
- Export the receipt as .txt and as a stamped PDF.

Acceptance:
- Vitest: identical bytes produce identical hashes across runs; a one-page edit is
  detected and localized to that page; a re-save that changes only metadata is
  reported as such.
```

### G2 — Studio health strip & byte audit
**Depends on:** nothing (G4 enriches it) · **Effort:** M

```text
Extend the PDF Studio page with an at-a-glance health strip, fed by
PdfRepairService.diagnosePdf plus new checks.

Build:
- Show: encryption state, PDF version, linearized flag, fonts embedded vs
  referenced, mixed page sizes, JavaScript present, attachments present,
  scanned-vs-digital verdict, searchable-text coverage percentage.
- Byte audit: which pages and which embedded images carry the file size, as a
  sorted list, so the user picks the right compression path.
- Each row links to the tool that addresses it.

Acceptance:
- Vitest per check against a fixture that trips it and one that does not.
- The existing Studio layout and launchpad behaviour are unchanged.
```

### G3 — Preflight & submission check
**Depends on:** G2 · **Effort:** L

```text
New tool at /features/pdf/preflight. Model it on the existing
DocumentValidatorService, which does this for photos and signatures.

Build:
- Rules: max file size, page count range, page size uniformity, orientation
  uniformity, minimum image DPI, fonts embedded, no encryption, no JavaScript, no
  attachments, searchable text present, no blank pages.
- Each rule: pass/fail/warn, the measured value, and the threshold.
- A one-tap fix per failed rule that calls the existing engine (compress,
  organize, sanitize, flatten), then re-runs the check.
- Save and reuse rule profiles; export/import as JSON.
- Profiles named by their numbers, never by an institution.

Acceptance:
- Vitest: every rule tested against a passing and a failing fixture; a fix
  actually flips its rule to pass on re-check.
```

### G4 — Embedded object inspector
**Depends on:** nothing · **Effort:** M

```text
New tool at /features/pdf/inspect: show exactly what is inside the file. The
Privacy Sanitizer removes in bulk; this one shows first.

Build:
- List embedded files and attachments, with extract and delete per item.
- Show embedded JavaScript via pdfjs getJSActions(), plus /OpenAction and
  launch/URI actions, with the code visible.
- Read-only by default; deletion is an explicit, confirmed action.
- Never execute anything found in the document.

Acceptance:
- Vitest: JS detection on a fixture with an /OpenAction script; attachment
  extraction round-trip; a clean document reports clean.
```

### G5 — Signature status panel
**Depends on:** nothing · **Effort:** M

```text
Report on existing signatures in a document. Report-only.

Build:
- List signature fields: signer name, claimed signing time, reason, location.
- Whether the signed /ByteRange covers the whole file.
- Whether the document was modified after signing (incremental updates past the
  signed range).
- STATE IN THE UI that certificate-chain trust cannot be validated offline. Report
  structure and coverage; never render a trust verdict, a green tick, or the word
  "valid".

Acceptance:
- Vitest: byte-range coverage maths on a signed fixture and on one with an
  appended update.
- Grep the UI strings: no "valid", "verified" or "trusted" anywhere in this panel.
```

### G6 — Archival conversion (PDF/A-2b, best effort)
**Depends on:** G2 · **Effort:** L

```text
Best-effort archival conversion plus an honest readiness report.

Build:
- Embed fonts, set an sRGB output intent, write conforming XMP metadata, strip
  JavaScript, encryption and disallowed transparency.
- A readiness report: ready / not ready, and the specific reason per item.
- NO COMPLIANCE BADGE. Full PDF/A conformance checking is a veraPDF-class job that
  cannot be done here. The UI says "prepared for archiving — not independently
  validated" and never "PDF/A compliant".

Acceptance:
- Vitest: fonts are embedded in the output; JS and encryption are gone; the report
  flags a document that cannot be made ready and says why.
- Grep: no UI string asserts PDF/A compliance.
```

### G7 — Selective flatten & flatten report
**Depends on:** nothing · **Effort:** S

```text
Extend the existing Flatten tool. Its current all-in behaviour stays the default.

Build:
- Choose what to flatten: forms only, annotations only, or everything.
- A report of what was baked and what could not be, by type and page.
- Never a silent partial result.

Acceptance:
- Vitest: forms-only leaves annotations interactive and vice versa; the report
  lists an un-flattenable item on a fixture that has one.
- Existing flatten specs pass unchanged.
```

### G8 — Compare: word-level diff & ignore options
**Depends on:** nothing · **Effort:** M

```text
Extend PdfCompareService. Its existing side-by-side and text diff stay as they are.

Build:
- Word-level inline diff within changed lines, not just line-level.
- Ignore options: whitespace, case, and header/footer zones (a top/bottom band
  excluded from comparison).
- Each option defaults OFF so today's results are reproduced.

Acceptance:
- Vitest: word-level tokens on a single-word change; ignore-whitespace suppresses
  a reflow-only difference; header-zone exclusion suppresses a page-number
  difference.
- Existing compare specs pass unchanged.
```

### G9 — Compare: metadata diff & PDF report export
**Depends on:** G8 · **Effort:** M

```text
Compare the things that are not page text, and make the result sendable.

Build:
- Metadata and geometry diff: page count, per-page sizes, fonts used, producer,
  creation and modification dates.
- Export the whole comparison as a PDF report with per-page change markers and a
  summary table, so it can be sent to someone who was not at the screen.

Acceptance:
- Vitest: a fixture pair differing only in page size is reported; the exported
  report's page count and summary match the on-screen result.
```

### G10 — Repair: salvage, triage & log
**Depends on:** nothing · **Effort:** M

```text
Extend PdfRepairService. Existing diagnose and repair behaviour is unchanged.

Build:
- Object-stream and truncated-stream salvage, with a per-page raster fallback when
  vector recovery fails.
- Distinguish ENCRYPTED from DAMAGED and route an encrypted file to the unlock
  tool instead of reporting corruption.
- Export the recovery log as a text file.

Acceptance:
- Vitest: a truncated fixture recovers readable pages; an encrypted fixture is
  reported as encrypted, not corrupt; the log lists per-page strategies.
- Existing repair specs pass unchanged.
```

---

## Part H — Scanner & capture

Extends `DocumentScannerService`. The five existing `EnhancementPreset` filters
(`original`, `document`, `grayscale`, `bw`, `high_contrast`) keep working exactly
as they do; every new processing step defaults OFF.

### H1 — Capture modes: book spread & ID card
**Depends on:** B6 shares the gutter logic · **Effort:** M

```text
Add a ScanMode type. 'document' is the default and must behave identically to
today when nothing else is chosen.

Build:
- 'book': capture a two-page spread, detect the gutter, split into two pages.
  Share the gutter-detection function with B6 if that has landed.
- 'id_card': capture front, then back, then lay both out on one page at true card
  proportions with a labelled gap.
- Mode picker in the camera UI, remembered per session.

Acceptance:
- Vitest: gutter detection on a synthetic spread; ID-card layout produces one page
  with two correctly proportioned placements.
- Document mode output is byte-identical to today's for a fixture image.
```

### H2 — Capture modes: whiteboard, photo & table
**Depends on:** H1 · **Effort:** M

```text
Add three more capture modes.

Build:
- 'whiteboard': glare suppression plus colour-ink preservation (do not threshold
  coloured marker strokes to black).
- 'photo': minimal processing, no thresholding, full colour.
- 'table': capture, then hand off to the table-OCR path (O5) when available;
  until then, hand off to the existing table extraction.

Acceptance:
- Vitest: whiteboard mode preserves hue on a coloured-stroke fixture; photo mode
  leaves pixels effectively unaltered.
```

### H3 — Auto-capture & batch scanning
**Depends on:** H4 (uses the blur score) · **Effort:** M

```text
Remove the tap-per-page friction.

Build:
- Auto-capture: fire when the detected quad is stable for N frames, fills a
  minimum share of the frame, and passes the blur gate. Manual shutter stays
  available and unchanged.
- Batch mode: stay in the camera after each capture with a page counter and a
  filmstrip; review everything at the end rather than between pages.
- A visible countdown or stability indicator so the shutter is never a surprise.

Acceptance:
- Vitest on the stability/coverage decision function with synthetic quad sequences.
- 20 consecutive captures stay responsive on a mid-range Android device.
```

### H4 — Blur gate
**Depends on:** nothing · **Effort:** S

```text
Stop a blurred capture becoming page 7 of a 20-page PDF.

Build:
- Variance-of-Laplacian sharpness score per capture.
- Prompt a retake above a configurable threshold, with an override to keep it.
- Show the score in the review filmstrip so a user can spot the weak page.

Acceptance:
- Vitest: a sharp fixture scores above a blurred one; the threshold decision is
  stable across image sizes.
```

### H5 — Shadow & glare removal
**Depends on:** nothing · **Effort:** M

```text
The most common complaint about phone scans. OFF by default.

Build:
- Local adaptive illumination normalization across the page (block-wise
  background estimation, then division), rather than the current global threshold.
- Preserve ink density while flattening the lighting gradient.
- Before/after toggle in the review screen.

Acceptance:
- Vitest: a synthetic gradient-lit fixture flattens to near-uniform background;
  an already-even page stays within tolerance of unchanged.
```

### H6 — Finger & edge removal
**Depends on:** H5 · **Effort:** L

```text
Detect a hand holding the page down and remove it.

Build:
- Detect skin-tone plus edge intrusion across the page boundary.
- Inpaint from surrounding paper, or crop inward when inpainting would be visible.
- ALWAYS show before/after and let the user decline — a bad inpaint is worse than
  a visible thumb.

Acceptance:
- Vitest on the detection function against fixtures with and without an intrusion.
- A false positive on a dark page corner is not silently inpainted.
```

### H7 — Book curvature dewarping
**Depends on:** H1 · **Effort:** L

```text
Straighten curved text on bound-book captures.

Build:
- Detect text baselines, fit the curvature, resample to straighten.
- Offer it only when curvature is actually detected; never run it on a flat page.
- Before/after preview, declinable.

Acceptance:
- Vitest: baseline-fit error drops on a synthetically warped fixture; a flat page
  is detected as flat and skipped.
```

### H8 — Auto-naming from content
**Depends on:** nothing · **Effort:** S

```text
Name the output from what the document says.

Build:
- OCR the top region of page 1 and propose a filename from the most title-like
  line (largest text, shortest line, nearest the top).
- PROPOSAL ONLY — show it in an editable field; never rename without the user
  seeing it.
- Sanitize for the filesystem; fall back to today's naming when nothing is found.

Acceptance:
- Vitest: title extraction on a fixture with a clear heading; graceful fallback on
  a blank page; filesystem-unsafe characters removed.
```

---

## Part I — Image tools

Extends `ImageService`, the photo tools and the batch suite. Existing exact-KB,
dimension, crop and EXIF-strip behaviour is unchanged.

### I1 — ID photo studio: detection & crop
**Depends on:** nothing · **Effort:** M

```text
New tool at /features/photo/id-photo. Build detection and cropping first; I2 adds
background and sheets.

Build:
- Face detection via the FaceDetector API where available, with a manual guide
  overlay as the fallback — the fallback is the primary path, not an afterthought.
- Auto-crop to a head-and-shoulders ratio with a configurable head-height
  percentage and eye-line position.
- Output in exact mm or px plus a KB target, reusing the existing exact-KB
  compressor rather than a new one.
- Presets named by their dimensions and KB only. Never by an institution.

Acceptance:
- Vitest: head-height and eye-line maths against known face boxes; exact-KB output
  within tolerance at passport dimensions.
- The manual path produces the same geometry as the detected path given the same
  box.
```

### I2 — ID photo studio: background & print sheet
**Depends on:** I1 · **Effort:** M

```text
Finish the ID photo tool.

Build:
- Background replacement to plain white or light blue for a plain-background
  portrait.
- On a cluttered background, REFUSE and say why rather than producing a torn
  matte. Do not add a segmentation model here — if a true subject matte is wanted,
  raise it as its own decision with the model size and cold-start cost stated.
- Print sheet: N copies tiled on 4x6 or A4 with cut marks and a configurable gap.

Acceptance:
- Vitest: sheet layout produces the expected copy count and positions; the
  cluttered-background case reports instead of outputting.
```

### I3 — Face & plate blur
**Depends on:** nothing · **Effort:** S

```text
Hide private details in an image.

Build:
- Blur or pixelate detected faces, or any user-drawn region (plates, addresses,
  signatures).
- Intensity control; irreversible on export, with that stated before applying.
- Works on a single image and across a batch.

Acceptance:
- Vitest: the region's pixel variance drops below a threshold after blurring;
  pixels outside the region are untouched.
```

### I4 — Document background cutout
**Depends on:** nothing · **Effort:** M

```text
Transparent-background cutout for documents and signatures, not people.

Build:
- Edge detection plus thresholding on a plain background; output transparent PNG.
- Feather and tolerance controls.
- Share the luminosity logic the Signature & Ink Processor already uses rather
  than writing a second implementation.
- No segmentation model in this prompt.

Acceptance:
- Vitest: a signature on off-white paper becomes transparent-background with ink
  preserved; a cluttered photo is reported as unsuitable.
```

### I5 — Upscale & enhance
**Depends on:** nothing · **Effort:** S

```text
Make a low-resolution scan readable. No ML model.

Build:
- Bicubic upscale at 2x and 4x, followed by unsharp masking.
- Side-by-side preview at 100%.
- State plainly that this sharpens, it does not recover detail that was never
  captured.
- If ML super-resolution is wanted later, raise it separately with the model size
  and cold-start cost stated.

Acceptance:
- Vitest: output dimensions are exact multiples; edge contrast increases measurably
  on a text fixture.
```

### I6 — Format reach
**Depends on:** nothing · **Effort:** M

```text
Accept and produce the formats phones and portals actually use.

Build:
- Input: HEIC/HEIF (what iPhones and newer Androids produce), AVIF, BMP,
  multi-page TIFF, SVG rasterization.
- Output: multi-page TIFF alongside the existing JPEG/PNG/WebP.
- PROBE support at runtime and hide what the runtime cannot do, rather than
  failing at export. Report honestly which formats needed a decoder dependency
  and what it costs in bundle size — HEIC on Android Chrome is the likely gap.

Acceptance:
- Vitest: a probe matrix test; multi-page TIFF round-trip page count.
- An unsupported format is hidden, not offered-then-failed.
```

### I7 — Image metadata viewer & date repair
**Depends on:** nothing · **Effort:** S

```text
The app can already strip EXIF; let the user see and fix it. exifr is already a
dependency, so reading is nearly free.

Build:
- Show EXIF, GPS, camera and capture dates for one image or a batch.
- Edit or batch-shift capture dates (the wrong-camera-clock case).
- The existing strip-on-export behaviour is unchanged and stays the default
  everywhere it already applies.

Acceptance:
- Vitest: date shift round-trip; GPS display; strip-on-export still removes
  everything it removes today.
```

### I8 — Image watermarking
**Depends on:** nothing · **Effort:** S

```text
Build:
- Text or logo watermark: opacity, rotation, position, scale, tiling.
- Single image and batch, with one preview before applying to the batch.
- Saved watermark presets.

Acceptance:
- Vitest: placement maths per position; tiling covers the canvas; opacity is
  applied.
```

### I9 — Photo sheet layout
**Depends on:** nothing · **Effort:** S

```text
Build:
- N images per A4 or 4x6 sheet, configurable rows/columns, gutters and cut marks.
- Mixed sizes handled by fitting within cells without distortion.
- Export as image or PDF (reuse the images-to-PDF path for the PDF case).

Acceptance:
- Vitest: cell positions and count for 2x2, 3x3 and 2x3 layouts; aspect ratios
  preserved.
```

### I10 — Batch image suite additions
**Depends on:** I7 for the date tokens · **Effort:** M

```text
Extend the batch suite. Existing bulk compress, resize, convert and rename
templates keep their behaviour and defaults.

Build:
- Per-file KB targets as an alternative to one uniform ceiling.
- EXIF-date rename tokens ({yyyy}, {mm}, {dd}) alongside the existing prefix,
  suffix and counter tokens.
- Auto-rotate from EXIF orientation.
- One-PDF-per-file vs one combined PDF on export.
- Skip-if-already-under-target, reported per file rather than silently re-encoding.

Acceptance:
- Vitest: token expansion including dates; skip logic leaves a compliant file
  byte-identical; existing rename templates produce identical names to today.
```

---

## Part J — Conversion

All 15 registered converters keep their ids, options and output. New converters
are added to `ConversionRegistryService` through the existing `Converter`
interface; none are modified.

### J1 — PDF → Markdown
**Depends on:** nothing · **Effort:** M

```text
New converter id 'pdf-to-markdown'.

Build:
- Headings from font-size hierarchy, paragraphs, bullet and numbered lists, tables
  as pipe tables, links preserved, images extracted to a sidecar folder or inlined
  as base64 (user choice).
- Reuse PdfExtractorService, which already yields text with positions and detected
  tables — this is a serialization layer, not a new extractor.

Acceptance:
- Vitest on a fixture: heading levels correct, table pipe count matches columns,
  list markers preserved, link syntax valid.
```

### J2 — PDF → HTML
**Depends on:** J1 · **Effort:** M

```text
New converter id 'pdf-to-html'.

Build:
- One self-contained .html file with images embedded as data URIs and CSS inline.
- Two modes: layout-preserving (absolute positioning) and reflowable (semantic
  flow). Reflowable is the default for phone reading.
- No external requests in the output file — it must open offline.

Acceptance:
- Vitest: output parses as valid HTML, contains no http(s) references, and page
  text appears in document order in reflowable mode.
```

### J3 — PDF → EPUB
**Depends on:** J2 · **Effort:** M

```text
New converter id 'pdf-to-epub'.

Build:
- Valid EPUB 3 zip: mimetype first and uncompressed, container.xml, OPF with a
  spine, nav document, one XHTML file per chapter or page group.
- Chapter breaks from the outline when present, otherwise per page group.
- Images included and referenced correctly.

Acceptance:
- Vitest: the zip structure is valid (mimetype first, uncompressed), the spine
  lists every document, and the nav resolves.
```

### J4 — Markdown / JSON / XML / YAML → PDF
**Depends on:** nothing · **Effort:** M

```text
New converter ids 'markdown-to-pdf', 'json-to-pdf', 'xml-to-pdf', 'yaml-to-pdf'.

Build:
- Markdown: headings, lists, tables, code blocks, emphasis, links.
- JSON/XML/YAML: pretty-printed monospace with indentation guides and optional
  syntax colouring; handle a large file by paginating, not by truncating.
- Same page-size, margin and font options as the shipped text-to-pdf converter.

Acceptance:
- Vitest per format on a fixture: page count, heading rendering, and that a
  malformed input reports a parse error rather than producing a garbled PDF.
```

### J5 — Email → PDF
**Depends on:** nothing · **Effort:** M

```text
New converter ids 'eml-to-pdf' and 'msg-to-pdf'.

Build:
- Render headers (from, to, cc, subject, date) as a block, then the body
  (HTML body preferred, plain-text fallback).
- Append attachments: images inline, PDFs merged, others listed with name and size.
- Inline images referenced by cid: resolved from the message parts.
- No network fetches for remote images — show a placeholder and note it.

Acceptance:
- Vitest: an .eml fixture with an inline image and two attachments produces the
  expected page count; remote images are not fetched.
```

### J6 — Images → Word / Excel
**Depends on:** O5 for the table path · **Effort:** M

```text
New converter ids 'images-to-word' and 'images-to-excel'.

Build:
- images-to-word: OCR each image and write the text into a .docx via the existing
  docx dependency, with the source image optionally embedded above its text.
- images-to-excel: OCR detected tables and write them into .xlsx sheets, one sheet
  per image.
- Reuse OcrService; do not create a second OCR path.

Acceptance:
- Vitest: a text-photo fixture yields a .docx with the recognized paragraphs; a
  table-photo fixture yields the expected row and column counts.
```

### J7 — PDF ↔ multi-page TIFF
**Depends on:** I6 (TIFF support) · **Effort:** M

```text
New converter ids 'pdf-to-tiff' and 'tiff-to-pdf'. Still mandatory on a surprising
number of government and legal upload portals.

Build:
- pdf-to-tiff: render pages at a chosen DPI into one multi-page TIFF, with a
  compression choice (none, LZW, CCITT G4 for bilevel).
- tiff-to-pdf: each TIFF page becomes a PDF page, preserving dimensions.

Acceptance:
- Vitest: page count round-trips; G4 output is bilevel; dimensions survive both
  directions.
```

### J8 — SVG ↔ PDF
**Depends on:** nothing · **Effort:** M

```text
New converter ids 'svg-to-pdf' and 'pdf-to-svg'.

Build:
- svg-to-pdf: render vector-preserved where possible, with a documented fallback
  to raster for filters and effects that cannot be represented.
- pdf-to-svg: one SVG per page, with embedded fonts or converted outlines.
- Report which elements were rasterized rather than silently flattening.

Acceptance:
- Vitest: a simple SVG stays vector in the PDF (no image XObject); a filtered SVG
  is reported as rasterized.
```

### J9 — PDF → structured JSON
**Depends on:** J1 · **Effort:** S

```text
New converter id 'pdf-to-json', for developer and LLM pipelines.

Build:
- Per page: text items with positions and font info, detected tables as arrays,
  links, annotations, and document metadata.
- A documented, stable schema, versioned in the output.
- Pretty and compact output options.

Acceptance:
- Vitest: output validates against the declared schema; positions match pdfjs text
  items; the schema version is present.
```

### J10 — Conversion fidelity controls & report
**Depends on:** J1-J9 benefit, but it can land first · **Effort:** L

```text
Worth more than an eleventh format: make every converter honest about what it did.
Add as OPTIONAL options whose defaults reproduce each converter's current output
exactly.

Build:
- Shared options across converters: layout-preserving vs reflowable text mode;
  table detection on/off; header and footer detection and suppression; hyperlink
  and bookmark preservation; a font substitution map; Indic and RTL shaping
  verification.
- A ConversionReport returned with every result: what was approximated, what was
  dropped, which fonts were substituted, how many tables were detected, which
  pages needed rasterizing.
- Surface the report in the converter page as an expandable panel, and include it
  in batch logs.

Acceptance:
- Vitest: every existing converter returns an identical output file with default
  options; the report correctly lists a substituted font and a dropped element on
  purpose-built fixtures.
- conversion.spec.ts passes unchanged.
```

### J11 — Batch PDF tool additions
**Depends on:** nothing · **Effort:** M

```text
Extend the batch PDF tools. The existing compress, image-archive, watermark and
header/footer batch operations keep their behaviour.

Build:
- Add: batch OCR, batch convert-to-Word, batch protect, batch unprotect, batch
  metadata strip, batch rename-from-content.
- A mixed-input queue with per-file status (queued, running, done, failed-with-
  reason) and a CSV result log.
- Quota: each saved output goes through StorageService.saveFile, so show the total
  free-tier cost BEFORE the run and stop cleanly at the limit, reporting what was
  and was not processed.

Acceptance:
- Vitest: a 3-file batch where the middle file fails still processes the third and
  logs the failure; the quota stop is clean and reports accurately.
```

---

## Part K — Editor

Extends the editor's 15 existing tools, the command stack and the export pipeline.
Nothing existing changes; new editor commands are added.

### K1 — Find & replace
**Depends on:** nothing · **Effort:** M

```text
Build:
- Search across the document, with a match list and jump-to-match.
- Replace one, replace all, case-sensitive and whole-word options.
- Include form field values in the search.
- Replacement uses the same font-matching path as K6 if that has landed; until
  then, replacement is limited to form fields and editor-added text, and the UI
  says so.

Acceptance:
- Vitest: hit counts and positions on a fixture; replace-all leaves no matches;
  form field values are found and replaced.
```

### K2 — Link editor
**Depends on:** nothing · **Effort:** M

```text
Build:
- Add, edit and delete hyperlinks: external URL and jump-to-page destinations.
- A panel listing every link in the document with its target and page, for review.
- Flag links whose target page no longer exists after page operations.
- Write /Annots link annotations with correct /Rect and /A or /Dest.

Acceptance:
- Vitest: a created link round-trips through pdfjs with the right target; a
  dangling internal link is flagged.
```

### K3 — Comment & review threads
**Depends on:** nothing · **Effort:** M

```text
Extend the existing sticky-note tool into a review workflow.

Build:
- Replies under a note, resolve/unresolve state, author name and initials.
- A comment panel listing all threads with page jump.
- Export a comment summary as PDF and CSV (page, author, date, text, state).
- Written as standard /Popup and /Text annotations with /IRT reply chains so other
  viewers see them.

Acceptance:
- Vitest: reply chains round-trip through pdfjs; the summary export row count
  matches the thread count.
- The existing note tool behaves as before when no reply is added.
```

### K4 — Editor image tools
**Depends on:** nothing · **Effort:** M

```text
Build:
- Insert an image (already possible), plus replace, delete, crop and mask an
  EXISTING page image.
- Whiteout: cover an arbitrary region with an opaque rectangle matched to the page
  background.
- Make clear in the UI that whiteout covers rather than removes — for actual
  removal, point at redaction (N4).

Acceptance:
- Vitest: replacing an image leaves the page's other content untouched; whiteout
  does not remove underlying text (and the UI says so).
```

### K5 — Shape recognition & measurement
**Depends on:** nothing · **Effort:** M

```text
Build:
- Pen shape recognition, opt-in: snap a drawn stroke to a clean rectangle, circle,
  line or arrow when it is close enough; keep the raw stroke otherwise.
- Measurement tool: distance and area against a user-set scale (e.g. 1cm = 1m),
  with the calibration shown and editable, and results as text annotations.

Acceptance:
- Vitest: snapping decisions on synthetic stroke inputs, including a deliberately
  ambiguous stroke that must stay freehand; distance maths against a known scale.
```

### K6 — Edit existing text
**Depends on:** nothing · **Effort:** L

```text
The biggest single gap against Sejda and Acrobat. SCOPE IT HONESTLY.

Build:
- Select a text run, edit it in place, re-embed with the matched font and size.
- In scope: same-font, same-size, single-line edits.
- Out of scope, and say so in the UI: paragraph reflow, multi-column, justified
  text re-spacing.
- When the embedded subset font lacks a glyph the new text needs, fall back to
  whiteout-and-retype and TELL THE USER that is what happened — do not silently
  substitute a different font.
- New editor commands; the existing text tool is untouched.

Acceptance:
- Vitest: a single-word edit preserves font, size and position; a glyph-missing
  case triggers the documented fallback and reports it.
- Output text remains selectable and searchable.
```

### K7 — Annotation flatten & overlay export
**Depends on:** C6 for the overlay pairing · **Effort:** S

```text
Build:
- Flatten annotations only, leaving form fields interactive (complements G7).
- Export the annotation layer alone as a transparent overlay PDF, which pairs with
  the overlay tool in C6.

Acceptance:
- Vitest: the overlay PDF has the same page count and geometry as the source and
  contains only annotation content; flatten-annotations-only leaves fields fillable.
```

---

## Part L — Reader

### L1 — Text search with highlighting
**Depends on:** nothing · **Effort:** M

```text
Build:
- Search the open document, highlight hits on the rendered page, list results with
  page numbers and surrounding context, and step between them.
- Match count and current position indicator.
- Search runs incrementally across pages so a long document is usable immediately.

Acceptance:
- Vitest: hit counts and page attribution on a fixture; highlight rectangles align
  with pdfjs text item positions at several zoom levels.
```

### L2 — Reading modes
**Depends on:** nothing · **Effort:** S

```text
Build:
- Night mode (inverted, with images left alone), sepia, and normal.
- Two-page spread, and continuous vs paged scrolling.
- Remembered per document; the existing default view is unchanged for documents
  with no stored preference.

Acceptance:
- Vitest on the preference persistence; a document with no stored preference opens
  exactly as today.
```

### L3 — Text reflow
**Depends on:** L1 · **Effort:** M

```text
Make a desktop-sized PDF readable on a phone.

Build:
- Reflow extracted text into a single readable column at the device width, with
  adjustable font size.
- Images placed inline in reading order.
- State clearly that this is a reading view, not the document's real layout, and
  keep one tap back to the true rendering.

Acceptance:
- Vitest: reading order matches the extracted text order on a two-column fixture;
  the toggle back to true layout is lossless.
```

### L4 — Bookmarks sidebar & last-read position
**Depends on:** E1 shares the outline model · **Effort:** S

```text
Build:
- A bookmarks sidebar from the document outline, with nesting and jump-to.
- Last-read position stored per document and restored on reopen, with a "start
  from beginning" option.
- Documents with no outline show the existing thumbnail strip instead of an empty
  panel.

Acceptance:
- Vitest: outline rendering for a nested fixture; position restore across a
  simulated reopen.
```

### L5 — Read-aloud
**Depends on:** nothing · **Effort:** S

```text
Build:
- Read the page text aloud using the Web Speech API with platform voices — no
  model, no network.
- Play, pause, speed, voice selection, and sentence highlighting as it reads.
- Continue across pages; stop on navigation away.
- Hide the feature when the runtime exposes no voices, rather than failing on tap.

Acceptance:
- Vitest on the sentence-segmentation and highlight-index logic.
- Absent speech synthesis, the control is not shown.
```

### L6 — Thumbnail scrubbing
**Depends on:** nothing · **Effort:** S

```text
Build:
- Drag along a thumbnail strip or scrollbar to preview and jump within a long
  document.
- Lazy thumbnail rendering via the page manager's existing renderThumbnailsLazy,
  with a placeholder until each is ready.

Acceptance:
- Vitest: lazy window calculation requests only visible thumbnails.
- A 500-page document scrubs without blocking the UI.
```

---

## Part M — Forms & signatures

The AcroForm fill-and-flatten flow and the drawn-signature burn-in keep working
exactly as they do. **M6 last, and only if it validates.** Every feature in this
part is strictly 100% on-device, fully responsive, and optimized for mobile
touchscreens on Android/Play Store (min 44px tap targets, thumb-zone action bars,
bottom sheets with dynamic viewport height, and offline persistence).

### M1 — Form builder (create fields)
**Depends on:** nothing · **Effort:** L
**Target Route:** `/features/pdf/forms/build` (`src/app/features/forms-build/`)
**Target Services:** `PdfFormBuilderService` (`src/app/core/services/pdf-form-builder.service.ts`), extending `PdfFormService`
**Target Models:** `src/app/core/models/pdf-forms.types.ts`
**Tool Catalogue ID:** `form-builder` (Category: `forms`)

```text
Build a mobile-first, visual interactive PDF Form Builder screen at /features/pdf/forms/build.
Allows users to create, position, configure, and save interactive AcroForm fields on any PDF document.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement PdfFormBuilderService in src/app/core/services/pdf-form-builder.service.ts.
- Support 7 field types using pdf-lib's PDFForm API:
  1. Text field: form.createTextField(name), with default text, multiline toggle, max length, font size.
  2. Checkbox: form.createCheckBox(name), checked/unchecked default state.
  3. Radio group: form.createRadioGroup(name), add options with addOptionToPage(opt, page, coords).
  4. Dropdown: form.createDropdown(name), set options list, select default value.
  5. Option list (listbox): form.createOptionList(name), multiselect support.
  6. Date field: specialized formatted text field with ISO date format mask and native date-picker input.
  7. Signature field: form.createSignature(name) creating an interactive digital signature widget placeholder.
- Coordinate System Mapping:
  - Translate mobile touch/canvas coordinates (CSS pixels from top-left) into PDF Points (72 DPI, bottom-left origin), accounting for page scale, DPR, and rotation (0, 90, 180, 270 degrees).
- Properties per field:
  - id, name (unique identifier), label (user visible), isRequired, isReadOnly, maxLength, defaultValue, tooltip, tabOrder index.
- Non-Destructive Form Generation:
  - Load original PDF bytes without stripping existing form fields or text.
  - Append new fields into the document's AcroForm tree (/AcroForm dictionary).
  - Ensure standard font resources (/Helv, /ZaDb) are registered in the AcroForm default resources (/DR).
  - Export output bytes through StorageService.saveFile for daily quota tracking.
- Compatibility Contract:
  - Documents exported by this builder MUST load, display, and fill cleanly in the existing PdfFormService fill-and-flatten path.

Mobile Play Store UI / UX Requirements:
- Mobile Canvas Viewport:
  - Full mobile screen layout using 100dvh to eliminate vertical jumping when mobile browser/system bars toggle.
  - PDF page rendered via pdfjs-dist on an HTML5 canvas with pinch-to-zoom (1.0x to 3.0x) and two-finger panning.
  - Visual field bounding boxes overlaid on top of the canvas with clear dashed boundaries and field-type badges.
  - Touch selection: Tapping an existing field selects it, displaying 4 corner resize handles. All drag/resize touch handles have a minimum hit target of 44x44px (--min-touch-target: 44px).
  - Drag-and-drop placement: Long-press and drag a field to reposition. Emits haptic tick on pickup and drop via @capacitor/haptics.
- Bottom Thumb-Zone Tool Rail:
  - Pinned horizontally scrolling carousel at the bottom of the screen displaying large touch cards for each field type: [Text] [Checkbox] [Radio] [Dropdown] [List] [Date] [Signature].
  - 1-tap on a tool enters "Placement Mode": the next tap on the PDF canvas drops the selected field at that exact location.
- Bottom Sheet Field Inspector:
  - When a field is selected, a slide-up bottom sheet drawer opens (breakpoints [0, 0.45, 0.85] using dvh) allowing one-handed thumb editing of: Field Name, Label, Required (switch), Read-only (switch), Default Value, Max Length, and Tab Order.
  - Virtual keyboard handling: The bottom sheet adjusts smoothly with window.visualViewport or dvh so keyboard never obscures active input fields.
- Sticky Bottom Action Bar:
  - Sticky bottom action bar within env(safe-area-inset-bottom) with two thumb buttons: "Preview Form" (interactive test fill) and "Save Form PDF".
- i18n & Icons:
  - Register tool in TOOL_CATALOGUE with title and description across en, hi, mr, bn, pa.
  - Add inline SVG icon form-builder in icon.registry.ts. All UI labels use the translate pipe.

Acceptance:
- Vitest: Every created field type is verified to read back through pdfjs-dist with the expected field type, name, and flags; documents created pass through existing PdfFormService.fillAndFlatten without errors; coordinate transformation handles 90/180/270 rotated pages correctly.
- Mobile UI: Zero horizontal page overflow; all touch targets >=44px; bottom sheet opens/closes cleanly without keyboard overlap.
```

### M2 — Form data import & export (FDF, XFDF, CSV, JSON)
**Depends on:** M1 (works on all existing forms too) · **Effort:** M
**Target Route:** `/features/pdf/forms/data` (`src/app/features/forms-data/`)
**Target Services:** `PdfFormDataService` (`src/app/core/services/pdf-form-data.service.ts`)
**Tool Catalogue ID:** `form-data-transfer` (Category: `forms`)

```text
Build a comprehensive Form Data Transfer utility to export and import form field values
across standard industry formats (FDF, XFDF, CSV, JSON) 100% locally on-device.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement PdfFormDataService in src/app/core/services/pdf-form-data.service.ts.
- Export Form Data:
  1. FDF (Forms Data Format): Generate compliant ISO 32000-1 Annex B FDF syntax (%FDF-1.2 ... /Root << /FDF << /Fields [ << /T (fieldname) /V (fieldvalue) >> ... ] >> >>).
  2. XFDF (XML Forms Data Format): Generate Adobe-standard XML with <?xml version="1.0" encoding="UTF-8"?><xfdf xmlns="http://ns.adobe.com/xfdf/"><fields><field name="..."><value>...</value></field></fields></xfdf>.
  3. CSV: RFC 4180 format with header row (all field names) and a single row containing escaped string values, handling quotes, commas, and newlines.
  4. JSON: Schema-valid JSON object with field names as keys and structured objects containing { name, type, value, isChecked, selectedOption }.
- Import Form Data:
  - Parse incoming FDF, XFDF, CSV, and JSON text streams.
  - Case-insensitive field matching with fallback to fuzzy name matching.
  - Populate values into the loaded PDF via pdf-lib: text fields, checkboxes (check/uncheck), radio groups (select option), dropdowns (select item).
  - Validation & Audit Report: Return detailed import statistics (total fields, matched and updated count, unmatched fields list with name and value). Never silently swallow or drop unmatched values.
- File Export & Share:
  - Direct download or mobile share sheet integration using @capacitor/share and StorageService.saveFile.

Mobile Play Store UI / UX Requirements:
- Responsive Mobile Layout:
  - Top card summarizing loaded document: Document Name, Total Form Fields detected, Filled vs Blank count.
  - Segmented control pills at top of viewport: "Export Data" | "Import Data".
- Export View:
  - 4 format cards (JSON, CSV, XFDF, FDF) with clear format badges, file size estimate, and dual action buttons: "Copy to Clipboard" (with toast notice) and "Share / Save File" (triggers native Android share sheet).
- Import View:
  - Large dashed touch drop zone (min height 140px, tap to open file selector accepting .json, .csv, .xfdf, .fdf).
  - Instant Import Preview Bottom Sheet: Shows matched fields in green badges and unmatched fields in amber warning chips. User can toggle individual fields to include/exclude before applying.
  - Sticky bottom action bar with large thumb button "Apply Data to Form" with safe-area padding.
- i18n & Icons:
  - Full translations for all format names, success/warning dialogs in en, hi, mr, bn, pa.
  - Add inline SVG icon form-data in icon.registry.ts.

Acceptance:
- Vitest: Complete round-trip fidelity test: export document form data to XFDF, FDF, CSV, and JSON, import each back into a blank duplicate form, and assert that 100% of field values match exactly; malformed XML/JSON returns descriptive error without crashing; unmatched field names are explicitly reported in the audit result.
```

### M3 — Form mail-merge from CSV
**Depends on:** M2 · **Effort:** M
**Target Route:** `/features/pdf/forms/mail-merge` (`src/app/features/forms-mail-merge/`)
**Target Services:** `PdfMailMergeService` (`src/app/core/services/pdf-mail-merge.service.ts`)
**Tool Catalogue ID:** `form-mail-merge` (Category: `forms`)

```text
Build an on-device Batch Mail-Merge tool to automatically generate multiple personalized PDF
documents from a single PDF form template and a CSV data sheet.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement PdfMailMergeService in src/app/core/services/pdf-mail-merge.service.ts.
- CSV Ingestion:
  - Parse CSV on-device with streaming support; detect header row and column names.
  - Handle quotes, commas, escapes, and variable whitespace gracefully.
- Auto-Mapping Algorithm:
  - Compare CSV headers against PDF form field names.
  - Perform automatic auto-mapping using normalized lowercase and Levenshtein similarity (e.g. "Full Name" maps to "fullname" or "name").
  - Allow manual overrides via UI mapping controls.
- Batch Generation Execution:
  - Chunked page processing using setTimeout/yield every 2 records so the mobile UI remains 60fps responsive.
  - For each CSV row: Clone the PDF template bytes in memory, inject field values corresponding to mapped columns, optionally flatten form fields via form.flatten(), and produce output PDF bytes.
  - File Naming Template: Support tokenized output naming (e.g. "Invoice_{InvoiceNo}_{CustomerName}.pdf").
  - Quota Pre-Check: Calculate total documents to generate, check remaining daily free quota via StorageService.getQuotaStatus(), and alert user upfront if batch exceeds limit.
- Output Packaging:
  - Bundle all generated PDFs into a single downloadable .zip archive using jszip, or save sequentially to user's device via StorageService.saveFile.
  - Return detailed per-row result log (Row #, status, file name, error reason if failed).

Mobile Play Store UI / UX Requirements:
- 4-Step Mobile Wizard (Stepper):
  1. Template: Pick PDF form template (shows thumbnail and field count).
  2. Data: Pick CSV file (displays row count preview and sample of first 3 rows in a scrollable horizontal card).
  3. Mapping: Mobile card list showing each PDF form field on the left with a dropdown picker on the right to select the matching CSV column. Auto-mapped fields show a green "Auto-Matched" pill.
  4. Generation Settings: File naming pattern text input with dynamic token chips ({name}, {id}), "Flatten Output PDFs" toggle, and "Bundle as ZIP" toggle.
- Quota Preview Banner:
  - Displays "Will generate N documents. Remaining free daily saves: M." with warning if N > M.
- Progress Modal & Bottom Sheet:
  - Non-blocking circular progress indicator with percentage, current record counter ("Processing 14 of 50..."), and a prominent "Cancel Batch" button.
  - Post-generation summary sheet with "Download ZIP" and "Share Files" thumb buttons.
- i18n & Icons:
  - Full translations across 5 languages (en, hi, mr, bn, pa).
  - Add inline SVG icon mail-merge in icon.registry.ts.

Acceptance:
- Vitest: Fixture with 3-row CSV and a form template generates 3 valid PDFs with correct field values; row with missing columns is reported in error log and skipped without halting run; zip packaging contains all 3 files; quota check stops processing if limit is reached.
```

### M4 — Signature appearance templates & typed signatures
**Depends on:** nothing · **Effort:** S
**Target Route:** `/features/pdf/sign/templates` (`src/app/features/sign-templates/`)
**Target Services:** `PdfSignatureAppearanceService` (`src/app/core/services/pdf-signature-appearance.service.ts`), extending `PdfSignService`
**Target Models:** `src/app/core/models/signature-appearance.types.ts`
**Tool Catalogue ID:** `signature-templates` (Category: `signatures`)

```text
Extend the Signature Studio with customizable signature appearance templates, formal metadata
blocks, and typed signatures rendered in beautiful cursive calligraphy.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement PdfSignatureAppearanceService in src/app/core/services/pdf-signature-appearance.service.ts.
- Appearance Layout Engine:
  - Compose a composite signature stamp combining:
    1. Graphic: Hand-drawn signature, transparent uploaded signature, or typed calligraphy font.
    2. Signer Details: Full name, Title/Role, Organization.
    3. Metadata Block: Signing Reason (e.g. "I approve this document"), Location (e.g. "Mumbai, India"), Localized Timestamp with timezone offset (e.g. "2026-10-28 14:30:00 IST").
    4. Organization Logo: Optional small transparent PNG logo embedded beside or above the text.
    5. Initials Circular Badge: Auto-derived initials (e.g. "Abhijeet Choudhary" -> "AC", "Mohandas Karamchand Gandhi" -> "MKG") rendered in a sleek vector circle badge.
  - 3 Layout Presets:
    - Standard Horizontal: Signature image on left, metadata block on right.
    - Compact Stacked: Signature image on top, metadata below in smaller font.
    - Formal Seal: Bordered rectangular seal with initials badge and full details.
- Typed Signature Engine:
  - Pure client-side Canvas rendering supporting 5 distinct cursive font families (embedded SVG/WOFF2 paths): Caveat, Dancing Script, Alex Brush, Great Vibes, Sacramento.
  - Outputs transparent high-DPI (2x DPR) PNG data URL.
- Template Persistence:
  - Save user custom templates to @capacitor/preferences / IndexedDB for instant 1-tap reuse.

Mobile Play Store UI / UX Requirements:
- Signature Studio Redesign:
  - Top segmented control: [Draw] [Type] [Upload] [Templates].
- "Type" Tab:
  - Text input for user's name; displays a swipeable vertical or horizontal carousel of live cursive previews rendered in the 5 font styles.
  - Ink color selector: Black, Dark Blue, Royal Navy, Dark Red, Dark Green.
- "Templates" Tab & Configuration Sheet:
  - Bottom sheet drawer with live signature stamp preview card on white paper mockup.
  - Toggles for: Include Date/Time, Include Reason, Include Location, Include Logo, Include Initials Badge.
  - Input fields for Reason and Location with quick presets ("Approved", "Reviewed", "Authorized").
- Sticky Bottom Action Bar:
  - Pinned "Save Template" and "Use Signature on PDF" thumb buttons with safe-area bottom padding.
- i18n & Icons:
  - Full translations for all appearance fields and font names across en, hi, mr, bn, pa.
  - Inline SVG icon signature-template in icon.registry.ts.

Acceptance:
- Vitest: Composite appearance canvas renders each element at exact relative coordinates; initials derivation algorithm handles single names, hyphenated names, and titles (e.g. "Dr. Jane Doe" -> "JD"); typed signature generates valid transparent PNG data URL; template options round-trip through preferences.
```

### M5 — Multi-party signing order (on-device packet)
**Depends on:** M1 · **Effort:** M
**Target Route:** `/features/pdf/sign/packet` (`src/app/features/sign-packet/`)
**Target Services:** `PdfSigningPacketService` (`src/app/core/services/pdf-signing-packet.service.ts`)
**Target Models:** `src/app/core/models/signing-packet.types.ts`
**Tool Catalogue ID:** `signing-packet` (Category: `signatures`)

```text
Build an entirely local, on-device Multi-Party Signing Workflow engine that enables sequential
and parallel document signing without any cloud accounts, servers, or external subscriptions.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement PdfSigningPacketService in src/app/core/services/pdf-signing-packet.service.ts.
- Signer & Workflow Model:
  - Signer definition: { id: string, name: string, emailOrPhone: string, role: string, orderIndex: number, assignedFieldIds: string[], status: 'pending' | 'signed' | 'declined', signedAt?: string }.
  - Mode: Sequential (Signer 1 must complete before Signer 2) or Parallel (all signers can sign anytime).
- Tamper-Evident On-Device Packet (.pdf):
  - Embed a cryptographically verifiable JSON manifest (_signing_manifest.json) into the PDF as an embedded file attachment (/EmbeddedFiles) using pdf-lib.
  - Manifest includes: Document SHA-256 base hash, signers list, workflow rules, field mappings, and audit trail of completed signatures.
  - When a signer signs:
    1. Verify base document hash to ensure file was not corrupted or altered outside the flow.
    2. Burn in signature graphic / fill assigned form fields.
    3. Mark current signer as 'signed' with ISO timestamp.
    4. Lock completed fields as read-only.
    5. Update embedded manifest attachment with updated audit trail.
- Packet Distribution:
  - Zero cloud reliance: The signed PDF packet is distributed to the next party directly using Android's native share sheet (@capacitor/share) via WhatsApp, Email, Bluetooth, or Nearby Share.
- Packet Inspection:
  - When any PDF is opened in the app, detect if it contains a _signing_manifest.json attachment.
  - If present, launch the "Packet Signer View" showing outstanding signers and enabling the next party to sign immediately.

Mobile Play Store UI / UX Requirements:
- Packet Designer View:
  - Mobile Stepper Timeline: Visual vertical timeline showing signers in sequence with avatar badges (1, 2, 3), name, assigned fields count, and status chips (Pending, Signed, Current).
  - Drag-to-reorder signer cards using touch gestures with haptic vibration.
  - Bottom sheet to add/edit signer: Name input, contact info, and checkboxes to assign available signature/form fields on the document.
- Signer Execution Mode (When receiving a packet):
  - Clean top banner: "Signing Request for [User Name] - Step 2 of 3".
  - Jump directly to assigned signature fields with a floating "Next Field" thumb button.
  - Tapping a field opens Signature Studio (M4).
  - Sticky bottom action bar: "Complete & Share to Next Signer" (activates Android Share Sheet).
- i18n & Icons:
  - All workflow statuses translated across en, hi, mr, bn, pa.
  - Add inline SVG icon signing-packet in icon.registry.ts.

Acceptance:
- Vitest: Packet manifest correctly serializes and embeds as PDF attachment; tamper detection flags modified document bytes; sequential rules prevent Signer 2 from signing before Signer 1; outstanding-fields calculation accurately updates after partial signing pass.
```

### M6 — Certificate-based signing (PKCS#12)
**Depends on:** M4 (for visible appearance) · **Effort:** L
**Target Route:** `/features/pdf/sign/certificate` (`src/app/features/sign-certificate/`)
**Target Services:** `PdfCryptoSignService` (`src/app/core/services/pdf-crypto-sign.service.ts`)
**Tool Catalogue ID:** `crypto-sign` (Category: `signatures`)

```text
Build a standards-compliant, cryptographic PDF digital signature engine based on PKCS#12 (.p12 / .pfx)
certificates and PKCS#7 / CMS SignedData, executing 100% locally using WebCrypto.
BUILD THIS LAST AND ON ITS OWN. Never touch the drawn-signature path while doing it.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement PdfCryptoSignService in src/app/core/services/pdf-crypto-sign.service.ts.
- PKCS#12 Parsing & Decryption:
  - Ingest binary .p12/.pfx file.
  - Unlock using user password via WebCrypto PBKDF2 / SHA-1 / 3DES / AES-CBC key derivation.
  - Parse ASN.1 DER structure to extract private key (RSA-2048/4096) and X.509 certificate chain.
- Incremental Update & ByteRange Allocation:
  - Digital signatures must NEVER invalidate earlier revisions: write via PDF incremental update appended to the end of the file.
  - Allocate a signature dictionary object:
    << /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [ 0 ********** ********** ********** ] /Contents <0000...0000> /M (D:...) >>
  - Reserve exact byte placeholders for /ByteRange and /Contents (hex encoded CMS SignedData container, allocated to 8192 bytes).
- CMS / PKCS#7 SignedData Construction:
  - Calculate SHA-256 digest of the PDF file excluding the /Contents hex string (the exact byte ranges specified in /ByteRange).
  - Construct DER-encoded PKCS#7 SignedData (RFC 5652) containing:
    - SignerInfo with signer certificate.
    - AuthenticatedAttributes (contentType = data, signingTime, messageDigest).
    - Digital signature: RSA-SHA256 signature over the AuthenticatedAttributes using the imported private key via crypto.subtle.sign.
  - Splice the hex-encoded SignedData into the reserved /Contents placeholder.
- Visible Signature Stamp:
  - Optionally create a signature annotation widget displaying the visual appearance block from M4.
- Honesty Gate & Compliance:
  - Verify output PDF against PDF.js and standard PDF viewers.
  - If output fails cryptographic structure verification, ABORT export cleanly and explain why.
  - Strict UI honesty: Do NOT use misleading marketing words like "legally certified" or "government recognized". State clearly: "Cryptographically signed with user certificate".

Mobile Play Store UI / UX Requirements:
- Certificate Selection Card:
  - File picker button accepting .p12 and .pfx certificate files.
  - Secure password input with eye icon to toggle visibility and clear keypad button.
- Certificate Inspection Bottom Sheet:
  - Once unlocked, displays parsed X.509 details: Subject Common Name (CN), Organization, Issuer, Validity Dates, Expiration status chip (Valid in green, Expired in red).
- Signature Configuration:
  - Toggle "Include Visible Signature Stamp on Page" with page selector and drag-to-position preview.
  - Reason input (e.g. "I approve this document") and Location input.
- Sticky Bottom Action Bar:
  - Prominent "Sign with Digital Certificate" button within env(safe-area-inset-bottom).
  - Spinner modal during cryptographic hashing with progress percentage.
- i18n & Icons:
  - Full translations across en, hi, mr, bn, pa.
  - Inline SVG icon certificate-sign in icon.registry.ts.

Acceptance:
- Vitest: /ByteRange array correctly brackets the document file boundaries with zero byte overlaps; CMS SignedData parses successfully; document hash verification matches; wrong password gracefully reports decryption failure without crashing.
```

---

## Part N — Security & privacy

The existing RC4 Standard-128 path (V=2, R=3) stays, works unchanged, and stays
available labeled as "Legacy (maximum compatibility)". All features in this part
are 100% on-device, fully responsive, and follow mobile Play Store UX standards
(bottom sheets with dynamic viewport height, thumb-friendly sticky action bars,
min 44px touch targets, and zero network calls).

### N1 — AES-256 (R6) and AES-128 (R4) encryption
**Depends on:** nothing · **Effort:** L
**Target Route:** `/features/pdf/security/protect` (`src/app/features/security-protect/`)
**Target Services:** `PdfSecurityService` (`src/app/core/services/pdf-security.service.ts`)
**Target Models:** `src/app/core/models/pdf-security.types.ts`
**Tool Catalogue ID:** `pdf-protect` (Category: `security`)

```text
Upgrade PDF document encryption to industry-standard AES-256 (V=5, R=6) and AES-128 (V=4, R=4)
using WebCrypto, while strictly preserving the legacy RC4 path unchanged.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement AES encryption in src/app/core/services/pdf-security.service.ts.
- Algorithm 2.B (Hardened ISO 32000-2 / PDF 2.0 AES-256 R6):
  - User and Owner password authentication using SHA-256, SHA-384, and SHA-512 with 32-byte salt and 64-byte validation keys.
  - Compute /U, /O, /UE, /OE, and /Perms entries adhering to ISO 32000-1 / ISO 32000-2 specifications.
  - Encrypt stream data and strings using WebCrypto SubtleCrypto.encrypt({ name: 'AES-CBC', iv }, fileKey, data).
  - Include 16-byte random Initialization Vector (IV) prepended to each encrypted stream/string.
- Algorithm 2.A (AES-128 R4):
  - Support V=4, R=4 with 128-bit file encryption key using AES-CBC.
- Legacy RC4 Preservation:
  - Existing RC4 Standard-128 (V=2, R=3) path MUST remain available as selectable option "Legacy (maximum compatibility)" with unchanged byte output.
- Granular Permissions Bitmask:
  - Unified permission flags: Allow Printing (High Res / Low Res), Allow Content Copying, Allow Document Assembly, Allow Form Filling, Allow Annotation.
  - Save output through StorageService.saveFile to track daily quota.

Mobile Play Store UI / UX Requirements:
- Modern Mobile Security Dashboard:
  - Top card displaying loaded file name, page count, and current protection status.
  - Encryption Standard Selector: Mobile segmented pill bar with 3 options:
    [AES-256 (Recommended)] [AES-128] [Legacy RC4 (Max Compatibility)].
  - Password Input Cards:
    - User Password (required to open document).
    - Owner / Permissions Password (optional, unlocks restriction editing).
    - Eye toggle to reveal passwords; integrated with Password Strength Meter (N2).
- Permissions Checklist (Thumb-friendly switch cards):
  - Touch-friendly toggle rows with >=44px height for: Printing, Copying Text, Editing Forms, Adding Notes.
- Sticky Bottom Action Bar:
  - Fixed action bar with safe-area padding containing large thumb button "Encrypt & Save PDF".
- i18n & Icons:
  - Full translations for all cryptographic terms and permissions across en, hi, mr, bn, pa.
  - Inline SVG icon shield-lock in icon.registry.ts.

Acceptance:
- Vitest: AES-256 R6 key derivation validates against official ISO test vectors; encrypted PDFs successfully open and decrypt in pdfjs-dist; permissions bitmask enforces restrictions; legacy RC4 output is byte-identical to previous implementation; files with both User and Owner passwords decrypt correctly with either password.
```

### N2 — Password strength meter & owner-password warning
**Depends on:** nothing · **Effort:** S
**Target Component:** `src/app/shared/components/password-strength-meter/`
**Target Services:** `PasswordEvaluationService` (`src/app/core/services/password-evaluation.service.ts`)

```text
Build a real-time, actionable Password Strength Meter and Passphrase Generator component
with clear warnings regarding Owner vs User password mechanics.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement PasswordEvaluationService in src/app/core/services/password-evaluation.service.ts.
- Password Entropy Scoring:
  - Calculate information entropy in bits: E = L * log2(R), factoring length L and pool size R (lowercase, uppercase, numbers, symbols).
  - Deduct score penalties for repeated characters, sequential runs ("12345", "abcdef"), and common keyboard patterns ("qwerty").
  - Fast client-side dictionary match against embedded list of top 1,000 most common passwords.
  - Return score (0 to 100), label (Very Weak, Weak, Fair, Strong, Excellent), and actionable improvement suggestions.
- Cryptographically Secure Passphrase Generator:
  - Uses crypto.getRandomValues to pick 4 random words from a built-in curated dictionary of 1,500 clear words separated by hyphens (e.g. "correct-horse-battery-staple") yielding ~52 bits of entropy.
- Owner Password Mechanics Warning:
  - When user leaves Owner Password blank, detect that owner password falls back to user password.
  - Present an educational, non-alarming notice explaining: "When only one password is set, anyone who can open the file can also change permissions."

Mobile Play Store UI / UX Requirements:
- Visual Fluid Progress Bar:
  - Animated multi-segment strength bar with fluid color transition (Red -> Amber -> Blue -> Emerald Green).
- Actionable Checklist Pills:
  - Horizontal chip row checking off criteria: [8+ chars] [Mixed case] [Numbers] [Symbols].
- One-Tap Passphrase Generator Button:
  - Compact button with dice icon: "Generate Strong Passphrase" with haptic vibration tick on generation. Tapping automatically fills input and copies to clipboard.
- Educational Bottom Sheet / Accordion:
  - Expandable tip card: "Understanding PDF Passwords" explaining User vs Owner passwords in simple words.
- i18n & Accessibility:
  - Full translations in en, hi, mr, bn, pa; ARIA live region reading strength updates to screen readers.

Acceptance:
- Vitest: Scoring accurately flags "password123" as Weak and random 16-char strings as Excellent; dictionary matches trigger immediate penalty; passphrase generator produces unique 4-word strings using secure random values; fallback warning triggers exactly when only User password is entered.
```

### N3 — Batch protect / unprotect
**Depends on:** N1 · **Effort:** S
**Target Route:** `/features/pdf/security/batch` (`src/app/features/security-batch/`)
**Target Services:** `PdfBatchSecurityService` (`src/app/core/services/pdf-batch-security.service.ts`)
**Tool Catalogue ID:** `batch-security` (Category: `security`)

```text
Build a high-performance Batch Security screen to encrypt multiple PDFs with shared passwords/permissions
or remove protection from multiple locked documents in a single pass.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement PdfBatchSecurityService in src/app/core/services/pdf-batch-security.service.ts.
- Batch Protect:
  - Ingest multiple PDF files.
  - Apply configured password and permission settings across all files using PdfSecurityService (AES-256 or AES-128).
  - Chunked execution to prevent freezing mobile UI thread.
- Batch Unprotect:
  - Accept master password (or attempt per-file password entry).
  - Decrypt and re-save files without encryption.
- Resilient Error Handling:
  - If one file fails (e.g. corrupted PDF or wrong password), log the error and continue processing the remaining documents. Never abort the entire batch.
  - Quota integration: Check total documents against daily free quota before starting; pause cleanly at quota limit.
- Packaging & Export:
  - Export as ZIP or save individually via StorageService.saveFile.

Mobile Play Store UI / UX Requirements:
- Multi-File Queue Card List:
  - Scrollable list of loaded documents with thumbnail, file name, size, and current status pill (Ready, Encrypted, Unlocked, Failed).
- Batch Mode Tabs:
  - Segmented pills: "Batch Protect" | "Batch Unlock".
- Processing Sheet:
  - Modal with overall progress bar ("Processing 3 of 10..."), live file status icons, and "Cancel" button.
- Summary Bottom Sheet:
  - Displays Success count, Failure count, and a 1-tap "Save All Files" thumb button.
- i18n & Icons:
  - Full translations across 5 languages (en, hi, mr, bn, pa).
  - Inline SVG icon batch-shield in icon.registry.ts.

Acceptance:
- Vitest: Mixed batch of 4 files where 1 file has invalid password completes the other 3 files successfully; results log accurately identifies the failed file; unprotecting an encrypted file produces an unencrypted readable PDF.
```

### N4 — Verified redaction
**Depends on:** nothing · **Effort:** M
**Target Route:** `/features/pdf/security/redact-verify` (`src/app/features/redact-verify/`)
**Target Services:** `PdfRedactionVerificationService` (`src/app/core/services/pdf-redaction-verification.service.ts`)
**Tool Catalogue ID:** `redact-verify` (Category: `security`)

```text
Build a post-redaction verification and audit engine that proves sensitive data has been
permanently purged from PDF content streams, offering rasterization fallbacks when vector removal is unprovable.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement PdfRedactionVerificationService in src/app/core/services/pdf-redaction-verification.service.ts.
- Dual-Pass Forensic Verification:
  1. Text Extraction Pass: Load redacted output PDF via pdfjs-dist, extract full text layer from each page, and search for the redacted text strings. If found anywhere in text items, mark as FAILED (unpurged).
  2. Content Stream Syntax Audit: Parse page /Contents streams using pdf-lib; check for text showing operators (Tj, TJ, ', ") containing target substrings within the redaction bounding coordinates.
- Provable vs Unprovable Reporting:
  - Per redaction: Report status as "Verified Purged" (proven vector removal) or "Unverified / Residual Vector Risk".
- Region Rasterization Fallback:
  - When vector removal cannot be mathematically proven (e.g. complex font encodings, clipping paths, Type3 fonts), provide a "Rasterize Redacted Region" option:
  - Renders the exact bounding box at 300 DPI to an off-screen canvas, strips vector objects under that box, and embeds the flattened rasterized image patch back onto the page.
  - Explicit UI note: "Rasterizing converts text in this region into an image, making it non-selectable."
- Claim Integrity:
  - Never display "Permanently Removed" in the UI unless verification passes 100%.

Mobile Play Store UI / UX Requirements:
- Verification Audit Card:
  - Prominent status header with shield badge: "Redaction Integrity Audit".
  - List of redacted areas with page number, redacted text snippet (masked with dots), and status badge (Green check: "Verified Scrubbed", Amber alert: "Vector Residual Risk").
- One-Tap Remediation:
  - Amber items display a direct button: "Rasterize Region to Guarantee Privacy".
- Zoomable Comparison Preview:
  - Mobile split-view or tap-to-zoom card comparing original vs redacted output.
- Sticky Bottom Action Bar:
  - "Approve & Save Verified PDF" thumb button with safe-area padding.
- i18n & Icons:
  - Translations across en, hi, mr, bn, pa.
  - Inline SVG icon verified-stamp in icon.registry.ts.

Acceptance:
- Vitest: Deliberate mock failure (black rectangle overlaid over text without deleting stream operators) is correctly flagged as FAILED; cleanly sanitized text stream is flagged as VERIFIED; rasterize fallback removes selectable text from target bounding box while preserving adjacent text.
```

### N5 — Search-and-redact by pattern
**Depends on:** N4 · **Effort:** M
**Target Route:** `/features/pdf/security/search-redact` (`src/app/features/search-redact/`)
**Target Services:** `PdfSearchRedactService` (`src/app/core/services/pdf-search-redact.service.ts`)
**Tool Catalogue ID:** `search-redact` (Category: `security`)

```text
Build an automated pattern-based search and bulk redaction engine with an interactive mobile review screen.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement PdfSearchRedactService in src/app/core/services/pdf-search-redact.service.ts.
- Built-in Sensitive Data Pattern Presets:
  1. Email Addresses: [a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}
  2. Phone Numbers: Global E.164 and Indian 10-digit mobile (?:(?:\+|0{0,2})91[\s-]?)?[6789]\d{9}
  3. Credit Card Numbers: Luhn-validated 13-19 digit card patterns.
  4. Indian Aadhaar Numbers: \b\d{4}[\s-]\d{4}[\s-]\d{4}\b
  5. Indian PAN Numbers: [A-Z]{5}[0-9]{4}[A-Z]{1}
  6. Dates: \b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b
  7. Custom User Regex: User-supplied regular expression with safety timeout to prevent ReDoS.
- Text Coordinates Matching:
  - Search all pages using pdfjs-dist getTextContent(); compute accurate PDF bounding boxes (x, y, width, height) for each match.
- Review & Execution Pipeline:
  - Generate structured match list with page number, matched text, surrounding context snippet, and checked state.
  - Apply approved redactions via existing redaction pipeline, then automatically trigger N4 verification.

Mobile Play Store UI / UX Requirements:
- Pattern Chips Carousel:
  - Horizontally scrolling chips at top with appAutoScroll: [Emails] [Phone Numbers] [Credit Cards] [Aadhaar/PAN] [Dates] [Custom Regex].
- Match Review Card List:
  - Virtual-scrolling list of detected matches:
    - Checkbox (>=44px touch target) to include/exclude.
    - Page number badge and surrounding context snippet with highlighted match.
  - Top action bar: "Select All" / "Deselect All" pills and match counter ("24 matches found").
- Sticky Bottom Action Bar:
  - Primary thumb button "Redact Selected Matches (N)" with confirm alert dialog.
- i18n & Icons:
  - Full translations across en, hi, mr, bn, pa.
  - Inline SVG icon search-redact in icon.registry.ts.

Acceptance:
- Vitest: Built-in presets accurately match test fixtures (emails, Indian phones, PAN) without matching adjacent unrelated words; custom regex matching executes safely; unselected matches remain completely unredacted; output feeds cleanly into N4 verification.
```

### N6 — Metadata editor (set, not only strip)
**Depends on:** nothing · **Effort:** S
**Target Route:** `/features/pdf/security/metadata` (`src/app/features/metadata-editor/`)
**Target Services:** `PdfMetadataEditorService` (`src/app/core/services/pdf-metadata-editor.service.ts`)
**Tool Catalogue ID:** `metadata-editor` (Category: `security`)

```text
Build a dedicated PDF Metadata Editor allowing users to inspect, correct, and set metadata attributes
in both the Info dictionary and XMP metadata stream, complementing the existing privacy sanitizer.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement PdfMetadataEditorService in src/app/core/services/pdf-metadata-editor.service.ts.
- Read & Write Standard Metadata Fields:
  - Title, Author, Subject, Keywords (comma-separated array), Creator, Producer, CreationDate, ModificationDate.
- Dual Synchronization (Info Dict & XMP Stream):
  - Update standard PDF Info dictionary via pdf-lib (pdfDoc.setTitle, pdfDoc.setAuthor, etc.).
  - Synchronize corresponding XMP metadata stream elements: dc:title, dc:creator, dc:description, dc:subject, pdf:Keywords, pdf:Producer, xmp:CreateDate, xmp:ModifyDate.
  - Sanitize input strings against null bytes, control characters, and malformed UTF-8.
- Date Formatting:
  - Support setting dates to current device time or custom timestamp in standard PDF format (D:YYYYMMDDHHmmSSOHH'mm').
- Sanitizer Independence:
  - This editor sets and corrects metadata; the existing Privacy Sanitizer continues to strip metadata in bulk. Neither compromises the other.

Mobile Play Store UI / UX Requirements:
- Mobile Card-Based Form:
  - Individual mobile cards for Title, Author, Subject, Keywords, Creator, Producer.
  - Keywords field supports intuitive tag/pill input with tap-to-remove chips.
  - Creation / Modification date selector with 1-tap "Set to Current Time" pill.
- Quick Action Buttons:
  - "Copy from Original" and "Clear All Fields" quick pills.
- Side-by-Side Comparison Drawer:
  - Slide-up bottom sheet comparing "Original Metadata" vs "Updated Metadata".
- Sticky Bottom Action Bar:
  - "Save Document with Updated Metadata" primary thumb button with safe-area bottom padding.
- i18n & Icons:
  - Full translations for all metadata fields across en, hi, mr, bn, pa.
  - Inline SVG icon metadata-edit in icon.registry.ts.

Acceptance:
- Vitest: Values set via editor read back accurately through pdfjs-dist and pdf-lib; XMP metadata stream synchronizes with Info dictionary; special characters and non-Latin scripts (Hindi/Marathi Unicode) round-trip with zero corruption; Privacy Sanitizer strip behavior remains 100% untouched.
```

### N7 — Hidden-content audit (report-only) (completed)
**Depends on:** G4 · **Effort:** M
**Target Route:** `/features/pdf/security/audit` (`src/app/features/security-audit/`)
**Target Services:** `PdfHiddenContentAuditService` (`src/app/core/services/pdf-hidden-content-audit.service.ts`)
**Tool Catalogue ID:** `hidden-content-audit` (Category: `security`)

```text
Build a forensic Hidden-Content Audit tool that scans a PDF and generates a comprehensive,
report-only breakdown of concealed or non-visible elements before a user shares a document.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement PdfHiddenContentAuditService in src/app/core/services/pdf-hidden-content-audit.service.ts.
- 5 Structural Concealment Detectors:
  1. Layers (Optional Content Groups - OCG): Scan /OCProperties in catalog; detect hidden layers, disabled default states, or print-only layers.
  2. Off-Page Content: Inspect page content streams for text, line art, or image objects placed outside the visible /CropBox or /MediaBox coordinates.
  3. Invisible / Low-Contrast Text: Analyze text drawing operations where fill color matches background color (e.g. white text on white page), opacity is zero, or font size is below 0.5pt.
  4. Off-Page Annotations: Inspect /Annots array for comments, sticky notes, or links positioned beyond page boundaries.
  5. Embedded Scripts & Attachments: Identify embedded files (/EmbeddedFiles) and JavaScript actions (/OpenAction, /AA).
- Forensic Report Output:
  - Categorized findings list: Category, Page #, Description, Severity (Info, Warning, High), and visual preview where possible.
- Remediation Handoff:
  - Provide direct one-tap links to the appropriate tool (e.g. "Clean with Privacy Sanitizer", "Crop with Page Geometry").

Mobile Play Store UI / UX Requirements:
- Mobile Health Gauge Dashboard:
  - Circular or arc risk meter at top: "Low Risk", "Moderate Risk", or "High Privacy Risk" based on detected findings count.
- Expandable Category Cards:
  - Cards for: Hidden Layers, Off-Page Objects, Invisible Text, Concealed Annotations, Attachments.
  - Each card shows badge count, expandable finding details, and small rendered thumbnail where applicable.
- Remediation Action Bar:
  - Sticky bottom action bar with two thumb buttons: "Export Audit Report (PDF)" and "Sanitize Document Now" (hands off to Privacy Sanitizer via DocumentBridgeService).
- i18n & Icons:
  - Full translations across en, hi, mr, bn, pa.
  - Inline SVG icon forensic-scan in icon.registry.ts.

Acceptance:
- Vitest: Fixture carrying each category (hidden OCG layer, off-crop text, white-on-white text, off-page annotation) is detected with 100% precision; clean documents produce zero false positives; white-on-white detector does not flag ordinary light-grey text; handoff bridge correctly passes document to Sanitizer.
```

### N8 — App lock & panic clear (completed)
**Depends on:** nothing · **Effort:** M
**Target Route:** `/features/settings/security-lock` (`src/app/features/security-lock/`)
**Target Services:** `AppSecurityLockService` (`src/app/core/services/app-security-lock.service.ts`)
**Tool Catalogue ID:** `app-lock` (Category: `security`)

```text
Build a device-level biometric/PIN App Lock and an emergency Panic Clear capability
to secure sensitive documents and guarantee zero data remnants on the device.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement AppSecurityLockService in src/app/core/services/app-security-lock.service.ts.
- App & History Lock:
  - Biometric authentication (Fingerprint, Face Unlock) with 4-digit PIN fallback.
  - Configurable lock targets:
    1. Lock App on Launch.
    2. Lock History Vault & Saved Documents only.
  - Configurable auto-lock timeout: Immediately on backgrounding, 1 minute, 5 minutes.
  - Default is OFF: Launch flow remains completely untouched until user explicitly enables it.
- Temp Files Auto-Clear:
  - Automated deletion of cached render canvases, temporary export files, and staging blobs upon app pause/exit or daily cleanup.
- Panic Clear (Emergency Data Wipe):
  - One-tap immediate purge of all local storage:
    - IndexedDB databases (PDF cache, document storage).
    - Capacitor Preferences / LocalStorage (recent files, signatures, settings).
    - Temporary files in Capacitor Filesystem cache directory.
  - Two-step confirmation dialog with explicit enumeration of items that will be deleted, stressing that this cannot be undone.

Mobile Play Store UI / UX Requirements:
- Security Settings Mobile Page:
  - Large toggle switch cards for: "Biometric App Lock", "Lock History Vault", "Auto-clear Cache on Exit".
  - Auto-lock timeout selector dropdown.
  - "Change PIN" button.
- PIN Keypad Modal:
  - Clean numeric keypad with large touch targets (64x64px), haptic feedback on keypress, and dot indicators.
- Prominent Panic Clear Section:
  - Red-bordered card with flame/shield icon: "Emergency Panic Clear".
  - Two-step confirmation bottom sheet: Shows exact storage breakdown (e.g. "12 cached files (45 MB), 8 history entries, 2 saved signatures will be permanently erased").
  - Red "Permanently Wipe Everything" action button.
- i18n & Icons:
  - Full translations across en, hi, mr, bn, pa.
  - Inline SVG icon panic-clear in icon.registry.ts.

Acceptance:
- Vitest: Lock state and PIN hash securely persist in preferences; failed PIN attempts reject cleanly; Panic Clear purges exactly the targeted IndexedDB stores, preferences, and cache directories without breaking app reinitialization; default state is verified to be completely unlocked.
```

### N9 — Per-document privacy report card (completed)
**Depends on:** G2, N7 · **Effort:** S
**Target Route:** `/features/pdf/security/privacy-card` (`src/app/features/privacy-card/`)
**Target Services:** `PdfPrivacyReportCardService` (`src/app/core/services/pdf-privacy-report-card.service.ts`)
**Tool Catalogue ID:** `privacy-card` (Category: `security`)

```text
Build an accessible, layman-friendly Privacy Report Card summarizing everything a PDF
reveals about its creator, device, software, and hidden contents.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement PdfPrivacyReportCardService in src/app/core/services/pdf-privacy-report-card.service.ts.
- Privacy Synthesis Algorithm:
  - Aggregate scans from PdfPrivacyService, PdfMetadataEditorService, and PdfHiddenContentAuditService.
  - Compute a Privacy Score (0-100) and Letter Grade (A+, A, B, C, D, F):
    - Grade A+: Zero metadata, no author name, no software traces, no GPS EXIF, no hidden layers.
    - Points deducted for: Personal Name revealed (-15), Software/OS version revealed (-10), Camera/Device model (-15), Geolocation coordinates in embedded images (-25), Hidden text or layers (-20), Embedded attachments or scripts (-30).
- Plain-Language Translation Engine:
  - Formulate findings into human-readable statements understandable by non-technical users:
    - e.g. "This document tells anyone who receives it that it was created by 'John Doe' using 'macOS 15.1' and 'Word 2024' on October 28."
    - e.g. "Contains 2 photos with embedded GPS locations showing where they were taken."
- Export & Remediation:
  - Export report card as a shareable single-page PDF or text summary.
  - 1-tap handoff to Privacy Sanitizer to scrub all flagged items.

Mobile Play Store UI / UX Requirements:
- Mobile Grade Card View:
  - Prominent Letter Grade Badge (large circular badge with grade A/B/C/D/F and color coding: Green, Amber, Red).
  - Short summary headline: "Good Privacy" / "High Exposure Risk".
- Layman Disclosure Cards:
  - "Who Created It" card (Name, Organization, Email).
  - "Device & Software" card (Software used, OS, Camera model).
  - "Time & Location" card (Creation timestamp, Timezone, GPS location if present).
  - "Concealed Content" card (Hidden layers, Off-page text, Comments).
- Sticky Bottom Action Bar:
  - Primary thumb button "Sanitize Document in 1-Tap" (routes to Privacy Sanitizer).
  - Secondary button "Share Privacy Report".
- i18n & Icons:
  - Full translations for all layman descriptions across en, hi, mr, bn, pa.
  - Inline SVG icon report-card in icon.registry.ts.

Acceptance:
- Vitest: Scoring algorithm yields expected grade and deductions for fixture documents; plain-language string generator accurately formats metadata values; fixture with EXIF GPS generates location alert; 1-tap handoff routes to sanitizer with document intact.
```

---

## Part O — OCR

**O0 first. It blocks O1 and it is a live problem today, not a new feature.**
All OCR features must run 100% on-device, support Android mobile ergonomics,
and provide fluid touch interfaces, real-time progress, and complete offline capability.

### O0 — OCR model delivery decision (Fix offline claim)
**Depends on:** nothing · **Effort:** M
**Target Services:** `OcrModelManagerService` (`src/app/core/services/ocr-model-manager.service.ts`), updating `OcrService`
**Target Models:** `src/app/core/models/ocr.models.ts`

```text
Fix the live offline-claim defect in OcrService where language models are downloaded
from a public CDN on first run despite the app claiming full offline functionality.

Architectural Delivery Implementation:
- Implement Option (c): Hybrid Bundled + On-Demand Local Cache:
  1. Primary Model Bundled: Bundle English (eng.traineddata.gz, ~4MB) directly in app assets: src/assets/tesseract/eng.traineddata.gz. Configure Tesseract createWorker with langPath pointing to local asset URL (/assets/tesseract/). English OCR is guaranteed 100% offline immediately upon app install with zero network connectivity.
  2. Extended Languages On-Demand Manager: For additional languages (Hindi, Marathi, Bengali, Tamil, etc.), provide an explicit in-app download manager:
     - Show exact download file size before user triggers download (e.g. "Hindi (hin.traineddata.gz) - 11.8 MB").
     - Clear upfront dialog: "Download once over Wi-Fi/data for permanent offline use."
     - Store downloaded language models in Capacitor Filesystem (FilesystemDirectory.Data/tesseract/) or IndexedDB blobs.
     - On subsequent runs, load directly from local device filesystem without touching the network.
- Correct Misleading On-Screen Messaging:
  - Replace generic "Loading OCR language models (cached locally for offline use)" with precise contextual text:
    - For bundled/cached: "Loading offline OCR engine..."
    - For initial download: "Downloading Hindi OCR model (11.8 MB) for permanent offline use... [Progress Bar]"
- Zero Recognition Regressions:
  - Ensure recognition behavior and output for existing 5 languages (English, Hindi, Marathi, Bengali, Punjabi) remain identical.
  - Update play store metadata notes to accurately describe offline language capabilities.

Mobile Play Store UI / UX Requirements:
- OCR Language Manager Bottom Sheet:
  - Scrollable list of available languages showing: Language Name, Script Name, Status Badge ("Offline Ready", "Downloaded", "Download Available"), and File Size.
  - Download Button: 1-tap touch button (min 44px) with circular progress bar during download.
  - Storage Management: "Free Up Space" action to delete cached language files and reclaim storage.
- Download Confirmation Modal:
  - Clear modal when user selects a non-cached language: "Download Language Model? Size: 11.8 MB. Once downloaded, it works 100% offline forever."
- i18n & Icons:
  - Translations across en, hi, mr, bn, pa.
  - Inline SVG icon download-cloud in icon.registry.ts.

Acceptance:
- Vitest: With device offline and network mocked as down, English OCR executes successfully using bundled assets; download manager verifies cached file integrity and skips network on second invocation; misleading progress strings are replaced; ocr.spec.ts passes unchanged.
```

### O1 — OCR language expansion
**Depends on:** O0 · **Effort:** M
**Target Services:** `OcrService` (`src/app/core/services/ocr.service.ts`)
**Target Models:** `src/app/core/models/ocr.models.ts`

```text
Expand OCR language recognition to cover 18 total languages, including 13 Indic scripts
and 5 major international languages, with full searchable-PDF text layer generation.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Extend OcrService in src/app/core/services/ocr.service.ts.
- Expanded Language Catalog:
  - Indic Scripts (13): Hindi (hin), Marathi (mar), Bengali (ben), Tamil (tam), Telugu (tel), Kannada (kan), Malayalam (mal), Gujarati (guj), Odia (ori), Assamese (asm), Urdu (urd), Sanskrit (san), Nepali (nep).
  - International (5): English (eng), Spanish (spa), French (fra), Arabic (ara), Chinese Simplified (chi_sim).
- High-Accuracy Indic Models:
  - Measure and integrate optimized Indic-OCR trained data models where they demonstrably outperform upstream Tesseract weights on complex conjuncts and matras.
- Multi-Language Combination Pass:
  - Support combined recognition passes (e.g. "hin+eng" for Hindi documents containing English terms, "tam+eng" for Tamil-English hybrid forms).
- Searchable PDF Text Layer Generation:
  - Inject invisible selectable text layer into output PDF with precise bounding box coordinates (pdfDoc.getPage().drawText).
  - Right-to-Left (RTL) text layer rendering support for Urdu and Arabic scripts.

Mobile Play Store UI / UX Requirements:
- Mobile Language Selector Bottom Sheet:
  - Top search bar to quickly find languages by English or native script name (e.g. "Tamil", "தமிழ்").
  - Two tab categories: "Indian Languages (13)" | "International (5)".
  - Multi-select language chips: Allows selecting up to 2 simultaneous languages (e.g. Hindi + English) with visual primary/secondary badges.
  - Displays download status icon next to each language (respecting O0 delivery mechanism).
- Sticky Bottom Action Bar:
  - Thumb-friendly "Confirm Languages" button within env(safe-area-inset-bottom).
- i18n & Icons:
  - Full native translations for all 18 language names across en, hi, mr, bn, pa.
  - Inline SVG icon globe-lang in icon.registry.ts.

Acceptance:
- Vitest: Language code mapping and worker initialization succeed for all 18 languages; searchable-PDF text layer coordinates position correctly for non-Latin and RTL scripts; existing 5 languages maintain identical recognition fidelity.
```

### O2 — Automatic script & language detection
**Depends on:** O1 · **Effort:** M
**Target Services:** `ScriptDetectionService` (`src/app/core/services/script-detection.service.ts`)
**Target Models:** `src/app/core/models/ocr.models.ts`

```text
Build a fast client-side Script & Language Detection pre-pass that automatically identifies
the document's script and suggests the optimal OCR language without requiring manual user selection.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement ScriptDetectionService in src/app/core/services/script-detection.service.ts.
- Dual-Mode Script Detection:
  1. Digital Text Pre-Check: If the PDF contains existing text fragments, analyze Unicode code point blocks:
     - Devanagari: \u0900-\u097F (Hindi/Marathi/Sanskrit/Nepali)
     - Bengali/Assamese: \u0980-\u09FF
     - Tamil: \u0B80-\u0BFF
     - Telugu: \u0C00-\u0C7F
     - Kannada: \u0C80-\u0CFF
     - Malayalam: \u0D00-\u0D7F
     - Gujarati: \u0A80-\u0AFF
     - Odia: \u0B00-\u0B7F
     - Arabic/Urdu: \u0600-\u06FF
     - Latin: \u0020-\u007F (English/Spanish/French)
  2. Scanned Image Sample Pass: For pure scans/photos, crop 3 small representative text patches (top, center, bottom) at 150 DPI, run Tesseract OSD (Orientation and Script Detection) or fast mobile script classifier.
- Confidence Scoring & Fallback:
  - Return { detectedScript, suggestedLanguage, confidence (0-100) }.
  - If confidence >= 70%: Auto-select language and show friendly banner.
  - If confidence < 70%: Fall back gracefully to asking user to select language, presenting top 2 guesses as quick-tap pills. Never silently guess on a weak signal.

Mobile Play Store UI / UX Requirements:
- Smart Detection Banner:
  - Sleek top banner on OCR screen with sparkles icon: "Detected Script: Devanagari (Hindi) · 92% confidence".
  - Quick action pill: "[Change]" allowing 1-tap override to another language.
- Low-Confidence Selection Sheet:
  - When detection is uncertain, open a compact bottom sheet: "Which language is this document in?" with the 2 most likely suggestions at the top.
- User Preference Memory:
  - Remember user overrides per document type in @capacitor/preferences.
- i18n & Icons:
  - Full translations for detection status strings across en, hi, mr, bn, pa.
  - Inline SVG icon magic-detect in icon.registry.ts.

Acceptance:
- Vitest: Unicode range detection correctly identifies Indic scripts on test strings; image OSD classifies Latin vs Devanagari vs Tamil correctly; low-confidence page triggers prompt rather than incorrect guess; user override is preserved.
```

### O3 — Handwriting mode
**Depends on:** O0 · **Effort:** M
**Target Route:** `/features/ocr/handwriting` (`src/app/features/ocr-handwriting/`)
**Target Services:** `OcrHandwritingService` (`src/app/core/services/ocr-handwriting.service.ts`)
**Tool Catalogue ID:** `ocr-handwriting` (Category: `ocr`)

```text
Build a specialized Handwriting OCR pipeline tailored for handwritten notes, forms, and signatures,
with upfront expectation setting and side-by-side verification.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement OcrHandwritingService in src/app/core/services/ocr-handwriting.service.ts.
- Image Preprocessing for Handwriting:
  - Adaptive Binarization (Sauvola thresholding) to isolate faint pen strokes and varied pencil pressure.
  - Contrast stretching and morphological line dilation to reconnect broken pen strokes.
  - Deskewing and line-angle normalization.
- Tesseract Handwriting Engine Tuning:
  - Configure page segmentation mode (PSM 6: uniform text block, or PSM 11: sparse text).
  - Use character whitelist where applicable and adjust stroke-width filters.
- Side-by-Side Preservation:
  - Because handwriting recognition cannot achieve 100% accuracy, the output MUST retain the original image alongside the recognized text for immediate human verification.
- Upfront Expectation Management:
  - Present an unavoidable, clear notice BEFORE the run starts explaining that handwriting accuracy depends heavily on penmanship legibility.

Mobile Play Store UI / UX Requirements:
- Mode Switcher:
  - Segmented control pills on OCR screen: "Printed Document" | "Handwritten Notes".
- Upfront Expectation Modal / Bottom Sheet:
  - Friendly informational dialog displayed when switching to Handwriting Mode: "Handwriting recognition works best with clear, unjoined script. Results may require review." with a "Got it, Continue" button.
- Split-View Verification Screen:
  - Mobile split layout:
    - Top half: Interactive zoomable image viewer showing the original handwriting.
    - Bottom half: Editable text area with recognized text, word count, and 1-tap "Copy Text" button.
  - Tapping a paragraph in the bottom text viewer scrolls the top image viewer to that corresponding section.
- Sticky Bottom Action Bar:
  - "Export Text & Scans" and "Share Recognized Text" thumb buttons with safe-area bottom padding.
- i18n & Icons:
  - Full translations across en, hi, mr, bn, pa.
  - Inline SVG icon pen-tool in icon.registry.ts.

Acceptance:
- Vitest: Handwriting mode selects the dedicated preprocessing pipeline; does not alter print-mode behavior or parameters; expectation notice is required before execution; recognized text output preserves coordinate links to original image crops.
```

### O4 — OCR confidence tools & correction dictionary
**Depends on:** nothing · **Effort:** M
**Target Route:** `/features/ocr/correct` (`src/app/features/ocr-correct/`)
**Target Services:** `OcrConfidenceService` (`src/app/core/services/ocr-confidence.service.ts`)
**Tool Catalogue ID:** `ocr-confidence` (Category: `ocr`)

```text
Build an interactive OCR Quality Audit, Confidence Heatmap, and Persistent Correction Dictionary tool
that transforms take-it-or-leave-it OCR results into verified, correctable text.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement OcrConfidenceService in src/app/core/services/ocr-confidence.service.ts.
- Per-Word Confidence Scoring:
  - Extract word-level confidence (0 to 100) and bounding box rectangles (x, y, width, height) from Tesseract HOCR/TSV output.
  - Categorize into confidence tiers: High (>=85%), Medium (60-84%), Low (<60%).
- Visual Heatmap Overlay:
  - Render semi-transparent colored bounding boxes directly over the document preview canvas (Green = High, Amber = Medium, Red = Low).
- Persistent User Correction Dictionary:
  - Store user corrections in @capacitor/preferences (e.g. replace recurring misreads like "rn" -> "m", "vv" -> "w", or user-specific names/terms).
  - Automatically apply learned dictionary replacements to future OCR runs across all documents.
- Targeted Region Re-OCR:
  - Allow selecting a specific low-confidence bounding region, cropping it at 3x DPR with bicubic interpolation and unsharp masking, and re-running OCR on that isolated region without re-processing the entire page.

Mobile Play Store UI / UX Requirements:
- Interactive Heatmap Canvas:
  - PDF page rendered with toggleable "Confidence Heatmap" switch.
  - Tapping any highlighted word opens the "Quick Correction Drawer".
- Quick Correction Bottom Sheet:
  - Displays magnified crop of the actual word from the original scan above a clean mobile text input field.
  - Suggestion chips with candidate words.
  - "Replace Here" and "Replace Everywhere in Document" action buttons.
  - "Add to Correction Dictionary" toggle to remember this fix permanently.
- Carousel of Low-Confidence Words:
  - Horizontal swipeable card carousel at screen bottom: Swipe through low-confidence words one by one with thumb-friendly "Accept" or "Edit" buttons.
- Sticky Bottom Action Bar:
  - Primary button "Save Corrected PDF & Text" with safe-area padding.
- i18n & Icons:
  - Full translations across en, hi, mr, bn, pa.
  - Inline SVG icon spellcheck in icon.registry.ts.

Acceptance:
- Vitest: Confidence bucket mathematics correctly classify word scores; dictionary replacement is idempotent, case-aware, and handles regex word boundaries; targeted region re-OCR updates only that region's text layer while leaving surrounding page text intact; dictionary persists across service re-instantiation.
```

### O5 — Table OCR → Excel from scans
**Depends on:** O0 · **Effort:** M
**Target Route:** `/features/ocr/table-to-excel` (`src/app/features/table-to-excel/`)
**Target Services:** `ScannedTableOcrService` (`src/app/core/services/scanned-table-ocr.service.ts`)
**Tool Catalogue ID:** `scanned-table-ocr` (Category: `ocr`)

```text
Build a Scanned Table Recognition engine that detects tabular structures in photos and scans,
OCRs individual table cells, provides a mobile grid editor, and exports to .xlsx and .csv.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement ScannedTableOcrService in src/app/core/services/scanned-table-ocr.service.ts.
- Tabular Layout Detection:
  1. Ruled Tables (with borders): Apply horizontal and vertical morphological kernel filters on document canvas to extract line segments, find intersection points, and segment individual cell bounding boxes.
  2. Borderless Tables: Analyze whitespace column gutters and horizontal line baselines to infer rows and columns.
- Cell-by-Cell OCR:
  - Crop each segmented cell image, run localized OCR, and populate a 2D table matrix data[row][col].
  - Clean whitespace, trim spurious characters, and infer data types (numbers, dates, currency, text).
- Excel & CSV Export:
  - Export to Microsoft Excel (.xlsx) using the bundled xlsx library with proper column widths and formatted cells.
  - Export to standard CSV format.
  - Route output through StorageService.saveFile to enforce daily quota.

Mobile Play Store UI / UX Requirements:
- Table Boundary Selector:
  - On the scanned document preview, display 4 draggable corner pins (>=44px touch targets) allowing users to adjust the table bounding area.
- Mobile Interactive Spreadsheet Preview:
  - Fluid mobile grid view: Horizontal and vertical swipe scrolling with sticky header row.
  - Tap any cell to open inline bottom-sheet cell editor with numeric/text keypad.
  - Quick action toolbar: "Add Row", "Delete Row", "Add Column", "Delete Column".
- Sticky Bottom Action Bar:
  - Pinned action bar within env(safe-area-inset-bottom) with dual thumb buttons:
    "Export to Excel (.xlsx)" and "Export to CSV".
- i18n & Icons:
  - Full translations for all table actions across en, hi, mr, bn, pa.
  - Inline SVG icon table-excel in icon.registry.ts.

Acceptance:
- Vitest: Detects correct row and column counts on ruled-table fixture and whitespace-only table fixture; cell text lands in the right 2D coordinate cell; Excel file generated by xlsx library opens with correct sheet structure and cell values; quota check is enforced before export.
```


---

## Part P — Extraction & local AI

Every feature in this part executes 100% locally on-device without external cloud
calls or remote APIs. UI is strictly mobile-first for the Google Play Store
(touch targets >= 44px, thumb-reachable sticky bottom action bars with safe-area padding,
bottom sheet drawers using dvh to prevent virtual keyboard clipping, and zero horizontal scroll).

### P1 — Structured field extraction (receipts, invoices, IDs)
**Depends on:** O5 (Table OCR) / Local AI · **Effort:** L
**Target Route:** `/features/pdf/intelligence/extract-structured` (`src/app/features/structured-extract/`)
**Target Services:** `StructuredExtractionService` (`src/app/core/services/structured-extraction.service.ts`)
**Target Models:** `src/app/core/models/structured-extraction.types.ts`
**Tool Catalogue ID:** `structured-extractor` (Category: `intelligence`)

```text
Build a mobile-first, on-device Structured Field Extraction tool to automatically pull key/value
pairs out of documents (receipts, invoices, utility bills, ID documents, bank statements).

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement StructuredExtractionService in src/app/core/services/structured-extraction.service.ts.
- Generic Document Classification:
  - Document categories: Receipt, Invoice, Utility Bill, ID Document, Bank Statement.
  - GENERIC CATEGORIES ONLY — no institution, exam board, or scheme names anywhere in the code or UI.
- Field Extraction Heuristics & RegEx Patterns:
  - Dates: ISO (YYYY-MM-DD), Indian formats (DD/MM/YYYY), textual dates ("28 Oct 2026").
  - Financial Totals & Taxes: Currency symbols (₹, $, €), Subtotal, Tax/GST/VAT lines, Grand Total, Balance Due.
  - Reference Identifiers: Invoice numbers, Receipt IDs, Order numbers, Account IDs.
  - Entities: Vendor / Merchant name, Customer / Billed-To name, physical addresses (via spatial clustering).
- Extraction Result Shape:
  - Per field: { key: string, label: string, value: string, confidence: number (0-100), pageNumber: number, boundingBox: { x, y, width, height } }.
  - Absent fields: If a field is not detected, report it as absent (null/undefined) with 0% confidence — NEVER hallucinate or guess.
- Human-in-the-Loop Review & Export:
  - Interactive review step before export; flag low-confidence fields (<80%) in amber.
  - Export to structured JSON and CSV formats via StorageService.saveFile.

Mobile Play Store UI / UX Requirements:
- Mobile Canvas & Bounding Box Viewer:
  - Document rendered via pdfjs-dist on an HTML5 canvas with pinch-to-zoom (1x to 3x) and pan gestures.
  - Extracted fields highlighted with colored bounding boxes (Green: high confidence >=80%, Amber: low confidence <80%).
  - Tapping a highlighted box smoothly scrolls and zooms the canvas to that location.
- Bottom Sheet Field Inspector:
  - Slide-up bottom sheet drawer (breakpoints [0, 0.45, 0.85] using dvh) listing all extracted fields.
  - Tap any field card to edit value inline with mobile keyboard; updates live on canvas.
  - Virtual keyboard handling: Bottom sheet adjusts dynamically with visualViewport/dvh so keyboard never clips the active field.
- Sticky Bottom Action Bar:
  - Action bar inside env(safe-area-inset-bottom) with thumb buttons: "Export to CSV" and "Export to JSON".
- i18n & Icons:
  - Full translations for all field names and categories across en, hi, mr, bn, pa.
  - Inline SVG icon structured-extract in icon.registry.ts.

Acceptance:
- Vitest: Fixture receipt yields expected totals and dates; absent fields reported as absent; CSV and JSON export match schema; coordinate bounding boxes map to page geometry.
```

### P2 — Business card → vCard, document → .ics
**Depends on:** nothing · **Effort:** S
**Target Route:** `/features/pdf/intelligence/contact-calendar` (`src/app/features/contact-calendar/`)
**Target Services:** `ContactCalendarExtractorService` (`src/app/core/services/contact-calendar-extractor.service.ts`)
**Target Models:** `src/app/core/models/contact-calendar.types.ts`
**Tool Catalogue ID:** `contact-calendar-extract` (Category: `intelligence`)

```text
Build a smart Contact & Calendar extractor that converts business card photos/scans into .vcf vCards
and document dates/schedules into .ics iCalendar events, 100% on-device.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement ContactCalendarExtractorService in src/app/core/services/contact-calendar-extractor.service.ts.
- Business Card to vCard:
  - Extract: Full Name, Job Title, Organization/Company, Phone Numbers (Mobile, Work), Email, Website URL, Physical Address.
  - Build standard vCard 3.0 / 4.0 format string (BEGIN:VCARD ... END:VCARD), reusing existing vCard utilities in QrBarcodeService.
- Document to .ics Calendar Event:
  - Extract: Event Title, Start Date/Time, End Date/Time, Location, Description/Notes, Meeting Links.
  - Build RFC 5545 compliant iCalendar string (BEGIN:VCALENDAR ... BEGIN:VEVENT ... END:VCALENDAR).
- Ambiguous Date Disambiguation:
  - When encountering ambiguous dates (e.g. "05/06/2026"), detect ambiguity and prompt user: "Is this May 6 or June 5?" — never assume silently.
- Native Mobile Integration:
  - Share or save .vcf / .ics using @capacitor/share and StorageService.saveFile so Android native contacts and calendar apps can import with 1 tap.

Mobile Play Store UI / UX Requirements:
- Dual-Card Mobile Review Layout:
  - Top preview card of source image/document.
  - Bottom card showing parsed contact details or calendar event fields.
  - Large touchable inputs (min 44px) for user verification and editing.
- Sticky Bottom Action Bar:
  - For Contact: "Save Contact (.vcf)" and "Open in Contacts" (triggers native Android intent).
  - For Event: "Save Event (.ics)" and "Add to Calendar".
  - Full padding for env(safe-area-inset-bottom).
- i18n & Icons:
  - Full translations across en, hi, mr, bn, pa.
  - Inline SVG icon contact-calendar in icon.registry.ts.

Acceptance:
- Vitest: vCard and .ics outputs parse back to exact input values; ambiguous dates trigger confirmation prompt; special characters and phone formats (+91, international) format cleanly.
```

### P3 — Barcode batch mode & 1D generation
**Depends on:** nothing · **Effort:** M
**Target Route:** `/features/qr-barcode/batch` (`src/app/features/qr-barcode-batch/`)
**Target Services:** `BarcodeBatchService` (`src/app/core/services/barcode-batch.service.ts`), extending `QrBarcodeService`
**Target Models:** `src/app/core/models/qr-barcode.types.ts`
**Tool Catalogue ID:** `barcode-batch` (Category: `scanner`)

```text
Extend the QR & Barcode toolkit with continuous camera batch scanning and industrial 1D barcode generation.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement BarcodeBatchService in src/app/core/services/barcode-batch.service.ts.
- Continuous Batch Scan Mode:
  - Camera viewfinder stays active continuously without closing between scans.
  - Real-time deduplication: configurable cooldown window (e.g. ignore duplicate code scanned within 3 seconds, or deduplicate against entire session list).
  - Sound and haptic feedback on each new unique barcode captured (@capacitor/haptics).
  - Collects running session list with format, payload, and timestamp.
  - Export batch scan results to CSV and TXT.
- 1D Barcode Generation:
  - Generate Code 128 (high-density alphanumeric), EAN-13 (retail with modulo-10 check-digit validation), and Code 39.
  - EAN-13 check digit validation: Compute sum of odd-index digits + 3 * sum of even-index digits; reject invalid 13th digit payloads with clear explanation.
  - Render as vector SVG and crisp PNG canvas.
- Bulk Barcode Generation:
  - Ingest CSV column with values; bulk generate 1D or QR codes into:
    1. Multi-page printable PDF label sheet (configurable 24-up or 12-up grid on A4).
    2. Downloadable ZIP archive containing individual PNG image files using jszip.

Mobile Play Store UI / UX Requirements:
- Full-Screen Mobile Viewfinder:
  - Edge-to-edge camera viewfinder with glowing target scan reticle.
  - Floating live count badge at top: "Scanned: 24 codes".
  - Slide-up bottom sheet drawer showing running list of scanned items with tap-to-delete.
- 1D Barcode Generator Tab:
  - Type payload or pick CSV file.
  - Barcode format picker pills: [Code 128] [EAN-13] [Code 39] [QR Code].
  - Live scalable barcode preview card.
- Sticky Bottom Action Bar:
  - "Export Batch Scan (CSV)" / "Generate Label Sheet PDF" thumb buttons with safe-area bottom padding.
- i18n & Icons:
  - Full translations across en, hi, mr, bn, pa.
  - Inline SVG icon barcode-scanner in icon.registry.ts.

Acceptance:
- Vitest: Deduplication prevents repeated capture of duplicate codes; EAN-13 check digit rejects invalid inputs; bulk generation produces exact count matching CSV rows; label sheet PDF places barcodes in correct grid coordinates.
```

### P4 — Multi-document Q&A
**Depends on:** nothing · **Effort:** M
**Target Route:** `/features/pdf/intelligence/multi-qa` (`src/app/features/multi-doc-qa/`)
**Target Services:** `MultiDocumentQaService` (`src/app/core/services/multi-document-qa.service.ts`), extending `PdfIntelligenceService`
**Target Models:** `src/app/core/models/pdf-intelligence.types.ts`
**Tool Catalogue ID:** `multi-doc-qa` (Category: `intelligence`)

```text
Extend local AI intelligence to query across multiple PDF documents simultaneously with strict on-device citation attribution.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement MultiDocumentQaService in src/app/core/services/multi-document-qa.service.ts.
- Multi-Document Ingestion & Indexing:
  - Ingest a corpus of 2 to 10 PDF documents.
  - Extract and index text chunks locally using in-memory inverted index / BM25 term weighting.
  - Preserve provenance: every indexed paragraph tracks { documentId, fileName, pageNumber, paragraphIndex }.
- Query & Search Execution:
  - Rank relevant paragraphs across all loaded documents based on BM25 query similarity.
  - Return top passages and synthesized response locally using LocalIntelligenceProvider.
- Dual Citation Attribution:
  - Every answer citation explicitly names the FILE NAME and the PAGE NUMBER (e.g. "[Policy_2026.pdf, Page 4]").
- Search Scope & Unanswered State:
  - Display search scope summary: list which documents were searched, and specifically identify documents that had zero relevance.
  - Transparent unanswered state: If no answer exists in the corpus, state clearly: "No relevant information found in the selected documents" — NEVER hallucinate.

Mobile Play Store UI / UX Requirements:
- Document Scope Carousel:
  - Horizontally scrolling chips at top showing loaded files with checkbox toggles to include/exclude specific files from the search corpus.
- Mobile Chat-Style Interface:
  - Message stream of user questions and structured answers.
  - Answer cards display clickable citation badges: Tapping a citation opens a modal preview showing that exact page with the excerpt highlighted.
  - Pinned question input bar using dvh so on-screen keyboard never obscures chat history.
- Sticky Action Controls:
  - Clear history button, Export Q&A transcript (PDF/TXT) button.
- i18n & Icons:
  - Full translations across en, hi, mr, bn, pa.
  - Inline SVG icon multi-qa in icon.registry.ts.

Acceptance:
- Vitest: Multi-document fixture (3 distinct documents) yields accurate file and page attribution; queries with no match return explicit unanswerable status; BM25 ranker correctly prioritizes highest relevance passage.
```

### P5 — Auto-tagging, classification & rename-from-content
**Depends on:** nothing · **Effort:** M
**Target Route:** `/features/pdf/intelligence/organize` (`src/app/features/auto-organize/`)
**Target Services:** `DocumentClassifierService` (`src/app/core/services/document-classifier.service.ts`)
**Target Models:** `src/app/core/models/document-classifier.types.ts`
**Tool Catalogue ID:** `auto-classifier` (Category: `intelligence`)

```text
Build a smart Document Classifier, Auto-Tagger, and Content-Based Renamer to automatically
organize messy document vaults 100% locally.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement DocumentClassifierService in src/app/core/services/document-classifier.service.ts.
- Document Classification:
  - Classify document into generic categories: Receipt, Invoice, Utility Bill, ID Document, Certificate, Official Letter, Financial Statement, Notes, Contract.
  - Rule-based keyword frequency, layout structural cues, and document metadata. Returns category and confidence score.
- Semantic Auto-Tagging:
  - Extract 3 to 5 content tags from high-frequency domain keywords, headings, and dates (e.g. ["Electricity", "October 2026", "Paid"]).
- Suggested Rename-from-Content:
  - Synthesize clean, descriptive filename proposal: "{Category}_{Title/Entity}_{Date}.pdf" (e.g. "Receipt_PowerUtility_2026-10-28.pdf").
  - Sanitize filenames: Strip all filesystem-unsafe characters (/, \, :, *, ?, ", <, >, |), replace whitespace with underscores, truncate to max 60 chars.
- User Confirmation Safeguard:
  - Suggestions only: NEVER rename or tag a document without explicit user review and confirmation.
- Batch Vault Mode:
  - Scan history vault or folder of scans, presenting a batch organization proposal table.

Mobile Play Store UI / UX Requirements:
- Batch Review Card List:
  - Mobile cards showing document thumbnail, detected category chip, editable proposed filename text field, and removable tag pills.
  - Swipe card left to reject suggestion, swipe right to approve.
- Top Action Bar:
  - "Approve All Suggestions" and "Reject All" quick action pills.
- Sticky Bottom Action Bar:
  - "Apply Organization Changes (N)" thumb button with safe-area padding.
- i18n & Icons:
  - Full translations across en, hi, mr, bn, pa.
  - Inline SVG icon smart-tag in icon.registry.ts.

Acceptance:
- Vitest: Fixtures for each generic category classify accurately; filename sanitizer strips invalid characters; no file is modified without explicit confirmation; tag extraction filters stop words.
```

### P6 — Entity & clause extraction with page anchors
**Depends on:** nothing · **Effort:** M
**Target Route:** `/features/pdf/intelligence/entities` (`src/app/features/entity-clause-extract/`)
**Target Services:** `EntityClauseExtractionService` (`src/app/core/services/entity-clause-extraction.service.ts`)
**Target Models:** `src/app/core/models/entity-clause.types.ts`
**Tool Catalogue ID:** `entity-clause-extractor` (Category: `intelligence`)

```text
Build an Entity and Clause Extraction tool that finds dates, amounts, parties, deadlines, and
obligation-bearing clauses with clickable page coordinate anchors.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement EntityClauseExtractionService in src/app/core/services/entity-clause-extraction.service.ts.
- Key Entity Extraction:
  - Extract: Dates, Monetary Amounts, Contracting Parties, Deadlines, Reference/Account Numbers.
  - Bounding Box Coordinate Anchors: Compute exact page number and bounding box (x, y, width, height) in PDF points for every entity.
- Obligation-Bearing Clause Detection:
  - Heuristic detection of operative contractual clauses using linguistic modal markers: "must", "shall", "agrees to", "within [N] days", "subject to", "penalty", "termination".
  - Group clauses by category: Obligations, Deadlines, Penalties, Rights.
- Strict Honesty Gate:
  - Text extraction only: UI must explicitly state: "Information extraction only. This tool finds text patterns and does not provide legal advice."
- Export Capabilities:
  - Export extracted entities and clauses to CSV, JSON, and printable summary report.

Mobile Play Store UI / UX Requirements:
- Interactive Document Viewer:
  - Canvas page viewer with touchable highlighted bounding boxes around extracted entities.
  - Tapping an entity highlights it and shows a popover with details.
- Bottom Sheet Drawer:
  - Segmented tab bar: [Amounts] [Dates & Deadlines] [Parties] [Clauses].
  - Scrollable card list of extracted items: Tapping a card jumps the document canvas directly to that exact passage.
- Sticky Bottom Action Bar:
  - "Export Extracted Data (CSV/JSON)" thumb button with safe-area padding.
- i18n & Icons:
  - Full translations across en, hi, mr, bn, pa.
  - Inline SVG icon clause-search in icon.registry.ts.

Acceptance:
- Vitest: Entity extraction correctly identifies known dates and amounts in fixture; page anchors resolve to correct geometric coordinates; clause classifier identifies obligation keywords; disclaimer string is strictly enforced.
```

### P7 — Reading time & readability scores
**Depends on:** nothing · **Effort:** S
**Target Route:** `/features/pdf/intelligence/readability` (`src/app/features/readability/`)
**Target Services:** `ReadabilityAnalysisService` (`src/app/core/services/readability-analysis.service.ts`)
**Target Models:** `src/app/core/models/readability.types.ts`
**Tool Catalogue ID:** `readability-analyzer` (Category: `intelligence`)

```text
Build a Reading Time and Readability Analyzer that computes reading metrics and plain-language
complexity bands per document and per section.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement ReadabilityAnalysisService in src/app/core/services/readability-analysis.service.ts.
- Document Statistics:
  - Total word count, character count, sentence count, syllable count (using vowel group heuristics).
- Estimated Reading & Speaking Time:
  - Reading time based on standard silent reading pace of 200 words per minute (wpm).
  - Speaking / presentation time based on 130 wpm.
- Readability Indices:
  - Flesch Reading Ease: 206.835 - 1.015 * (words/sentences) - 84.6 * (syllables/words).
  - Flesch-Kincaid Grade Level: 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59.
  - Gunning Fog Index: 0.4 * ((words/sentences) + 100 * (complexWords/words)).
- Plain-Language Complexity Bands:
  - Name the metric explicitly and map to clear bands:
    - Easy / Conversational (Reading Ease >= 80, Grade <= 6)
    - Moderate / Standard (Reading Ease 60-79, Grade 7-10)
    - Dense / Academic / Technical (Reading Ease < 60, Grade 11+).
- Granularity:
  - Report overall document metrics, plus per-chapter / per-section metrics for multi-page documents.

Mobile Play Store UI / UX Requirements:
- Executive Summary Mobile Card:
  - Big visual metric badge: "4 min read" with plain-language pill ("Easy", "Moderate", "Dense").
- Readability Gauges Card:
  - Visual dials/progress bars for Reading Ease, Grade Level, and Word Count.
  - Educational explanation card for each formula.
- Per-Section Breakdown Table:
  - Scrollable card list showing reading time and difficulty rating for each section/page.
- Sticky Bottom Action Bar:
  - "Share Readability Report" button with safe-area padding.
- i18n & Icons:
  - Full translations across en, hi, mr, bn, pa.
  - Inline SVG icon book-open in icon.registry.ts.

Acceptance:
- Vitest: Calculations on standard sample texts match published Flesch and Gunning Fog test scores; syllable counting handles irregular words; reading time arithmetic is exact.
```

### P8 — Side-by-side translation & summary export (COMPLETED)
**Depends on:** nothing · **Effort:** M · **Status:** Completed (P8)
**Target Route:** `/features/pdf/intelligence/translation-reader` (`src/app/features/translation-reader/`)
**Target Services:** `TranslationReaderService` (`src/app/core/services/translation-reader.service.ts`), extending `PdfIntelligenceService`
**Target Models:** `src/app/core/models/pdf-intelligence.types.ts`
**Tool Catalogue ID:** `translation-reader` (Category: `intelligence`)

```text
Build a dual-pane Side-by-Side Translation Reader with synchronized scroll-locking and multi-format export.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement TranslationReaderService in src/app/core/services/translation-reader.service.ts.
- Dual-Pane Synchronization Engine:
  - Left / Top pane: Original document page rendered via pdfjs-dist.
  - Right / Bottom pane: Translated text for that corresponding page.
  - Synchronized scroll-lock: Scrolling through pages in one pane smoothly synchronizes and locks the opposite pane to the same page index.
- Multi-Format Export:
  - Export translated text and executive summary to formatted PDF (using pdf-lib).
  - Export to Microsoft Word document (.docx) using the bundled docx package, preserving headings, bold text, and paragraphs.
- Layout Fidelity Contract:
  - Translation is presented in dual-pane side-by-side view; in-place visual text box replacement is NOT performed because translated text expansion (often 30-40%) causes clipping or unreadable overflow.

Mobile Play Store UI / UX Requirements:
- Mobile Split View:
  - Portrait orientation: Vertically stacked split view (Top: Original PDF canvas, Bottom: Scrollable translated text).
  - Landscape orientation: Side-by-side split view.
  - Draggable touch divider handle to adjust pane heights/widths on mobile.
- Top Language Selector Bar:
  - Quick-switch pill chips: Source Language -> Target Language.
- Sticky Bottom Action Bar:
  - Pinned action bar within env(safe-area-inset-bottom) with dual thumb buttons: "Export Translated PDF" and "Export as Word (.docx)".
- i18n & Icons:
  - Full translations across en, hi, mr, bn, pa.
  - Inline SVG icon split-view in icon.registry.ts.

Acceptance:
- Vitest: Scroll-lock index mapping accurately pairs pages of unequal text length; DOCX export produces valid OpenXML document structure; translated PDF output includes page breaks matching original document.
```

### P9 — Accessibility pass (tagged PDF, alt text, reading order)
**Depends on:** E1 · **Effort:** L
**Target Route:** `/features/pdf/accessibility` (`src/app/features/pdf-accessibility/`)
**Target Services:** `PdfAccessibilityService` (`src/app/core/services/pdf-accessibility.service.ts`)
**Target Models:** `src/app/core/models/pdf-accessibility.types.ts`
**Tool Catalogue ID:** `pdf-accessibility` (Category: `tools`)

```text
Build a PDF Accessibility enhancement tool that creates Tagged PDF structure trees (/StructTreeRoot),
adds image alt-text, and validates reading order.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement PdfAccessibilityService in src/app/core/services/pdf-accessibility.service.ts.
- Tagged PDF Structure Tree (/StructTreeRoot):
  - Infer logical document structure from page layout: Headings (/H1, /H2, /H3), Paragraphs (/P), Lists (/L, /LI, /LBody), Tables (/Table, /TR, /TD).
  - Construct standard ISO 32000-1 Logical Structure Dictionary: /StructTreeRoot with /RoleMap, /ParentTree, and marked content identifiers (/MCID).
  - Mark decorative elements, headers, and footers as /Artifact so screen readers skip them.
- Image Alt-Text Engine:
  - Detect all embedded image objects on pages.
  - Prompt user for descriptive alt-text for each image.
  - Provide OCR-derived starter suggestions for images containing text/diagrams.
  - Embed alt-text into structure element dictionary: /Alt (descriptive text).
- Visual Reading Order Editor:
  - Detect reading sequence; support multi-column newspaper layouts.
  - Interactive reorder UI allowing user to drag reading blocks into proper sequential order.
- Integrated Read-Aloud:
  - Preview accessibility flow using device Text-to-Speech (PdfReadAloudService).
- Strict Honesty Gate:
  - Structure inference from raw PDFs is heuristic: Report what could not be confidently inferred.
  - NEVER label document as "WCAG Compliant" or "Section 508 Certified" in any UI string. State clearly: "Enhanced with structure tags and image descriptions."

Mobile Play Store UI / UX Requirements:
- 3-Step Accessibility Mobile Stepper:
  1. Structure Tags: Visual colored overlay badges on page canvas (H1, P, Table).
  2. Image Alt-Text: Slide-up drawer showing image thumbnails with text inputs and "Suggest from OCR" button.
  3. Reading Order: Reorderable card list with drag handles (>=44px touch target).
- Audio Preview Bar:
  - Floating "Listen with Screen Reader" button with play/pause controls.
- Sticky Bottom Action Bar:
  - "Save Tagged Accessible PDF" thumb button with safe-area padding.
- i18n & Icons:
  - Full translations across en, hi, mr, bn, pa.
  - Inline SVG icon accessibility in icon.registry.ts.

Acceptance:
- Vitest: Written /StructTreeRoot and /ParentTree object graphs validate in pdf-lib; alt-text attributes embed correctly; reading order changes reflect in structure tree; no false accessibility certification claims exist in code or templates.
```

---

## Part Q — Presets, validator & pipelines

All preset, profile, and recipe tools run strictly on-device, store data in
Capacitor Preferences / Filesystem, and integrate with StorageService.saveFile
for daily quota tracking.

### Q1 — Preset builder from instructions
**Depends on:** nothing · **Effort:** M
**Target Route:** `/features/presets/builder` (`src/app/features/preset-builder/`)
**Target Services:** `PresetBuilderService` (`src/app/core/services/preset-builder.service.ts`), extending `PresetService`
**Target Models:** `src/app/core/models/preset.types.ts`
**Tool Catalogue ID:** `preset-builder` (Category: `presets`)

```text
Build a smart Preset Builder that OCRs upload instruction guidelines (photos or PDFs) and
extracts an automated dimension, size, and format specification profile.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement PresetBuilderService in src/app/core/services/preset-builder.service.ts.
- Instruction Sheet Ingestion & OCR:
  - OCR a photo or PDF page containing file upload instructions using OcrService.
  - Parse specifications:
    - File size limits: Min KB, Max KB (e.g. "between 20 KB and 50 KB").
    - Dimensions: Width and Height in pixels, millimeters, centimeters, or inches (e.g. "3.5 cm x 4.5 cm", "200x230 px").
    - Aspect Ratio: Proportional ratio (e.g. "3:4", "1:1").
    - Resolution / DPI: (e.g. "200 DPI", "300 DPI").
    - Allowed File Formats: JPEG, JPG, PNG, PDF.
- Neutral Profile Naming:
  - Automatically propose profile names based on NUMBERS ONLY (e.g. "Photo 35x45mm 50KB", "Doc PDF 200KB") — NEVER use government, exam board, or institution names.
- Human Verification Step:
  - Display extracted values side-by-side with original source text.
  - Every field is editable; nothing is saved without explicit user confirmation.
- Save to Custom Presets:
  - Save valid profile to @capacitor/preferences under CUSTOM_PRESETS_KEY.

Mobile Play Store UI / UX Requirements:
- Split Mobile Review Card:
  - Top card: Scanned instruction snippet with highlighted extracted numbers.
  - Bottom card: Mobile form with clean touch inputs for Max KB, Dimensions (Width x Height), Format, and DPI.
- Sticky Bottom Action Bar:
  - "Save Specification Profile" thumb button with safe-area padding.
- i18n & Icons:
  - Full translations across en, hi, mr, bn, pa.
  - Inline SVG icon preset-builder in icon.registry.ts.

Acceptance:
- Vitest: Extraction from fixture instruction sheet accurately pulls size and dimension bounds; unparseable sheet reports error without hallucinating values; profile saves to custom presets and is retrievable.
```

### Q2 — Profile export & import as JSON
**Depends on:** nothing · **Effort:** S
**Target Route:** `/features/presets/manage` (`src/app/features/presets-manage/`)
**Target Services:** `ProfileTransferService` (`src/app/core/services/profile-transfer.service.ts`)
**Tool Catalogue ID:** `profile-transfer` (Category: `presets`)

```text
Build a Specification Profile Import & Export utility using a documented, versioned JSON schema.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement ProfileTransferService in src/app/core/services/profile-transfer.service.ts.
- Documented Schema (ifh.profile.v1.json):
  - Schema definition: { version: "1.0", id: string, name: string, category: string, photo?: PresetRequirement, signature?: PresetRequirement, pdf?: PresetRequirement }.
- Export:
  - Serialize profile into formatted JSON string.
  - Share via native share sheet (@capacitor/share) or save to device file.
- Import & Validation:
  - Ingest JSON file or clipboard text.
  - Strict schema validation: Check types, required fields, and version compatibility.
  - Provide human-friendly error messages on malformed or incompatible JSON (e.g. "Missing required field 'maxKb'", "Unsupported profile version '2.0'").
  - Merge imported profile into local custom presets without overwriting existing profiles unless user approves.

Mobile Play Store UI / UX Requirements:
- Mobile Profile Management Card List:
  - Cards for each saved profile showing name, dimensions, and size limit chips.
  - Each card has "Share Profile (JSON)" and "Delete" touch buttons.
- Import Section:
  - Dashed drop card: "Tap to Import Profile File (.json)" or "Paste Profile JSON".
  - Validation modal previewing profile details before saving.
- Sticky Bottom Action Bar:
  - "Import Profile" primary thumb button with safe-area bottom padding.
- i18n & Icons:
  - Full translations across en, hi, mr, bn, pa.
  - Inline SVG icon profile-json in icon.registry.ts.

Acceptance:
- Vitest: Exported profile round-trips through import with byte-exact equality; invalid JSON or missing fields rejected with descriptive error message; version mismatch flagged cleanly.
```

### Q3 — Batch check against a profile
**Depends on:** Q2, G3 · **Effort:** M
**Target Route:** `/features/presets/batch-check` (`src/app/features/preset-batch-check/`)
**Target Services:** `PresetBatchValidatorService` (`src/app/core/services/preset-batch-validator.service.ts`)
**Tool Catalogue ID:** `preset-batch-check` (Category: `presets`)

```text
Build a Batch Profile Compliance Validator that inspects multiple documents/images against a selected profile,
providing an audit scorecard and 1-click batch auto-fix.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement PresetBatchValidatorService in src/app/core/services/preset-batch-validator.service.ts.
- Multi-File Inspection Engine:
  - Ingest multiple PDF documents or image files.
  - Audit each file against the active profile: File size (KB), Dimensions (Width x Height), Aspect ratio, DPI, File format.
  - Generate scorecard per file: Pass / Fail status per rule, with measured value vs required limit (e.g. "Measured: 82 KB, Limit: 50 KB -> FAIL").
- Batch Auto-Fix Pipeline:
  - For fixable violations:
    - Size too large -> Re-compress image or PDF via CompressionService to target KB.
    - Dimensions incorrect -> Resize or crop canvas to match profile dimensions.
    - Format mismatch -> Convert to required format (e.g. PNG to JPEG).
  - Unfixable violations (e.g. blurry scan, illegible document) are clearly marked and skipped.
- Quota Pre-Check:
  - Calculate total free-tier operations required for auto-fixing batch; alert user before starting.

Mobile Play Store UI / UX Requirements:
- Multi-File Audit Scorecard:
  - List of loaded files with thumbnail, file name, overall badge ("Compliant" in green, "Non-Compliant" in red).
  - Expandable row showing individual rule results: Size, Dimensions, Format, DPI.
- 1-Click Auto-Fix Action Bar:
  - Top summary chip: "3 of 5 files need auto-fixing".
  - Sticky bottom action bar with large thumb button: "1-Click Auto-Fix All Files (3)" with safe-area padding.
- Progress & Results Drawer:
  - Live progress bar during auto-fix with per-file status updates.
- i18n & Icons:
  - Full translations across en, hi, mr, bn, pa.
  - Inline SVG icon batch-check in icon.registry.ts.

Acceptance:
- Vitest: Audit on mixed batch of compliant and non-compliant files produces accurate pass/fail matrix; auto-fix converts failing files into compliant outputs; quota stop is enforced before running.
```

### Q4 — Recipes: pipeline engine
**Depends on:** nothing · **Effort:** M
**Target Route:** `/features/recipes/editor` (`src/app/features/recipe-editor/`)
**Target Services:** `RecipeService` (`src/app/core/services/recipe.service.ts`)
**Target Models:** `src/app/core/models/recipe.types.ts`
**Tool Catalogue ID:** `recipe-editor` (Category: `recipes`)

```text
Build a sequential Recipe Pipeline Engine that allows users to chain multiple PDF tools together
into an automated single-tap workflow.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement RecipeService in src/app/core/services/recipe.service.ts.
- Recipe Model & Schema:
  - Recipe definition: { id: string, name: string, description: string, steps: RecipeStep[], isCustom: boolean }.
  - RecipeStep definition: { stepId: string, toolId: string, parameters: Record<string, any>, label: string }.
- Sequential Pipeline Execution:
  - Execute steps sequentially in memory: Output of Step N becomes input to Step N+1.
  - Validate parameters for each step against tool registry schema before execution starts.
  - Per-step progress callback: Report current step, step progress percentage, and step completion status.
  - Cancellation support: User can cancel execution cleanly after any completed step.
- Local Recipe Management:
  - Create, save, rename, duplicate, and delete recipes in @capacitor/preferences.
  - Export and import recipes as JSON.
- Resilient Error Handling:
  - If a tool parameter becomes invalid or a step fails, abort pipeline cleanly and report the exact failing step without corrupting earlier outputs.

Mobile Play Store UI / UX Requirements:
- Visual Mobile Pipeline Builder:
  - Vertical flow of step cards: e.g. [Step 1: Compress to 2MB] -> [Step 2: Add Page Numbers] -> [Step 3: Flatten Form].
  - Drag-and-drop handles on each step card to reorder pipeline steps with haptic vibration.
  - "Add Step" button opening a bottom sheet drawer of available tools.
- Step Parameter Inspector:
  - Tapping a step card opens a bottom sheet allowing thumb configuration of that tool's parameters.
- Sticky Bottom Action Bar:
  - "Test Run Recipe" and "Save Recipe" thumb buttons with safe-area bottom padding.
- i18n & Icons:
  - Full translations across en, hi, mr, bn, pa.
  - Inline SVG icon recipe-pipeline in icon.registry.ts.

Acceptance:
- Vitest: 3-step recipe runs sequentially in order; intermediate steps pipe data correctly; invalid step parameters caught before execution starts; JSON export/import preserves exact recipe structure.
```

### Q5 — Recipes: batch run & starter recipes
**Depends on:** Q4 · **Effort:** M
**Target Route:** `/features/recipes/batch` (`src/app/features/recipe-batch/`)
**Target Services:** `RecipeBatchService` (`src/app/core/services/recipe-batch.service.ts`)
**Tool Catalogue ID:** `recipe-batch` (Category: `recipes`)

```text
Build Batch Execution capabilities for Recipes, with fault-tolerant processing, quota pre-checks,
and 3 built-in starter recipes.

Core Engine Requirements (FULL WORKING FUNCTIONALITY):
- Implement RecipeBatchService in src/app/core/services/recipe-batch.service.ts.
- Batch Pipeline Runner:
  - Execute a recipe over a queue of multiple files.
  - Per-file and overall progress reporting: e.g. "Processing File 3 of 10 — Step 2/3...".
  - Fault tolerance: A failing step on File 2 must NOT halt the entire batch; log the error for File 2 and proceed with File 3.
- Quota Pre-Check & Enforcement:
  - Check total operations against remaining daily free quota via StorageService.getQuotaStatus().
  - Display quota impact upfront (e.g. "10 files x 1 save = 10 operations. Remaining today: 15.").
  - Stop cleanly if quota is exhausted, reporting processed vs pending files.
- 3 Built-in Starter Recipes (Descriptive functional names):
  1. "Compress to 2 MB, then number pages" (Compression -> Bates/Page Numbering).
  2. "Scan cleanup: deskew, grayscale, OCR" (Deskew -> Grayscale Filter -> OCR Searchable PDF).
  3. "Submission prep: sanitize, flatten, preflight" (Privacy Sanitize -> AcroForm Flatten -> PDF Preflight Check).

Mobile Play Store UI / UX Requirements:
- Starter Recipes Showcase:
  - Horizontal swipeable cards at top presenting the 3 starter recipes with 1-tap "Run on Files" buttons.
- Batch Queue & Execution Dashboard:
  - File queue list showing status badges (Queued, Processing, Completed, Failed).
  - Dual progress indicator: Top bar shows overall batch progress; lower bar shows active file step progress.
  - Prominent "Cancel Batch" button.
- Summary Bottom Sheet:
  - Displays Success count, Failure count, and "Save All Outputs (ZIP)" thumb button.
- i18n & Icons:
  - Full translations for all starter recipe names across en, hi, mr, bn, pa.
  - Inline SVG icon recipe-batch in icon.registry.ts.

Acceptance:
- Vitest: 3-step recipe over 3-file batch produces 3 outputs with full execution log; single file failure does not abort remaining batch; quota limit stops execution gracefully; starter recipes execute with valid test inputs.
```

---

## Part R — Shell, flexibility & responsiveness

Not features. This is the frame the other 123 prompts render inside, addressing
the primary usability complaints:
1. **The UI is not handy to the user:** controls and primary actions are rigid,
   unreachable for one-handed thumb use on mobile devices, or clipped by viewport changes.
2. **Buttons and icons must be responsive:** controls use hardcoded pixel sizes
   that fail on small screens or high-density/scaled displays.
3. **All header options must be animated to slide left to right automatically:**
   on phones (<=960px), header options disappear into the drawer; instead, all
   navigation options should appear in a smooth, continuous or ping-pong sliding
   rail that glides left-to-right automatically and pauses on user touch.

Use **R0** as a turnkey master prompt that implements all shell UX improvements
in one pass, or follow the modular sequence **R1 -> R2 -> R3 -> R4**. Additive
rules still apply: no component's `@Input` names, defaults, or rendered output
may break existing callers.

### R0 — Master Shell Prompt: Handy & Flexible UI, Responsive Controls, Auto-Sliding Header Rail
**Depends on:** Part 0 · **Effort:** L

```text
Overhaul the shell UI so it is flexible, ergonomic ("handy" for one-handed mobile use),
guarantees fully responsive buttons and icons, and animates all header options
sliding automatically from left to right. This is purely shell styling, layout
elasticity, responsive tokens, and navigational animation — no existing tool behaviour,
APIs, or defaults may break.

Context & Pain Points to Solve:
- UI Handiness & Ergonomics: On mobile devices, primary tool actions are stranded
  at the top of tall screens or obscured by on-screen keyboards; grids and cards
  snap to rigid breakpoints rather than flowing naturally.
- Button & Icon Responsiveness: Sizing is locked in hardcoded pixels; app-button
  classes use fixed heights, and app-icon injects fixed width/height attributes into
  inline SVGs, preventing buttons and icons from adapting to viewport size or Android
  font-scale zoom settings.
- Header Options Animation: At <=960px, header navigation (.desktop-nav) is completely
  hidden, forcing all navigation into a drawer. All header options (Tools, PDF, Photo,
  Signature, Presets, History, Premium) must be visible in an auto-sliding rail that
  glides left to right automatically on view load.

Build:
1. Responsive Buttons & Icons (Fluid Control Scale):
   - In src/theme/variables.scss, define fluid CSS tokens beside existing ones:
     --control-h-sm/md/lg, --control-pad-x-sm/md/lg, and --icon-sm/md/lg using
     clamp(min, preferred + vw, max). Mins hold at 320px; maxes never look inflated at 1440px.
   - Floor every touch/pointer-driven control at max(<fluid value>, var(--min-touch-target, 44px))
     on (pointer: coarse) to meet accessibility guidelines without clipping.
   - app-button: size classes ('sm' | 'md' | 'lg') consume the new fluid tokens.
   - app-icon: continue supporting numeric sizes (default 20), but also accept
     'sm' | 'md' | 'lg' | 'inherit'. For non-numeric tokens, omit width/height SVG
     attributes and size the icon via CSS (1em or token) so it responsively scales
     with container dimensions and user text scaling (100% to 200%).

2. Auto-Sliding Header Options Rail (Left-to-Right Animation):
   - At <=960px, display all header navigation options (Tools dropdown/chip, PDF,
     Photo, Signature, Presets, History, Pro/Premium) inside a dedicated rail row.
   - Animate the rail to slide left to right automatically using the shipped
     AutoScrollDirective ([appAutoScroll]="true" with autoScrollMode="ping-pong" or "loop",
     autoScrollSpeed=0.65, edgePauseDuration=1200).
   - The rail slides automatically upon page load so all header options are actively
     presented to the user without requiring manual scrolling.
   - Automatically pauses on user interaction (touch, pointer drag, hover, or keyboard
     focus) and automatically resumes sliding ~2.5s after release.
   - The current active route option automatically scrolls into view and receives the
     active indicator line (.nav-item.active::after).
   - Left and right gradient fade masks indicate overflowing options naturally.
   - Honor prefers-reduced-motion by disabling automatic sliding while keeping manual swipe.
   - Fold rail height into --header-height and --header-total-height in header.component.ts
     so sticky bars and page content align flush with zero clipping.

3. Handy & Flexible Layouts:
   - Tool & preset grids: use grid-template-columns: repeat(auto-fit, minmax(<clamp>, 1fr))
     so cards reflow continuously across all screen widths.
   - Primary action handiness: at <=768px, pin primary actions to a sticky bottom action
     bar within env(safe-area-inset-bottom), padding the scroll container by the bar's
     height so all content is reachable by thumb with nothing covered.
   - Viewport flexibility: use dvh (Dynamic Viewport Height) instead of vh for modals
     and screens so Android URL bars and on-screen virtual keyboards never clip
     confirmations or form fields. Modal containers cap at min(90dvh, ...) with
     scrollable bodies.
   - Overflow handling: any row that overflows either auto-scrolls with appAutoScroll or
     wraps cleanly; horizontal document scrollbar is strictly forbidden.

Acceptance:
- Playwright checks across 320, 360, 390, 412, 768, 1180, 1440: no horizontal document
  scroll; all buttons and icons measure >=44px touch targets on mobile; header options
  auto-slide left-to-right unattended, pause on touchstart, and resume cleanly.
- 200% font/text scale at 360px shows no text clipping or button overlapping.
- npm run test:unit passes with zero regressions against baseline.
```

### R1 — Fluid control scale: responsive buttons, icons, tap targets
**Depends on:** nothing · **Effort:** M

```text
Make every button and icon responsive to the viewport and user font scale rather
than carrying a fixed pixel size, ensuring the UI is flexible and comfortable to tap.
This is sizing and responsiveness only — no behaviour, no API, no visual redesign.

Today's state — read these three before you change anything:
- src/theme/variables.scss: --min-touch-target: 44px (line ~178) and a fixed type
  scale. Nothing in the file is fluid; global.scss uses clamp() exactly once.
- app-button (shared/components/ui/button/button.component.ts): @Input() size
  'sm' | 'md' | 'lg' picks a class, each with a hard height and font-size.
- app-icon (shared/components/ui/icon/icon.component.ts): @Input() size = 20 is a
  NUMBER written straight into the SVG's width/height attributes, so an icon
  cannot respond to its container or to an Android font-scale setting at all.

Build:
- Add a fluid control scale to src/theme/variables.scss as NEW tokens beside the
  existing ones — --control-h-sm/md/lg, --control-pad-x-sm/md/lg,
  --icon-sm/md/lg — each a clamp(min, preferred + vw, max). Mins must hold at
  320px; maxes must not look inflated at 1440px.
- Floor every pointer-driven control at max(<fluid value>,
  var(--min-touch-target, 44px)). The fluid scale may never take a tap target below
  44px on (pointer: coarse). The glyph inside may be scaled proportionally; the
  hit box is what accessibility reviews measure.
- app-button: the three size classes read the new tokens. The @Input() values and
  the 'md' default stay as they are.
- app-icon: keep accepting a number (default 20, byte-for-byte the same output),
  and also accept 'sm' | 'md' | 'lg' | 'inherit'. For the non-numeric forms, emit
  no width/height attribute and size the SVG in CSS (1em or the token) so it
  responsively tracks its container and the user's text size.
- Ensure all icon buttons and responsive buttons provide immediate visual active/hover
  feedback without layout shifting.
- Nothing may reflow onto a second row unexpectedly, clip, or overlap anywhere
  between 320px and 1440px, at 100% and at 200% text scaling.

Acceptance:
- Vitest on app-icon: a numeric size renders today's width/height attributes; a
  token size renders none and is sized by CSS.
- Playwright at 320, 360, 390, 412, 768, 1180, 1440: every button and icon button
  in the header, the tool grid and the organizer action bar measures at least
  44x44 below 960px, and the document never scrolls horizontally.
- npm run test:unit shows no new failures against the count you recorded first.
```

### R2 — Auto-sliding header option rail (animated left-to-right)
**Depends on:** R1 · **Effort:** M

```text
All header options must be accessible on every screen size and animated sliding
left to right automatically: on phones, options were hidden in a burger menu;
now, all options (Tools, PDF, Photo, Signature, Presets, History, Premium) glide
smoothly across the header rail so the user sees all available capabilities in motion.

Build:
- Below 960px the bar displays all navigation options in a dedicated sub-row rail:
  Tools dropdown/trigger, PDF, Photo, Signature, Presets, History, Pro/Premium.
  The burger menu drawer stays as a secondary route; this rail puts all options
  directly on screen.
- Animate the rail to slide left to right automatically using the shipped
  AutoScrollDirective (src/app/shared/directives/auto-scroll.directive.ts) — do
  not write a second marquee. appAutoScroll in 'ping-pong' mode glides left to right,
  pauses ~1.2s at the edge and glides back (or smooth loop); hover, touch, pointer,
  focus and manual swipe pause it immediately; it resumes ~2.5s after release;
  prefers-reduced-motion stops it and leaves a normally swipeable row. All of that
  already exists — pass inputs, do not re-implement it.
- Slide animation starts automatically on page load so all header options are
  presented to the user without requiring manual scrolling.
- :host in header.component.ts owns --header-height: 60px and derives
  --header-total-height from it + the safe-area inset. Fold the rail's height
  into those tokens instead of hard-coding a number anywhere: the drawer, the
  sticky offset and the page wrapper all measure against them, and a mismatch
  leaves a dead strip or hides content under the bar.
- Left and right fade masks on the rail, so a half-scrolled option reads as "more
  this way" rather than as a clipped label.
- On a route change the active option scrolls into view and centres, and the
  existing .nav-item.active::after underline lands on it in the rail too.
- Tab reaches every option in DOM order; focus pauses the slide.
- At >=1180px nothing changes. The desktop nav renders as it does today.
- Labels keep going through the translate pipe — Hindi, Bengali and Punjabi
  labels are longer than English, which is why white-space: nowrap is already on
  .nav-item. The rail must hold at the longest of the five dictionaries.

Acceptance:
- Playwright at 360 and 390: all header options are reachable in the rail without
  opening the drawer; scrollLeft advances unattended left to right, stops on touchstart,
  and resumes after the pause delay.
- With prefers-reduced-motion: reduce, scrollLeft never moves on its own and the
  row still scrolls by swipe.
- Content sits flush under the header at 360, 768 and 1440 — no gap, nothing
  hidden behind the bar.
- auto-scroll.directive.spec.ts and the existing header e2e specs still pass.
```

### R3 — Handy & flexible layout: reachable actions, fluid grids, nothing clipped (completed)
**Depends on:** R1 · **Effort:** M

```text
The UI is not handy if the user has to stretch awkwardly on mobile screens or if
views clip during keyboard input or viewport resizing. Make the screens flexible,
ergonomic, and thumb-friendly rather than tuned to rigid named breakpoints.
Layout only — no tool's behaviour or output changes.

Build:
- Thumb-reachable primary actions: at <=768px, pin the primary action of each tool
  screen (Convert, Compress, Reorder, Sign, Export, etc.) to a sticky action bar
  at the bottom of the viewport inside env(safe-area-inset-bottom). Pad the main
  scroll container by the bar's own height so the bottom-most content is never obscured.
- Tool and preset grids: grid-template-columns: repeat(auto-fit, minmax(<clamp>,
  1fr)) so cards reflow continuously. Remove per-breakpoint fixed column counts
  where auto-fit replaces them; keep the breakpoint only where the content
  genuinely needs a different shape.
- Use dvh, not vh, for anything that must stay visible — the Android URL bar and
  the on-screen keyboard both change the viewport, and vh measures the wrong one.
  Modals cap at min(90dvh, …) with a scrollable body, so confirm buttons and forms
  are reachable and handy even with the virtual keyboard open.
- Any row that overflows either auto-scrolls (the appAutoScroll row treatment,
  already on 11 screens) or wraps gracefully. Nothing clips.
- The layout survives 200% text scaling and the Android font-scale setting
  without clipping or overlap.
- Dark mode and both orientations, at every width touched.

Acceptance:
- Playwright at 360x640, 390x844, 412x915, 768x1024 and 1440x900, portrait and
  landscape: no horizontal document scroll; the primary action of the organizer,
  the converter and the compressor is inside the thumb zone without scrolling; no
  element overlaps the sticky bars.
- A 200% text-scale run at 360px shows no clipped label and no overlap.
- npm run test:unit and the existing Playwright specs for the screens you touched
  show no new failures.
```

### R4 — Responsive proof pass (completed)
**Depends on:** R1, R2, R3 · **Effort:** S

```text
One script that proves the three prompts above, with committed images — so the
next change to the shell can be compared against something rather than argued
about.

Build:
- tools/capture-responsive.mjs, modelled on tools/capture-screenshots.mjs, but
  writing to docs/screenshots/responsive/ inside the repo. Note that
  capture-screenshots.mjs has an absolute outDir pointing outside this project —
  do not copy that line.
- Widths: 320, 360, 390, 412, 768, 1180, 1440. Screens: home, PDF Studio, the
  organizer, the converter, one modal, and the header with the rail mid-slide.
- Light and dark, and one 200% text-scale run at 360px.
- Deterministic: onboarding dismissed, fixed demo profile, animations settled
  before the shot, prefers-reduced-motion forced for the still images so the
  rail is in a known position. File names are <screen>-<width>-<theme>.png.
- Print a summary table: width, screen, horizontal overflow yes/no, smallest tap
  target found. A horizontal overflow or a sub-44px target below 960px exits
  non-zero.

Acceptance:
- The script runs green from a clean www build and writes every expected file.
- The summary reports no horizontal overflow and no tap target under 44px below
  960px.
- Images committed under docs/screenshots/responsive/.
```


---

## Suggested order

Two prompts are correctness, not features, and should go first — both are small
and neither changes anything a user relies on today:

1. **O0** — OCR model delivery. The offline claim is wrong today and this blocks
   every other OCR prompt.
2. **N1** — AES-256. The shipped RC4 output is the weakest option in the spec and
   is deprecated in PDF 2.0.

One more group goes early for a different reason: **R0-R4**, the shell. Every
prompt in this file adds a screen, a button row or a chip rail, so the fluid
control scale and the sliding header rail are far cheaper to land before those
123 screens exist than after (use **R0** to execute all shell requirements in one pass).

Then, by value per unit of work:

| Wave | Prompts | Why |
| --- | --- | --- |
| 1 | A1-A8, B1, B2 | Extends services that already exist; split-by-size is the most requested missing case |
| 2 | H4, H5, H8, I1, I2 | Scan quality improves every downstream output; the ID photo studio is the highest-value single addition |
| 3 | D0-D7, C1-C3, B6, B7 | D0 unlocks all the geometry work; interleave and insert are small and sharp |
| 4 | F1-F5, G1, G2, G7 | Size control and integrity reporting, mostly read-and-report |
| 5 | J1, J9, J10, L1-L6 | Markdown and JSON are cheap on the existing extractor; reader upgrades are self-contained |
| 6 | N2-N9, G3-G6, G8-G10 | Security and integrity depth; claim accuracy is the risk here, not difficulty |
| 7 | E1-E3, C4-C6, K1-K5, K7 | Outline work unlocks chapter split and the bookmarks sidebar |
| 8 | O1-O5, P1-P8, Q1-Q3 | OCR breadth and extraction, once O0 is settled |
| 9 | Q4, Q5, I3-I10, J2-J8, J11, H1-H3, H6, H7 | Breadth once the engines exist |
| 10 | K6, M1-M5, P9, F6, F3, M6 | The long poles. M6 last of everything, and only if it validates |
