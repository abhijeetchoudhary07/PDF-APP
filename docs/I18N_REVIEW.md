# Translation review

Five languages ship: English, Hindi, Marathi, Bengali, Punjabi. Every key exists
in all five — `i18n.spec.ts` fails the build otherwise, and it also checks that
`{{placeholders}}` survive translation. What no test can check is whether the
Hindi actually reads like Hindi. This file tracks which sections a native
speaker has read, and gives them a way to work that is not "edit TypeScript".

## Review status

| Section | Keys | hi | mr | bn | pa |
|---|---|---|---|---|---|
| `editor` | 85 | — | — | — | — |
| `common` (title/tooltip keys) | 16 | — | — | — | — |
| `organizer`, `security`, `previews`, `profilePage`, `scanner` additions, and the rest of the 2026-09-28 batch | 53 | — | — | — | — |
| everything else | ~1,100 | — | — | — | — |

`—` means never reviewed by a speaker. Put the reviewer's name and the date in
the cell when a section is done. Nothing in this app has been through a native
review yet; the dictionaries were written by the author and by Claude, and the
69 keys added on 2026-09-28 for the untranslated `title` attributes are in that
same category.

Keep this table honest rather than aspirational. Its only job is to stop a later
batch of new keys from disappearing into a section that was signed off before
those keys existed.

## Exporting a section for review

```
python3 tools/i18n-inventory.py export editor i18n-review
```

Writes `i18n-review/editor.<lang>.csv`, one per non-English language, with
columns `key, english, current, corrected, notes`. Send the CSV, not the `.ts`
file: a reviewer editing TypeScript in a spreadsheet-shaped task will break the
quoting, and the Devanagari/Bengali/Gurmukhi strings are exactly where that goes
unnoticed.

The reviewer fills in `corrected` only where the current translation is wrong,
awkward, or too long, and leaves the rest empty. `notes` is pre-filled with what
the key is for, because the string alone does not say: which ones are hover
tooltips (short, imperative), which are tab labels in a fixed-width bar, and
which contain placeholders that must survive verbatim.

## Importing the result

```
python3 tools/i18n-inventory.py import editor hi i18n-review/editor.hi.csv
```

Only rows with a `corrected` value are touched; key order and every other
section are left alone. Then:

```
npm run test:unit
```

The parity and placeholder specs are what catch a reviewer who dropped a
`{{count}}` or a key whose name got mangled in transit.

## What to send with the CSV

A reviewer reading 85 strings out of context will approve something that is
correct and three times too wide for the toolbar it sits in. Run the app in
their language, screenshot the screens that section covers, and attach them:

```
npm start
```

Switch language from the header, walk the relevant screens, and send the
screenshots with the CSV. Truncation and register are what only a person
catches; correctness of terminology is what the glossary below is for.

## Glossary

Agreed renderings, so that four reviewers working separately do not produce four
words for "page". These are what the dictionaries currently use.

| English | hi | mr | bn | pa |
|---|---|---|---|---|
| PDF | PDF | PDF | PDF | PDF |
| page | पेज | पान | পৃষ্ঠা | ਸਫ਼ਾ |
| document | दस्तावेज़ | दस्तऐवज | ডকুমেন্ট | ਦਸਤਾਵੇਜ਼ |
| preview | पूर्वावलोकन | पूर्वावलोकन | প্রিভিউ | ਪੂਰਵਦਰਸ਼ਨ |
| zoom | ज़ूम | झूम | জুম | ਜ਼ੂਮ |
| rotate | घुमाएं | फिरवा | ঘোরান | ਘੁਮਾਓ |
| crop | क्रॉप | क्रॉप | ক্রপ | ਕ੍ਰਾਪ |
| delete | हटाएं | हटवा | মুছুন | ਹਟਾਓ |
| share | शेयर करें | शेअर करा | শেয়ার করুন | ਸਾਂਝਾ ਕਰੋ |
| undo | पहले जैसा करें | पूर्ववत करा | আগের অবস্থায় | ਪਹਿਲਾਂ ਵਾਂਗ ਕਰੋ |

Two known inconsistencies for the reviewer to settle rather than inherit:

- Marathi uses both `पान` (`editor.pages`) and `पृष्ठे` (`common.pages`) for
  "page".
- Punjabi uses both `ਸਫ਼ੇ` (`editor.pages`) and `ਪੰਨੇ` (`common.pages`).

## Who reviews what

One reviewer per language. Hindi and Marathi share the Devanagari script and are
not the same language — do not hand both to one person unless they are genuinely
fluent in both. Budget two to three hours per language for the `editor` section.
