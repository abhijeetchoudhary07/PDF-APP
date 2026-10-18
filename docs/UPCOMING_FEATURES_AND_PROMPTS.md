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
| N3 | Batch protect / unprotect | S |
| N4 | Verified redaction | M |
| N5 | Search-and-redact by pattern | M |
| N6 | Metadata editor (set, not only strip) | S |
| N7 | Hidden-content audit (report-only) | M |
| N8 | App lock & panic clear | M |
| N9 | Per-document privacy report card | S |
| O0 | **OCR model delivery decision — blocks O1** | M |
| O1 | OCR language expansion | M |
| O2 | Automatic script & language detection | M |
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
| R1 | Shell: fluid control scale for every button, icon and tap target | M |
| R2 | Shell: auto-sliding header option rail (all options animated left-to-right) | M |
| R3 | Shell: handy & flexible layout — reachable actions, fluid grids, nothing clipped | M |
| R4 | Shell: responsive proof pass — one script, every width, committed images | S |

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
exactly as they do. **M6 last, and only if it validates.**

### M1 — Form builder
**Depends on:** nothing · **Effort:** L

```text
New screen at /features/pdf/forms/build: create fields, not only fill them.

Build:
- Create text, checkbox, radio group, dropdown, list, date and signature fields by
  drawing them on the page, using pdf-lib's PDFForm API.
- Per-field: name, required flag, default value, max length, read-only, tooltip.
- Tab order editor.
- The EXISTING fill-and-flatten path must handle documents this builder produces —
  test that explicitly.

Acceptance:
- Vitest: every created field type reads back through pdfjs with the right type and
  flags; a built form fills and flattens through the existing path unchanged.
```

### M2 — Form data import & export
**Depends on:** M1 for the field model (works on existing forms too) · **Effort:** M

```text
Build:
- Export form data as FDF, XFDF, CSV and JSON.
- Import the same formats back into a matching form, reporting fields that did not
  match rather than dropping them silently.
- Round-trip fidelity for every field type, including checkbox and radio states.

Acceptance:
- Vitest: XFDF round-trip preserves every value and state; an unmatched field name
  is reported, not swallowed.
```

### M3 — Form mail-merge
**Depends on:** M2 · **Effort:** M

```text
Fill one template from many rows.

Build:
- Map CSV columns to form fields, fill once per row, and produce N documents.
- Output naming template from row values.
- Optionally flatten each output.
- Per-row result log.
- Quota: show the total free-tier cost before running, since every output goes
  through StorageService.saveFile, and stop cleanly at the limit.

Acceptance:
- Vitest: 3 rows produce 3 documents with the right values and names; a row with a
  missing column is reported and skipped, not silently blank.
```

### M4 — Signature appearance templates
**Depends on:** nothing · **Effort:** S

```text
Extend the Signature Studio. The drawn pad and burn-in are unchanged.

Build:
- Appearance template: reason, location, date format, optional logo, and a
  "signed by" text block alongside the signature image.
- Initials auto-generated from a typed name.
- A typed-signature option using an embedded handwriting-style font, as an
  alternative to drawing.
- Saved templates.

Acceptance:
- Vitest: template rendering places each element at the expected position; initials
  derivation handles single names, middle names and multi-word surnames.
```

### M5 — Multi-party signing order
**Depends on:** M1 · **Effort:** M

```text
Extend the existing signature-request placeholders with a signing state machine,
entirely on-device.

Build:
- Define signers, their fields, and an order.
- Export a signing packet (the PDF plus a manifest of who signs what, in order).
- Track which fields have come back filled, and show what is outstanding.
- No cloud, no email sending — the packet is shared through the existing share
  sheet.

Acceptance:
- Vitest: packet manifest shape; the outstanding-field calculation after a partial
  return.
```

### M6 — Certificate-based signing (PKCS#12)
**Depends on:** M4 for the appearance · **Effort:** L

```text
A real cryptographic signature. BUILD THIS LAST AND ON ITS OWN. Never touch the
drawn-signature path while doing it.

Build:
- Load a .p12/.pfx, unlock it with its password, and sign with WebCrypto
  (RSA + SHA-256).
- Build a PKCS#7/CMS SignedData container.
- Reserve a correct /ByteRange placeholder and write via incremental update so the
  signature covers the whole file.
- Visible signature appearance from M4's template.
- Embed a timestamp only if one can be obtained offline; otherwise omit it and say
  so rather than faking one.

Honesty gate:
- Verify the output in at least two strict third-party viewers before considering
  this done.
- If it cannot be made to validate, SHIP NOTHING for this item and report why. A
  signature that viewers flag as invalid is worse than no signature feature.
- No UI string claims a signature is "legally valid" or "verified".

Acceptance:
- Vitest: /ByteRange arithmetic covers the file exactly; the CMS structure parses;
  the document hash matches what was signed.
- Two independent viewers report the signature as intact.
```

---

## Part N — Security & privacy

**The existing RC4 Standard-128 path (V=2, R=3) stays, works unchanged, and stays
available.** It is relabelled "Legacy (maximum compatibility)", never removed, and
its code is not refactored.

### N1 — AES-256 and AES-128 encryption
**Depends on:** nothing · **Effort:** L

```text
A correctness upgrade, not a feature. The shipped output is RC4 Standard-128,
which is the weakest option in the spec and is DEPRECATED IN PDF 2.0; AES-256
(V=5, R=6) is the only value PDF 2.0 does not deprecate.

Build:
- AES-256 (V=5, R=6) and AES-128 (V=4, R=4), added as an algorithm choice that
  defaults to AES-256 for new protection.
- Use WebCrypto for AES-CBC and SHA-256/384/512. Implement the R6 hardened hash
  (Algorithm 2.B) and write /U, /O, /UE, /OE and /Perms correctly.
- The existing RC4 path stays selectable as "Legacy (maximum compatibility)" and
  its output must be unchanged.
- Permissions bitmask handling is shared, not duplicated.

Acceptance:
- Vitest: R6 key derivation against the published test vectors; encrypt-then-open
  round-trip at every algorithm setting; the RC4 path produces the same structure
  it produces today for a fixed input and document id.
- Output verified to open in at least two independent viewers per algorithm.
- No UI string calls any of this unbreakable.
```

### N2 — Password strength meter & owner-password warning
**Depends on:** nothing · **Effort:** S

```text
Build:
- A strength meter (length, character classes, common-password check) with
  actionable guidance, not just a colour bar.
- A passphrase generator.
- Warn explicitly when the owner password falls back to the user password — the
  current code does this by design, so SURFACE it rather than changing it.
- Explain in plain language what the user password and owner password each do.

Acceptance:
- Vitest: scoring boundaries; the fallback warning fires exactly when only one
  password is supplied.
```

### N3 — Batch protect / unprotect
**Depends on:** N1 · **Effort:** S

```text
Build:
- Apply one password and permission set across many files, or remove protection
  from many files with a known password.
- Per-file result log, with wrong-password reported per file rather than aborting
  the run.
- Quota-aware, like every batch operation.

Acceptance:
- Vitest: a mixed batch where one password is wrong completes the rest and logs
  the failure.
```

### N4 — Verified redaction
**Depends on:** nothing · **Effort:** M

```text
The editor already draws and applies redactions. What is missing is proof. That
proof is the whole difference between a black rectangle and a redaction.

Build:
- After applying redactions, re-extract text from the OUTPUT and search for the
  redacted strings.
- Report per redaction: removal provable / not provable.
- Offer a rasterize-the-region fallback when vector removal cannot be proven, and
  say what that costs (text in the region stops being selectable).
- Do NOT change how redactions are drawn or applied.

Acceptance:
- Vitest: verification correctly reports success on a clean removal and failure on
  a deliberately incomplete one.
- The UI never says "permanently removed" for an unproven redaction.
```

### N5 — Search-and-redact
**Depends on:** N4 · **Effort:** M

```text
Build:
- Match a pattern across all pages: phone numbers, account numbers, emails, dates,
  free text, or a user regex, with built-in presets.
- A reviewable match list with page, context and a per-match include toggle —
  nothing is redacted without being seen.
- Apply through the existing redaction path, then run N4's verification.

Acceptance:
- Vitest: preset patterns match their fixtures without false positives on adjacent
  text; applying redacts exactly the selected matches.
```

### N6 — Metadata editor
**Depends on:** nothing · **Effort:** S

```text
The Privacy Sanitizer strips metadata. Sometimes a submission needs it CORRECT
rather than absent.

Build:
- Set Title, Author, Subject, Keywords, and creation/modification dates.
- Show the current values and what will change.
- The sanitizer's strip behaviour is untouched and stays the default everywhere it
  already applies.

Acceptance:
- Vitest: values round-trip through pdfjs; the sanitizer still strips everything it
  strips today.
```

### N7 — Hidden-content audit
**Depends on:** G4 · **Effort:** M

```text
Report-only. The sanitizer removes in bulk; this shows what is there first.

Build:
- Detect: optional content groups (layers) including hidden ones, content outside
  the crop box, white-on-white or background-coloured text, text clipped but
  present, and annotations positioned off the visible page.
- Per finding: page, what it is, and a preview where one can be rendered.
- Link each finding to the tool that removes it.

Acceptance:
- Vitest: each detector against a fixture that trips it and one that does not;
  white-on-white detection does not flag ordinary light-grey text.
```

### N8 — App lock & panic clear
**Depends on:** nothing · **Effort:** M

```text
Build on the existing local-data-storage screen.

Build:
- Biometric or PIN lock for the app, and separately for the history vault.
- Auto-clear temp files on exit, with the setting visible and the amount shown.
- A one-tap clear of all history and caches, with a confirm step naming exactly
  what will be deleted and that it cannot be undone.
- Lock is OFF by default; nothing about today's launch flow changes until it is
  enabled.

Acceptance:
- Vitest: lock-state persistence; the clear action removes exactly the keys and
  caches it names and nothing else.
```

### N9 — Per-document privacy report card
**Depends on:** G2, N7 · **Effort:** S

```text
Build:
- A plain-language summary of what a file reveals: who made it, with what
  software, when, on what device, plus whether it carries scripts, attachments,
  hidden layers or GPS-bearing images.
- Written for someone who does not know what XMP is.
- Exportable, and a one-tap hand-off to the sanitizer.

Acceptance:
- Vitest: the report's findings match the underlying scan on a fixture carrying
  each category.
```

---

## Part O — OCR

**O0 first. It blocks O1 and it is a live problem today, not a new feature.**

### O0 — OCR model delivery decision
**Depends on:** nothing · **Effort:** M

```text
Fix how OCR language models are delivered. This is a correctness problem that
exists in the shipped app.

The finding: OcrService calls createWorker(langStr, 1, {...}) with NO langPath, so
tesseract.js resolves .traineddata from its default public CDN on first use and
caches it in IndexedDB — while the on-screen progress message reads "Loading OCR
language models (cached locally for offline use)". The five shipped languages
therefore need connectivity on their first run, in an app whose headline claim is
that it works offline.

Build — pick one and state why:
 (a) Bundle the .traineddata files in the app and point langPath at the local
     asset directory. Each file is roughly 1-15 MB, so five is realistic.
 (b) Explicit opt-in download per language, with the size shown and a clear "this
     needs internet once" prompt.
 (c) Bundle English plus the primary language; download the rest on request.

Also:
- Correct the misleading progress message either way.
- Do NOT change recognition behaviour or output for the five current languages.
- Report explicitly that the store-listing offline claim needs re-reading against
  whichever option is chosen.

Acceptance:
- With the device offline and caches cleared, OCR in a bundled language works, or
  the UI states plainly and in advance that a download is required.
- ocr.spec.ts passes unchanged and output for the current five languages is
  identical.
```

### O1 — OCR language expansion
**Depends on:** O0 · **Effort:** M

```text
Build:
- Add Tamil, Telugu, Kannada, Malayalam, Gujarati, Odia, Assamese, Urdu, Sanskrit
  and Nepali, plus Arabic, Chinese, Spanish and French.
- Prefer the Indic-OCR trained models over upstream for Indic scripts where they
  measurably win on a shared test page — measure, do not assume.
- Multi-language selection in one pass, as today.
- Respect whatever O0 decided about delivery; show per-language availability and
  size.

Acceptance:
- Vitest: language-code plumbing per script; the searchable-PDF text layer is
  positioned correctly for a non-Latin script.
- The five existing languages behave identically.
```

### O2 — Automatic script & language detection
**Depends on:** O1 · **Effort:** M

```text
Build:
- Detect the script and likely language from a sample of the page before OCR, so
  the user does not have to choose.
- Show the detection, let the user override it, and remember the override.
- Fall back to the current manual choice when confidence is low — never pick
  silently on a weak signal.

Acceptance:
- Vitest: detection on fixtures per script; a low-confidence page falls back to
  asking rather than guessing.
```

### O3 — Handwriting mode
**Depends on:** O0 · **Effort:** M

```text
Build:
- A separate model path for handwriting, selectable explicitly.
- State the accuracy expectation IN THE UI BEFORE a long run starts — handwriting
  recognition will disappoint anyone expecting print-level accuracy.
- Always keep the original image alongside the text output.

Acceptance:
- Vitest: the mode selects the handwriting path and does not alter print-mode
  behaviour.
- The expectation notice appears before processing, not after.
```

### O4 — OCR confidence tools
**Depends on:** nothing · **Effort:** M

```text
Make OCR output correctable instead of take-it-or-leave-it.

Build:
- A confidence heatmap overlay on the page.
- A low-confidence word list with jump-to-location and inline correction.
- A persistent correction dictionary (common misreads for this user's documents)
  applied to later runs.
- Re-OCR a selected region at higher resolution.

Acceptance:
- Vitest: heatmap bucket maths; dictionary application is idempotent and
  case-aware; a region re-OCR replaces only that region's text.
```

### O5 — Table OCR → Excel
**Depends on:** O0 · **Effort:** M

```text
The current table extractor works on digital PDFs. Scans need the OCR path.

Build:
- Detect table structure in a scanned page or photo (ruling lines where present,
  whitespace-column inference where not), OCR each cell, and export to .xlsx or
  .csv through the existing table export.
- A preview grid with editable cells before export — cell-level OCR will make
  mistakes and the user must be able to fix them.

Acceptance:
- Vitest: row and column counts on a ruled-table fixture and on a whitespace-only
  table; cell text lands in the right cell.
```

---

## Part P — Extraction & local AI

### P1 — Structured field extraction
**Depends on:** O5 · **Effort:** L

```text
New capability: pull key/value pairs out of documents.

Build:
- Document categories: receipt, invoice, bill, ID document, bank statement.
  GENERIC CATEGORIES ONLY — no institution, board or scheme names anywhere.
- Extract dates, totals, tax numbers, document numbers, names and addresses, each
  with a confidence score and the page/position it came from.
- A human-review step before anything is exported; low-confidence fields are
  flagged, never silently accepted.
- Export to CSV and JSON.

Acceptance:
- Vitest: a fixture receipt yields the expected key/values; a field that is absent
  is reported absent rather than guessed; confidence ordering is sane.
```

### P2 — Business card → vCard, document → calendar
**Depends on:** nothing · **Effort:** S

```text
Build:
- Business card photo -> contact fields -> .vcf, reusing the vCard builder the QR
  toolkit already has rather than writing a second one.
- Detect dates and times in a document and offer an .ics calendar event.
- Editable review before export in both cases.

Acceptance:
- Vitest: vCard and .ics output are valid and parse back to the input values;
  ambiguous dates are surfaced for confirmation, not assumed.
```

### P3 — Barcode batch mode & 1D generation
**Depends on:** nothing · **Effort:** M

```text
Extend the QR & barcode toolkit. Existing scanning and QR generation unchanged.

Build:
- Batch scan mode: keep the camera open, collect many codes in one session,
  dedupe, show a running list, export to CSV.
- Generate 1D codes (Code 128, EAN-13) alongside QR, with check-digit validation
  for EAN.
- Bulk-generate from a CSV column into a ZIP or a printable sheet.

Acceptance:
- Vitest: dedupe across repeated scans; EAN-13 check digit validation rejects a
  bad payload; bulk generation count matches the input rows.
```

### P4 — Multi-document Q&A
**Depends on:** nothing · **Effort:** M

```text
Extend the local intelligence provider. Single-document Q&A is unchanged.

Build:
- Ask one question across a set of documents.
- Citations name the FILE and the page, not just the page.
- Show which documents were searched and which had no relevant content.
- Stays on-device, like the existing provider.

Acceptance:
- Vitest: citation attribution across a three-document fixture; a question with no
  answer in the set says so rather than inventing one.
```

### P5 — Auto-tagging, classification & rename-from-content
**Depends on:** nothing · **Effort:** M

```text
Make a folder of scans sort itself.

Build:
- Classify a document into a generic type (receipt, letter, form, certificate,
  statement, notes) with a confidence.
- Suggest tags from content, and a filename from the detected title and date.
- Suggestions only — the user confirms before anything is renamed or tagged.
- Batch mode over the history vault.

Acceptance:
- Vitest: classification on one fixture per type; renames are proposed, never
  applied without confirmation; filesystem-unsafe characters are stripped.
```

### P6 — Entity & clause extraction
**Depends on:** nothing · **Effort:** M

```text
Build:
- Extract dates, amounts, parties, deadlines and reference numbers, each anchored
  to its page and position so it can be clicked.
- Flag obligation-bearing clauses (must, shall, within N days, penalty) in longer
  documents.
- Present as a reviewable list, with an export.
- No legal advice framing anywhere in the UI — this finds text, it does not
  interpret contracts.

Acceptance:
- Vitest: entity extraction on a fixture with known dates and amounts; page
  anchors resolve to the right location.
```

### P7 — Reading time & readability
**Depends on:** nothing · **Effort:** S

```text
Build:
- Word count, estimated reading time, and a readability score with a plain-language
  band (easy / moderate / dense).
- Per document and per section.
- Say which metric is used rather than presenting a bare number.

Acceptance:
- Vitest: word count and score against a fixture with a known expected value.
```

### P8 — Side-by-side translation & summary export
**Depends on:** nothing · **Effort:** M

```text
Extend the existing translation feature, which stays as it is.

Build:
- Side-by-side view: original page beside the translation, scroll-locked.
- Export a summary or translation as PDF or DOCX, reusing the existing docx
  dependency.
- Layout-preserving in-place translation is NOT in this prompt: text that grows
  30% does not fit the original boxes, and a silently overflowing page is worse
  than a side-by-side view. If it is wanted later, raise it as its own decision.

Acceptance:
- Vitest: scroll-lock index mapping across pages of unequal text length; export
  structure.
```

### P9 — Accessibility pass
**Depends on:** E1 · **Effort:** L

```text
Build:
- Generate tagged-PDF structure (/StructTreeRoot) for headings, paragraphs, lists
  and tables where the layout supports confident inference.
- Alt text for images: prompt the user, with an OCR-derived suggestion for images
  that contain text.
- A reading-order check with a reorder UI.
- Read-aloud (shares L5).

Honesty gate:
- Structure inference from a visual layout is a genuine research problem. Generate
  only what can be verified, report what could not be inferred, and NEVER label a
  document "accessible" or "WCAG compliant" — that is the same class of false
  claim as an unverified PDF/A badge.

Acceptance:
- Vitest: the written /StructTreeRoot object graph for a simple fixture; an
  ambiguous layout is reported as uninferrable rather than mis-tagged.
- Grep: no UI string claims accessibility compliance.
```

---

## Part Q — Presets, validator & pipelines

### Q1 — Preset builder from instructions
**Depends on:** nothing · **Effort:** M

```text
Build:
- OCR a page of upload instructions (a photo or PDF of the requirements) and
  propose a specification profile: size limits in KB, dimensions, format, DPI.
- Show what it extracted beside the source text, every field editable, nothing
  applied without confirmation.
- Save as a profile. Named by its numbers, never by an institution.

Acceptance:
- Vitest: extraction from a fixture instruction sheet with known limits; an
  unparseable sheet reports rather than inventing values.
```

### Q2 — Profile export & import
**Depends on:** nothing · **Effort:** S

```text
Build:
- Export a specification profile as JSON and import one back, with validation and
  a clear message on a malformed or version-mismatched file.
- A documented, versioned schema.
- Shareable through the existing share sheet.

Acceptance:
- Vitest: round-trip equality; a malformed file is rejected with a specific reason.
```

### Q3 — Batch check against a profile
**Depends on:** Q2, G3 · **Effort:** M

```text
Build:
- Check many documents or images against one profile at once.
- A pass/fail table with the measured value per rule per file.
- Batch auto-fix for the fixable failures, reusing the existing 1-click auto-fix
  pipeline, with a per-file result log.
- Quota-aware: show the cost before running.

Acceptance:
- Vitest: a mixed batch reports correctly per file; auto-fix flips the fixable
  failures and leaves the unfixable ones clearly reported.
```

### Q4 — Recipes: pipeline engine
**Depends on:** nothing · **Effort:** M

```text
New RecipeService. Extend the existing batch tools — do NOT build a second batch
engine.

Build:
- A serializable step list: each step is a tool id plus its parameter object,
  validated against a per-tool schema.
- Run over one document, with per-step progress, cancellation, and a step-by-step
  result log.
- Save, rename, duplicate and delete recipes locally; export and import as JSON.
- A step whose parameters no longer validate (because a tool changed) is reported,
  not silently skipped.

Acceptance:
- Vitest: a 3-step recipe runs in order and logs each step; an invalid step is
  reported before the run starts; JSON round-trip preserves behaviour.
```

### Q5 — Recipes: batch run & starter recipes
**Depends on:** Q4 · **Effort:** M

```text
Build:
- Run a recipe over a batch, with per-file and overall progress and a per-file log
  (succeeded, skipped, failed and why).
- A failing middle step on one file must not abort the remaining files.
- Quota: every saved output goes through StorageService.saveFile, so a recipe over
  10 files costs 10 free-tier operations. Show the cost BEFORE the run and stop
  cleanly at the limit, reporting what was and was not processed.
- Three starter recipes, named by what they do: "Compress to 2 MB, then number
  pages" · "Scan cleanup: deskew, grayscale, OCR" · "Submission prep: sanitize,
  flatten, preflight".

Acceptance:
- Vitest: a 3-step recipe over a 3-file batch produces 3 outputs and a complete
  log; a failing file does not stop the others; the quota stop is clean and
  accurate.
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

### R3 — Handy & flexible layout: reachable actions, fluid grids, nothing clipped
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

### R4 — Responsive proof pass
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
