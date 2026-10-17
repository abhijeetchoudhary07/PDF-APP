# Exam & Job Portal Preparation Suite — Verified Audit & Upgrade Plan

**Scope:** Photo Tools, Signature Tools, Presets, Document Validator
**Audited:** 2026-10-14 against `main` @ `8d200c9`
**Baseline:** `npx vitest run --dir src` → 30 files, 376 tests, all passing

Every claim below was read out of the source, not inferred. File:line references are
exact.

---

## 0. Blocking policy conflict — read first

The brief asks for presets named for **SSC, UPSC, IBPS, Railways, GATE, NEET, State
PSCs**. On 2026-10-11 this app deliberately removed every government name from
user-visible copy to escape Google Play's "provides government information"
classification, after **five Misleading Claims rejections**. Presets are now named by
dimensions (`350 × 450 photo + 400 × 200 signature`), ids are dimension slugs
(`photo-350x450`), and all `verifiedSource` fields were stripped. The app was approved
on 2026-10-12 with policy status "No issues found" and is on Closed testing.

**Reintroducing board names in preset names, categories or marketing copy re-triggers
the strict-sourcing standard that caused those rejections.** It also re-asserts a claim
the app cannot back: the current presets are generic dimension profiles, not sourced
from any authority.

**Recommended answer instead of a board-name database → Feature R8, Rule Capture.**
Let the candidate paste or photograph the requirement text from the portal they are
actually applying to, and parse it into a custom preset. The app never claims to know
any authority's rules; the user supplies them. That delivers more coverage than a
hand-maintained board list (it works for the state PSC nobody has added yet, and for
private employers), stays current without app updates, and is policy-neutral by
construction.

Two exceptions that are already correct and should stay: the disclaimers in
`terms-of-use` and `govDisclaimer` name UPSC/SSC/IBPS on purpose — a disclaimer must
name what it disclaims — and the search keywords in `tool-registry.service.ts:219,255`
are not user-visible.

**Second policy item.** `docs/APP_FEATURES.md` (untracked, new) names SSC/UPSC/IBPS/
NEET/Railways/Passport Seva/NSDL throughout and describes capabilities that do not
exist (see §2). It must not be used as store-listing copy or in-app content in its
current form.

---

## 1. Confirmed defects

Ordered by user impact. All seven are real, read from source, and currently shipping.

### D1 — Presets cannot set dimensions and file size together; the engine refuses to

`CompressionConfig` declares `exactDimensions` and `maintainAspectRatio`
(`src/app/core/models/compression-config.model.ts:6-7`). **Neither is read anywhere in
the codebase** — the only references are the declarations themselves.
`CompressionService.compressToExactKB` starts from the *source* file's dimensions
(`compression.service.ts:35-37`) and scales them down in 10% steps purely to hit the
byte target.

So `PhotoPage.applyPreset` (`photo.page.ts:243-250`) sets `targetWidth`, `targetHeight`
**and** `selectedTargetKB`, then sets `mode = 'kb'` — and the KB path passes only
`{ targetKB, outputFormat }` (`photo.page.ts:384-387`). The preset's pixel dimensions
are silently discarded. Tapping "413 × 531 px, 20–50 KB" produces a file at 50 KB and
whatever dimensions the compressor happened to land on.

This is the app's central promise and it does not work. Everything else in this list is
smaller.

### D2 — No minimum-size support anywhere; the common failure has no fix

Portal rules are bands (20–50 KB). The compressor enforces only the ceiling. The
validator *checks* the floor (`document-validator.service.ts:100-116`) but
`fixAction` is set **only when `sizeKb > maxKb`** — when a file is under the minimum the
rule fails as a hard `error` with no fix action at all, and `autoFixAllIssues` can do
nothing. For signatures there is not even a `suggestedFix` string
(`document-validator.service.ts:267-280`).

This is not an edge case: a phone photo resized to 200 × 230 routinely lands at 6–10 KB
against a 20 KB floor. The validator says "not compliant", Auto-Fix does nothing, and
the user is stuck with no path forward.

### D3 — The 1-tap preset hand-off does nothing on the photo and signature pages

`PresetsPage.goToTool` navigates to `/photo?preset=<id>` (`presets.page.ts:74-78`).
Neither `photo.page.ts` nor `signature.page.ts` injects `ActivatedRoute` or reads a
query param — only `document-validator.page.ts:97` does. The pages open with hardcoded
defaults (50 KB, 200 × 230). The documented "selecting a preset pre-configures and
opens the tool with required constraints pre-populated" is not implemented for two of
the three targets.

### D4 — Signature auto-crop is a guaranteed no-op

`ImageService.autoCropSignature(file, padding = 10, threshold = 240)`
(`image.service.ts:52`). The call site passes them **in the wrong order**:

```ts
// signature.page.ts:225-229
await this.imageService.autoCropSignature(
  this.originalFile,
  this.autoCropThreshold,   // 240 → arrives as `padding`
  this.autoCropPadding      // 10  → arrives as `threshold`
);
```

With `threshold = 10`, only near-pure-black pixels count as ink; a photographed
signature has no such pixels, `hasContent` stays false, and the function returns the
original file untouched (`image.service.ts:94-97`). In the rare case some pixels do
qualify, `padding = 240` expands the bounding box past both edges and it is clamped to
the full image. Either way the crop never happens.

Second, independent bug: even on success the result is only used for a preview.
`autoCrop()` assigns `cleanedPreviewUrl` (`signature.page.ts:235`) but
`compressSignature()` always reads `this.originalFile`
(`signature.page.ts:285`). The crop is discarded on export regardless.

### D5 — Signature background whitening and ink enhancement are unreachable

`SignatureProcessingService` (grayscale, contrast, threshold) is injected by exactly one
consumer: the validator's `clean_signature` auto-fix
(`document-validator.service.ts:527`). `signature.page.ts` never imports it and the
page has no control for it. The two headline Signature Tools capabilities cannot be
invoked from Signature Tools.

The service is also weaker than described: a single global threshold
(`signature-processing.service.ts:46`), not adaptive. On a phone photo with uneven
lighting a global cut turns shadow into black blobs and loses faint strokes at the same
time — the exact case it exists to handle. It also converts to plain luma
(`0.3R + 0.59G + 0.11B`), which crushes blue ink against grey paper rather than
preserving it.

### D6 — Auto-Fix reports success for fixes it never performed, and undoes its own work

**Phantom fix:** the aspect-ratio rule emits `fixAction: 'crop'`
(`document-validator.service.ts:154`), and `ValidationRule` declares `'crop'` in its
union (`document-validator.models.ts:21`). `autoFixRule` has branches for `compress`,
`resize`, `convert`, `clean_signature` and nothing else
(`document-validator.service.ts:501-527`) — `crop` falls through to `return file`. The
page then shows `Auto-fixed: Aspect Ratio` (`document-validator.page.ts:316`) for a
no-op. `'crop'` is also absent from the `autoFixAllIssues` order array
(`document-validator.service.ts:549`).

**Self-undoing fix:** that order is `convert → resize → clean_signature → compress`.
`resize` pins the file to exactly 350 × 450; `compress` then scales dimensions down by
up to 50% to reach the byte target (`compression.service.ts:49,113`). "Fix all" can
therefore break the dimension rule it just fixed, and there is no re-validation loop —
`validateSlot` runs once afterwards and simply reports the new failure.

### D7 — The background check can silently pass anything

`checkImageBackgroundLightness` resolves `{ isLight: true }` on a **200 ms timeout**
(`document-validator.service.ts:410-412`). On a mid-range Android device a large JPEG
often does not decode in 200 ms, so the background rule passes without ever having been
evaluated. It also samples only the top and bottom rows (`:432-438`) — never the left or
right edges, where a scanned border actually shows.

### Smaller items

- **PNG target silently fails.** `targetFormat` defaults to the input's MIME type
  (`photo.page.ts:184`). Canvas PNG encoding ignores the `quality` argument entirely, so
  the whole binary search is inert for PNG; only the dimension scaling does anything.
  The final fallback returns `resizeToCanvasBlob(..., 0)` unconditionally
  (`compression.service.ts:134`) and `compressToExactKB` wraps it in `success: true`
  with **no check that the result meets the target**. The UI shows SUCCESS for a file
  that misses the requirement. Presets specify `format: "JPEG"` and nothing enforces it.
- **Encrypted PDFs are misdiagnosed.** `getPdfPageCount` calls pdf.js with no password
  handling (`pdf.service.ts:20-25`); a protected PDF throws and lands in the generic
  catch, reported as "Cannot read PDF structure / PDF Integrity"
  (`document-validator.service.ts:363-374`). A password-protected certificate scan is a
  top-three upload rejection and the app already has Protect & Unlock to fix it.
- **DPI is decided by a string sniff.** The DPI rule only fires when
  `req.backgroundGuidance` happens to contain the substring "dpi"
  (`document-validator.service.ts:172`). Only `photo-213x213` does. There is no `dpi`
  field on `PresetRequirement`. And because every fix re-encodes through canvas, EXIF
  resolution tags are stripped, so DPI afterwards reads as absent → lenient pass
  (`:175`).
- **Two divergent preset catalogues.** `PhotoPage.formPresets`
  (`photo.page.ts:117-145`) is a hardcoded list of three (`200 × 230`, `413 × 531`,
  `140 × 180`) with ids `pan`/`passport`/`px140x180`; `assets/presets/*.json` holds six
  photo entries with dimension-slug ids. They overlap on one entry. The hardcoded list
  retains the old naming convention in its ids.
- **Dead code.** `ValidationReport` is imported by both the page and the service and
  never constructed. `validateDocument` allocates an unused `rules` array and `sizeKb`
  (`document-validator.service.ts:33-35`).
- **History spam.** `recordValidationHistory` is called on every single rule fix
  (`document-validator.page.ts:317`).
- **Quota.** `downloadSlotFile` calls `saveFile(file)` with no `operationId`
  (`document-validator.page.ts:384`), so one validation run that saves three slots costs
  three of five daily free operations, and re-saving after each fix costs more.

---

## 2. `docs/APP_FEATURES.md` vs. the code

| Documented | Actual |
|---|---|
| Photo: "resize using exact pixels (px), millimeters (mm), centimeters (cm), or inches (in)" | Pixels only. No unit conversion exists in the codebase; `photo.page.html` has no mm/cm/in control. |
| Photo: "Metadata Stripping" as a feature | A side effect of canvas re-encoding. No control, no verification, not surfaced. |
| Signature: "Background Whitening (adaptive luminosity thresholding)", "Ink Enhancement (boosts blue and black ink contrast)" | Service exists, is not adaptive, is not reachable from the Signature page (D5). |
| Signature: "140 × 60 px or 400 × 200 px standards" | Page offers 140 × 60 and 200 × 80. 400 × 200 exists only in JSON the page never reads. |
| Presets: "comprehensive database of exact document requirements across leading Indian examination authorities", SSC/UPSC/IBPS/NEET/Railways/PAN/Passport profiles | 6 photo + 2 signature + 1 PDF generic dimension profiles, deliberately unnamed. |
| Validator: "checks … color depth" | No color-depth rule exists. |
| Validator: "forces files into compliance with zero manual trial-and-error" | Cannot fix under-minimum (D2), cannot crop (D6), resize and compress conflict (D6). |
| "1-Tap Navigation … pre-configures and opens the tool" | Not implemented for photo or signature (D3). |

---

## 3. Recommendations, prioritised

Ranked by (user value × impact) ÷ cost. R1–R5 make the existing feature set true; R6–R10
are new and differentiating.

| # | Recommendation | Value | Cost | Why it matters |
|---|---|---|---|---|
| **R1** | **Band-targeted, dimension-locked compression.** Implement `exactDimensions`: hold W×H fixed, binary-search quality only. Add `minKB` and converge *inside* the band, not under the ceiling. Return a verified `meetsTarget` flag and fail honestly when the band is unreachable at locked dimensions. | Critical | M | Fixes D1, D2 and the PNG silent-success in one place. Every other exam feature depends on it. |
| **R2** | **One "Exact spec" panel** replacing the KB / Pixels tabs on both pages. Dimensions *and* size together, because that is what a portal rule is. | Critical | S | The tabs exist only because the engine couldn't do both. Once R1 lands they are a liability. |
| **R3** | **Real preset hand-off + single catalogue.** Both pages read `?preset=`; delete `PhotoPage.formPresets` and drive chips from `PresetService`. | High | S | Fixes D3 and the catalogue drift. |
| **R4** | **Signature pipeline repair.** Fix the argument order, feed the cropped file into the export path, expose whiten/ink-boost on the page, and replace the global threshold with Otsu (global, auto) plus optional Sauvola (local window) for uneven lighting. | High | M | Fixes D4 and D5 — two of the three advertised signature capabilities. |
| **R5** | **Validator honesty pass.** Implement `crop`; add a converge loop (re-validate after fixing, max 3 passes, stop when stable or no progress); only toast a fix that changed the file; detect encrypted PDFs and route to Protect & Unlock; drop the 200 ms background timeout and sample all four edges; add a real `dpi` field; drop the "strictly satisfy official portal requirements" copy. | High | M | Fixes D6, D7 and the encrypted-PDF misdiagnosis. A validator that passes a bad file is worse than none. |
| **R6** | **JFIF density stamping (real DPI).** Patch the JPEG APP0 segment after encoding — set `units=1`, `Xdensity`/`Ydensity` to the target DPI, inserting the segment when absent. ~50 lines of byte manipulation, no dependency. | High | S | Canvas writes density 0. Portals that demand "200 DPI" read these exact bytes. **No browser-based competitor does this** — it is a hard differentiator for a day's work. |
| **R7** | **Submission Pack export.** One tap on a green validation → a ZIP named for the preset containing each slot file plus a generated `compliance-report.pdf` (rule, actual, required, thumbnails, timestamp). `jszip` and `pdf-lib` are already dependencies. | High | M | The artefact a candidate keeps and reuses across a season of applications. Nothing on the market ships it. |
| **R8** | **Rule Capture → custom preset.** Paste the requirement text from the portal, or OCR a screenshot of it (`tesseract.js` already present), and parse it into a `Preset`: KB bands, px/cm/mm dimensions, format, DPI, background wording. Show the parsed result for confirmation before saving. | Very high | M | **This is the answer to the board-name ask.** Broader coverage than any hand-maintained list, current without app updates, works for state PSCs and private employers alike, and policy-neutral: the user supplies the rule. |
| **R9** | **Preset sharing by QR / short code.** Encode a custom preset as a QR or compact string; scan to import. `qrcode` and `@zxing/library` are already in. | Medium | S | Offline, backend-free distribution. One coaching centre seeds a cohort. Makes the Custom Preset Builder worth using. |
| **R10** | **Capture-time pre-flight.** In the photo capture path, an oval head guide at the 70–80% frame ratio with live "too dark / too close / background not plain" hints from the existing luminance helpers. Heuristics only — no face-detection claims. | Medium | M | Prevents the rejection instead of repairing it. Keep the copy honest: "framing guide", not "face detected". |

**Deliberately not recommended:** cloud/AI photo enhancement (breaks the on-device
guarantee, the app's only real moat), a board-named preset database (§0), and automated
portal upload (no stable APIs, and it would put credentials in scope).

---

## 4. Production-ready implementation prompt

Copy from here down.

---

### Task

Upgrade the Exam & Job Portal Preparation suite in the `PDF APP` repo (Ionic 9 /
Angular 22 standalone / Capacitor 8). Deliver R1–R8 below. Preserve all existing
functionality, keep the current UI/UX language, and keep the test suite green.

### Hard constraints — violating any of these is a failed change

1. **100% on-device.** No network call may be added to any code path in this task. No
   new runtime dependency unless it ships in `package.json` already. Available and
   already bundled: `pdf-lib`, `pdfjs-dist`, `tesseract.js`, `jszip`, `qrcode`,
   `@zxing/library`, `exifr`, `cropperjs`, `docx`, `xlsx`.
2. **No government or exam-board names** in any user-visible string: preset names,
   categories, headings, button labels, placeholders, toasts, i18n values, or doc copy.
   Presets are named by their specs (`350 × 450 px · 20–50 KB`); ids are dimension slugs.
   Do not add `verifiedSource` back. Keywords in `tool-registry.service.ts` are
   not user-visible and stay as they are. The disclaimers in `terms-of-use` and
   `govDisclaimer` name boards on purpose — do not touch them.
3. **No claim the app cannot verify.** Never state that a file satisfies an authority's
   requirements; state that it satisfies *the selected spec*. Rewrite
   `en.ts → validator.readySubtext` accordingly and mirror in all five languages.
4. **i18n parity is enforced by tests** (`src/app/core/i18n/i18n.spec.ts:153-180`). Every
   new key must be added to all five dictionaries: `en`, `hi`, `mr`, `bn`, `pa`.
5. **Quota.** Do not wire anything to `UsageQuotaService.reset()`. Group a single
   validation run's saves under one `operationId` via `StorageService.saveFile`'s third
   argument.
6. **Node.** Build and test with the nvm Node (`nvm use 24.21.0`); a version mismatch
   aborts with exit 0 and fakes a pass.
7. Run `npx vitest run --dir src` (not a bare `vitest run` — that collects the Playwright
   specs). Baseline to maintain or exceed: **376 passing**.

### R1 — Band-targeted, dimension-locked compression

`src/app/core/services/compression.service.ts`,
`src/app/core/models/compression-config.model.ts`

Extend `CompressionConfig`:

```ts
export interface CompressionConfig {
  targetKB?: number;          // existing: ceiling
  minKB?: number;             // NEW: floor; converge inside [minKB, targetKB]
  exactDimensions?: ImageDimensions;   // EXISTING BUT DEAD — implement it
  maintainAspectRatio?: boolean;       // EXISTING BUT DEAD — implement it
  dpi?: number;               // NEW: see R6
  // …existing fields unchanged
}
```

Behaviour:

- When `exactDimensions` is set, every candidate encode uses exactly those dimensions.
  **Never** scale them to reach the byte target — quality is the only free variable.
- Converge into the band. If the best candidate is under `minKB`, search *upward*
  toward quality 1.0. If quality 1.0 at locked dimensions is still under `minKB`, raise
  real entropy rather than faking size: re-encode at 4:4:4 chroma subsampling, and if
  still short apply a near-invisible high-frequency dither (amplitude ≤ 2/255) and
  re-encode. Never append padding bytes after EOI — portals that re-encode on upload
  strip them and some validators reject trailing data.
- When the band cannot be reached at locked dimensions, return
  `{ success: false, error: <reason>, nearest: { sizeKb, dimensions } }` naming the
  closest achievable result and what would have to give. **Do not return `success: true`
  for a file that misses the target** — that is the current behaviour at
  `compression.service.ts:134` and it must stop.
- Add `meetsTarget: boolean` and `actualSizeKb: number` to the result and verify them by
  measuring the produced blob, not by assuming.
- PNG: canvas ignores `quality` for `image/png`. Detect this and either convert to JPEG
  (when the preset's `format` allows it, after telling the user) or fail honestly. Never
  run an inert binary search.
- Keep the existing 30 s timeout and 25-iteration cap. Keep every current call signature
  working — `compressToExactKB(file, { targetKB })` with no new fields must behave
  exactly as it does today.

### R2 — Single "Exact spec" panel

`src/app/features/photo/photo.page.{ts,html,scss}`,
`src/app/features/signature/signature.page.{ts,html,scss}`

Replace the KB / Pixels `app-tabs` with one panel carrying width, height, aspect lock,
a size band (min + max KB), and format. One action button. Remove the `mode` field and
every `mode === 'kb' | 'pixels'` branch. Keep `AppTabsComponent` imported only if still
used elsewhere on the page.

Show the outcome against the band, e.g. `48 KB — inside 20–50 KB ✓` and
`413 × 531 px ✓`. When R1 reports `meetsTarget: false`, show the reason and the nearest
achievable result; do not show a success state.

Preserve: dropzone, cropper modal, `app-conversion-animation`, `appAutoScroll` chip rows
(do not reintroduce duplicate tracking keys — see `1e59fa3`), `ResultPreviewComponent`
and its share modal, border/stamp options, and the existing error-state handling in
`compressPhoto`'s try/catch (`photo.page.ts:371-414`) — that guard exists because the
image APIs reject with a bare DOM `Event` and a leak left the spinner stuck forever.

### R3 — Real preset hand-off, one catalogue

- Inject `ActivatedRoute` in both pages; read `?preset=<id>`, resolve through
  `PresetService`, and apply the full `PresetRequirement`: `width`, `height`, `minKb`,
  `maxKb`, `format`, `aspectRatio`, `dpi`. Show which preset is active and let the user
  clear it.
- Delete `PhotoPage.formPresets` (`photo.page.ts:117-145`) and the hardcoded
  `pixelPresets` on both pages. Drive the chips from `PresetService`. One catalogue:
  `src/assets/presets/*.json` plus custom presets from Preferences.
- Add `dpi?: number` to `PresetRequirement` in `preset.service.ts`. Populate it where the
  JSON guidance currently mentions DPI, and remove the substring sniff at
  `document-validator.service.ts:172`.
- Note `redirectTo` routes: `/photo` → `features/photo` (`app.routes.ts:454`). Confirm by
  test that query params survive the redirect.

### R4 — Signature pipeline

- **Fix the argument order** at `signature.page.ts:225-229`. Prefer changing the call to
  named options (`{ padding, threshold }`) so the mistake cannot recur, and update
  `ImageService.autoCropSignature` accordingly.
- `autoCrop()` must replace the working file, not just `cleanedPreviewUrl`. Introduce an
  explicit working-file field and have `compressSignature()` read it instead of
  `this.originalFile` (`signature.page.ts:285`). Keep the original for before/after.
- Inject `SignatureProcessingService` into `signature.page.ts` and expose: background
  whitening, ink contrast, and auto-crop as a single "Clean signature" step with a
  before/after preview and an undo.
- Upgrade `SignatureProcessingService`: add Otsu (automatic global threshold) and
  Sauvola (local window, for uneven phone-photo lighting) alongside the existing fixed
  threshold. Default to Otsu. Preserve blue ink explicitly — weight the blue channel
  rather than collapsing to `0.3R + 0.59G + 0.11B`, which crushes blue against grey
  paper. Offer white-background and transparent-background output. Keep the existing
  fixed-threshold path reachable, since the validator's `clean_signature` fix calls it
  with explicit values (`document-validator.service.ts:527-531`).

### R5 — Validator honesty pass

`src/app/core/services/document-validator.service.ts`,
`src/app/features/document-validator/document-validator.page.ts`

- Implement the **`crop`** branch in `autoFixRule` (aspect-ratio → centred crop to ratio,
  then resize to the exact target) and add `'crop'` to the `autoFixAllIssues` order,
  before `resize`.
- **Converge loop:** after applying fixes, re-validate and repeat while errors remain,
  up to 3 passes, stopping when a pass makes no progress. Fix order:
  `convert → crop → resize → clean_signature → compress`. Pass the preset's
  `exactDimensions` + `minKB` into the compress step (R1) so compression can no longer
  undo the resize.
- **Fix under-minimum:** route `sizeKb < minKb` to R1's upward search. Set a `fixAction`
  for it — today there is none, which is why Auto-Fix dead-ends.
- **No phantom success.** Compare the file before and after; only toast
  `Auto-fixed: …` when it actually changed. Report "could not be fixed automatically"
  with the reason otherwise.
- **Encrypted PDFs:** detect pdf.js's `PasswordException` in `PdfService` and surface a
  dedicated rule ("This PDF is password-protected") with a link to
  `/features/pdf/security`, instead of the current misleading "Cannot read PDF
  structure".
- **Background check:** remove the 200 ms pass-by-default timeout
  (`document-validator.service.ts:410-412`). Decode properly, raise the budget to ~2 s,
  and on genuine failure mark the rule `inconclusive` — never `passed`. Sample all four
  edges, not just the top and bottom rows (`:432-438`).
- Delete the unused `ValidationReport` imports and the dead locals at
  `document-validator.service.ts:33-35`, or construct and use `ValidationReport` in R7.
- Call `recordValidationHistory` once per validation run, not once per rule fix
  (`document-validator.page.ts:317`).
- Give `downloadSlotFile` a shared `operationId` for the run
  (`document-validator.page.ts:384`).

### R6 — JFIF density stamping (real DPI)

New: `src/app/core/utilities/jpeg-density.util.ts`

Canvas `toBlob` writes JFIF density units `0` (aspect ratio only), so a file the app
produces always reports "no DPI". Portals that require 200 DPI read these bytes.

Implement `setJpegDensity(bytes: Uint8Array, dpi: number): Uint8Array`:
- Walk the JPEG segments from `SOI (FFD8)`.
- If `APP0` with the `JFIF\0` identifier is present, set `units = 1` (dots per inch) and
  write `Xdensity` / `Ydensity` big-endian at their fixed offsets.
- If absent, insert a minimal 18-byte `APP0` JFIF segment immediately after `SOI`.
- Leave `APP1`/EXIF and all image data untouched. Return the original bytes unchanged on
  any parse surprise — never corrupt a file to stamp metadata.

Apply it in `CompressionService` when `config.dpi` is set, as the last step after the
size band is satisfied (the segment is ~18 bytes; account for it in the band check).
Verify in the validator with the existing `exifr` read so the rule actually turns green.

### R7 — Submission Pack export

`document-validator.page.ts` + new
`src/app/core/services/submission-pack.service.ts`

When a run has zero errors, offer **Download submission pack**: a `jszip` archive named
for the preset containing each slot file under a predictable name (`photo.jpg`,
`signature.jpg`, `document.pdf`) plus `compliance-report.pdf` built with `pdf-lib`:
preset name, one row per rule (name, required, actual, pass/fail), embedded thumbnails
of the photo and signature, file sizes and dimensions, a local timestamp, and a footer
stating the files were checked against the selected spec on-device. Construct the
existing `ValidationReport` type for this. One `operationId` for the whole pack.

### R8 — Rule Capture → custom preset

New: `src/app/core/services/rule-parser.service.ts`, plus an entry point on the Presets
page ("Add from portal instructions").

Input: pasted text, or an image/screenshot run through the existing `OcrService`
(`tesseract.js`, already bundled, English + the existing Indian-language traineddata).

Parse into a `Partial<Preset>`, handling at minimum:
- size bands — `20 KB to 50 KB`, `20-50kb`, `between 20 and 50 KB`, `max 50 KB`,
  `not more than 50kb`, `minimum 20 kb`
- pixel dimensions — `200 x 230 pixels`, `200*230`, `200 by 230 px`
- physical dimensions — `3.5 cm x 4.5 cm`, `35 mm × 45 mm`, `3.5 X 4.5 cms`
- DPI — `200 DPI`, `200 dpi resolution`
- format — `JPEG/JPG only`, `.jpg format`, `PNG`
- background — `white background`, `light coloured background`
- per-slot attribution when one block covers both photo and signature

Convert physical units to pixels using the parsed DPI, defaulting to 200 and saying so.
**Always show the parsed result in an editable confirmation form before saving** — never
save a silently-parsed rule. List anything it could not parse. Save through
`PresetService.saveCustomPreset`.

Copy discipline: the app is transcribing what the user supplied. "From your pasted
instructions", never "official requirements for …".

### Testing

Unit (`src/**/*.spec.ts`, vitest, jsdom):
- `compression.service.spec.ts` — **new.** Band convergence (lands inside, not under);
  dimensions locked across the whole search; under-minimum upward search; unreachable
  band returns `success: false` with `nearest`; PNG path does not report a false success;
  existing `{ targetKB }`-only calls behave as before.
- `jpeg-density.util.spec.ts` — **new.** Patches an existing `APP0`; inserts one when
  absent; round-trips through `exifr`; returns input unchanged on malformed bytes.
- `rule-parser.service.spec.ts` — **new.** A table of at least 20 real-world instruction
  strings → expected `Preset`, including mm/cm conversion and unparseable input.
- `image.service.spec.ts` — **new.** `autoCropSignature` crops a synthetic stroke with
  the right padding and threshold, and the named-options signature cannot be transposed.
- `signature-processing.service.spec.ts` — **new.** Otsu picks a sane threshold on a
  bimodal histogram; Sauvola beats a global cut on a shadow gradient; blue ink survives.
- `document-validator.spec.ts` — **extend.** `crop` actually crops; the converge loop
  ends with dimensions *and* size both satisfied; under-minimum gets fixed; an unchanged
  file does not report a fix; an encrypted PDF gets the password rule, not corruption;
  the background check reports `inconclusive` rather than passing when decode fails.
- `preset.service.spec.ts` — **new.** Grouping and merge across the three JSON files;
  custom presets sort first; `dpi` round-trips.
- Photo and signature page specs — **new.** `?preset=` applies the full requirement; the
  single panel sends both dimensions and band to the service; the cropped/cleaned file
  is what gets exported.
- `i18n.spec.ts` must stay green — parity across all five dictionaries.

E2E (`e2e/`, Playwright): extend the six existing
`e2e/document-validator/*.spec.ts` specs and add
- preset tap → photo page opens pre-configured → process → result inside the band;
- an under-minimum file → Auto-Fix → compliant;
- Fix-all → both dimensions and size pass simultaneously;
- submission pack downloads and contains the expected entries;
- rule capture from pasted text → confirmation form → saved custom preset.

Serve the built app for e2e as the existing config does; do not point tests at port 3001
(that may be the production API — check the listener's cmdline before running the
account specs).

### Definition of done

- `npx vitest run --dir src` ≥ 376 passing, zero failures.
- `npm run lint` clean. Two rules were previously narrowed to reach green — do not narrow
  further; fix the code instead.
- `npx playwright test e2e/document-validator` green.
- A photo and a signature can each be made to satisfy an exact-dimension **and** a
  size-band rule in one pass, verified by reading back the produced file.
- The validator cannot report a fix it did not make, and cannot pass a rule it did not
  evaluate.
- No government or exam-board name in any user-visible string, in any of the five
  languages.
- `docs/APP_FEATURES.md` updated so every documented capability exists (§2 of this
  document lists the current mismatches).

---

## 5. Suggested sequencing

1. **R1** — everything else depends on it. Land it with its spec first.
2. **R3**, **R2** — wire the catalogue through, then collapse the tabs onto the new engine.
3. **R4**, **R5** — the two repair passes; R5's converge loop needs R1.
4. **R6** — small, self-contained, high differentiation.
5. **R7**, **R8** — new surface area; R8 is the policy-safe answer to the board-name ask.
6. **R9**, **R10** — after the above ship and are observed in closed testing.

R1 + R3 + R4 alone turn the four advertised features from partly-false into true, and
that is worth more than any new feature on this list.
