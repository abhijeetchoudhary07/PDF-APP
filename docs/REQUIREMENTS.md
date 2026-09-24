# Requirements — Indian Form Helper

**Version:** 1.0 · **Date:** 2026-09-24 · **Derived from:** [FEATURE_LIST.md](FEATURE_LIST.md)

This document states what the app is required to do, in a form that can be
tested. Every requirement is traceable to a route, a service and a Playwright
test id.

Requirements marked **[GAP]** describe behaviour the product needs but the code
does not yet implement. They are written as requirements, not as apologies, so
they can be scheduled.

---

## 1. Purpose and scope

Indian Form Helper prepares documents for Indian government exam and job
portals: resizing a photo to an exact KB, cleaning a signature, shrinking a PDF
under an upload limit, and the PDF toolkit around that.

**The product promise is that documents never leave the device.** Every
functional requirement below is subordinate to that: any requirement that would
be satisfied by uploading a document is satisfied wrongly.

### In scope
On-device document processing; an optional account that carries a premium
entitlement between devices; a paywall.

### Out of scope
Server-side document processing; document storage; collaboration; anything that
transmits document content.

---

## 2. Actors

| Actor | Definition |
| --- | --- |
| **Guest** | Has not signed in. The default and the majority case |
| **Free user** | Signed in, no active entitlement |
| **Premium user** | Signed in with `entitlement.isPremium === true` |
| **Admin** | Operates the backend. Has no interface in this app |

> The app has no protected routes. Every tool is available to every actor.
> Actors differ only in quota.

---

## 3. Functional requirements

### 3.1 Core promise

**FR-001 — On-device processing**
*As a guest, I want my documents processed on my phone, so that a private
document is never uploaded anywhere.*

- **Given** any tool in the catalogue
- **When** I process a file
- **Then** no request carrying document bytes is made to any host
- **And** the operation completes with the device offline

> ⚠️ **Not currently met.** Fetching the pdf.js worker from `cdnjs.cloudflare.com`
> broke the offline half of this (fixed in this audit, B1); tesseract.js still
> downloads its core and language data on first use (**[GAP]** B2).

**FR-002 — Offline availability**
*As a user in a queue outside an exam centre, I want the app to work without a
network, so that I can fix a document where I actually need to.*

- **Given** the device has no connectivity
- **When** I open any of the 27 tools and process a file
- **Then** the tool completes normally
- **And** no error referring to a network appears

---

### 3.2 Navigation and routing

**FR-010 — Every route resolves**
- **Given** any route in `app.routes.ts`
- **When** it is visited directly
- **Then** its component loads and the URL is unchanged

**FR-011 — Legacy URLs are honoured**
- **Given** any of the 83 alias routes (e.g. `/merge`, `/ocr`, `/compress`)
- **When** visited
- **Then** the app redirects to the canonical route

**FR-012 — Unknown URLs land on 404, not home**
*As someone following a stale bookmark, I want to be told the page is gone, so
that I don't think the app reset itself.*

- **Given** a URL matching no route
- **When** visited
- **Then** the app navigates to `/404` and renders the not-found page

**FR-013 — No route requires a session**
- **Given** I am a guest
- **When** I visit any route
- **Then** I am never redirected to a sign-in screen

---

### 3.3 Photo, signature and presets

**FR-020 — Compress a photo to an exact size**
*As an applicant, I want my photo under a stated KB at stated dimensions, so
that the portal accepts it.*

- **Given** a JPG/PNG and a target of *N* KB
- **When** I compress
- **Then** the output is ≤ *N* KB and still legible
- **And** if the target cannot be met, I am told rather than given a silent miss

**FR-021 — Crop to a required aspect/pixel size** · **FR-022 — Custom size and style**

**FR-023 — Clean a signature**
- **Given** a photographed signature
- **When** I clean it
- **Then** the background is white, the ink is dark, and the result is auto-cropped

**FR-024 — Apply an exam preset**
*As an SSC/UPSC applicant, I want a preset, so that I don't have to read the
spec sheet.*

- **Given** the preset list
- **When** I pick one and supply a file
- **Then** every field (dimensions, KB, format) is filled from the preset

---

### 3.4 PDF toolkit

**FR-030 — Compress a PDF to an exact KB** · **FR-031 — Images to PDF**
**FR-032 — Merge** · **FR-033 — Split** · **FR-034 — Extract pages**
**FR-035 — Reorder / rotate / delete pages** · **FR-036 — Read and annotate**
**FR-037 — Sign** · **FR-038 — Fill and create forms**
**FR-039 — Protect and unlock** · **FR-040 — Convert** (PDF ⇄ Word/Excel/PPT/images)
**FR-041 — Compare two PDFs** · **FR-042 — Repair a damaged PDF**
**FR-043 — Extract text/images/tables/attachments** · **FR-044 — Header & footer**
**FR-045 — Privacy sanitizer** · **FR-046 — QR & barcode** · **FR-047 — PDF intelligence**

Each shares this acceptance shape:

- **Given** a valid input file
- **When** the primary action runs
- **Then** a correct output is produced and offered for save/share
- **And** the URL remains the tool's own route throughout
- **And** an invalid or corrupt input produces a specific message, never a blank screen or a crash

**FR-048 — Flatten a PDF** **[GAP]**
The feature is implemented, routed at `/features/pdf/flatten` and translated
into all five languages, but **nothing in the UI links to it**.

- **Given** the tool catalogue
- **When** I look for flatten
- **Then** it appears and navigates to `/features/pdf/flatten`

---

### 3.5 OCR and scanning

**FR-050 — Detect selectable text before offering OCR**
- **Given** a PDF
- **When** it is selected
- **Then** the app reports how many pages already contain selectable text
- **And** offers direct extraction as well as full OCR
- **And** names the file it is reporting on *(added in this audit)*

**FR-051 — OCR in five Indian languages** · **FR-052 — Searchable PDF export**
**FR-053 — Cancel a running OCR** and leave no partial state
**FR-054 — Scan with the camera**, auto-detect corners, correct perspective
**FR-055 — Validate a document against a portal's rules**, with one-click auto-fix

---

### 3.6 Output, history and quota

**FR-060 — Save or share a result**
- **Given** a completed output
- **When** I save
- **Then** the file is written to device storage (Capacitor) or downloaded (web)
- **And** only a file that actually landed is counted against my quota

**FR-061 — Daily free allowance**
*As the operator, I want free use capped, so that premium has a reason to exist.*

- **Given** a guest or free user who has saved 5 outputs today
- **When** they attempt a 6th
- **Then** nothing is saved, a message names the limit, and the paywall is offered
- **And** the count resets at local midnight
- **And** a premium user is never counted

**FR-062 — One operation is counted once**
- **Given** one result saved and then shared
- **Then** the quota is decremented once, not twice
- **And** a batch run counts as one operation

**FR-063 — History of outputs** — on-device, clearable by the user

---

### 3.7 Account

**FR-070 — Register** · `POST /auth/register`
- **Given** a valid email and a password meeting the rules
- **When** I create an account
- **Then** I am signed in, the session persists, and my plan shows **Free**
- **And** an invalid email or a short password is rejected **without a network request**

**FR-071 — Sign in** · **FR-072 — Sign out**
- **Given** I sign out
- **Then** the stored session is destroyed
- **And** every tool continues to work — *this is the product, not a fallback*

**FR-073 — Session survives a restart**; a rotating refresh token is
single-flighted so two parallel refreshes cannot sign the user out

**FR-074 — Cached entitlement is trusted while offline**
- **Given** a premium user with no connectivity
- **When** the app starts
- **Then** premium is applied from cache and the paywall is **not** shown

**FR-075 — Delete my account** **[GAP]** — *required by Google Play*
*As a user, I want to delete my account and data from inside the app, so that I
am not forced to email support.*

- **Given** I am signed in
- **When** I choose Delete account and confirm
- **Then** `DELETE /auth/me` is called, the session is destroyed, and I am returned to a signed-out app
- **And** the same request can be made from a public web page without installing the app
- **And** it is stated what is deleted and what is retained, and for how long

---

### 3.8 Premium

**FR-080 — Show plans** — from `GET /subscription/plans`, visible before sign-in
**FR-081 — Explain why purchase is unavailable** — the paywall distinguishes
*off-device*, *not-configured*, *no-products*, *error*

**FR-082 — Submit a manual UPI payment**
- **Given** I have paid and have a UTR
- **When** I submit it
- **Then** the claim is recorded as **pending** and **grants nothing**
- **And** one UTR cannot be claimed twice, including from another account
- **And** I cannot stack a second pending claim

**FR-083 — Premium arrives without reinstall** — on resume or "Check status"
**FR-084 — Premium is the union of store and server entitlement**, never the intersection

**FR-085 — Advertised benefits are enforced** **[GAP]**
- **Given** any benefit listed on a plan
- **When** a free user attempts it
- **Then** it is gated — or it is removed from the plan description

> Today only the daily cap is enforced. "Batch processing", "No ads",
> "Unlimited pages" and "OCR & PDF intelligence" are advertised and ungated.

---

### 3.9 Presentation

**FR-090 — Five languages**, chosen from the navbar, persisted across sessions
and surviving sign-in/sign-out
**FR-091 — No raw translation key is ever rendered**
**FR-092 — Light / dark / system theme**, persisted
**FR-093 — Global search** over the catalogue (Ctrl+K)
**FR-094 — Every page has a loading state and an error state**

---

## 4. Non-functional requirements

### Performance
| ID | Requirement |
| --- | --- |
| NFR-001 | First contentful paint < 2.5 s on a mid-range Android over 4G |
| NFR-002 | Route transition < 300 ms (routes are lazy; chunks must stay small) |
| NFR-003 | A 20-page PDF merges in < 5 s on a mid-range device |
| NFR-004 | Batch work is sequential, never parallel, to avoid OOM on mobile |
| NFR-005 | Long operations report progress and are cancellable |

### Security and privacy
| ID | Requirement |
| --- | --- |
| NFR-010 | No document content is transmitted to any host, ever |
| NFR-011 | No secret, API key or credential in the shipped bundle |
| NFR-012 | Tokens are stored via Capacitor Preferences, never in `localStorage` on device |
| NFR-013 | A password is never rendered as text in the DOM |
| NFR-014 | Credentials are validated locally before any request is made |
| NFR-015 | `allowMixedContent: false`; no remote script is loaded at runtime |
| NFR-016 | A payment claim never grants an entitlement; only the admin path grants |
| NFR-017 | The purchase amount comes from the plan row, never the request body |

### Accessibility
| ID | Requirement |
| --- | --- |
| NFR-020 | Every interactive control has an accessible name |
| NFR-021 | Touch targets ≥ 44 px on phone viewports |
| NFR-022 | Keyboard navigation works with no focus traps |
| NFR-023 | Text contrast meets WCAG AA in both themes |
| NFR-024 | Errors are announced, not only coloured |

### Offline
| ID | Requirement |
| --- | --- |
| NFR-030 | All 27 tools function with no connectivity |
| NFR-031 | No tool depends on a third-party CDN at runtime |
| NFR-032 | Quota state is local and survives being offline |
| NFR-033 | A cached entitlement is honoured while offline |

### Compatibility
| ID | Requirement |
| --- | --- |
| NFR-040 | Chrome/Android WebView current − 2 |
| NFR-041 | Usable at 360 px width without horizontal scroll |
| NFR-042 | Target SDK meets Google Play's current minimum |

---

## 5. Free vs premium matrix

| Capability | Guest | Free | Premium | Enforced today |
| --- | :---: | :---: | :---: | :---: |
| All 27 tools | ✅ | ✅ | ✅ | ✅ |
| Saved outputs per day | 5 | 5 | ∞ | ✅ |
| Entitlement across devices | ❌ | ✅ | ✅ | ✅ |
| Batch processing | ✅ | ✅ | ✅ | ❌ *advertised as premium* |
| Ad-free | ✅ | ✅ | ✅ | ❌ *no ads exist* |
| Unlimited pages per merge | ✅ | ✅ | ✅ | ❌ *no limit exists* |
| OCR & intelligence | ✅ | ✅ | ✅ | ❌ *advertised as premium* |
| Account deletion | — | ❌ | ❌ | ❌ **[GAP]** |

**The matrix a paying customer is shown and the matrix the code enforces are
different documents.** Reconciling them — by gating the features or by rewriting
the plan descriptions — is a prerequisite for charging money, and for the Play
listing being accurate.

---

## 6. Traceability

| Requirement group | Test tag | Location |
| --- | --- | --- |
| FR-010…013 | `@release` | `e2e/release/feature-navigation.spec.ts`, `not-found.spec.ts` |
| FR-020…024 | `@validator` | `e2e/document-validator/` |
| FR-030…047 | `@phase2` | `e2e/phase2/` |
| FR-050…055 | `@ocr`, `@scanner` | `e2e/pdf-ocr/`, `e2e/document-scanner/` |
| FR-060…063 | `@release` | `e2e/release/free-tier-quota.spec.ts`, `e2e/common/history.spec.ts` |
| FR-070…075 | `@auth`, `@journey` | `e2e/account/`, `e2e/release/user-journey.spec.ts` |
| FR-080…085 | `@premium` | `e2e/account/account-entitlement.spec.ts`, `e2e/release/premium-compliance.spec.ts` |
| FR-090…094 | `@i18n`, `@accessibility` | `e2e/release/language-selector.spec.ts`, `e2e/common/` |
| NFR-020…024 | `@accessibility` | `e2e/common/accessibility.spec.ts` |

---

## 7. Open requirements

| ID | Requirement | Blocked on |
| --- | --- | --- |
| FR-048 | Flatten reachable from the catalogue | Product decision: surface or delete |
| FR-075 | Account deletion | Backend endpoint (`DELETE /auth/me`) in the server repo |
| FR-085 | Premium benefits enforced or de-advertised | Product decision |
| FR-001/002 | Full offline operation | Bundling tesseract core + language data (APK size trade-off) |
