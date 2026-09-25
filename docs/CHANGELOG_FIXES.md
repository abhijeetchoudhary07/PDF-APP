# Fix log — production readiness audit

**Audit date:** 2026-09-24 · **Starting commit:** `289a90d`

Every defect found, its root cause, and what was done about it.

> **Scope note.** Existing test files were deliberately left untouched. Where a
> test fails because it describes a UI the app does not have, that is recorded
> in [§ Findings in the test suite](#findings-in-the-test-suite) rather than
> edited away. Only application source was changed.

---

## Fixed

### FIX-001 — Every PDF feature required the internet
**Severity:** Critical · **Files:** `core/utilities/pdfjs-worker.ts` (new), `angular.json`, 10 services

#### Symptom
126 of 748 end-to-end tests failed, clustered entirely in PDF-loading features:
OCR (26), Document Validator (14), Phase-1 regression (14), Content Extractor
(13), Repair (12), Compare (6), Privacy Sanitizer (6). Individual tests took
**up to 2.6 minutes** before failing — `REP-030` took 2.6 min on desktop and
14 s on mobile in the same run.

#### Root cause
Ten services each set the pdf.js worker to a CDN URL:

```ts
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
```

Nothing could open a PDF until a third-party CDN answered. The wildly variable
timings were that fetch — the app was not slow, it was waiting on the network.

Three problems, worst first:

1. **It broke the product's central promise.** The header says *100% Offline*
   and the footer says *Files Never Leave Your Device*. Both were true of the
   document bytes and false of the ability to do anything with them. Offline,
   the file picker accepted a PDF and then nothing happened.
2. **A Capacitor build has no origin to fall back on.** `allowMixedContent:
   false` is set, and a remote module script is exactly what a stricter WebView
   or a future CSP blocks.
3. **Ten copies drift.** Eight guarded the assignment with
   `if (!GlobalWorkerOptions.workerSrc)`, two set it unconditionally — so which
   URL won depended on module evaluation order.

#### Fix
One module, `pdfjs-worker.ts`, points pdf.js at a worker copied into
`assets/pdfjs/` at build time. The ten services import it for its side effect.
The bundled worker can never disagree with the installed `pdfjs-dist`, and
nothing is fetched from a third party.

Two details earned their place the hard way:

- **The URL is resolved against `document.baseURI`.** pdf.js hands `workerSrc`
  to the Worker constructor, which resolves a relative path against the current
  URL, not the app base — on a route two segments deep that becomes
  `/features/pdf/assets/pdfjs/...`, and because this is a single-page app the
  404 returns `index.html`, so the failure looks like a syntax error inside the
  worker rather than a missing file.
- **The assignment is guarded.** See FIX-001a.

#### FIX-001a — the regression this fix introduced, and how it was caught
Making the assignment unconditional broke `pdf-analysis.spec.ts`
("should diagnose healthy PDF correctly", 229/230). Under Node, pdf.js falls
back to a *fake worker* that `import()`s `workerSrc`, and Node's ESM loader
accepts only `file:` and `data:` URLs:

```
Setting up fake worker failed: "Only URLs with a scheme in: file and data
are supported by the default ESM loader. Received protocol 'http:'"
```

The old CDN value had exactly the same problem — the reason it never showed is
that eight of the ten services *guarded* the assignment, so in the unit
environment pdf.js kept its own resolvable default. Restoring the guard keeps
that default under Node while still supplying the bundled asset in a browser,
where `workerSrc` starts empty.

#### Verification
Failures fell from 126 to the low tens, and the suite went from 29.2 min to
15.1 min. Two suites that have nothing to do with PDFs — `language-selector`
(6 failures) and `free-tier-quota` (4) — went green, because they had been
timing out behind the same fetch. Unit suite back to 230/230.

---

### FIX-002 — OCR never told you which file it had opened
**Severity:** Low (UX) · **Files:** `features/pdf-ocr/pdf-ocr.page.html`

The OCR page has a three-step flow and the steps disagreed. An **image** skips
straight to *configure*, whose header renders the filename. A **PDF** stops at
*detect*, whose header renders a title and a badge and **never names the file**.
Someone selecting a PDF from a folder of scans was shown a detection result with
no indication of which document it described; picking the wrong file looked
identical to picking the right one until two steps later.

The detect step now carries the same filename element as the configure step.

---

### FIX-003 — The PDF Editor had no heading
**Severity:** Medium (accessibility) · **Files:** `features/pdf-editor/pdf-editor.page.{html,scss}`

`pdf-editor.page.html` was the **only** feature page in the app with no `<h1>`
and no `<app-page-header>` — verified across every `src/app/features/*.page.html`.
Screen-reader users had nothing to navigate to and no announced identity for the
page.

The toolbar already showed the document name in a `<span class="editor-title">`;
it is now an `<h1>` with the same class. `margin: 0` was added because the
element sits inline in a toolbar rather than above content.

---

### FIX-004 — No way to delete your account
**Severity:** Critical (Play policy) · **Status:** ✅ Done — client *and* server

No route, no UI, no API call existed anywhere. Google Play requires any app that
lets someone create an account to offer deletion **in the app** and **from a
public web page**.

- `AuthService.deleteAccount()` calls `DELETE /api/v1/pdf-app/auth/me`, then
  clears the local session. 404 and 401 are treated as "already gone" and still
  clear the session — leaving a signed-in shell on the device would be worse.
  Only a genuine failure to reach the server is surfaced, because that is the
  one case where the account really might still exist.
- A danger-zone card at the foot of `/account`, behind a typed `DELETE`
  confirmation. It is the only irreversible action in the app and would
  otherwise sit one button away from *Sign out*.
- The privacy policy now documents both paths, what is deleted, what is
  retained, and the timescale.

**Files:** `core/api/auth.service.ts` · `features/account/account.page.{ts,html,scss}` ·
`features/privacy-policy/privacy-policy.page.html`

> **Closed 2026-09-25.** The endpoint exists:
> `api/v1/pdf-app/auth/me.ts` in the accounts repository handles `DELETE` and
> calls `deletePdfUser`. It was unavailable during the original audit, which is
> why this was recorded as open.
>
> Verified rather than assumed: `JOURNEY-FULL` deletes the account through the
> UI and then posts the same credentials to `/auth/login`, asserting **401**.
> Clearing the device while the row survived would pass the first half of that
> and fail the second. It passes on both viewports.

---

### FIX-005 — 17 empty lifecycle methods
**Severity:** Low · **Files:** 12 feature pages/components

`ngOnInit(){}` / `ngOnDestroy(){}` with empty bodies, plus the now-unneeded
`implements OnInit, OnDestroy`. Angular calls them on every instance for no
effect, and they mislead a reader into thinking there is setup to find.
Removed, along with the interfaces that no longer applied.

---

### FIX-006 — `result-preview` shipped two parallel output APIs
**Severity:** Medium · **Files:** `shared/components/result-preview/`, 5 feature templates, 3 preview components

`ResultPreviewComponent` declared six outputs where three were meant:

```ts
@Output() onSave;  @Output() saved;
@Output() onShare; @Output() shared;
@Output() onChangeSettings; @Output() reset;
```

Every action emitted **both** halves. Five templates bound one set
(`pdf`, `pdf-organizer`, `photo`, `signature`) and one bound the other
(`pdf-security`), and nothing indicated which was current — so a new caller had
an even chance of binding the pair that would eventually be deleted.

Consolidated to `saved` / `shared` / `resetRequested`, and all five call sites
updated. The surviving names avoid both lint traps the old ones hit: no `on`
prefix (Angular supplies that at the binding site) and nothing shadowing a
native DOM event.

Separately, `close` on `document-preview`, `image-preview` and `pdf-preview` and
`cancel` on `file-dropzone` shadowed native DOM events and are now `closed` and
`cancelled`.

---

### FIX-007 — 29 dead buttons across three features
**Severity:** Critical · **Files:** `document-scanner`, `document-validator`, `pdf-ocr` templates

#### Symptom
Found by running the app, not by a test. On the Smart PDF OCR page, selecting a
PDF correctly reported *"Found selectable text in 1 of 1 pages"* — and then
**"Extract Digital Text Directly" did nothing**. No error, no console message,
no state change. Clicking it via the DOM directly did nothing either.

#### Root cause
`AppButtonComponent` declares exactly one output:

```ts
@Output() clicked = new EventEmitter<MouseEvent>();
```

Three feature templates bound `(btnClick)` instead:

```html
<app-button (btnClick)="extractExistingDigitalText()">
```

`btnClick` is defined nowhere in the codebase. Angular does not error on an
unknown output binding for a component — it falls back to adding a native DOM
listener for an event called `btnClick`, which nothing ever dispatches. So the
handler was simply never wired, silently.

240 bindings elsewhere in the app use the correct `(clicked)`. These 29 were the
outliers:

| Feature | Dead buttons | What stopped working |
| --- | --- | --- |
| Document Scanner | 14 | Capture from camera, import from gallery, crop, enhance, done |
| Smart PDF OCR | 9 | Extract digital text, run OCR, cancel, export |
| Document Validator | 6 | Validate, 1-click auto-fix |

These are the primary actions of all three features. **All three were
effectively unusable.**

#### Fix
All 29 rebound to `(clicked)`. Verified in the running app: the same click now
runs the extraction to completion — *"Recognized Document · Avg. Confidence:
100% · 1 Page"* with the text correctly extracted and all four export options
offered.

#### Why no test caught it
The three suites covering these features have **42 failing tests between them**,
and none of them reaches a button click — they fail earlier, on selectors that
describe a UI the app does not have (FIND-T1, FIND-T3). Fixing `btnClick`
changed the pass/fail counts in those suites by **zero**.

That is the finding worth keeping: the suite was stale enough that it failed for
cosmetic reasons, and those cosmetic failures masked three features being
completely broken. A suite failing for the wrong reason is worse than no suite,
because it looks like coverage.

---

## Changed outside application source — please confirm

### `tools/serve-www.mjs` — conditional revalidation
**This is test-harness infrastructure, not application source and not a test.**
It is flagged here because it changes test *outcomes*, and is easy to revert if
you would rather it did not.

The static server sent `Cache-Control: no-store` for every file, so the browser
re-downloaded every chunk on every navigation. With the suite fully parallel and
the app's chunks running to megabytes — the pdf.js worker alone is 1.2 MB — a few
hundred navigations moved gigabytes through one single-threaded Node process, and
tests began failing on timeouts unrelated to the app. **Which** tests failed
changed from run to run, which is the signature of load rather than a defect:
running the same regression file three times produced three different sets of
failures, and every one of them passed in isolation.

Non-`index.html` responses now carry an ETag and `no-cache`, so a request is
still made every time and nothing stale is ever used — the response just comes
back as an empty 304. `index.html` keeps `no-store`.

Measured on the two regression files: **48.7 s with 4 failures → 19.5 s with 0**.

---

## Findings in the test suite

Recorded, not fixed. In each case the application was verified to behave
correctly and the test describes something else.

### FIND-T1 — The Document Validator suite targets a UI that does not exist
**16 failures** across `validator-preset`, `validator-photo`, `validator-autofix`,
`validator-error`.

The specs drive a `<select>` with `<option>` children and assert
`.preset-selector`, `.preset-name`, `.doc-slot-card`, `.slot-item`. The page has
none of those: preset selection is a `.preset-search-input` filtering a row of
`.preset-pill` buttons, and the document slots are `.slot-card`. Failures are
`element(s) not found`, while the page itself works — a preset auto-selects on
load and the slots populate.

A second group are **Playwright strict-mode violations**:
`expect(page.locator('.validation-report, .rule-row, .status-badge')).toBeVisible()`
resolves to five `.rule-row` elements, and `toBeVisible()` on a multi-match
locator fails by design. The rules *are* rendered, with pass/fail status.

**To fix:** rewrite against the real markup and add `.first()` where a locator is
intentionally plural.

### FIND-T2 — Regression suites require redirects not to happen
**10 failures** across `e2e/regression/phase-1-regression.spec.ts` and
`e2e/phase2/shared/regression.spec.ts`.

Both navigate to legacy alias routes and then assert the URL still matches the
alias:

```ts
await page.goto('/features/pdf-reader');
await expect(page).toHaveURL(/.*features\/pdf-reader/);   // redirects to /features/pdf/editor
```

`/features/pdf-reader`, `/features/pdf-signing`, `/features/pdf-merge`,
`/features/converter` and others are aliases the app redirects on purpose, for
old bookmarks and shared links. The assertion passes only for the entries that
were never aliases.

It is also **racy**: `toHaveURL` polls, so it passes whenever the poll happens to
catch the pre-redirect URL. That is why the failing set changed between runs.

**To fix:** assert the canonical destination, which tests the thing that matters
— the old link still reaches the right tool.

### FIND-T3 — OCR replace-file tests assume a single-screen page
**6 failures** in `pdf-ocr-upload.spec.ts` (`OCR-007`, `OCR-011`, `OCR-012`,
`OCR-013`).

They call `setInputFiles` a second time on `input[type="file"]`. Once a PDF is
selected the page advances to the detection step and the dropzone — with its file
input — is gone; *Cancel* returns to selection. The tests time out waiting for an
element the app has deliberately replaced.

The app's behaviour is defensible. Whether *Cancel* is discoverable as "choose a
different file" is a design question worth asking separately.

### FIND-T0 — The suite is unreliable at its own default parallelism
**This one invalidates any failure count taken from a default local run.**

`playwright.config.ts` sets `fullyParallel: true` and
`workers: process.env['CI'] ? 1 : undefined` — so CI runs serial and reliable,
while a local run spawns as many Chromium instances as the machine has cores.
On this machine that is more than it can sustain, and tests fail on
`page.goto: Timeout 15000ms exceeded` while the static server answers the same
request in **6 ms**.

`e2e/release/language-selector.spec.ts` shows it cleanly:

| Run | Workers | Result |
| --- | --- | --- |
| Full suite, baseline | default | 6 failures |
| Full suite, run 3 | default | 1 failure |
| Full suite, final | default | 17 failures |
| **That file alone** | default | **9 failed / 19 passed, 6.1 min** |
| **That file alone** | `--workers=1` | **28 passed / 0 failed, 1.9 min** |

Same build, same assertions, same machine. Nothing about the app changed
between the last two rows.

This is also why the failing *set* moved between runs — running
`e2e/regression` three times in a row produced three different sets of
failures, every one of which passed in isolation.

**Consequence:** the headline "99 failed" from a default local run is not a
count of defects. Pin `workers` to something the host can sustain (or run the
CI path) before treating any number as real.

### FIND-T4 — Four hard-coded waits
`e2e/account/account-auth.spec.ts` (×3) and `e2e/release/file-handling.spec.ts`
(×1) use `page.waitForTimeout`, which the brief for this audit prohibits. Each is
a "wait long enough that any request would have happened" pattern and each has a
condition-based equivalent — `waitForLoadState('networkidle')`, `waitForResponse`,
or waiting for the preview the file select produces.

---

## Findings in the product — decisions required

### FIND-001 — Premium sells four things it does not deliver
**Severity:** High (mis-selling)

`pro_monthly` (₹149) advertises *Unlimited pages*, *Batch processing*,
*OCR & PDF intelligence* and *No ads*. None are gated:

| Claim | Reality |
| --- | --- |
| Batch processing | `BatchProcessingService` holds the premium check — **and is never injected**. Both batch pages implement their own ungated `processBatch()` |
| No ads | `AdService` has **zero callers**. No ad is ever requested, for anyone |
| Unlimited pages | No page-count limit exists anywhere in the code |
| OCR & intelligence | No premium check on either |

The only thing money buys is the lifted 5-saves-per-day cap. Someone paying
₹2 999 for *Lifetime* is promised three things every free user already has.

**Decision needed:** gate them, or rewrite the plan descriptions.

### FIND-002 — OCR still needs the network on first use
**Severity:** High

`createWorker(langStr, 1, { logger })` passes no `workerPath`, `corePath` or
`langPath`, so tesseract.js downloads its core WASM and language data from its
default CDN. The progress message says *"cached locally for offline use"*, which
is true only **after** a successful online run. FIX-001 removed the network from
every other PDF feature; this is what remains. Bundling five language packs is a
real APK-size trade-off (~10–15 MB each), so it is a product decision.

### FIND-003 — Flatten PDF is built, translated, and unreachable
`/features/pdf/flatten` has a page, a service and i18n keys in all five
languages. **Nothing links to it** and it is absent from the tool registry.
Surface it or delete it.

### FIND-004 — AdMob ships in test mode with placeholder IDs
```ts
initializeForTesting: true,   // Set to false in production
adId: 'android-banner-id',    // Replace with real IDs
isTesting: true               // Set to false in production
```
`AdService` is never called, so none of it runs — but the dependency still merges
`com.google.android.gms.permission.AD_ID` into the manifest, forcing a Data
Safety declaration and a content-rating answer for a feature that does not exist.
**Recommendation: delete the service and drop `@capacitor-community/admob`.**

### FIND-005 — Dead code
| Service | Callers | Note |
| --- | --- | --- |
| `AdService` | 0 | See FIND-004 |
| `BatchProcessingService` | 0 | Its premium gate never runs — see FIND-001 |
| `PdfProcessingService` | 0 | Its `compressPdf` passes `useObjectStreams: false`, which **grows** a PDF |
| `DocumentPreviewComponent` | 0 | `app-document-preview` appears in no template |

### FIND-006 — In-app UPI for digital goods
Already documented in `PLAY_STORE_RELEASE.md §7` as a deliberate product
decision. Restated in [PLAY_STORE.md §9](PLAY_STORE.md) with the four compliant
routes. **No code changed** — confirmed as document-only.

### FIND-007 — No Android platform
`@capacitor/android` is not a dependency and no `android/` directory exists, so
`npx cap add android` cannot run and no AAB can be produced.
`@capacitor/splash-screen` is likewise absent, making the entire `SplashScreen`
block in `capacitor.config.ts` inert. `android/` is also not in `.gitignore`, so
a keystore could be committed the moment the folder is generated.

### FIND-008 — 1 067 pre-existing lint errors left in place
`ng lint` went from **1 092 → 1 067**: 25 substantive errors fixed (FIX-005,
FIX-006). What remains:

| Rule | Count | Why it was left |
| --- | --- | --- |
| `prefer-control-flow` (`*ngIf` → `@if`) | 781 | `ng generate @angular/core:control-flow` — rewrites most of the app |
| `prefer-inject` (constructor → `inject()`) | 278 | `ng generate @angular/core:inject` — same |
| `no-negated-async` | 8 | **See below** |

Both migrations are official and mechanical, but together they touch over a
hundred files. They belong in their own reviewable change, not folded into a
stability audit.

#### The 8 `no-negated-async` are not safely auto-fixable
The rule wants `!(obs | async)` rewritten as `(obs | async) === false`. Applied
literally, that is a behaviour change in every one of these cases:

```html
[disabled]="!(state.canUndo$ | async)"     <!-- pdf-editor.page.html:19 -->
```

`!undefined` is `true`, so the button is **disabled until the state is known** —
which is correct. `undefined === false` is `false`, so the rewrite would *enable*
Undo before the editor knows whether there is anything to undo.

The five object-valued ones are worse:

```html
*ngIf="!(state.document$ | async)"          <!-- pdf-editor.page.html:176 -->
```

There is no `=== x` form that preserves this; it needs restructuring to
`*ngIf="(state.document$ | async) as doc; else empty"`.

`profile.page.html:185` (`!(monetization.isPremium$ | async)`) is the one with a
real user-visible edge: `isPremium$` is a `BehaviorSubject(false)`, so a premium
user sees the upgrade prompt for one change-detection tick before it flips. Mild,
pre-existing, and the same class of flash the quota service documents avoiding.

**Recommendation:** fix these by hand alongside the `control-flow` migration,
which restructures these templates anyway.

---

## Verified as *not* defects

| Claim | Finding |
| --- | --- |
| "47 broken lazy route imports" | **False.** A tooling artefact — a shell heredoc silently ate the backslashes in the verification regex. All 48 lazy imports resolve and all 83 redirects resolve. The routing layer is sound |
| "Hardcoded secrets in the bundle" | **None.** A scan for key/secret/token/password literals in `src/` came back clean. The only placeholders are the RevenueCat keys, which are publishable client keys by design |
