#!/usr/bin/env python3
"""
Inventory of untranslated `title=` attributes in Angular templates, and the
CSV export/import used for native-speaker review of a translation section.

Two jobs, one script, because both need the same thing: a list of strings that
a human has to read, keyed by where it lives.

    python3 tools/i18n-inventory.py titles
        Every literal `title="..."` still left in src/**/*.html, as CSV on
        stdout: file,line,tag,bucket,value. `bucket` says how the attribute is
        consumed, which decides the fix:
          heading   the tag is a component whose `title` @Input renders as
                    visible text (<h1>/<h3>) -- an untranslated page title
          tooltip   a native element, so a real browser tooltip
          host      a component with no `title` @Input, so the attribute lands
                    on the host element as a plain DOM attribute

    python3 tools/i18n-inventory.py export <section> [outdir]
        One review CSV per non-English language for one translation section
        (e.g. `editor`): key,english,current,corrected,notes. `notes` is
        pre-filled with what the key is for -- tooltip, tab label, contains
        placeholders -- because the string alone does not say.

    python3 tools/i18n-inventory.py import <section> <lang> <csv>
        Reads a filled-in review CSV back into
        src/app/core/i18n/translations/<lang>.ts, replacing only the values in
        that section and preserving key order. Run the unit tests afterwards:
        the placeholder-parity spec is what catches a reviewer who dropped a
        {{count}}.
"""

import csv
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'src'
TRANSLATIONS = SRC / 'app' / 'core' / 'i18n' / 'translations'
LANGS = ['hi', 'mr', 'bn', 'pa']

# Components whose `title` @Input is rendered as visible text rather than being
# passed through to a DOM title attribute.
HEADING_COMPONENTS = {
    'app-page-header', 'app-modal', 'app-file-dropzone',
    'app-result-preview', 'app-empty-state',
}

TAG_RE = re.compile(r'<([a-zA-Z][\w-]*)((?:"[^"]*"|\'[^\']*\'|[^>"\'])*?)>', re.S)
TITLE_RE = re.compile(r'(?<![\w\[\(-])title\s*=\s*"([^"]*)"')


def bucket_for(tag):
    if tag in HEADING_COMPONENTS:
        return 'heading'
    if tag.startswith('app-') or tag.startswith('ion-'):
        return 'host'
    return 'tooltip'


def titles():
    out = csv.writer(sys.stdout)
    out.writerow(['file', 'line', 'tag', 'bucket', 'value'])
    total = 0
    for path in sorted(SRC.rglob('*.html')):
        text = path.read_text()
        for tag_match in TAG_RE.finditer(text):
            tag, attrs = tag_match.group(1), tag_match.group(2)
            for title_match in TITLE_RE.finditer(attrs):
                value = title_match.group(1)
                # Interpolated or piped values are already translated.
                if not value.strip() or '{{' in value or '|' in value:
                    continue
                line = text.count('\n', 0, tag_match.start()) + 1
                out.writerow([path.relative_to(ROOT), line, tag,
                              bucket_for(tag), value])
                total += 1
    print(f'# {total} literal title= attributes', file=sys.stderr)
    return 1 if total else 0


def load_section(lang, section):
    """Read one section of a translation dictionary as a flat key -> string dict.

    The dictionaries are TypeScript, so this reads them structurally rather than
    importing them: sections are two-space indented, their keys four-space, and
    every value is a single-quoted string on one line. That is enforced by the
    files themselves being generated and reviewed in this shape -- and by
    `i18n.spec.ts`, which would fail the moment a key went missing from one
    language, whatever caused it.
    """
    path = TRANSLATIONS / f'{lang}.ts'
    keys = {}
    inside = False
    for line in path.read_text().splitlines():
        if not inside:
            inside = line.rstrip() == f'  {section}: {{'
            continue
        if line.startswith('  }'):
            break
        match = re.match(r"^    ([A-Za-z_]\w*): '((?:\\.|[^'])*)',?$", line)
        if match:
            keys[match.group(1)] = match.group(2).replace("\\'", "'").replace('\\\\', '\\')
    return keys


def note_for(key, english):
    notes = []
    if re.search(r'\{\{\w+\}\}', english):
        notes.append('KEEP PLACEHOLDERS EXACTLY: '
                     + ', '.join(re.findall(r'\{\{\w+\}\}', english)))
    if key.endswith('Title'):
        notes.append('hover tooltip - short, imperative')
    if key.startswith('tab'):
        notes.append('tab label - fixed-width bar, keep very short')
    if key.endswith('Placeholder'):
        notes.append('input placeholder')
    if key.endswith('Alt'):
        notes.append('image alt text - screen readers only')
    return '; '.join(notes)


def export(section, outdir):
    english = load_section('en', section)
    if not english:
        sys.exit(f'no section `{section}` in en.ts')
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    for lang in LANGS:
        current = load_section(lang, section)
        path = outdir / f'{section}.{lang}.csv'
        with path.open('w', newline='') as handle:
            out = csv.writer(handle)
            out.writerow(['key', 'english', 'current', 'corrected', 'notes'])
            for key, value in english.items():
                out.writerow([key, value, current.get(key, ''), '',
                              note_for(key, value)])
        print(f'{path}  ({len(english)} keys)')


def import_csv(section, lang, path):
    if lang not in LANGS:
        sys.exit(f'{lang} is not one of {LANGS}')
    with open(path, newline='') as handle:
        rows = [r for r in csv.DictReader(handle) if r.get('corrected', '').strip()]
    if not rows:
        sys.exit('nothing to import: every `corrected` column is empty')

    target = TRANSLATIONS / f'{lang}.ts'
    text = target.read_text()
    start = text.index(f'\n  {section}: {{')
    end = text.index('\n  },', start)
    body = text[start:end]

    for row in rows:
        key, value = row['key'], row['corrected'].strip()
        pattern = re.compile(
            rf"^(\s*){re.escape(key)}: (['\"])(?:\\.|(?!\2).)*\2",
            re.M,
        )
        if not pattern.search(body):
            sys.exit(f'{lang}.{section}.{key} not found -- key order changed?')
        escaped = value.replace('\\', '\\\\').replace("'", "\\'")
        body = pattern.sub(lambda m: f"{m.group(1)}{key}: '{escaped}'", body, count=1)

    target.write_text(text[:start] + body + text[end:])
    print(f'{len(rows)} strings imported into {target.relative_to(ROOT)}')
    print('now run: npm run test:unit')


if __name__ == '__main__':
    args = sys.argv[1:]
    if not args or args[0] not in ('titles', 'export', 'import'):
        sys.exit(__doc__)
    if args[0] == 'titles':
        sys.exit(titles())
    if args[0] == 'export':
        if len(args) < 2:
            sys.exit('usage: export <section> [outdir]')
        export(args[1], args[2] if len(args) > 2 else 'i18n-review')
    if args[0] == 'import':
        if len(args) != 4:
            sys.exit('usage: import <section> <lang> <csv>')
        import_csv(args[1], args[2], args[3])
