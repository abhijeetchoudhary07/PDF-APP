# Google Play submission package — Indian Form Helper

**Prepared:** 2026-09-24 · **Package:** `com.pdfhelper.indianformhelper`

Everything needed to publish, plus an honest account of what currently stops
the submission. Operational build detail lives in
[PLAY_STORE_RELEASE.md](PLAY_STORE_RELEASE.md); this document is the Console
submission itself.

> ## ⛔ Read first — four hard blockers
>
> | # | Blocker | Why it stops submission |
> | --- | --- | --- |
> | **1** | **In-app UPI payments for digital features** | Violates Play's Payments policy. The single most common cause of suspension. §9 |
> | **2** | **No Android platform exists** | `@capacitor/android` is not installed and there is no `android/` directory. No AAB can be produced. §10 |
> | **3** | **No upload keystore** | Nothing is signed. §10 |
> | **4** | **Plan descriptions promise features that are not gated** | The listing would advertise "batch processing" and "no ads" as paid, which every free user already has. Mis-selling. §9 |
>
> Blockers 2 and 3 are mechanical — a few hours. Blockers 1 and 4 are product
> decisions and need an owner before anything is uploaded.

---

## 1. Store listing

| Field | Value | Limit |
| --- | --- | --- |
| **App name** | `Indian Form Helper` | 18/30 ✅ |
| **Short description** | `Resize photos, shrink PDFs and fix exam form documents — fully offline.` | 71/80 ✅ |
| **Category** | Productivity | |
| **Tags** | PDF, Document scanner, Photo editor, Productivity, Utilities | |
| **Contact email** | `support@indianformhelper.app` **[TO CONFIRM]** | |
| **Website** | `https://indianformhelper.app` **[TO CONFIRM]** | |
| **Privacy policy URL** | `https://indianformhelper.app/privacy` **[MUST BE LIVE BEFORE SUBMISSION]** | |
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
requires a policy URL that a reviewer can open in a browser. Publish the same
content at `https://indianformhelper.app/privacy`.

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
| Crash logs | ✅ | ✅ Firebase Crashlytics | Stability | ✅ | ✅ |
| Analytics | ✅ | ✅ Firebase Analytics | Product usage | ✅ | ✅ |
| Advertising ID | ⚠️ See §8 | ⚠️ | — | ✅ | ✅ |
| **Documents, photos, PDFs** | **❌ Never** | **❌ Never** | Processed only on-device | n/a | n/a |
| **File contents** | **❌ Never** | **❌ Never** | — | n/a | n/a |

**Declarations**
- Data is encrypted in transit — **Yes**
- Users can request data deletion — **Yes** (§5)
- Committed to Play Families Policy — N/A (not child-directed)
- Independent security review — No

> ⚠️ Answer the Advertising ID question against the **shipped manifest**, not
> against intent. The AdMob SDK is a dependency and merges
> `com.google.android.gms.permission.AD_ID` into the manifest even though
> `AdService` is never called. Either remove the dependency (recommended —
> nothing uses it) or declare the ID. Declaring "not collected" while the
> permission is present is an automatic rejection.

---

## 5. Account deletion — Play policy requirement

Required for any app that lets someone create an account. **Both** paths are
required.

| Path | Where | Status |
| --- | --- | --- |
| **In-app** | Account → Delete account | ✅ **Built in this audit** |
| **Public web URL** | `https://indianformhelper.app/delete-account` | ⚠️ **Must be published** |

The in-app flow sits in its own card at the foot of `/account`, behind a typed
`DELETE` confirmation, and calls `DELETE /api/v1/pdf-app/auth/me` before
destroying the local session.

**What is deleted:** the account, the email address, the display name, the
entitlement, the subscription record and all manual-payment claims.
**What is retained:** nothing tied to the person. No document ever reaches the
server, so there is nothing else to delete.
**Timescale:** immediate in-app; within 30 days for an emailed request.

> ### ⚠️ Backend half is not implemented
> The client calls `DELETE /api/v1/pdf-app/auth/me`. **That endpoint does not
> exist on the server yet.** It lives in the separate accounts repository. The
> client treats 404 and 401 as "already gone" and still clears the local
> session, so the button behaves sanely today — but the row stays in the
> database, which does not satisfy the policy.
>
> **Endpoint specification** for the server repo:
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

  Email:    playreview@indianformhelper.app
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
| **Ads** | Declare **No** — and remove the AdMob dependency to make that true (§8) |

> 18+ is the honest answer: the audience is adults applying for exams and jobs,
> and it keeps the app out of Families policy, which it is not built for.

---

## 8. Permissions

No `AndroidManifest.xml` exists yet. This is what the installed plugins will
merge in.

| Permission | Source | Justification | Keep? |
| --- | --- | --- | --- |
| `INTERNET` | Core | Account sign-in and entitlement sync only. No document data | ✅ |
| `ACCESS_NETWORK_STATE` | Firebase | Offline detection | ✅ |
| `CAMERA` | `@capacitor/camera` | Document Scanner; capturing a photo or signature. Requested at point of use | ✅ |
| `READ_MEDIA_IMAGES` | `@capacitor/camera` | Choosing an existing photo to process | ✅ |
| `READ_EXTERNAL_STORAGE` (≤32) | `@capacitor/filesystem` | Opening a PDF the user picks | ✅ |
| `WRITE_EXTERNAL_STORAGE` (≤28) | `@capacitor/filesystem` | Saving a finished document | ✅ |
| `com.android.vending.BILLING` | RevenueCat | Dormant — no products configured | ⚠️ Remove unless §9 option 4 |
| `com.google.android.gms.permission.AD_ID` | AdMob | **Nothing requests an ad.** `AdService` has zero callers | ❌ **Remove the dependency** |
| `POST_NOTIFICATIONS` | — | Not used | ❌ Not requested |

**[ACTION]** Drop `@capacitor-community/admob` from `package.json` and delete
`ad.service.ts`. It contributes a tracking permission, a Data Safety
declaration and a content-rating answer, in exchange for no ads. It also still
carries `initializeForTesting: true` and placeholder ad unit IDs
(`'android-banner-id'`), neither of which should ever reach a production build.

---

## 9. Billing — **the submission blocker**

### What ships today

Premium is sold by **manual UPI transfer**: the person pays in their own bank
app, submits the UTR in the paywall, and an admin approves it. Plans come from
`GET /subscription/plans`:

| Plan | Price | Duration |
| --- | --- | --- |
| `pro_monthly` | ₹149 | 30 days |
| `pro_annual` | ₹1 199 | 365 days |
| `lifetime` | ₹2 999 | Forever |

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

`pro_monthly` advertises *Unlimited pages*, *Batch processing*, *OCR & PDF
intelligence* and *No ads*. **None of those are gated.** The only thing premium
changes is the 5-saves-per-day cap:

- `BatchProcessingService` holds the premium check and is never injected —
  both batch pages implement their own ungated `processBatch()`
- `AdService` has zero callers, so there are no ads to remove
- No page-count limit exists anywhere in the code
- OCR and PDF Intelligence have no premium check

Either gate them or rewrite the plan descriptions before money changes hands.
Shipping a listing that advertises paid features every free user already has is
a consumer-protection problem before it is a Play problem.

---

## 10. Build and release

### Blocked — the Android platform does not exist

```bash
# 1. Install the platform (currently not a dependency at all)
npm install @capacitor/android

# 2. Generate the project
npx cap add android

# 3. Build the web bundle and copy it in
npm run build && npx cap sync android
```

### Also missing

| Item | Status |
| --- | --- |
| `@capacitor/splash-screen` | ❌ Not installed — the entire `SplashScreen` block in `capacitor.config.ts` is inert |
| Upload keystore | ❌ Does not exist |
| `versionCode` / `versionName` | ❌ No Gradle file yet. `package.json` still says `0.0.1` |

### Signing

```bash
keytool -genkey -v -keystore upload-keystore.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

Keep the keystore and its passwords out of the repository — `android/` is not
in `.gitignore` today, so add it before the folder is generated. Enrol in **Play
App Signing**; losing an upload key without it means never updating the app
again.

### Version

| Field | Set to |
| --- | --- |
| `versionCode` | `1` (integer, +1 every upload, never reused) |
| `versionName` | `1.0.0` |

### SDK levels

| | Value | Requirement |
| --- | --- | --- |
| `minSdkVersion` | 23 (Capacitor 8 default) | Android 6.0+ |
| `targetSdkVersion` | **35** | Play requires API 35 for new apps as of Aug 2025 — **verify against the Console at submission time** |
| `compileSdkVersion` | 35 | |

### Produce the AAB

```bash
cd android && ./gradlew bundleRelease
# → android/app/build/outputs/bundle/release/app-release.aab
```

### Pre-submission checks

- [ ] `allowMixedContent: false` — ✅ already set
- [ ] `webContentsDebuggingEnabled: false` — ✅ already set
- [ ] No remote script loaded at runtime — ✅ fixed in this audit (pdf.js worker now bundled)
- [ ] `initializeForTesting: true` removed — ❌ still present in `ad.service.ts`
- [ ] Placeholder ad unit IDs removed — ❌ still present
- [ ] Privacy policy live at a public URL — ❌
- [ ] Account-deletion web URL live — ❌
- [ ] `DELETE /auth/me` implemented server-side — ❌
- [ ] Reviewer demo account created and granted premium — ❌

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

| # | Item | Status |
| --- | --- | --- |
| 1 | App name, descriptions | ✅ §1 |
| 2 | Icon, feature graphic | ✅ §2 |
| 3 | Phone screenshots | ⚠️ Generated, review before upload |
| 4 | Privacy policy at a public URL | ❌ |
| 5 | Data Safety form | ✅ §4 — answer AD_ID honestly |
| 6 | Account deletion, in-app | ✅ Built |
| 7 | Account deletion, web URL | ❌ |
| 8 | Account deletion, backend endpoint | ❌ |
| 9 | Reviewer access notes | ⚠️ Needs a real demo account |
| 10 | Content rating | ✅ §7 |
| 11 | Permissions reviewed | ⚠️ Remove AdMob |
| 12 | **Billing policy compliant** | ❌ **Blocker** |
| 13 | **Plan descriptions accurate** | ❌ **Blocker** |
| 14 | **Android platform generated** | ❌ **Blocker** |
| 15 | **Signed release AAB** | ❌ **Blocker** |
| 16 | Target SDK 35 | ⚠️ Verify at submission |
| 17 | Closed test, 12 testers / 14 days | ⚠️ If personal account |
