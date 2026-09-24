# Feature inventory — Indian Form Helper

**Audited:** 2026-09-24 · **Commit:** `289a90d` · **Branch:** `main`

A complete inventory of every feature reachable in the app, how it is routed,
who may use it, what it depends on, and whether it works.

---

## 1. How this was built

Nothing here is taken on trust from an existing document. Each row is derived
from one of:

| Source | What it establishes |
| --- | --- |
| `src/app/app.routes.ts` | Every route, redirect and lazy target |
| `src/app/core/services/tool-registry.service.ts` | The catalogue the home screen and search render |
| `grep` for `isPremium` / `isUserPremium` | Where premium is actually enforced, rather than advertised |
| `src/app/core/api/*` | The backend contract |
| Playwright run, `E2E_TARGET=prod`, 748 tests | Working vs. broken, by observation |

Route integrity was checked mechanically: every `loadComponent` / `loadChildren`
target was resolved against the filesystem and its exported symbol, and every
`redirectTo` was resolved against the set of real routes.

```
lazy imports OK: 48    broken: 0
redirects: 83          dangling: 0
```

**The routing layer is structurally sound.** No navigation in this app can land
on a missing component or a redirect loop. Where a page misbehaves it is inside
the page, not in the route table.

---

## 2. System context

| | |
| --- | --- |
| **Stack** | Ionic 9 + Angular 22 (standalone, zone.js), Capacitor 8 |
| **Rendering** | SPA, hash-less routing, lazy per-route |
| **Processing** | Entirely on-device — pdf-lib, pdf.js, tesseract.js, ZXing, browser-image-compression |
| **Backend** | Accounts + entitlements only. **No document data is ever uploaded.** |
| **API root** | `{apiBaseUrl}/api/v1/pdf-app` |
| **apiBaseUrl (dev)** | `http://localhost:3001` |
| **apiBaseUrl (prod)** | `https://postflow360.onrender.com` — verified live during this audit |
| **Billing** | Manual UPI transfer + admin approval. RevenueCat/Play Billing present but dormant (placeholder keys) |
| **Languages** | English, Hindi, Marathi, Bengali, Punjabi |
| **Android platform** | **Not generated.** No `android/` directory exists |

### Roles

The app has **no route guards and no protected routes**. This is deliberate:
every tool runs on the device and works fully signed out. Roles therefore
describe *entitlement*, not *access*.

| Role | How you become one | What it changes |
| --- | --- | --- |
| **Guest** | Default. No account | Full access to all 27 tools. 5 saved outputs/day |
| **Free** | Registered account | Identical to guest, plus entitlement syncs across devices |
| **Premium** | Server entitlement (admin grant, or approved UPI payment) | Daily cap lifted |
| **Admin** | Backend only | Not a role in this app. No admin UI ships here |

> **There is no "redirect to login" anywhere in this app**, because no route
> requires a session. A requirements or test document that assumes one is
> describing a different app. See §6.

---

## 3. Tool catalogue — the 27 features on the home screen

All 27 are available to **guest, free and premium alike**. The only gate is the
shared daily output quota (§5). "Backend" is blank for every one of them because
none of them talk to a server.

| # | Feature | Module | Route | Aliases | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Photo Tools | `features/photo` | `/features/photo` | `/photo` | ✅ Working |
| 2 | Signature Tools | `features/signature` | `/features/signature` | `/signature` | ✅ Working |
| 3 | Compress PDF | `features/pdf` (`mode: compress`) | `/features/pdf-compress` | `/pdf-compress`, `/compress` | ✅ Working |
| 4 | Images to PDF | `features/pdf` (`mode: create`) | `/features/images-to-pdf` | `/images-to-pdf` | ✅ Working |
| 5 | Extract Pages | `features/pdf-organizer` | `/features/pdf/extract` | `/features/pdf-extract` | ✅ Working |
| 6 | PDF Studio | `features/pdf` | `/features/pdf` | `/pdf`, `/pdf-dashboard` | ✅ Working |
| 7 | Merge PDF | `features/pdf-organizer` | `/features/pdf/merge` | `/merge`, `/pdf-merge` | ✅ Working |
| 8 | Split PDF | `features/pdf-organizer` | `/features/pdf/split` | `/split`, `/pdf-split` | ✅ Working |
| 9 | Organize Pages | `features/pdf-organizer` | `/features/pdf/organize` | `/organize`, `/pdf-organize` | ✅ Working |
| 10 | PDF Reader & Editor | `features/pdf-editor` | `/features/pdf/editor` | `/editor`, `/pdf-reader`, +4 | ✅ Working |
| 11 | Annotate PDF | `features/pdf-editor` | `/features/pdf/editor` | shares #10 | ✅ Working |
| 12 | Sign PDF | `features/pdf-sign` | `/features/pdf/sign` | `/sign`, `/pdf-sign`, +3 | ✅ Working |
| 13 | Fill & Create Forms | `features/pdf-forms` | `/features/pdf/forms` | `/forms`, `/pdf-forms` | ✅ Working |
| 14 | Protect & Unlock PDF | `features/pdf-security` | `/features/pdf/security` | `/pdf-security` | ✅ Working |
| 15 | Document Converter | `features/pdf-conversion` | `/features/pdf/conversion` | `/converter`, `/conversion`, +3 | ✅ Working |
| 16 | Batch Image Tools | `features/batch` | `/features/batch-images` | `/batch-images` | ✅ Working |
| 17 | Exam & Job Presets | `features/presets` | `/features/presets` | `/presets` | ✅ Working |
| 18 | Smart PDF OCR | `features/pdf-ocr` | `/features/pdf-ocr` | `/ocr`, `/pdf-ocr` | ⚠️ Buttons were dead — fixed |
| 19 | Document Scanner | `features/document-scanner` | `/features/document-scanner` | `/scanner` | ⚠️ Buttons were dead — fixed |
| 20 | Exam Document Validator | `features/document-validator` | `/features/document-validator` | `/validator` | ⚠️ Buttons were dead — fixed |
| 21 | PDF Compare | `features/pdf-compare` | `/features/pdf-compare` | `/compare` | ⚠️ Partly failing |
| 22 | Privacy Sanitizer | `features/pdf-privacy-sanitizer` | `/features/pdf-privacy-sanitizer` | `/sanitizer`, +1 | ⚠️ Partly failing |
| 23 | Header & Footer Studio | `features/pdf-header-footer` | `/features/pdf-header-footer` | `/header-footer` | ✅ Working |
| 24 | PDF Repair & Recovery | `features/pdf-repair` | `/features/pdf-repair` | `/repair` | ⚠️ Partly failing |
| 25 | PDF Content Extractor | `features/pdf-extractor` | `/features/pdf-extractor` | `/extractor` | ⚠️ Partly failing |
| 26 | QR & Barcode Toolkit | `features/qr-barcode` | `/features/qr-barcode` | `/qr`, `/barcode` | ✅ Working |
| 27 | PDF Intelligence | `features/pdf-intelligence` | `/features/pdf-intelligence` | `/intelligence` | ✅ Working |

---

## 4. Routed features *not* in the catalogue

These have real routes and complete implementations, but the home screen never
offers them.

| Feature | Route | Reachable from UI? | Status |
| --- | --- | --- | --- |
| **Flatten PDF** | `/features/pdf/flatten` | **No — nothing links to it** | 👻 Orphaned |
| Signature Request | `/features/pdf/signature-request` | Yes — `pdf.page.html:215` | ✅ Working |
| Batch PDF | `/features/batch-pdf` | Yes | ✅ Working |
| Rotate Pages | `/features/pdf/rotate` | Via PDF Studio | ✅ Working |
| Delete Pages | `/features/pdf/delete` | Via PDF Studio | ✅ Working |
| Protect / Unlock (direct) | `/features/pdf/protect`, `/unlock` | Via #14 | ✅ Working |
| Converter detail | `/features/pdf/conversion/:converterId` | Via #15 | ✅ Working |

> **Flatten PDF is fully built and translated into all five languages, and no
> user can reach it.** It has a page, a service (`pdf-flatten.service.ts`) and
> i18n keys (`pdf_flatten.*` in `en/hi/mr/bn/pa`). It is missing only a tile in
> the tool registry. Either add it or delete it — shipping it in this state
> means paying the translation and maintenance cost for nothing.

---

## 5. Account, premium and support pages

| Feature | Route | Role | Backend | Status |
| --- | --- | --- | --- | --- |
| Home / dashboard | `/home` | All | — | ✅ Working |
| Account (sign in + register) | `/account` | All | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `GET /auth/me` | 🔒 Needs backend |
| Profile | `/profile` | All | `GET /auth/me` | 🔒 Needs backend |
| Premium / paywall | `/features/premium` | All | `GET /subscription/plans`, `/payment-settings`, `POST /subscription/manual-payment` | 🔒 Needs backend |
| History | `/features/history` | All | — (device storage) | ✅ Working |
| Settings | `/features/settings` | All | — | ✅ Working |
| Privacy policy | `/features/privacy-policy` | All | — | ✅ Working |
| Terms of use | `/features/terms-of-use` | All | — | ✅ Working |
| Local data & storage | `/features/local-data-storage` | All | — | ✅ Working |
| Help & FAQ | `/features/help-faq` | All | — | ✅ Working |
| Contact support | `/features/contact-support` | All | — | ✅ Working |
| About the engine | `/features/about-engine` | All | — | ✅ Working |
| 404 | `/404` (catch-all `**`) | All | — | ✅ Working |
| **Account deletion** | — | — | — | ❌ **Does not exist** |

> **There is no account-deletion path anywhere in the app** — no route, no UI,
> no API call. Google Play requires both an in-app path and a publicly reachable
> web URL for any app that lets people create an account. This is a submission
> blocker, not a nice-to-have.

---

## 6. Free vs premium — advertised against enforced

The backend sells four plans (`GET /subscription/plans`, verified live):

| Plan | Price | Advertised features |
| --- | --- | --- |
| `free` | ₹0 | Core PDF tools · Up to 20 pages per merge · Ads supported |
| `pro_monthly` | ₹149 / 30d | Unlimited pages · Batch processing · OCR & PDF intelligence · No ads · Priority support |
| `pro_annual` | ₹1199 / 365d | Everything monthly · 2 months free · Early access |
| `lifetime` | ₹2999 | Everything annual · One-time · Lifetime updates |

What the **app actually enforces**:

| Advertised benefit | Enforced? | Evidence |
| --- | --- | --- |
| Lifted daily cap | ✅ **Yes** | `usage-quota.service.ts` — 5 saved outputs/day free, unlimited premium. Consumed in `storage.service.ts:72` |
| "Up to 20 pages per merge" | ❌ No | No page-count limit exists anywhere in the codebase |
| "Batch processing" | ❌ No | `BatchProcessingService` has the premium check — **and is never injected by either batch page**. Both implement their own ungated `processBatch()` |
| "No ads" | ❌ No | `AdService` has **zero callers**. No ad is ever requested, for anyone |
| "OCR & PDF intelligence" | ❌ No | Neither feature has a premium check |
| "Priority support" | n/a | Not a software behaviour |

**The only thing money buys today is the lifted daily cap.** Four of the five
advertised software benefits are unenforced — three of them because the code
that would enforce them is dead. This is a mis-selling risk as much as a
technical one: someone paying ₹2999 for "Lifetime" is promised batch processing
and ad removal that every free user already has.

### Dead code found

| Service | Callers | Consequence |
| --- | --- | --- |
| `AdService` | 0 | No ads exist. Also ships `initializeForTesting: true` and placeholder ad unit IDs |
| `BatchProcessingService` | 0 | The premium gate on batch never runs |
| `PdfProcessingService` | 0 | Includes a `compressPdf` that passes `useObjectStreams: false`, which *grows* a PDF. Harmless only because nothing calls it |

---

## 7. Cross-cutting capabilities

| Capability | Where | Status |
| --- | --- | --- |
| i18n — 5 languages | `core/i18n/translations/*` | ⚠️ Selector tests failing at baseline |
| Theme (light/dark/system) | `theme.service.ts` | ✅ Working |
| Global search (Ctrl+K) | `global-search.service.ts` | ✅ Working |
| History of outputs | `history.service.ts` | ⚠️ Partly failing |
| Daily quota | `usage-quota.service.ts` | ⚠️ Partly failing |
| Toasts / error surface | `toast.service.ts`, `app-error.service.ts` | ✅ Working |
| Share sheet | `share.service.ts` | ✅ Working |
| Recent & favourite tools | `tool-registry.service.ts` | ✅ Working |
| Onboarding | home | ✅ Working |

---

## 8. Backend API surface

Everything the app asks of the server. **No endpoint receives document data.**

| Endpoint | Method | Auth | Used by |
| --- | --- | --- | --- |
| `/auth/register` | POST | — | Account |
| `/auth/login` | POST | — | Account |
| `/auth/refresh` | POST | — | `auth.interceptor` |
| `/auth/me` | GET | Bearer | Startup, resume, profile |
| `/subscription/plans` | GET | — | Paywall |
| `/subscription/payment-settings` | GET | — | Paywall |
| `/subscription/manual-payment` | GET · POST | Bearer | Paywall |
| `/subscription/verify` | POST | Bearer | Store purchase (dormant) |
| **`DELETE /auth/me`** | — | — | **Missing — required for Play** |

---

## 9. Test results

Full suite, `E2E_TARGET=prod`, both viewports (Desktop Chrome + Pixel 5).

| Run | Workers | Passed | Failed | Skipped | Time |
| --- | --- | --- | --- | --- | --- |
| Baseline (`289a90d`) | default | 572 | 126 | 50 | 29.2 min |
| After the pdf.js fix | default | 616 | 82 | 50 | 19.8 min |
| After the server-caching fix | default | 626 | 80 | 60 | 15.1 min |
| Final, test edits reverted | default | 608 | 99 | 59 | 24.5 min |
| **Final, bounded workers** | **4** | **634** | **72** | **60** | **22.3 min** |

The last row is the one to trust — see below.

The 50–60 skips are the account/premium suites, which skip by design when the
accounts backend is unreachable. It was unreachable throughout this audit — see
§10. The extra skips in later runs are the new journey and screenshot specs
skipping on the project they do not target.

### These numbers are noisier than they look

The suite is `fullyParallel` with unbounded local workers, and this machine
cannot sustain that. Tests fail on `page.goto: Timeout 15000ms exceeded` while
the static server answers the same request in 6 ms. The clearest demonstration:

```
language-selector.spec.ts, default workers :   9 failed / 19 passed  (6.1 min)
language-selector.spec.ts, --workers=1      :   0 failed / 28 passed  (1.9 min)
```

Same build, same assertions. That file alone accounted for 6 failures at
baseline, 1 in run 3 and 17 in the final run without a single relevant code
change between them.

**Treat any default-parallelism failure count as an upper bound, not a
defect count.** See FIND-T0 in [CHANGELOG_FIXES.md](CHANGELOG_FIXES.md).

Re-running the whole suite with `--workers=4` moved it from 99 failures to
**72**, and dropped `language-selector` off the failure list entirely — 27
"failures" that were the harness, not the app.

```bash
E2E_TARGET=prod npx playwright test --workers=4
```

### Where the real failures sit

Baseline failures clustered almost entirely in PDF-loading features, and the
pdf.js fix cleared most of them:

| Area | Baseline | Final (`--workers=4`) |
| --- | --- | --- |
| Smart PDF OCR | 26 | 18 |
| Exam Document Validator | 14 | 14 |
| Phase-1 regression | 14 | 3 |
| PDF Content Extractor | 13 | 2 |
| PDF Repair | 12 | 2 |
| Privacy Sanitizer | 6 | 2 |
| Language selector | 6 | **0** |
| PDF Compare | 6 | 2 |
| Free-tier quota | 4 | **0** |
| Document Scanner | 3 | 4 |
| History | — | 4 |
| Other | 22 | 21 |

The remaining 72 are dominated by three groups of tests that describe a UI the
app does not have — the Document Validator selectors (14), the OCR
replace-file flow (6+), and the regression suites' redirect assertions (3).
All three were verified against the running app and recorded as findings rather
than edited; see FIND-T1 to FIND-T3 in
[CHANGELOG_FIXES.md](CHANGELOG_FIXES.md).

---

## 10. Blockers found

| # | Blocker | Impact |
| --- | --- | --- |
| B1 | **pdf.js worker loaded from a CDN** in 10 services | Every PDF feature required the internet, in an app whose headline claim is "100% Offline". Root cause of most test failures. **Fixed in this audit** |
| B2 | **tesseract.js downloads core + language data from a CDN** | OCR does not work offline on first use, despite the UI saying "cached locally for offline use" |
| B3 | **No accounts backend available** | The pdf-app API exists only on production. The local snapshot in `Downloads/linkedin AUTO_8522` is a Sept-8 copy with **no `/pdf-app` routes at all**. All account, premium and journey tests skip |
| B4 | **No account deletion** | Play policy blocker |
| B5 | **No `android/` platform** | No AAB can be produced |
| B6 | **In-app UPI for digital goods** | Play Payments policy — the most common cause of suspension |
| B7 | **Premium benefits unenforced** | Mis-selling risk (§6) |
| B8 | **AdMob ships in test mode** with placeholder ad unit IDs | `initializeForTesting: true`, `adId: 'android-banner-id'` |

---

## 11. What changed during this audit

Application source only. Existing test files were left exactly as written —
where a test fails because it describes a UI the app does not have, that is
recorded as a finding rather than edited away.

| Change | Files |
| --- | --- |
| **29 dead buttons rebound** — `(btnClick)` bound to an output that does not exist, so the primary actions of Document Scanner, Document Validator and Smart PDF OCR did nothing | `document-scanner`, `document-validator`, `pdf-ocr` templates |
| pdf.js worker bundled locally instead of fetched from cdnjs | `core/utilities/pdfjs-worker.ts` (new), 10 services, `angular.json` |
| OCR detection step now names the selected file | `features/pdf-ocr/pdf-ocr.page.html` |
| PDF Editor given the `<h1>` it never had | `features/pdf-editor/pdf-editor.page.{html,scss}` |
| Account deletion: service call, confirmation UI, policy text | `core/api/auth.service.ts`, `features/account/*`, `features/privacy-policy/*` |
| 17 empty lifecycle methods removed | 12 feature pages/components |
| `result-preview` consolidated from six outputs to three; native-shadowing outputs renamed | `shared/components/result-preview/`, 5 templates, 3 preview components |

Added (new files, no existing test modified):

| Addition | Path |
| --- | --- |
| Nine-stage journey test (skips without the accounts backend) | `e2e/release/full-journey.spec.ts` |
| Play Store screenshot capture | `e2e/release/store-screenshots.spec.ts` |
| Page objects for the journey | `e2e/pages/app.pages.ts` |

Flagged for your decision — test-harness infrastructure, not source and not a
test: `tools/serve-www.mjs` now revalidates with ETags instead of sending
`no-store` for every asset. It changes test *timing* (and removed a large
source of flakiness) without changing any assertion. See
[CHANGELOG_FIXES.md](CHANGELOG_FIXES.md).

Full detail in [CHANGELOG_FIXES.md](CHANGELOG_FIXES.md).
