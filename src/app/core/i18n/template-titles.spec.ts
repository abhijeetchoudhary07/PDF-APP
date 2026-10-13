import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/*
 * A `title` attribute is the one string in a template that is easy to write and
 * easy to forget: it never shows up in a screenshot, it never fails a render,
 * and it is the same word in the markup whether or not it has been translated.
 * 80 of them accumulated that way -- 30 of which were not tooltips at all but
 * `title` @Inputs on `app-page-header` / `app-modal` / `app-file-dropzone`,
 * rendered as the visible <h1> of a page, in English, in a five-language app.
 *
 * Both shapes are checked here, because both were present:
 *
 *   title="Delete Page"                       a literal attribute
 *   [title]="isDeleted ? 'Restore page' : …"  a binding over literal English
 *
 * The rule for the second one is that a binding containing a quoted string
 * must also pipe through `translate` -- which allows the ternary-over-keys form
 * the organizer uses, and rejects a ternary over English. Bindings over data
 * (`[title]="file.name"`) have no string literal and are not affected.
 */

const SRC = join(process.cwd(), 'src');

/*
 * `.ts` as well as `.html`: three of these lived in inline component templates
 * -- the header's profile link, the breadcrumb home link -- which an
 * HTML-only scan walks straight past. Specs are excluded because this file's
 * own comments quote the shapes it is looking for.
 */
function templates(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return templates(path);
    if (entry.name.endsWith('.spec.ts')) return [];
    return entry.name.endsWith('.html') || entry.name.endsWith('.ts') ? [path] : [];
  });
}

/*
 * Strings that are deliberately not translated belong here, as
 * `relative/path.html:the exact value`, with a comment saying why. It is empty
 * on purpose: every title in the app is currently translated, and an addition
 * here should be an argued exception rather than a place to put a hurry.
 */
const ALLOWED = new Set<string>([]);

// `title=` but not `[title]=`, `(title)=` or `data-title=`.
const LITERAL_ATTR = /(?<![\w[(-])title="([^"{]+)"/g;
const BOUND_ATTR = /\[title\]="([^"]*)"/g;

describe('template title attributes are translated', () => {
  const files = templates(SRC);

  it('finds the templates it is meant to be scanning', () => {
    expect(files.length).toBeGreaterThan(150);
  });

  it('has no literal title="..." attribute', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(LITERAL_ATTR)) {
        const value = match[1].trim();
        const line = text.slice(0, match.index).split('\n').length;
        const entry = `${relative(SRC, file)}:${value}`;
        if (!value || ALLOWED.has(entry)) continue;
        offenders.push(`${relative(SRC, file)}:${line}  title="${value}"`);
      }
    }
    expect(offenders, `use [title]="'section.key' | translate" instead:\n${offenders.join('\n')}`)
      .toEqual([]);
  });

  it('has no [title] binding over a string literal that skips the translate pipe', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(BOUND_ATTR)) {
        const expression = match[1];
        const hasLiteral = /'[^']*'/.test(expression);
        if (!hasLiteral || expression.includes('| translate')) continue;
        const line = text.slice(0, match.index).split('\n').length;
        offenders.push(`${relative(SRC, file)}:${line}  [title]="${expression}"`);
      }
    }
    expect(offenders, `pipe the key through translate:\n${offenders.join('\n')}`).toEqual([]);
  });
});
