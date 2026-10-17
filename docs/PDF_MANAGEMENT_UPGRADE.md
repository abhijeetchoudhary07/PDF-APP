# PDF Management, Organizing & Integrity — Updated Feature List & Build Prompts

**Written:** 2026-10-14 · **Scope:** Section I of [APP_FEATURES.md](APP_FEATURES.md) · **Status:** planning document, not a store-facing claim

**Companion:** Sections II–VI (image, conversion, editing, security, OCR/AI) are in [SUITE_UPGRADE_SECTIONS_2-6.md](SUITE_UPGRADE_SECTIONS_2-6.md). **Prompt 0 below is the shared contract for both documents** — prepend it to every build session.

This replaces the 7-line summary of the PDF management suite with a 27-entry map:
the 9 tools that ship today, plus 18 researched additions drawn from what Sejda,
Stirling PDF, PDF24, Adobe Acrobat and Nutrient/Apryse expose in the same category.
Every addition is checked against what `pdf-lib` + `pdfjs-dist` can actually do
on-device, because the whole product promise is that nothing leaves the phone.

> **Do not copy the 🆕 rows into Play Store listing text, `APP_FEATURES.md`, or
> in-app marketing until they ship.** The last Play rejection in this project was
> a Misleading Claims flag; unbuilt features described as present are exactly how
> that repeats.

**Legend** — ✅ shipped · 🔶 shipped but thin (listed gaps are real) · 🆕 new

---

## Part 1 — The updated feature list

### A. Inspect & triage

**1. PDF Studio — central inspection, metadata overview, rapid tool launchpad** ✅
- 🆕 **Health strip** on the loaded document: encryption state, PDF version, linearized flag, fonts embedded vs. referenced, mixed page sizes, JavaScript/attachments present, scanned-vs-digital verdict, searchable-text coverage %.
- 🆕 **Byte audit:** which pages and which embedded images carry the file size, so the user picks the right compression path instead of guessing.
- 🆕 **Resume last document** across tools (the hand-off service already exists for OCR/validator/intelligence — extend it to the whole PDF suite).

**2. Document Fingerprint & Integrity Receipt** 🆕
- SHA-256 of the file plus a per-page content hash, computed with WebCrypto.
- "Has this file changed?" check: re-hash a file against a saved receipt and report page-level drift.
- Exportable receipt (`.txt` and a stamped PDF) for anyone who has to prove a submitted copy is the copy they sent.

### B. Size & output control

**3. PDF Compression — adaptive vector/raster, target KB/MB, 3 presets** ✅
- 🆕 **DPI ceiling** control (72 / 96 / 150 / 200 / 300) with a per-image downsample report.
- 🆕 **Grayscale and 1-bit mono paths** for scanned forms — the single biggest size win on phone scans.
- 🆕 **Identical-image dedupe:** hash image XObjects and reference each one once.
- 🆕 **Before/after proof view:** side-by-side render at the same zoom, KB delta, and an explicit warning when text has been rasterized.
- 🆕 **"Fit the upload limit" mode:** chains strip-metadata → downsample → grayscale → and, only if still over, offers a size-based split.

**4. Structure Optimizer & Fast-Web-View Pass** 🆕
- Drops orphaned/unreferenced objects, rewrites with object streams, dedupes repeated fonts.
- Best-effort page-order linearization for a faster first-page render.
- Reports what it did in bytes. Labelled "optimized", never "PDF/A" or "certified Fast Web View" — see the honesty notes in Part 3.

### C. Combine

**5. Merge PDF — non-destructive vector merge, drag reorder, structure preservation** ✅
- 🆕 **Per-file page subsets:** take `1-3` from file A and all of file B in one pass.
- 🆕 **Sort by** file name / date modified / size, ascending or descending, before merging.
- 🆕 **Auto-bookmarks + optional table-of-contents page** named after the source files.
- 🆕 **Cover page and separator sheets** between sources.
- 🆕 **AcroForm collision handling:** detect duplicate field names across sources, then rename or flatten rather than silently losing values.
- 🆕 **Signature warning:** merging breaks existing digital signatures — say so and offer strip-or-cancel instead of producing a quietly invalid file.

**6. Alternate & Mix (Interleave)** 🆕
- Weave pages from two or more documents alternately, with the option to reverse one side.
- Built for the phone-scanning reality: scan every front, then every back, then interleave into correct order.

**7. Insert Pages** 🆕
- Insert another PDF, an image, or blank pages at an exact position, without rebuilding the document in the organizer.

**8. Overlay / Underlay PDF** 🆕
- Lay one PDF over or under another: letterhead, pre-printed government form, watermark sheet, or a stamp page.
- Page mapping modes: sequential, interleaved, fixed-repeat. Position: foreground or background.

### D. Divide

**9. Split PDF — custom ranges, fixed intervals, single-page burst** ✅
- 🆕 **Split by output file size:** every part under N MB — the upload-portal case the current modes cannot serve.
- 🆕 **Split by document count:** into exactly N files of even length.
- 🆕 **Split by bookmarks/chapters**, using the document outline.
- 🆕 **Split at detected blank pages or at QR divider sheets** (reuses the barcode toolkit and the new blank detector) for batch-scanned stacks.
- 🆕 **Split by text pattern:** start a new document whenever a header line changes — invoice runs, roll-number batches, payslip exports.

**10. Spread Split & Page Sectioning** 🆕
- Cut each page into a grid: halves, quarters, or custom rows × columns.
- A3 spread → 2 × A4; book-scan gutter split with automatic gutter detection.

**11. Poster Tiling / Printable Chunks** 🆕
- Slice one oversized page into A4/Letter tiles with configurable overlap and crop marks, for printing a large sheet on a home printer.

### E. Organize

**12. Extract & Organize Pages — thumbnail grid, reorder, rotate 90/180/270, delete, duplicate** ✅
- 🆕 **Page-order expressions** with live preview: `1,3,2,4-6`, `2n-1`, `reverse`.
- 🆕 **One-tap modes:** Reverse, Odd-Even Split, Odd-Even Merge, Duplex Sort (all-fronts-then-all-backs).
- 🔶 **Selection helpers:** odd/even/range/invert exist in the page manager; add select-by blank, duplicate, landscape, portrait, and page size.
- 🔶 **Multi-document tray:** `loadMultipleDocuments` already exists in the page manager but no screen exposes it — let users pull pages from several PDFs onto one canvas.

**13. Remove Blank Pages** 🆕
- Ink-coverage plus text-layer detection with an adjustable threshold.
- Always emits a review PDF of what it removed, so a faint-but-real page is recoverable.

**14. Duplicate Page Finder** 🆕
- Perceptual hash of rendered pages combined with a text hash; groups duplicates and near-duplicates for one-tap removal.

**15. Auto-Rotate Upright** 🆕
- Detects each page's text orientation and straightens it, then reports what changed.
- Low-confidence and near-blank pages are grouped for manual review rather than silently rotated.

**16. Mirror / Flip Pages** 🆕
- Horizontal or vertical flip, per page or document-wide — fixes mirrored scans and some fax output.

**17. Bookmarks & Outline Editor** 🆕
- Read, add, rename, nest, reorder and delete bookmarks.
- Auto-generate an outline from OCR headings or from merge sources. Feeds split-by-chapter.

**18. Page Labels & Bates Numbering** 🆕
- Logical page labels (`i, ii, iii`, `A-1`, restart-at-N) distinct from physical page order.
- Zero-padded Bates stamps with prefix/suffix, continuous across a batch of files. Extends the existing Header & Footer Studio rather than duplicating it.

### F. Page geometry

**19. Page Size & Layout Studio** 🆕
- **Normalize** mixed page sizes to one target (A0–A6, Letter, Legal) with scale factor, orientation and centering.
- **Crop / trim margins**, including auto-crop whitespace, applied to one page or all.
- **Add margins / padding** for binding or annotation space.
- **N-up:** 2 / 4 / 6 / 9 pages per sheet with borders and gutters.
- **Booklet imposition** (saddle stitch) so a double-sided fold reads in order.
- **Single long page:** stack every page into one tall page for scroll reading or chat sharing.
- **Tone passes:** grayscale, invert, high-contrast — a dark-mode or low-ink copy.

### G. Freeze & verify

**20. Flatten PDF — bakes form fields, signatures, annotations into static vector content** ✅
- 🆕 **Selective flatten:** forms only, annotations only, or everything.
- 🆕 **Flatten report:** what was baked and what could not be, instead of a silent partial result.

**21. PDF Compare — side-by-side visual overlay + text diff** ✅
- 🆕 **Word-level inline diff** with ignore-whitespace, ignore-case, and ignore header/footer zones.
- 🆕 **Metadata & geometry diff:** page count, page sizes, fonts, producer, creation dates.
- 🆕 **Exportable PDF diff report** with per-page change markers, for sending to someone who was not at the screen.

**22. PDF Repair & Recovery — XREF rebuild, corrupted object recovery** ✅
- 🆕 **Object-stream and truncated-stream salvage**, with a per-page raster fallback when vector recovery fails.
- 🆕 **Distinguish encrypted from damaged** and route to the unlock tool rather than reporting corruption.
- 🆕 **Exportable recovery log.**

**23. Preflight & Submission Check** 🆕
- A rule-driven pre-upload gate for PDFs, mirroring what the Document Validator already does for photos and signatures: max file size, page count, page size and orientation uniformity, minimum image DPI, fonts embedded, no encryption, no JavaScript, no attachments, searchable text present, no blank pages.
- **1-click auto-fix** chains the existing engines — compress, organize, sanitize, flatten — and re-runs the check.

**24. Archival Conversion (PDF/A-2b, best effort) + Readiness Report** 🆕
- Embeds fonts, sets an sRGB output intent, writes conforming XMP, strips JavaScript, encryption and disallowed transparency.
- Reports "ready / not ready, and why" rather than asserting compliance it cannot prove offline.

**25. Embedded Object Inspector** 🆕
- Lists and extracts or deletes embedded files, shows embedded JavaScript, launch/URI actions and open-action behaviour.
- Security triage that complements the Privacy Sanitizer's bulk scrub with "show me exactly what is in here".

**26. Signature Status Panel** 🆕
- Lists signature fields, signer name and claimed time, whether the signed byte range covers the whole file, and whether the document changed after signing.
- Report-only: no trust decision, because a certificate chain cannot be validated against a trust store offline. Says that plainly in the UI.

### H. Repeatable work

**27. Recipes (Saved Pipelines)** 🆕
- Save a chain — compress → page numbers → flatten → rename — and re-run it on one file or a whole batch.
- Exportable as a JSON preset. Extends the existing Batch PDF tools instead of a second batch engine.

---

## Part 2 — Where the additions came from

| Addition | Precedent | Source |
| --- | --- | --- |
| Alternate & mix, split down the middle, split by size, split by text, split by outline | Sejda ships all five as separate tools | sejda.com tool index |
| Crop/trim, resize/add margins, N-up, flip, grayscale, rename-from-text, Bates, bookmarks, delete-annotations | Sejda "Other tools" group | sejda.com tool index |
| Split by chapters / sections / file size / document count / divider sheet / printable chunks | Stirling PDF, Split tool methods table | docs.stirlingpdf.com → Tools → Page operations |
| Page-order expressions, Duplex Sort, Odd-Even Split/Merge, Remove Blank pages, Auto Rotate with confidence report | Stirling PDF, Reorder/Remove groups | docs.stirlingpdf.com → Tools → Page operations |
| Adjust page size/scale, Multi-Page Layout, Single Large Page, Booklet Imposition, Manage Attachments | Stirling PDF, Page size and layout group | docs.stirlingpdf.com → Tools → Page operations |
| Overlay PDFs (sequential / interleaved / fixed-repeat, fore/background), Show JavaScript, Auto-rename, repair | Stirling PDF, Advanced tools | docs.stirlingpdf.com → Tools → Advanced tools |
| Merge with generated TOC/bookmarks, per-file page picks, cover page, AcroForm merge-or-flatten, strip signatures | Sejda merge options; Stirling merge options | sejda.com/merge-pdf; Stirling page operations |
| PDF/A conversion plus a validation report per document | Acrobat Pro preflight; Apryse and Nutrient both treat validation as a separate reported step from conversion | helpx.adobe.com PDF/X-, PDF/A-; apryse.com PDF/A validation; nutrient.io "What is PDF/A?" |
| Linearize / Fast Web View as its own action | pdfAssistant shipped it as a discrete feature; PDF2Go documents it as optimization for progressive loading | pdfa.org linearize announcement; pdf2go.com linearized-PDF entry |

Competitor capability is evidence that a feature is wanted, not that it is feasible
client-side. Part 3 is where that gets separated.

---

## Part 3 — Engine feasibility, honestly

**Straightforward with the current stack**

| Feature | How |
| --- | --- |
| Insert / interleave / duplex sort / reverse / odd-even | `copyPages` + insertion order — the page manager already models this |
| Crop, trim, add margins, spread split, poster tiling | Copy the page N times and set a different `setCropBox` on each copy; `setCropBox` is already used in the export pipeline |
| Normalize page size, N-up, booklet, single long page, overlay/underlay | `pdfDoc.embedPage()` + `page.drawPage()` with a transform — not used anywhere in the repo yet, so it is new ground but a documented `pdf-lib` API |
| Split by size | Binary-search the chunk boundary, serialize, measure, adjust — same loop shape as the existing target-KB compressor |
| Split by text, auto-rename, split by pattern | `pdfjs` `page.getTextContent()` per page + regex |
| Blank-page detection | Render at ~0.2 scale, measure non-white pixel ratio, cross-check an empty text layer |
| Duplicate pages | Downscale render → dHash → Hamming distance, plus a text hash for exact matches |
| Flip / mirror / invert / grayscale | Canvas transform on render, or a content-stream transform for vector-preserving flips |
| Fingerprint & receipt | WebCrypto `crypto.subtle.digest('SHA-256', …)` |
| Embedded object inspector | `pdfjs` `getJSActions()`, `getAttachments()`, and the `/Names`, `/OpenAction` dictionaries via `pdf-lib` low-level objects |
| Split by QR divider | The barcode toolkit already decodes from PDF pages — reuse it as a page classifier |

**Needs low-level `pdf-lib` dictionary work (no high-level API)**

- **Bookmarks / outline writing** — build `/Outlines` with `PDFDict` / `PDFName` / `context.register`. Reading is easy (`pdfjs.getOutline()`); writing is where the effort is.
- **Page labels** — the `/PageLabels` number tree.
- **Image dedupe** — hash XObject streams and rewrite the resource references.

**Approximate — must be labelled as such in the UI**

- **Linearization.** `pdf-lib` has no linearizing writer. What is achievable is object cleanup, object streams and a sane page order. Call it "Optimize structure", show the byte saving, and do not print "Fast Web View" as a guarantee.
- **PDF/A-2b.** Full conformance checking is a veraPDF-class job. Ship the conversion steps plus an honest readiness report, and never render a green "PDF/A compliant" badge off an unverified conversion.
- **Signature validation.** Byte-range coverage and post-signing modification are both checkable offline; certificate-chain trust is not. Report structure, state the limit.
- **Auto-rotate.** A text-direction heuristic from `pdfjs` text-item transforms, with OCR as the fallback for pages with no text layer. Keep the confidence report — a wrong silent rotation is worse than no rotation.
- **Grayscale/mono compression.** Rasterizes the page, so vector text loses crispness. Gate it behind an explicit "this is a scan" choice and warn when the document has a real text layer.

**Deliberately not proposed**

Cloud OCR or cloud conversion for any of the above; certificate issuance; anything
requiring a server round-trip. The offline guarantee is the product.

---

## Part 4 — Build prompts

Paste **Prompt 0** first in any session that builds one of these, then the phase prompt.
Phases are ordered by dependency: 1 and 2 extend engines that later phases reuse.

### Prompt 0 — Repo contract (prepend to every build prompt)

```text
You are working in the PDF APP repo: Ionic 9 + Angular 22 standalone components,
Capacitor 8, Android + browser. Every feature is 100% on-device: no network calls,
no cloud services, no new runtime dependency unless you state it and justify it.
Writing is pdf-lib; rendering and text extraction are pdfjs-dist.

ADDITIVE ONLY — existing behaviour must not change:
- Every item in these documents is a NEW capability alongside what ships today.
  Do not modify, re-route or "clean up" an existing tool's behaviour, defaults,
  output format, file naming or public service method signatures while building
  one.
- Extend services by ADDING methods, or by adding optional parameters whose
  defaults reproduce today's behaviour exactly. No renamed method, no changed
  default, no altered return shape.
- New screens get new routes. Every existing route, alias and redirect keeps
  working.
- These shipped engines are not to be replaced, only extended alongside: the
  RC4 Standard-128 encryption path, the drawn-signature burn-in, the 5-language
  OCR flow, the 15 registered converters, the compression presets, the scanner's
  5 enhancement filters, and the editor's existing 15 tools.
- Before finishing: record the `npm run test:unit` pass/fail counts BEFORE you
  start, and show no new failures at the end. Existing Playwright specs covering
  the tools you touched must still pass.
- If a new capability genuinely cannot be added without changing existing
  behaviour, stop and report it rather than making the change.

Where code goes:
- Engine: src/app/core/services/<name>.service.ts, with a Vitest spec next to it.
- Types: src/app/core/models/<area>.types.ts (see pdf-organization.types.ts and
  pdf-analysis.types.ts for the house style).
- Screen: src/app/features/<feature>/<feature>.page.{ts,html,scss}, standalone.
- Route: a lazy loadComponent entry in src/app/app.routes.ts. Keep the existing
  /features/pdf/* shape and add redirects for any legacy alias you introduce.
- Tool entry: TOOL_CATALOGUE in src/app/core/services/tool-registry.service.ts
  — id, category, title, description, route, icon, color, keywords, relatedIds.

Reuse, do not re-implement:
- PdfPageManagerService — load/multi-load, select, reorder, rotate, delete,
  duplicate, undo/redo, thumbnail and high-res render, single and split export.
- PdfRenderService, PdfService, CompressionService, PdfRepairService,
  PdfCompareService, PdfExtractorService, PdfPrivacyService.
- DocumentBridgeService for tool-to-tool hand-off, HistoryService for outputs,
  ToastService and AppErrorService for user-facing outcomes.
- StorageService.saveFile for every saved output — the free-tier daily quota is
  enforced there, so bypassing it bypasses monetization.

Hard constraints the test suite enforces:
- i18n: every user-visible string goes through the translate pipe, and new tool
  ids need tools.<id>.title and tools.<id>.description in ALL FIVE dictionaries
  (en, hi, mr, bn, pa). src/app/core/i18n/i18n.spec.ts asserts full key parity.
- src/app/core/i18n/template-titles.spec.ts forbids literal title="..." in
  templates and [title] bound to a bare string — use the pipe.
- Icons are inline SVG in src/app/shared/components/ui/icon/icon.registry.ts
  (24x24 grid, currentColor). ion-icon's runtime sprite fetch fails offline, so
  a new icon must be added to that registry, not referenced by name alone.
- Unit tests: `npm run test:unit` (vitest run --dir src). A bare `vitest run`
  collects the Playwright e2e specs and fails.
- Lint: `npm run lint` only works on the nvm Node (v24.21.0). On the wrong Node
  the Angular CLI aborts with exit 0 and fakes a pass — check the version first.

UX requirements:
- Long jobs: progress callback, cancellable, chunked so the UI stays responsive
  on a mid-range Android device. Page-by-page, not all-pages-in-one-tick.
- Dark mode and responsive layout, matching the recent responsive overhaul.
- Never silently produce a lossy or partial result: report what changed and what
  could not be done.
- Presets and profiles are named by dimensions and sizes, never by exam board or
  institution name.

Documentation rule: new capabilities go in docs/PDF_MANAGEMENT_UPGRADE.md with a
status marker. Do not add them to docs/APP_FEATURES.md or any store-facing text
until they ship — a previous Play submission was rejected for misleading claims.
```

### Prompt 1 — Organize engine upgrade

```text
Extend the page organizer into a full page-arrangement engine.

Build:
1. Page-order expressions in PdfPageManagerService: "1,3,2,4-6", "2n-1", "2n",
   "reverse", with validation and a live preview of the resulting order before
   it is applied. Invalid expressions explain what is wrong, not "invalid input".
2. One-tap arrangement modes: Reverse, Odd-Even Split, Odd-Even Merge, and
   Duplex Sort (document is all fronts in order followed by all backs, possibly
   reversed — interleave to true reading order). Each is undoable.
3. Selection helpers beyond the current odd/even/range/invert: select blank,
   select duplicates, select landscape, select portrait, select by page size.
4. New BlankPageService: render each page at ~0.2 scale, compute the non-white
   pixel ratio, cross-check an empty text layer, and expose an adjustable
   threshold. Removal always also emits a review PDF of the removed pages.
5. New DuplicatePageService: dHash of a downscaled render plus a normalized text
   hash; group exact and near duplicates with a Hamming distance threshold and a
   side-by-side confirm step before removal.
6. New PageOrientationService: auto-rotate upright from pdfjs text-item
   transforms, with tesseract.js as the fallback for pages with no text layer.
   Emit a per-page report of what was rotated and at what confidence; group
   low-confidence and near-blank pages for manual review instead of rotating.
7. Mirror/flip: horizontal and vertical, per selection or whole document,
   preserving vector content via a content-stream transform where possible.
8. Expose the multi-document tray: PdfPageManagerService.loadMultipleDocuments
   already exists and no screen uses it. Let the organizer hold pages from
   several PDFs at once, with a per-page source badge.

Acceptance:
- Vitest specs for every expression form, duplex sort against a 6-page fixture,
  blank detection on a faint-text fixture (must NOT be removed) and on a truly
  empty page (must be), and dHash grouping on a duplicated page.
- A 100-page document stays interactive on a mid-range Android device while
  blank detection runs; progress and cancel both work.
```

### Prompt 2 — Split and combine upgrade

```text
Extend split and merge to the cases the current modes cannot serve.

Build:
1. Split by output file size: every part under a user-set ceiling (e.g. 10 MB).
   Binary-search the chunk boundary, serialize and measure — the same loop shape
   as the existing target-KB compressor. Warn when one page alone exceeds the
   ceiling and offer the compressor instead of failing.
2. Split by document count: into exactly N files of as even a length as possible.
3. Split by bookmarks/chapters: read the outline with pdfjs getOutline(), resolve
   destinations to page indices, split at each top-level (or chosen-level) entry.
4. Split at blank pages, and split at QR/barcode divider sheets by reusing the
   existing barcode toolkit as a page classifier. The divider sheet itself is
   dropped from the output.
5. Split by text pattern: start a new document whenever a regex match on a chosen
   page region changes value, and name each output from the captured text.
6. Spread Split & Page Sectioning: cut each page into rows x columns via repeated
   copies with different setCropBox values. Presets for halves and quarters, plus
   automatic gutter detection for book scans.
7. Poster Tiling: slice one oversized page into A4/Letter tiles with configurable
   overlap and optional crop marks.
8. Alternate & Mix: interleave pages from two or more documents, with a
   reverse-one-side toggle for front/back phone scanning.
9. Insert Pages: insert another PDF, an image, or N blank pages at an exact
   position.
10. Merge upgrades: per-file page subsets, sort by name/date/size, auto-generated
    bookmarks plus an optional table-of-contents page from source filenames, a
    cover page and separator sheets, AcroForm field-name collision detection with
    rename-or-flatten, and an explicit warning that merging invalidates existing
    digital signatures (strip or cancel — never produce a silently invalid file).

Acceptance:
- Vitest: size-split parts all under the ceiling; chapter split boundaries match
  the outline destinations; sectioning produces R x C pages per source page with
  correct crop boxes; interleave of a 3-page and 3-page pair yields A1,B1,A2,B2,…
- Outputs save through StorageService.saveFile and appear in history.
```

### Prompt 3 — Page Size & Layout Studio

```text
New feature: Page Size & Layout Studio at /features/pdf/layout.

This is the first use of pdf-lib's embedPage()/drawPage() in the repo — build a
small shared helper for "draw source page onto target page with transform" and
reuse it for every mode below.

Build:
1. Normalize page size: target A0-A6, Letter or Legal, with scale factor,
   portrait/landscape, and centering. Flag documents with mixed page sizes on
   load and offer this as the fix.
2. Crop / trim margins: drag a crop region on a live preview, auto-crop
   whitespace, apply to one page or all. setCropBox is already used in the export
   pipeline — follow that precedent.
3. Add margins / padding: grow the page and inset the content, for binding or
   annotation space.
4. N-up: 2 / 4 / 6 / 9 pages per sheet, with row/column order, borders and
   gutters.
5. Booklet imposition: saddle-stitch page order so a double-sided fold reads in
   sequence; pad to a multiple of 4.
6. Single long page: stack every page into one tall page, with a width-cap option
   and a hard warning when the result exceeds the PDF 14,400-unit page limit.
7. Tone passes: grayscale, invert, high-contrast.

Acceptance:
- Vitest on output page dimensions and page counts for each mode: 9 pages at 4-up
  gives 3 sheets; booklet of 6 pages pads to 8 and orders 8,1,2,7,6,3,4,5.
- Every mode has a live preview of page 1 before export.
- The 14,400-unit limit is enforced, not discovered by the user.
```

### Prompt 4 — Overlay, numbering and outline

```text
Build the stamping and navigation layer.

1. Overlay / Underlay PDF at /features/pdf/overlay: lay one or more PDFs over or
   under a base document. Page mapping modes sequential, interleaved and
   fixed-repeat (per-overlay page counts); position foreground or background;
   per-overlay opacity and scale-to-fit. Letterhead, pre-printed form and
   watermark-sheet presets.
2. Page Labels: write the /PageLabels number tree — roman lowercase, roman upper,
   decimal, letters, with prefix and restart-at-N per range. There is no
   high-level pdf-lib API; build it from PDFDict/PDFName/context.register and
   unit-test the resulting object graph.
3. Bates numbering in the existing Header & Footer Studio: zero-padded width,
   prefix/suffix, and a counter that runs continuously across a batch of files
   rather than restarting per document.
4. Bookmarks & Outline Editor at /features/pdf/bookmarks: read with pdfjs
   getOutline(); add, rename, nest, reorder, delete; write back as a proper
   /Outlines tree with correct /First, /Last, /Count and /Parent links. Offer
   auto-generation from OCR headings and from merge sources. Chapter-split in
   Prompt 2 consumes this.

Acceptance:
- Vitest asserting the written /Outlines and /PageLabels object graphs, including
  negative /Count for collapsed nodes.
- Round-trip test: write an outline, reopen with pdfjs, and get the same tree.
- Overlay output opens in a strict viewer (verify in the pdfjs reader in-app).
```

### Prompt 5 — Integrity suite

```text
Build the integrity and compliance group. Accuracy matters more than coverage
here: a false "compliant" verdict is worse than no verdict.

1. Document Fingerprint & Integrity Receipt at /features/pdf/fingerprint:
   SHA-256 of the file via WebCrypto plus per-page content hashes; verify a file
   against a saved receipt and report page-level drift; export the receipt as
   .txt and as a stamped PDF.
2. Preflight & Submission Check at /features/pdf/preflight: rule-driven, modelled
   on the existing DocumentValidatorService. Rules: max file size, page count,
   page size and orientation uniformity, minimum image DPI, fonts embedded, no
   encryption, no JavaScript, no attachments, searchable text present, no blank
   pages. Each failed rule gets a one-tap fix that calls the existing engine
   (compress, organize, sanitize, flatten), then re-runs the check.
3. Embedded Object Inspector at /features/pdf/inspect: list and extract or delete
   embedded files; show embedded JavaScript (pdfjs getJSActions()), launch/URI
   actions and /OpenAction. Read-only by default; deletion is explicit.
4. Signature Status Panel: list signature fields, signer name and claimed time,
   whether the signed byte range covers the whole file, and whether the document
   changed after signing. State in the UI that certificate-chain trust cannot be
   validated offline — report structure, do not render a trust verdict.
5. Structure Optimizer: drop orphaned objects, rewrite with object streams,
   dedupe repeated fonts and identical image XObjects, order pages for a faster
   first-page render. Report the byte saving. Label it "Optimize structure" — not
   "Fast Web View", which pdf-lib cannot guarantee.
6. Archival Conversion (PDF/A-2b, best effort) + readiness report: embed fonts,
   set an sRGB output intent, write conforming XMP, strip JavaScript, encryption
   and disallowed transparency. The report says ready / not ready and why. No
   green compliance badge off an unverified conversion.
7. Studio health strip and byte audit on the PDF Studio page, fed by
   PdfRepairService.diagnosePdf plus the new checks: encryption, PDF version,
   linearized flag, font embedding, mixed page sizes, JS/attachments present,
   scanned-vs-digital, searchable-text coverage, and which pages and images carry
   the file size.
8. Flatten and Compare upgrades: selective flatten (forms only / annotations only
   / everything) with a report of what could not be baked; word-level inline diff
   with ignore-whitespace, ignore-case and ignore header/footer zones; metadata
   and geometry diff; an exportable PDF diff report with per-page change markers.

Acceptance:
- Vitest: fingerprint stability across re-saves of identical bytes; drift
  detection on a one-page edit; every preflight rule tested against a passing and
  a failing fixture; JS detection on a fixture carrying an /OpenAction script.
- No UI string anywhere asserts PDF/A compliance, Fast Web View, or signature
  validity. Grep for those claims as part of the acceptance check.
```

### Prompt 6 — Recipes (saved pipelines)

```text
Build Recipes: a saved chain of PDF operations, re-runnable on one file or a
batch. Extend the existing Batch PDF tools — do not build a second batch engine.

Build:
1. A RecipeService with a serializable step list: each step is a tool id plus its
   parameter object, validated against a per-tool schema.
2. Run a recipe over one document or a batch, with per-step and overall progress,
   cancellation, and a per-file result log (succeeded, skipped, failed and why).
3. Save, rename, duplicate and delete recipes locally; export and import as JSON.
4. Ship three starter recipes, named by what they do: "Compress to 2 MB, then
   number pages", "Scan cleanup: deskew, grayscale, OCR", "Submission prep:
   sanitize, flatten, preflight".
5. Quota: each saved output still goes through StorageService.saveFile, so a
   recipe over 10 files consumes 10 free-tier operations. Show the cost before
   the run starts and stop cleanly at the limit rather than failing mid-batch.

Acceptance:
- Vitest: a 3-step recipe over a 3-file batch produces 3 outputs and a complete
  log; a failing middle step does not abort the remaining files; the quota stop
  is clean and reports what was and was not processed.
- Round-trip a recipe through JSON export/import with identical behaviour.
```

---

## Part 5 — Suggested order and effort

| Phase | Entries | Why this order | Rough effort |
| --- | --- | --- | --- |
| 1 — Organize engine | 12–16 | Extends a service that already exists; everything else reuses the selection and export paths | M |
| 2 — Split & combine | 5–11 | Highest user-visible value per unit of work; split-by-size is the most requested missing case | M–L |
| 3 — Layout Studio | 19 | Introduces the embedPage helper that overlay and booklet need | M |
| 4 — Overlay & outline | 8, 17, 18 | Needs phase 3's helper and unlocks chapter split from phase 2 | L (low-level dict work) |
| 5 — Integrity suite | 2, 4, 20–26 | Mostly read-and-report; the risk is in claim accuracy, not engine difficulty | L |
| 6 — Recipes | 27 | Only worth building once the engines above exist to chain | M |

Phase 1 and 2 alone close most of the gap against Sejda and Stirling in this
category. Phase 5 is the differentiator: an offline preflight that tells someone
their document will be accepted before they upload it is something the cloud
tools structurally cannot promise, because the file has already left the device.
