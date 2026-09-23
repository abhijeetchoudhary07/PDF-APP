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
4. **The One Network Path**: The optional account (§5.3) sends an email address, a password hash request, and nothing else. It is opt-in, every tool works without it, and no document, image, filename or page count is ever transmitted. A signed-out launch makes zero requests to the backend.

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

### 5.1 Two Sources of Entitlement (`MonetizationService`)
Premium is the **union** of two independent signals:

| Source | Knows about | Reached via |
|---|---|---|
| **Store** | What this device's Play/App Store account bought | `@revenuecat/purchases-capacitor`, entitlement id `'premium'` |
| **Account** | What the signed-in user is entitled to, including grants made by support | `GET /api/v1/pdf-app/auth/me` |

`isPremium$` (RxJS `BehaviorSubject<boolean>`) and the `isUserPremium` getter are
unchanged, and remain the single thing every consumer reads — `AdService`,
`BatchProcessingService`, `ConversionService`, the profile page and the header.

The union, rather than the intersection, is deliberate:
- **Store-only entitled** must stay premium when the network is down, or a
  paying customer hits the paywall on a train.
- **Account-only entitled** must become premium with no purchase on this
  device, because that is what a manual grant from support *is*.

`premiumSource` reports which one is currently responsible, for the account screen.

### 5.2 AdMob Lifecycle (`AdService`)
- Free users: Non-intrusive banner ads displayed on non-sensitive dashboard screens.
- Premium users: Banner ads and interstitials are completely suppressed when `isUserPremium === true`.
- Sensitive Workflows: Ads are suppressed during active editing, signing, and security sessions to prevent distraction.

### 5.3 Account & Entitlement Backend

Accounts live on the shared ContentFlow backend under `/api/v1/pdf-app`
(`environment.apiBaseUrl`). Sign-in is **optional**; it buys two things:
premium that survives a reinstall or a new phone, and premium that support can
grant without a store purchase.

| File | Responsibility |
|---|---|
| `core/api/pdf-api.types.ts` | Hand-maintained copy of the server's wire contract. The server is a separate repository, so there is no package to import — keep it narrow, and look here first when a response "isn't what it should be". |
| `core/api/auth.service.ts` | Register / sign in / sign out / refresh, plus `syncProfile()`. Owns the tokens. |
| `core/api/auth-session.store.ts` | Persists the session in `@capacitor/preferences` under `IFH_PDF_ACCOUNT_SESSION_V1`. |
| `core/api/auth.interceptor.ts` | Attaches the bearer token and renews it once on a 401. Scoped to `API_ROOT`, so bundled `assets/` JSON never carries a token. |
| `core/api/pdf-api.service.ts` | Plan catalogue and store-purchase verification. |
| `features/account/` | The sign-in screen and entitlement detail. |

**Tokens.** Access tokens are 15-minute JWTs; refresh tokens are opaque and
**rotate on every use**. Rotation is why `AuthService.refreshSession()`
single-flights: two parallel exchanges would present the same token twice and
the loser would be signed out mid-session. That is a correctness requirement,
not an optimisation, and it is covered by `auth.service.spec.ts`.

**Offline.** The last entitlement the server reported is cached alongside the
session and republished at launch, so a premium user opening the app with no
network sees premium rather than the paywall. It is replaced the moment
`/auth/me` answers, so a revocation lands on the next successful call.

**Storage caveat.** `Preferences` is the app's private sandbox
(SharedPreferences / UserDefaults), not a keystore — this app ships no
secure-storage plugin. The residual exposure is a rooted or jailbroken device,
and it is bounded server-side: short access tokens, rotating refresh tokens,
and revocation of every refresh token the moment an account is suspended.

### 5.4 Purchase Flow

1. `PremiumPage` lists plans from `GET /subscription/plans`, so pricing and
   feature copy change without shipping a build. A bundled fallback keeps the
   paywall rendering when the server is unreachable; the store quotes the real
   local price at checkout regardless.
2. A plan is matched to a store package by product id suffix — the same
   convention the server uses when verifying.
3. On success the receipt goes to `POST /subscription/verify`, which confirms
   it with Google Play / RevenueCat **server-side** before recording anything.
   That call is idempotent, so restores and relaunches are safe.
4. `Purchases.logIn({ appUserID })` binds the RevenueCat subscriber to the
   `pdf_users` row on sign-in. Without it the server has nothing to look up.

### 5.5 Tests

- `src/app/core/api/*.spec.ts` and `core/services/monetization.spec.ts` — 19
  unit specs over the interceptor's retry, the single-flight rotation, and the
  store/account entitlement union. `npx vitest run --dir src`.
- `e2e/account/` — 22 Playwright specs over the real API: sign-in, session
  persistence, silent token renewal, and an admin grant reaching a running app.
  They need the backend up (`DATABASE_URL= npm run dev:api` in the
  `linkedin AUTO` repository) and fail with that instruction if it is not.

### 5.6 How a Support Grant Reaches the Device

An admin grants premium in the ContentFlow admin portal → the entitlement is
written against the account → the app picks it up on the next `/auth/me`, which
runs at launch, on Capacitor `resume` (`AppComponent`), and from **Refresh
status** on the account screen. No reinstall, no store involvement.

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
