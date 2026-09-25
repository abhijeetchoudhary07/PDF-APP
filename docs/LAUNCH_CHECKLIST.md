# Launch checklist — what you have to do

The steps that cannot be done from this repository, in the order they have to
happen. Everything here needs your identity, your money, your secrets or a
product decision, which is why none of it is automated.

**State (2026-09-25, re-verified against the live services):** policy URLs
**live**; migration `029` **applied to production** — the plans endpoint returns
truthful copy; upload key created and the AAB **signed**; UPI payee still
unverified; billing route still undecided.

The two remaining Phase 0 items are both yours: send ₹1 to the payee, and pick a
billing route. Neither is a code change, and 0.5 blocks submission.

Reference material, not duplicated here:

| Document | What it holds |
| --- | --- |
| [PLAY_STORE.md](PLAY_STORE.md) | The Console submission itself — listing copy, Data Safety answers, content rating, permissions, migration 028's SQL |
| [PLAY_STORE_RELEASE.md](PLAY_STORE_RELEASE.md) | Build detail, the payment flow, free-tier quota, test targets |
| [ANDROID_SIGNING.md](ANDROID_SIGNING.md) | The keystore, in full |

---

## Phase 0 — before the Play Console exists

Four mechanical tasks and one decision. About 30 minutes, apart from the
decision.

### 0.1 · ~~Turn on GitHub Pages~~ ✅ done

Play requires a privacy policy URL a reviewer can open in a browser, and — because
the app offers accounts — a public account-deletion URL. Both pages are written,
committed and pushed. They are not served, because Pages has no source.

Done. The source had been **Deploy from a branch → `main` /(root)**, serving a
repository root with no `index.html` — not "Pages was never enabled", which is
what the failing `actions/configure-pages@v5` step and the 404 from the Pages
API both looked like. Switched to **Source: GitHub Actions** and deployed.

- <https://abhijeetchoudhary07.github.io/PDF-APP/privacy> → 200
- <https://abhijeetchoudhary07.github.io/PDF-APP/delete-account> → 200

Both serve `Officialpostflow360@gmail.com`. Re-check after any Pages change:

```bash
curl -sL -o /dev/null -w '%{http_code}\n' https://abhijeetchoudhary07.github.io/PDF-APP/privacy
```

### 0.2 · ~~Apply migration 029 to production~~ ✅ done

The paywall renders `pdf_plans.features_json` whenever the server answers, so
an unmigrated server kept advertising *Unlimited pages*, *Batch processing* and
*OCR & PDF intelligence* — none of which is gated — even though the app's
bundled fallback was already fixed.

Done. Production now returns truthful copy for all four plans. Re-check with the
command below and read the payload, not just the count: a `0` from `grep` on an
error page or a cold-start timeout looks exactly like a pass.

Kept for the next migration, because none of it stopped being true:
`server/cli/migrate.ts` has no dry-run and no way to apply a single file — it
applies everything pending, so check what else is unrecorded in production's
`schema_migrations` before running it.

```bash
DATABASE_URL= npx tsx server/cli/migrate.ts   # local only, safe
```

Dropping the `DATABASE_URL=` prefix makes it read `.env`, which points at the
production Neon database — which is exactly why the prefix is a habit worth
keeping.

Verify (expect `0`):

```bash
curl -s https://postflow360.onrender.com/api/v1/pdf-app/subscription/plans | grep -c "Batch processing"
```

### 0.3 · Prove the UPI payee receives money ▸ 2 min

`payment-settings` is live with `isActive: true` and the payee
`indianformhelper@okicici`. If that handle is a placeholder, every person who
pays sends money nowhere and you find out from a support mail.

Send ₹1 to it from your own UPI app. Confirm it arrives.

### 0.4 · ~~Create the upload keystore~~ ✅ done

**The password is irreducibly yours.** It protects the only key Google will ever
accept for this listing; lose it and the app can never be updated, leak it and
someone else can update it. Nobody else should hold it — not CI, not an
assistant.

Done via `tools/create-upload-key.sh`. `android/app/upload-keystore.jks`, alias
`upload`, PKCS12, RSA 2048, valid to 2054-02-10, subject:

```
CN=Abhijeet Dhaka, OU=Yugxor, O=Yugxor, L=Pune, ST=Maharashtra, C=IN
```

A first attempt used `C=91` — the telephone dialing code, not the ISO 3166-1
alpha-2 code — and was discarded and regenerated. Play does not validate these
fields, but the DN is visible in the Console for the life of the listing and it
cost nothing to correct before the key had any history.

Full detail, and the by-hand equivalent, in
[ANDROID_SIGNING.md](ANDROID_SIGNING.md).

> **Still outstanding:** back the `.jks` and its password up in your password
> manager. The key currently exists in exactly one place, on one laptop. That is
> the whole risk surface until you copy it somewhere durable.

### 0.5 · Decide the billing route ▸ the decision

Play's Payments policy requires Google Play Billing for digital content
unlocked inside the app. The shipped flow collects UPI payment in-app and
unlocks premium after an admin approves it. That is the most common single
cause of suspension under that policy, and it is a product decision rather than
a bug.

| | Route | Effort | Trade |
| --- | --- | --- | --- |
| **1** | **Sell on the web; the app only restores** | Low | Keeps the whole manual-UPI backend. No service fee. Poor in-app conversion |
| 2 | User Choice Billing | Medium | Reduced fee, still needs Play Billing integrated |
| 3 | Ship outside Play | Low | Gives up Play distribution |
| 4 | Play Billing alongside | High | Real RevenueCat keys, Console products, a signed build in a track to test |

**Route 1 is the shortest path to a submittable build**, and it is one config
change: `is_active = false` in `pdf_payment_settings` hides the pay panel, which
the paywall already handles. Move the payment flow onto the Pages site.

Whichever you pick, link-out and alternative-billing rules have moved repeatedly
and vary by region. **Read the current Payments policy text in the Console
yourself before submitting** rather than trusting any summary, including this one.

---

## Phase 1 — Play Console account

### 1.1 · Register ▸ $25, one time

<https://play.google.com/console/signup>. A **personal** account needs identity
verification (government ID, name and address matching it). An **organisation**
account needs a D-U-N-S number, which takes longer to obtain but exempts you
from the closed-testing requirement in Phase 4.

Choose deliberately — the account type cannot be changed later.

### 1.2 · Accept the Developer Distribution Agreement

A legal contract in your name. Read it.

---

## Phase 2 — create the app and its listing

### 2.1 · Create the app

**All apps → Create app.** App name `Indian Form Helper`, default language
**English (India)**, type **App**, **Free**.

> The package name `com.pdfhelper.indianformhelper` is bound to this listing on
> the first upload and can never be changed. A different package name is a
> different app, with its own install base and review history.

### 2.2 · Enrol in Play App Signing

Do it when you create the listing, not later. Google then holds the app signing
key and your upload key becomes recoverable through support. Without it there is
no recovery path at all.

### 2.3 · Store listing

Copy verbatim from [PLAY_STORE.md](PLAY_STORE.md) §1 — name, short description,
the 1 812-character full description — and §2 for graphics:

- Icon `resources/play-store/play-store-icon-512.png`
- Feature graphic `resources/play-store/feature-graphic-1024x500.png`
- 2–8 phone screenshots from `docs/screenshots/`

Regenerate the screenshots if the UI has moved since they were captured; a
listing showing an older UI is a common rejection:

```bash
npx playwright test e2e/release/store-screenshots.spec.ts --project=mobile-chrome
```

Contact email `Officialpostflow360@gmail.com`. Privacy policy URL the one from
step 0.1 — it must already return 200.

### 2.4 · Data Safety

From [PLAY_STORE.md](PLAY_STORE.md) §4, which has been checked against the
rebuilt binary. The short version: documents, photos and file contents are
**never** collected; email, name and purchase history only if an account is
created; no crash logs, no analytics, no advertising ID.

> Keep these answers identical to §8 of the in-app privacy policy. A mismatch
> between the label and the policy is an enforcement trigger by itself.

### 2.5 · Content rating

IARC questionnaire per §7 — everything **No** except *purchase of digital
goods*, which depends on your Phase 0.5 decision. Ads: **No**. Target age
**18+**.

### 2.6 · App access

Every tool works signed out and offline, so most of the app needs no
credentials. The account and premium screens do. Paste the note from §6, and
**create a demo account and grant it premium first** — the reviewer will use it.

### 2.7 · Government-apps declaration

The app is themed around Indian exam and job forms, which Play reads as a
government claim unless disclaimed. The disclaimer already renders in the
footer, on Settings, on About and in the Terms. Nothing to do unless the Console
asks you to affirm it.

---

## Phase 3 — build and upload

### 3.1 · Build the signed bundle

```bash
npm run build && npx cap sync android
```

```bash
cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew bundleRelease
```

> The explicit `JAVA_HOME` is not optional. Capacitor 8 compiles at Java 21;
> Homebrew's `openjdk@21` is keg-only here, and `/usr/libexec/java_home -v 21`
> silently returns 17 instead of failing — so the build dies at
> `:capacitor-camera:compileReleaseJavaWithJavac` with a command that looks right.

### 3.2 · Prove it is signed

```bash
jarsigner -verify android/app/build/outputs/bundle/release/app-release.aab | tail -3
```

`jar verified` is the pass. `jar is unsigned` means `keystore.properties` was
not found — Play rejects that bundle at upload.

### 3.3 · Pre-flight

```bash
npm run test:unit && npm run build && npm run test:e2e:prod
```

And confirm the bundle carries no advertising id:

```bash
grep -c AD_ID android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml
```

`0`. Anything else contradicts the Data Safety answers you just filed.

### 3.4 · Internal testing

Upload the `.aab` to **Testing → Internal testing** first. It reaches your own
devices in minutes and there is no review queue.

**Install it on a real phone and check:**

- [ ] The document scanner's camera capture works — no `CAMERA` permission is
      merged, which is very likely correct because Capacitor delegates to the
      system camera intent, but it has never been confirmed on hardware
- [ ] A file saves, and appears in the phone's file manager
- [ ] The 5-a-day free cap triggers and the paywall appears
- [ ] Sign up, then delete the account from the Account screen, and confirm the
      row is actually gone server-side
- [ ] Nothing in the pre-launch report's crash list

**`versionCode` must increase on every single upload** — it is `1` in
`android/app/build.gradle`. Play rejects a duplicate, and a rejected upload
after a long build is a miserable way to learn that.

---

## Phase 4 — tracks to production

```
Internal testing  →  Closed testing  →  Production
```

### 4.1 · Closed testing — the 14-day rule

A **personal** developer account created after 13 November 2023 must run a
closed test with **at least 12 testers opted in continuously for 14 days**
before it can apply for production access. Organisation accounts are exempt.

The clock starts when the twelfth tester opts in, not when you create the
track — so **recruit the twelve before you upload**, or you add two weeks to the
timeline for nothing.

Verify the current rule in the Console; this requirement has been revised more
than once.

### 4.2 · Apply for production access

A questionnaire about the testing you ran and what you changed because of it.
Answer it from what actually happened in the closed test.

### 4.3 · Submit for review

Days, sometimes longer for a first submission from a new account. Rejections
usually cite a specific policy — read which one before changing anything.

---

## The order, condensed

| # | Task | Time | Blocks |
| --- | --- | --- | --- |
| 0.1 | ~~Enable GitHub Pages~~ ✅ | — | — |
| 0.2 | ~~Apply migration 029 to production~~ ✅ | — | — |
| 0.3 | ₹1 to the UPI payee | 2 min | Taking any money |
| 0.4 | ~~Create the keystore~~ ✅ | — | — |
| 0.5 | Decide the billing route | — | **Submission** |
| 1.x | Register, $25, verify identity | 1–3 days | Everything in the Console |
| 2.x | Create app, listing, Data Safety | 2 h | Upload |
| 3.x | Signed AAB, internal test on hardware | 1 h | Closed test |
| 4.x | 12 testers × 14 days, then production | **14+ days** | Launch |

Phase 0 is down to 0.3 and 0.5 — two minutes of work and one decision. The long
poles are identity verification and the 14-day closed test, and neither can be
shortened by starting the others late, so register the account now rather than
waiting on the decision.
