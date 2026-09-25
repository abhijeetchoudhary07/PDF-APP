# Google Play submission package — Indian Form Helper

**Prepared:** 2026-09-24 · **Package:** `com.pdfhelper.indianformhelper`

Everything needed to publish, plus an honest account of what currently stops
the submission. Operational build detail lives in
[PLAY_STORE_RELEASE.md](PLAY_STORE_RELEASE.md); this document is the Console
submission itself. For the sequenced list of what *you* have to do, in order,
see [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md).

> ## ⛔ Read first — what still stops submission
>
> Re-verified against the repository, a fresh manifest merge and the live API
> on **2026-09-25**. Every row below was reproduced, not recalled.
>
> | # | Blocker | Evidence |
> | --- | --- | --- |
> | **1** | **No upload keystore** | `android/app/keystore.properties` is absent, so `bundleRelease` produces an **unsigned** AAB: `jarsigner -verify` on the bundle prints `jar is unsigned`. §10 |
> | **2** | ~~Both policy URLs return 404~~ — **cleared** | Pages *was* enabled, but its source was "Deploy from a branch" → `main` `/(root)`, which serves a repository root that has no `index.html`. Switched to **GitHub Actions**; both URLs now return 200. §3 |
> | **3** | ~~No JDK 21 on the build machine~~ — **cleared** | Capacitor 8 compiles at Java 21. Homebrew's `openjdk@21` was installed but keg-only, so `java_home` could not see it and `java_home -v 21` silently returned 17. Build with the explicit cellar path. §10 |
> | **4** | **In-app UPI payments for digital features** | Violates Play's Payments policy. The single most common cause of suspension. §9 |
>
> 1–3 are mechanical, under an hour between them. 4 is a product decision and
> needs an owner before anything is uploaded.
>
> ### Cleared since this document was first written
>
> - **The Android platform exists.** `android/` is generated, committed, and
>   builds: `bundleRelease` produces a 12 MB AAB.
> - **The payment backend is deployed and answering.** `subscription/plans` and
>   `subscription/payment-settings` return 200 — ₹49 / ₹365 / ₹999 and a live
>   payee — and `subscription/manual-payment` returns 401 without a token.
> - **Account deletion works end to end.** `DELETE /auth/me` used to return 405;
>   it now returns 401 unauthenticated, so the endpoint exists.
> - **AdMob and Firebase are gone, and the AAB proves it.** The bundle was
>   rebuilt on 2026-09-25 at 12:45 (12.0 MB) and its packaged manifest contains
>   no `AD_ID`, no install-referrer and no `play-services-measurement`. The §4
>   Data Safety answers now match the binary. It is still **unsigned**, because
>   there is no keystore.
> - **"No ads" is no longer sold** as a feature, in either the app or `pdf_plans`.
> - **The support address is real.** All three dead addresses —
>   `support@indianformhelper.app`, `support@indianformhelper.in` and
>   `privacy@indianformhelper.in` — now point at `Officialpostflow360@gmail.com`,
>   as do the two `https://indianformhelper.app` website links on the hosted
>   pages. `tools/set-support-email.sh` was rewriting only the HTML-entity
>   spelling and silently skipping every plain `mailto:`; that bug is fixed.
> - **The plan copy is true.** Pro no longer advertises *Unlimited pages*,
>   *Batch processing* or *OCR & PDF intelligence*. **The server half is not
>   applied yet** — migration 028 is written out in §9 and has to be run against
>   `pdf_plans`, or the API keeps serving the old claims.

---

## 1. Store listing

| Field | Value | Limit |
| --- | --- | --- |
| **App name** | `Indian Form Helper` | 18/30 ✅ |
| **Short description** | `Resize photos, shrink PDFs and fix exam form documents — fully offline.` | 71/80 ✅ |
| **Category** | Productivity | |
| **Tags** | PDF, Document scanner, Photo editor, Productivity, Utilities | |
| **Contact email** | `Officialpostflow360@gmail.com` — set across the app, the hosted pages and this document. Change it with `tools/set-support-email.sh <address>`; it rewrites both the `mailto:` and the visible text everywhere. | |
| **Website** | `https://abhijeetchoudhary07.github.io/PDF-APP/` — **404 today**, see below | |
| **Privacy policy URL** | `https://abhijeetchoudhary07.github.io/PDF-APP/privacy` — **404 today.** Published from `docs/hosted` by `.github/workflows/pages.yml`, which is committed and pushed but has never run: Pages has no source. Switch **Settings → Pages → Source: GitHub Actions** on once, then run the workflow. | |
| **Default language** | English (India) — `en-IN` | |

### Full description (1 812 / 4 000 characters)

```
Indian Form Helper fixes the documents that government exam and job portals
keep rejecting — on your phone, without uploading anything.

Applying for SSC, UPSC, IBPS, a state PSC or a job portal means meeting exact
rules: a photo under 50 KB at 200x230 pixels, a signature on a white
background, a PDF under 500 KB. Getting that wrong means a rejected form.

WHY IT IS DIFFERENT
Every tool runs inside the app on your device. Your certificates, ID proofs
and photographs are never uploaded to a server — not for processing, not for
storage, not ever. You can use the whole app in aeroplane mode.

PHOTO AND SIGNATURE
• Compress a photo to an exact KB without it turning to mush
• Crop to an exact pixel size or aspect ratio
• Clean a photographed signature — white background, dark ink, auto-cropped
• One-tap presets for SSC, UPSC and major portals, so you do not have to read
  the specification sheet

PDF TOOLKIT
• Shrink a PDF to an exact size limit
• Merge, split, reorder, rotate and delete pages
• Turn photos into a single PDF
• Read, annotate and sign
• Fill and create forms
• Password-protect or unlock
• Convert to and from Word, Excel, PowerPoint and images
• Repair a damaged PDF
• Compare two versions and see exactly what changed
• Add headers, footers and page numbers
• Remove hidden metadata before you send a file to anyone

SCANNING AND TEXT
• Scan documents with the camera — corners detected, perspective corrected
• Extract text with OCR in English, Hindi, Marathi, Bengali and Punjabi
• Produce a searchable PDF with an invisible text layer
• Pull out text, images, tables and attachments
• Read and generate QR codes and barcodes

IN FIVE LANGUAGES
English, हिन्दी, मराठी, বাংলা and ਪੰਜਾਬੀ.

FREE AND PREMIUM
Every tool is free to use. A free account saves 5 finished documents a day.
Premium lifts that limit.

No account is required for anything. Sign in only if you want premium to
follow you to a new phone.
```

---

## 2. Graphics checklist

| Asset | Required | Status |
| --- | --- | --- |
| App icon | 512×512 PNG, 32-bit | ✅ `resources/play-store/play-store-icon-512.png` |
| Feature graphic | 1024×500 PNG/JPG | ✅ `resources/play-store/feature-graphic-1024x500.png` |
| Phone screenshots | 2–8, min 320 px, 16:9 or 9:16 | ✅ 8 generated — `docs/screenshots/`, 1081×1999 PNG |
| 7" tablet | Optional | ➖ Not planned |
| 10" tablet | Optional | ➖ Not planned |
| Promo video | Optional | ➖ Not planned |

Screenshots are captured from the real app at a Pixel-class mobile viewport by:

```bash
npx playwright test e2e/release/store-screenshots.spec.ts --project=mobile-chrome
```

They land in `docs/screenshots/`. Regenerate them whenever the UI changes —
a listing showing an older UI is a common review rejection.

Captured so far, all 1081×1999 (Pixel 5 at 3× density):

| # | Screen |
| --- | --- |
| 01 | Home / tool catalogue |
| 02 | Photo Tools |
| 03 | PDF Studio |
| 04 | Organize Pages |
| 05 | Document Scanner |
| 06 | Smart PDF OCR |
| 07 | Exam & Job Presets |
| 08 | Premium |

> ⚠️ **Check the aspect ratio before uploading.** 1081×1999 is ≈1:1.85, slightly
> taller than the 9:16 (1:1.78) the Console documents. It is inside the range
> Play actually accepts, but if the upload is rejected, either pad to 1125×2000
> or set an explicit 9:16 viewport in the spec's `resize_window` step rather
> than cropping — cropping the header out of these would lose the offline
> badge, which is the listing's main selling point.

---

## 3. Privacy policy

A full policy already ships in the app at `/features/privacy-policy`
(`src/app/features/privacy-policy/privacy-policy.page.html`, 9 sections). It
covers the zero-upload principle, what is not collected, local storage, device
permissions, third-party services, deletion and a section that mirrors the Data
Safety form row for row.

**It must also be reachable at a public URL without installing the app.** Play
requires a policy URL that a reviewer can open in a browser. The same content is
prepared at `https://abhijeetchoudhary07.github.io/PDF-APP/privacy`, served from
`docs/hosted`.

> ### ✅ Live since 2026-09-25
> Both pages 404'd for a while, and not for the reason the Pages API suggested.
> Pages *was* enabled; its source was **Deploy from a branch → `main` /(root)**,
> which serves the repository root — where there is no `index.html`, and no
> `privacy/` either, because the pages live under `docs/hosted/`. The workflow
> ran on every push and failed at `actions/configure-pages@v5`, which reads as
> "Pages is not set up" and is really "Pages is set up the other way".
>
> Setting **Source: GitHub Actions** fixed it. Re-check after any Pages change:
>
> ```bash
> curl -sL -o /dev/null -w '%{http_code}\n' https://abhijeetchoudhary07.github.io/PDF-APP/privacy
> ```
>
> `200` (a bare `/privacy` answers 301 to `/privacy/` first, which is normal).
> Same for `/delete-account`.

A `github.io` URL is acceptable to Play — it checks that the URL resolves and
serves a policy, not who owns the domain. Moving to a custom domain later is a
listing edit, not a client release, because the app never hard-codes the URL.

> Keep §8 of the in-app policy and the Console's Data Safety answers in sync.
> A mismatch between the two is an enforcement trigger in its own right.

---

## 4. Data safety form

**Documents you process are never collected.** All processing is on-device.

| Data type | Collected | Shared | Purpose | Encrypted in transit | Deletable |
| --- | :---: | :---: | --- | :---: | :---: |
| Email address | ✅ (only if you make an account) | ❌ | Account management, premium entitlement | ✅ HTTPS | ✅ In-app + email |
| Name (optional) | ✅ | ❌ | Personalisation | ✅ | ✅ |
| Purchase history | ✅ | ❌ | Entitlement, support | ✅ | ✅ |
| UPI reference (UTR) | ✅ | ❌ | Verifying a manual payment | ✅ | ✅ |
| Crash logs | **❌ Never** | ❌ | No crash reporter is wired up | n/a | n/a |
| Analytics / app activity | **❌ Never** | ❌ | `AnalyticsService` records events **locally** and transmits nothing | n/a | n/a |
| Advertising ID | **❌ Never** | ❌ | No ad SDK; `AD_ID` is not in the merged manifest | n/a | n/a |
| **Documents, photos, PDFs** | **❌ Never** | **❌ Never** | Processed only on-device | n/a | n/a |
| **File contents** | **❌ Never** | **❌ Never** | — | n/a | n/a |

**Declarations**
- Data is encrypted in transit — **Yes**
- Users can request data deletion — **Yes** (§5)
- Committed to Play Families Policy — N/A (not child-directed)
- Independent security review — No

> ⚠️ Answer the Advertising ID question against the **binary you are about to
> upload**, not against this table. AdMob and Firebase have both been removed,
> and a manifest merged from the current tree carries no `AD_ID` — but the AAB
> sitting in `build/outputs/` predates the removal and still does. Declaring
> "not collected" while the permission is present is an automatic rejection, so
> rebuild first and then check the bundle itself:
>
> ```bash
> grep -c AD_ID android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml
> ```
>
> `0` is the only acceptable answer. The same goes for
> `play-services-measurement` and `BIND_GET_INSTALL_REFERRER_SERVICE`.
>
> These rows must also stay in step with §8 of the in-app privacy policy and
> with `PLAY_STORE_RELEASE.md` §5. A mismatch between the label and the policy
> is an enforcement trigger by itself.

---

## 5. Account deletion — Play policy requirement

Required for any app that lets someone create an account. **Both** paths are
required.

| Path | Where | Status |
| --- | --- | --- |
| **In-app** | Account → Delete account | ✅ **Built in this audit** |
| **Public web URL** | `https://abhijeetchoudhary07.github.io/PDF-APP/delete-account` | ✅ Published from `docs/hosted` |

The in-app flow sits in its own card at the foot of `/account`, behind a typed
`DELETE` confirmation, and calls `DELETE /api/v1/pdf-app/auth/me` before
destroying the local session.

**What is deleted:** the account, the email address, the display name, the
entitlement, the subscription record and all manual-payment claims.
**What is retained:** nothing tied to the person. No document ever reaches the
server, so there is nothing else to delete.
**Timescale:** immediate in-app; within 30 days for an emailed request.

> ### ✅ Backend half is implemented
> An earlier revision of this document recorded `DELETE /api/v1/pdf-app/auth/me`
> as missing — it returned 405. It is now live in the accounts repository and
> returns **401** when called without a token, which is the endpoint existing
> and refusing an anonymous caller:
>
> ```bash
> curl -o /dev/null -w '%{http_code}\n' -X DELETE https://postflow360.onrender.com/api/v1/pdf-app/auth/me
> ```
>
> Contract, for the record:
>
> ```
> DELETE /api/v1/pdf-app/auth/me
> Auth:     Bearer (access token)
> Effect:   hard-delete the user row; cascade subscriptions and
>           pdf_manual_payment_requests; revoke all refresh tokens
> Returns:  204 No Content
> Errors:   401 invalid/expired token · 404 already deleted
> Notes:    idempotent; must survive being called twice
> ```
>
> **Still to do before submitting:** delete a throwaway account through the
> in-app button once, end to end, against production. The endpoint answering
> 401 proves it is routed, not that it cascades.

---

## 6. App access for reviewers

The app needs **no credentials to review**. Every one of the 27 tools works
signed out, offline, with no account.

Put this in *App access → All functionality is available without special access*:

```
No login is required. Every feature in this app works without an account and
without a network connection.

An optional account exists only to carry a premium entitlement between
devices. To review the account and premium screens:

  Email:    [set a real reviewer-contact mailbox before submitting]
  Password: [SET BEFORE SUBMISSION]

This demo account has premium granted, so the paywall and the premium state
are both reachable. Premium changes one thing: it removes the 5-saves-per-day
limit on a free account.
```

**[ACTION]** Create that account and grant it premium before submitting.

---

## 7. Content rating and target audience

Answer the IARC questionnaire as follows — all **No**:

| Question | Answer |
| --- | --- |
| Violence, sexual content, profanity, drugs, gambling | No |
| User-to-user communication | No |
| Shares user location | No |
| Allows purchase of digital goods | **Yes** — see §9 |
| Shares personal information with third parties | No |

**Expected rating:** IARC 3+ / ESRB Everyone / PEGI 3

| | |
| --- | --- |
| **Target age group** | 18+ |
| **Appeals to children** | No |
| **Ads** | Declare **No** — true as of the AdMob removal; §8 has the manifest check that keeps it true |

> 18+ is the honest answer: the audience is adults applying for exams and jobs,
> and it keeps the app out of Families policy, which it is not built for.

---

## 8. Permissions

This is the **actual merged release manifest**, read back after a merge from
the current tree — not a prediction of what the plugins might add:

| Permission | Source | Justification | Keep? |
| --- | --- | --- | --- |
| `INTERNET` | Core | Account sign-in and entitlement sync only. No document data | ✅ |
| `ACCESS_NETWORK_STATE` | Capacitor | Offline detection | ✅ |
| `VIBRATE` | `@capacitor/haptics` | Touch feedback | ✅ |
| `WRITE_EXTERNAL_STORAGE` (≤29) | App manifest | Saving a finished document to public Documents | ✅ |
| `READ_EXTERNAL_STORAGE` (≤32) | App manifest | Opening a PDF the user picks | ✅ |
| `com.android.vending.BILLING` | `billing:8.3.0`, via RevenueCat | Dormant — no products configured | ⚠️ See §9 |
| `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | AndroidX | Self-scoped, generated | ✅ |

Both storage permissions are capped with `maxSdkVersion`, which matters: Play
flags an uncapped `WRITE_EXTERNAL_STORAGE`.

**Gone, and verified gone:** `com.google.android.gms.permission.AD_ID`,
`BIND_GET_INSTALL_REFERRER_SERVICE` and `play-services-measurement` all left
with AdMob and Firebase Analytics. Re-check after any dependency change —
adding one Google library back is enough to reintroduce `AD_ID` transitively
and silently invalidate the §4 answers.

> ### ⚠️ No `CAMERA` permission is merged
> Three screens call `Camera.getPhoto({ source: CameraSource.Camera })` —
> Document Scanner, QR/Barcode and photo capture — and the merged manifest
> declares no `CAMERA` permission. Capacitor's plugin delegates to the system
> camera *intent*, which does not require it, so this is very likely correct
> and is the better of the two options (declaring it would force a runtime
> prompt for nothing). It has **not been confirmed on a physical device.**
> Capture on a real phone during internal testing before the closed track
> opens; a scanner that cannot scan is the kind of thing a reviewer finds.

---

## 9. Billing — **the submission blocker**

### What ships today

Premium is sold by **manual UPI transfer**: the person pays in their own bank
app, submits the UTR in the paywall, and an admin approves it. Plans come from
`GET /subscription/plans`:

| Plan | Price | Duration |
| --- | --- | --- |
| `pro_monthly` | ₹49 | 30 days |
| `pro_annual` | ₹365 | 365 days |
| `lifetime` | ₹999 | Forever |

Confirmed live on 2026-09-25 — the API serves exactly these, and `OFFLINE_PLANS`
in `premium.page.ts` mirrors them. (An earlier revision of this document listed
₹149 / ₹1 199 / ₹2 999, which migration `025_pdf_app_pricing_update.sql`
superseded.) `payment-settings` is live too, with `isActive: true` and the payee
`indianformhelper@okicici` — **confirm that handle actually receives money
before anyone pays into it.**

### Why it cannot be submitted as-is

Play's Payments policy requires **Google Play Billing** for digital content
unlocked inside the app. An in-app UPI flow that unlocks premium is the most
common cause of suspension under that policy. RevenueCat is wired but dormant —
`store.config.ts` still holds `goog_XXXXX`.

### The four compliant routes

| # | Option | Effort | Notes |
| --- | --- | --- | --- |
| 1 | **Sell outside the app.** Move the pay panel to the website; the app only *restores* an entitlement | **Low** | The paywall already reads `PdfPaymentSettings.isActive`, so hiding the panel is a config change. Play permits recognising a purchase made elsewhere |
| 2 | **User Choice Billing** — Google's alternative billing, available in India | Medium | Reduced service fee; still needs Play Billing integrated |
| 3 | **Ship outside Play** — direct APK or another store | Low | Gives up Play distribution |
| 4 | **Add Play Billing alongside**, UPI only where Billing is unavailable | **High** | Real RevenueCat keys + Play Console products + a signed build to test |

**Option 1 is the shortest path to a submittable build.**

### Second problem — the plan descriptions are not true

*No ads* has since been dropped from the copy. The other three claims are
**still live on the API today** and still ungated. The only thing premium
changes is the 5-saves-per-day cap:

| Advertised on `pro_monthly` | Gated? | Verified 2026-09-25 |
| --- | :---: | --- |
| Unlimited pages | ❌ | No page-count limit exists anywhere in the code |
| Batch processing | ❌ | `BatchProcessingService` holds the premium check **and is imported by nothing but itself**. `batch.page.ts` and `batch-pdf.page.ts` both run their own ungated `processBatch()` and reference neither `MonetizationService` nor the quota |
| OCR & PDF intelligence | ❌ | Neither feature has a premium check |
| Unlimited daily saves | ✅ | Real. `StorageService.saveFile` is the single gate every output passes through |

`isPremium` is referenced in exactly four places — the profile, account and
premium pages, and the quota service. No tool page consults it.

Either gate the three, or rewrite the plan copy so it describes the daily cap
alone. **Rewriting is what was done**, because gating would take working
features away from people who have them today — that is a product decision, and
it stays yours.

`OFFLINE_PLANS` (`premium.page.ts`) is already updated. The server half is
**not**: `pdf_plans.features_json` is what the paywall actually renders, so
until this runs the API keeps serving the old claims. Save it as
`migrations/028_pdf_app_plan_copy_truthful.sql` in the `linkedin AUTO` repo:

```sql
-- Migration 028: the plans stop advertising features that are not gated
--
-- 027 removed "No ads" because the AdMob plugin was gone. Three claims it left
-- behind are false the same way, and they are the ones the paywall charges
-- ₹49 for:
--
--   "Unlimited pages"        no page-count limit exists anywhere in the app
--   "Batch processing"       BatchProcessingService holds the only premium
--                            check and is imported by nothing but itself;
--                            batch.page.ts and batch-pdf.page.ts each run
--                            their own ungated processBatch()
--   "OCR & PDF intelligence" neither feature consults MonetizationService
--
-- The free tier's "Up to 20 pages per merge" is the same error from the other
-- side: a ceiling that is not implemented, implying Pro lifts something that
-- was never there.
--
-- One thing separates the tiers, enforced at a single point:
-- StorageService.saveFile stops a free account at five completed outputs a day
-- (FREE_DAILY_OPERATIONS). Every tool's output passes through it. That is what
-- the copy now says.
--
-- features_json is read on every paywall load, so this needs no client
-- release. OFFLINE_PLANS in premium.page.ts is kept in step by hand and was
-- updated in the same change. Additive and re-runnable.

update pdf_plans
   set features_json = '["Every tool in the app","Fully offline — nothing is uploaded","5 saved files a day"]',
       updated_at = now()
 where plan_id = 'free';

update pdf_plans
   set features_json = '["Unlimited saved files — no daily cap","Every tool in the app","Fully offline — nothing is uploaded","Priority support"]',
       updated_at = now()
 where plan_id = 'pro_monthly';
```

Apply it the same way as every other PDF App migration — and mind the empty
`DATABASE_URL=`, because `.env` points at the production Neon database:

```bash
DATABASE_URL= npx tsx server/cli/migrate.ts
```

Verify against the live API afterwards; the old copy should be gone:

```bash
curl -s https://postflow360.onrender.com/api/v1/pdf-app/subscription/plans | grep -c "Batch processing"
```

Selling three features every free user already has is a consumer-protection
problem before it is a Play problem, and the endpoint is live right now.

Either gate them or rewrite the plan descriptions before money changes hands.
Shipping a listing that advertises paid features every free user already has is
a consumer-protection problem before it is a Play problem.

---

## 10. Build and release

### The Android platform exists and builds

An earlier revision of this section said it did not. `android/` is generated,
committed and produces a 12 MB AAB. Rebuilding the web bundle and copying it in:

```bash
npm run build && npx cap sync android
```

### The one thing still missing: the upload key

| Item | Status |
| --- | --- |
| `@capacitor/android` | ✅ `^8.5.2`, and `android/` is committed |
| Splash and icons | ✅ Applied — `core-splashscreen` is on the Gradle classpath |
| Upload keystore | ❌ **Absent.** `bundleRelease` therefore signs nothing |
| `versionCode` / `versionName` | ✅ `1` / `1.0.0` in `android/app/build.gradle` (`package.json` still says `0.0.1` — cosmetic, Play never reads it) |

### Signing

Full walkthrough in [ANDROID_SIGNING.md](ANDROID_SIGNING.md). You run this, not
CI and not an assistant:

```bash
keytool -genkeypair -v -keystore android/app/upload-keystore.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000 -storetype PKCS12
```

Then `android/app/keystore.properties` with `storeFile`, `storePassword`,
`keyAlias=upload`, `keyPassword`. `*.jks`, `*.keystore` and
`keystore.properties` are already in `android/.gitignore`, and `build.gradle`
attaches the signing config only when that file exists — so a clean checkout
still builds, just unsigned.

Enrol in **Play App Signing** when you create the listing. Without it, a lost
upload key means this listing can never be updated again.

### SDK levels

| | Value | Requirement |
| --- | --- | --- |
| `minSdkVersion` | 24 | Android 7.0+ |
| `targetSdkVersion` | **36** | Comfortably above Play's current floor — **still verify against the Console at submission time**, the requirement moves every August |
| `compileSdkVersion` | 36 | |

Set in `android/variables.gradle`.

### Produce the AAB

> ### ⛔ This needs a JDK 21, and the machine has only 17
> Capacitor 8 compiles its plugins at Java 21. `/usr/libexec/java_home -V`
> lists one JVM, Homebrew's OpenJDK 17, so the build stops at:
>
> ```
> > Could not create task ':capacitor-camera:compileReleaseJavaWithJavac'.
>    > Cannot find a Java installation on your machine matching:
>      {languageVersion=21, ...}. Toolchain download repositories have not been configured.
> ```
>
> It fails in about a second, before anything is compiled or signed.
>
> **A JDK 21 is in fact installed** — Homebrew's `openjdk@21`, 21.0.12.1. It is
> *keg-only*, so it was never symlinked into `/Library/Java/JavaVirtualMachines`
> and `/usr/libexec/java_home` cannot see it. Worse, `java_home -v 21` does not
> fail: it silently falls back to 17, so a build that looks correctly
> configured dies anyway. Point `JAVA_HOME` at the cellar path instead:
>
> ```bash
> cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew bundleRelease
> ```
>
> Output: `android/app/build/outputs/bundle/release/app-release.aab`
>
> To make `java_home` aware of it permanently, so plain `-v 21` works:
>
> ```bash
> sudo ln -sfn /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-21.jdk
> ```

Then prove it is signed — an unsigned bundle is rejected at upload:

```bash
jarsigner -verify android/app/build/outputs/bundle/release/app-release.aab | tail -3
```

`jar verified` is the pass. `jar is unsigned` means `keystore.properties` was
not found.

### Pre-submission checks

- [x] `allowMixedContent: false` — already set
- [x] `webContentsDebuggingEnabled: false` — already set
- [x] No remote script loaded at runtime — pdf.js worker is bundled
- [x] AdMob removed — the dependency and `ad.service.ts` are both gone
- [x] Firebase Analytics removed — no `AD_ID` in a fresh manifest merge
- [x] `DELETE /auth/me` implemented server-side — returns 401 unauthenticated
- [x] **JDK 21 reachable** — use the explicit cellar path, not `java_home`
- [x] **AAB rebuilt since the Firebase removal** — 12:45, clean, unsigned
- [x] Privacy policy live at a public URL
- [x] Account-deletion web URL live
- [x] Support address points at a mailbox that exists
- [ ] Reviewer demo account created and granted premium
- [ ] Camera capture confirmed on a physical device (§8)
- [ ] `npm run test:unit && npm run build && npm run test:e2e:prod` all green

---

## 11. Testing track

A **personal** developer account created after 13 Nov 2023 must run a **closed
test with at least 12 testers, opted in continuously for 14 days**, before it
can apply for production access. Organisation accounts are exempt.

Plan for it: the 14 days start when the 12th tester opts in, not when the track
is created. Recruit the testers before uploading.

Suggested path:

```
Internal testing  →  Closed testing (12 testers, 14 days)  →  Production
```

---

## 12. Submission checklist

Status as re-verified on 2026-09-25.

| # | Item | Status |
| --- | --- | --- |
| 1 | App name, descriptions | ✅ §1 |
| 2 | Icon, feature graphic | ✅ §2 |
| 3 | Phone screenshots | ⚠️ 8 generated — review before upload, and regenerate if the UI has moved |
| 4 | Android platform generated | ✅ Builds a 12 MB AAB |
| 5 | Account deletion, in-app | ✅ Built |
| 6 | Account deletion, backend endpoint | ✅ `DELETE /auth/me` → 401 unauthenticated |
| 7 | AdMob / Firebase removed | ✅ No `AD_ID` in a fresh manifest merge |
| 8 | Content rating | ✅ §7 — answer Ads = **No** |
| 9 | Permissions reviewed | ✅ §8 — merged manifest read back |
| 10 | Data Safety form | ✅ §4 — matches the rebuilt bundle |
| 11 | Privacy policy at a public URL | ✅ Live, 200 |
| 12 | Account deletion, web URL | ✅ Live, 200 |
| 13 | Support / contact email | ✅ `Officialpostflow360@gmail.com` everywhere |
| 14 | JDK 21 reachable | ✅ Keg-only; build with the explicit `JAVA_HOME` in §10 |
| 15 | **Signed release AAB** | ❌ **Blocker — no keystore** |
| 16 | **Billing policy compliant** | ❌ **Blocker — product decision** |
| 17 | Plan descriptions accurate | ⚠️ App fixed; **migration 028 still to run** |
| 18 | Reviewer demo account | ⚠️ Create it and grant premium |
| 19 | Target SDK | ✅ 36 — re-verify against the Console at submission |
| 20 | Closed test, 12 testers / 14 days | ⚠️ Required on a personal account |
