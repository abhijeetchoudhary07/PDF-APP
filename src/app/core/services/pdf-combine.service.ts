import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import {
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFPage,
  PDFRef,
  StandardFonts,
  rgb
} from 'pdf-lib';
import {
  CombineNotice,
  CombineOutput,
  CombinePageRef,
  CombineProgress,
  CombineSource,
  InsertOptions,
  InsertPlan,
  InterleaveDocOptions,
  InterleavePlan,
  MergeOptions,
  MergePlan,
  MergePlanEntry,
  MergeStructureOptions,
  MergeStructurePlan,
  StructureEntry
} from '../models/pdf-combine.types';
import { LAYOUT_PAPER_SIZES_PT, LayoutPaperSize } from '../models/pdf-layout.types';
import { PdfDrawPageUtil } from '../utilities/pdf-draw-page.util';
import { PdfMergePreflightService } from './pdf-merge-preflight.service';

/**
 * Combining: C1-C4.
 *
 * Planning and writing are separate throughout. `planInterleave`,
 * `planInsert`, `planMerge` and `planStructure` are synchronous, write
 * nothing, and return the exact output composition — which is what lets a
 * screen show the resulting order and page count before anything is
 * committed, and what lets the specs assert the order without writing a file.
 *
 * The default path is deliberately the shipped one. `planMerge` with no
 * subsets and no sort returns every page of every file in list order, which is
 * precisely what the organizer's merge produces today; the four C4 structure
 * options all default to off.
 */
@Injectable({
  providedIn: 'root'
})
export class PdfCombineService {
  /** Most blank pages one insert may add, so a typo cannot hang a phone. */
  readonly MAX_BLANK_INSERT = 200;

  /*
   * Constructed rather than injected, for the same reason `PageFlipService` is
   * in the page manager: it is stateless, takes no dependencies, and the specs
   * here build this service with `new` outside any injection context, where a
   * field `inject()` would throw.
   */
  private readonly preflight = new PdfMergePreflightService();

  // ════════════════════════════════════════════════════════════════════
  // C1 — alternate & mix (interleave)
  // ════════════════════════════════════════════════════════════════════

  /**
   * Takes one page from each document in turn until all are exhausted.
   *
   * A reversed document is read from the back, which is the case this exists
   * for: scanning a stack of double-sided sheets front-first and then
   * back-first leaves the backs in the opposite order, and interleaving with
   * the second document reversed puts them back in reading order.
   *
   * Documents of unequal length are not padded — once a document runs out, the
   * rounds simply continue without it, so the longest one's tail lands at the
   * end. That is reported, because it is the one case where the result is not
   * a strict alternation.
   */
  planInterleave(
    pageCounts: number[],
    perDoc?: InterleaveDocOptions[]
  ): InterleavePlan {
    const counts = pageCounts.map(n => Math.max(0, Math.floor(n)));
    const order: CombinePageRef[] = [];
    const perDocCount = counts.map(() => 0);
    const rounds = counts.length > 0 ? Math.max(...counts) : 0;

    for (let round = 0; round < rounds; round++) {
      for (let docIndex = 0; docIndex < counts.length; docIndex++) {
        const count = counts[docIndex];
        if (round >= count) continue;

        const reversed = perDoc?.[docIndex]?.reversed === true;
        order.push({
          sourceIndex: docIndex,
          pageIndex: reversed ? count - 1 - round : round
        });
        perDocCount[docIndex]++;
      }
    }

    const nonEmpty = counts.filter(c => c > 0);
    return {
      order,
      uneven: nonEmpty.length > 1 && new Set(nonEmpty).size > 1,
      perDocCount,
      totalPageCount: order.length
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // C2 — insert pages
  // ════════════════════════════════════════════════════════════════════

  /**
   * Where an insertion lands, without rebuilding anything.
   *
   * The anchor is a 1-indexed page of the base document and is clamped into
   * it, so "after page 99" of a 4-page document inserts at the end rather than
   * failing. An empty base document takes the insertion at position 0.
   */
  planInsert(
    basePageCount: number,
    insertedCount: number,
    anchorPage: number,
    side: 'before' | 'after'
  ): InsertPlan {
    const base = Math.max(0, Math.floor(basePageCount));
    const added = Math.max(0, Math.floor(insertedCount));

    const anchor = base > 0 ? Math.min(Math.max(1, Math.round(anchorPage)), base) : 0;
    const insertAt = base === 0 ? 0 : side === 'before' ? anchor - 1 : anchor;

    const order: CombinePageRef[] = [];
    for (let i = 0; i < insertAt; i++) {
      order.push({ sourceIndex: 0, pageIndex: i });
    }
    for (let i = 0; i < added; i++) {
      order.push({ sourceIndex: 1, pageIndex: i });
    }
    for (let i = insertAt; i < base; i++) {
      order.push({ sourceIndex: 0, pageIndex: i });
    }

    return {
      order,
      insertAt,
      insertedCount: added,
      totalPageCount: order.length
    };
  }

  /**
   * The size an inserted blank page takes.
   *
   * `neighbour` is the default and copies the page the blank lands next to,
   * which is what makes an inserted sheet invisible in a printed stack. The
   * neighbour is the anchor page itself — the page the person pointed at — in
   * both directions.
   */
  blankPageSize(
    mode: InsertOptions['blankSize'],
    neighbour: { width: number; height: number } | undefined,
    landscape = false
  ): { width: number; height: number } {
    if (mode === 'neighbour') {
      return neighbour
        ? { width: neighbour.width, height: neighbour.height }
        : { ...LAYOUT_PAPER_SIZES_PT.A4 };
    }

    const paper = LAYOUT_PAPER_SIZES_PT[mode as LayoutPaperSize] ?? LAYOUT_PAPER_SIZES_PT.A4;
    return landscape
      ? { width: paper.height, height: paper.width }
      : { width: paper.width, height: paper.height };
  }

  /**
   * Writes the base document with content inserted at a position.
   *
   * `insertBuffer` is another PDF, `insertImages` are images sized by the
   * same fit-inside-the-page rule the images-to-PDF path uses, and neither is
   * needed for a blank insertion.
   */
  async exportWithInsertion(
    baseBuffer: ArrayBuffer,
    options: InsertOptions,
    outputName: string,
    content?: { pdfBuffer?: ArrayBuffer; images?: Array<{ bytes: ArrayBuffer; type: 'png' | 'jpg' }> },
    onProgress?: (p: CombineProgress) => void,
    signal?: AbortSignal
  ): Promise<CombineOutput> {
    const base = await PDFDocument.load(baseBuffer.slice(0), { ignoreEncryption: true });
    const basePages = base.getPages();
    const notices: CombineNotice[] = [];

    let insertedCount = 0;
    let insertDoc: PDFDocument | undefined;

    if (options.kind === 'pdf') {
      if (!content?.pdfBuffer) throw new Error('No PDF was chosen to insert.');
      insertDoc = await PDFDocument.load(content.pdfBuffer.slice(0), { ignoreEncryption: true });
      insertedCount = insertDoc.getPageCount();
    } else if (options.kind === 'image') {
      insertedCount = content?.images?.length ?? 0;
      if (insertedCount === 0) throw new Error('No image was chosen to insert.');
    } else {
      insertedCount = Math.min(
        this.MAX_BLANK_INSERT,
        Math.max(1, Math.floor(options.blankCount))
      );
    }

    const plan = this.planInsert(
      basePages.length,
      insertedCount,
      options.anchorPage,
      options.side
    );

    const anchorIndex =
      basePages.length > 0
        ? Math.min(Math.max(1, Math.round(options.anchorPage)), basePages.length) - 1
        : -1;
    const neighbour =
      anchorIndex >= 0
        ? (() => {
            const geometry = PdfDrawPageUtil.mediaBoxOf(basePages[anchorIndex]);
            const rotation = PdfDrawPageUtil.normalizeRotation(
              basePages[anchorIndex].getRotation().angle
            );
            return PdfDrawPageUtil.visualSize(geometry.width, geometry.height, rotation);
          })()
        : undefined;

    const target = await PDFDocument.create();
    const total = plan.order.length;

    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw new Error('Insert cancelled by user.');
      const ref = plan.order[i];

      if (ref.sourceIndex === 0) {
        const [copied] = await target.copyPages(base, [ref.pageIndex]);
        target.addPage(copied);
      } else if (options.kind === 'pdf' && insertDoc) {
        const [copied] = await target.copyPages(insertDoc, [ref.pageIndex]);
        target.addPage(copied);
      } else if (options.kind === 'image') {
        const image = content!.images![ref.pageIndex];
        const embedded =
          image.type === 'png'
            ? await target.embedPng(image.bytes)
            : await target.embedJpg(image.bytes);

        const sheet = this.blankPageSize(
          options.blankSize,
          neighbour,
          options.blankLandscape
        );
        const page = target.addPage([sheet.width, sheet.height]);
        const fit = PdfDrawPageUtil.fitScale(
          embedded.width,
          embedded.height,
          sheet.width,
          sheet.height,
          'contain'
        );
        const drawnWidth = embedded.width * fit.scaleX;
        const drawnHeight = embedded.height * fit.scaleY;
        page.drawImage(embedded, {
          x: (sheet.width - drawnWidth) / 2,
          y: (sheet.height - drawnHeight) / 2,
          width: drawnWidth,
          height: drawnHeight
        });
      } else {
        const sheet = this.blankPageSize(
          options.blankSize,
          neighbour,
          options.blankLandscape
        );
        target.addPage([sheet.width, sheet.height]);
      }

      onProgress?.({
        phase: 'writing',
        completed: i + 1,
        total,
        percent: Math.round(((i + 1) / total) * 100)
      });
    }

    if (options.kind === 'blank') {
      notices.push({ kind: 'blanks-inserted', count: plan.insertedCount });
    }

    return this.finish(target, outputName, basePages.length + plan.insertedCount, notices);
  }

  // ════════════════════════════════════════════════════════════════════
  // C3 — merge: page subsets and sorting
  // ════════════════════════════════════════════════════════════════════

  /**
   * Sorts the source list.
   *
   * `none` is the default and leaves the list exactly as the person arranged
   * it, which is the shipped behaviour. Every other field sorts a copy with a
   * stable comparator, so files that compare equal keep their relative order
   * rather than shuffling on every re-render.
   */
  sortSources(
    sources: CombineSource[],
    sortBy: MergeOptions['sortBy'],
    direction: MergeOptions['sortDirection']
  ): CombineSource[] {
    if (sortBy === 'none') return [...sources];

    const sign = direction === 'desc' ? -1 : 1;
    const compare = (a: CombineSource, b: CombineSource): number => {
      switch (sortBy) {
        case 'name':
          // Numeric-aware, so scan_2 sorts before scan_10.
          return a.name.localeCompare(b.name, undefined, {
            numeric: true,
            sensitivity: 'base'
          });
        case 'date':
          return a.lastModified - b.lastModified;
        case 'size':
          return a.sizeBytes - b.sizeBytes;
        default:
          return 0;
      }
    };

    // Array.prototype.sort is stable, so equal elements keep their order.
    return [...sources].sort((a, b) => sign * compare(a, b));
  }

  /**
   * A per-file subset expression, in the order it was written.
   *
   * `PdfRangeParserUtil.parseRange` is the shipped parser and returns pages
   * sorted and deduplicated, which is right for extracting and splitting —
   * "pages 5, 1-2" of one document is pages 1, 2 and 5. It is wrong for a
   * merge subset, where the expression is also an ordering instruction: a
   * person who writes `5, 1-2` is saying to put page 5 first. That parser is
   * left alone and this walks the expression itself.
   *
   * A descending range (`3-1`) counts down, which is the shortest way to say
   * "this document, backwards". Repeats are dropped, keeping the first
   * position, so a typo cannot quietly double a page.
   */
  parseSubset(expression: string, pageCount: number): { valid: boolean; pages: number[] } {
    const trimmed = (expression ?? '').trim();
    if (trimmed.length === 0) return { valid: true, pages: [] };

    const pages: number[] = [];
    const seen = new Set<number>();

    const take = (pageNumber: number): void => {
      if (pageNumber < 1 || pageNumber > pageCount || seen.has(pageNumber)) return;
      seen.add(pageNumber);
      pages.push(pageNumber);
    };

    for (const rawPart of trimmed.split(',')) {
      const part = rawPart.trim();
      if (part.length === 0) continue;

      const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (range) {
        const from = Number(range[1]);
        const to = Number(range[2]);
        if (from < 1 || to < 1 || from > pageCount || to > pageCount) {
          return { valid: false, pages: [] };
        }
        const step = from <= to ? 1 : -1;
        for (let page = from; step > 0 ? page <= to : page >= to; page += step) {
          take(page);
        }
        continue;
      }

      if (!/^\d+$/.test(part)) return { valid: false, pages: [] };
      const single = Number(part);
      if (single < 1 || single > pageCount) return { valid: false, pages: [] };
      take(single);
    }

    return { valid: pages.length > 0, pages };
  }

  /**
   * The merged output's exact composition.
   *
   * A row with an empty subset takes the whole file — today's behaviour and
   * the default. A subset that cannot be read takes the whole file too and
   * says so, rather than silently dropping a document the person expected to
   * be in the output.
   */
  planMerge(sources: CombineSource[], options: MergeOptions): MergePlan {
    const ordered = this.sortSources(sources, options.sortBy, options.sortDirection);
    const subsetById = new Map(options.rows.map(row => [row.sourceId, row.subset]));

    const entries: MergePlanEntry[] = [];
    const order: CombinePageRef[] = [];
    const notices: CombineNotice[] = [];

    for (const source of ordered) {
      const sourceIndex = sources.indexOf(source);
      const subset = (subsetById.get(source.id) ?? '').trim();

      let pageNumbers: number[];
      let subsetInvalid = false;

      if (subset.length === 0) {
        pageNumbers = Array.from({ length: source.pageCount }, (_, i) => i + 1);
      } else {
        const parsed = this.parseSubset(subset, source.pageCount);
        if (!parsed.valid || parsed.pages.length === 0) {
          subsetInvalid = true;
          pageNumbers = Array.from({ length: source.pageCount }, (_, i) => i + 1);
          notices.push({ kind: 'invalid-subset', detail: source.name });
        } else {
          pageNumbers = parsed.pages;
        }
      }

      if (pageNumbers.length === 0) {
        notices.push({ kind: 'empty-subset', detail: source.name });
        continue;
      }

      entries.push({
        sourceIndex,
        sourceId: source.id,
        sourceName: source.name,
        pageNumbers,
        firstOutputPage: order.length + 1,
        subsetInvalid: subsetInvalid || undefined
      });

      for (const pageNumber of pageNumbers) {
        order.push({ sourceIndex, pageIndex: pageNumber - 1 });
      }
    }

    return { entries, order, totalPageCount: order.length, notices };
  }

  // ════════════════════════════════════════════════════════════════════
  // C4 — merge: bookmarks, TOC, cover & separators
  // ════════════════════════════════════════════════════════════════════

  /**
   * Folds the generated pages into a merge plan and works out where every
   * source's first page ends up.
   *
   * Two passes are unavoidable: a contents page lists page numbers, and it is
   * itself a page, so its own existence shifts every number it prints. The
   * cover and the contents page are counted first, then the separators as the
   * sources are walked, and only then are the entries numbered — which is why
   * the printed numbers and the bookmark targets cannot disagree.
   */
  planStructure(plan: MergePlan, options: MergeStructureOptions): MergeStructurePlan {
    const order: CombinePageRef[] = [];
    const entries: StructureEntry[] = [];

    let coverPage: number | undefined;
    let tocPage: number | undefined;

    if (options.coverPage) {
      order.push({ sourceIndex: -1, pageIndex: 0, generated: 'cover' });
      coverPage = order.length;
    }
    if (options.tableOfContents) {
      order.push({ sourceIndex: -1, pageIndex: 0, generated: 'toc' });
      tocPage = order.length;
    }

    plan.entries.forEach((entry, index) => {
      if (options.separators) {
        order.push({ sourceIndex: -1, pageIndex: index, generated: 'separator' });
      }

      const firstOutputPage = order.length + 1;
      for (const pageNumber of entry.pageNumbers) {
        order.push({ sourceIndex: entry.sourceIndex, pageIndex: pageNumber - 1 });
      }

      entries.push({
        title: entry.sourceName,
        outputPage: firstOutputPage,
        pageCount: entry.pageNumbers.length
      });
    });

    return {
      order,
      entries,
      totalPageCount: order.length,
      tocPage,
      coverPage
    };
  }

  /**
   * Text the built-in fonts can actually draw.
   *
   * pdf-lib's standard fonts are WinAnsi-encoded and *throw* on a character
   * they cannot encode, so a file called `दस्तावेज़.pdf` would fail the whole
   * export rather than print oddly. Characters outside Latin-1 are dropped
   * here and the caller reports it — and the bookmark for the same file keeps
   * its full text, because an outline title is a UTF-16 string with no such
   * limit.
   */
  toDrawableText(text: string): { text: string; dropped: number } {
    let dropped = 0;
    let out = '';

    for (const char of text) {
      const code = char.codePointAt(0) ?? 0;
      const encodable =
        (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff);
      if (encodable) {
        out += char;
      } else {
        dropped++;
      }
    }

    return { text: out.replace(/\s+/g, ' ').trim(), dropped };
  }

  /**
   * Writes a document outline — one bookmark per entry, pointing at a page.
   *
   * pdf-lib has no outline API, so this builds the dictionaries by hand: an
   * /Outlines node holding a doubly-linked list of items, each with a /Dest
   * naming its page. Titles go in as hex strings, which are UTF-16BE, so a
   * Devanagari or Bengali file name survives into the bookmark intact.
   */
  writeOutline(
    doc: PDFDocument,
    entries: Array<{ title: string; pageIndex: number }>
  ): number {
    const usable = entries.filter(
      entry => entry.pageIndex >= 0 && entry.pageIndex < doc.getPageCount()
    );
    if (usable.length === 0) return 0;

    const context = doc.context;
    const outlinesRef = context.nextRef();
    const itemRefs: PDFRef[] = usable.map(() => context.nextRef());

    usable.forEach((entry, index) => {
      const page = doc.getPage(entry.pageIndex);
      const item = context.obj({
        Title: PDFHexString.fromText(entry.title),
        Parent: outlinesRef,
        /*
         * /XYZ with a null zoom leaves the reader's current magnification
         * alone and scrolls to the top of the page, which is what a
         * file-level bookmark should do. A /Fit destination would force the
         * whole page into view and fight the reader's own zoom.
         */
        Dest: [page.ref, PDFName.of('XYZ'), null, page.getHeight(), null]
      }) as PDFDict;

      // Set after construction, because an item at either end has no sibling.
      if (index > 0) item.set(PDFName.of('Prev'), itemRefs[index - 1]);
      if (index < usable.length - 1) item.set(PDFName.of('Next'), itemRefs[index + 1]);

      context.assign(itemRefs[index], item);
    });

    context.assign(
      outlinesRef,
      context.obj({
        Type: 'Outlines',
        First: itemRefs[0],
        Last: itemRefs[itemRefs.length - 1],
        Count: usable.length
      })
    );

    doc.catalog.set(PDFName.of('Outlines'), outlinesRef);
    // Open the bookmark pane, so a generated outline is actually noticed.
    doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));

    return usable.length;
  }

  /**
   * Merges the sources, with whatever structure was asked for.
   *
   * `structure` defaults to everything off, which makes this exactly the
   * shipped merge: every page of every source, copied in order, with nothing
   * generated and nothing added.
   */
  async exportMerged(
    sources: CombineSource[],
    options: MergeOptions,
    outputName: string,
    structure: MergeStructureOptions = {
      bookmarks: false,
      tableOfContents: false,
      coverPage: false,
      coverTitle: '',
      separators: false
    },
    onProgress?: (p: CombineProgress) => void,
    signal?: AbortSignal
  ): Promise<CombineOutput> {
    const plan = this.planMerge(sources, options);
    if (plan.totalPageCount === 0) throw new Error('No pages were selected to merge.');

    const structurePlan = this.planStructure(plan, structure);
    const notices: CombineNotice[] = [...plan.notices];

    const target = await PDFDocument.create();
    const loaded = new Map<number, PDFDocument>();
    const total = structurePlan.order.length;

    /*
     * Generated pages take the first merged page's size, so a cover or a
     * separator does not stand out in a printed stack. The source has to be
     * parsed to find that out, which is why it happens once up front rather
     * than per generated page.
     */
    const generatedSize = await this.firstPageSize(sources, plan);

    let font: Awaited<ReturnType<PDFDocument['embedFont']>> | undefined;
    let boldFont: Awaited<ReturnType<PDFDocument['embedFont']>> | undefined;
    let droppedCharacters = 0;

    const needsFont =
      structure.coverPage || structure.tableOfContents || structure.separators;
    if (needsFont) {
      font = await target.embedFont(StandardFonts.Helvetica);
      boldFont = await target.embedFont(StandardFonts.HelveticaBold);
    }

    /* First pass: every page, generated or copied, in final order. */
    const tocPages: PDFPage[] = [];

    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw new Error('Merge cancelled by user.');
      const ref = structurePlan.order[i];

      if (ref.sourceIndex >= 0) {
        let doc = loaded.get(ref.sourceIndex);
        if (!doc) {
          doc = await PDFDocument.load(sources[ref.sourceIndex].buffer.slice(0), {
            ignoreEncryption: true
          });
          loaded.set(ref.sourceIndex, doc);
        }
        const [copied] = await target.copyPages(doc, [ref.pageIndex]);
        target.addPage(copied);
      } else {
        const page = target.addPage([generatedSize.width, generatedSize.height]);

        if (ref.generated === 'cover') {
          const title =
            structure.coverTitle.trim().length > 0
              ? structure.coverTitle.trim()
              : outputName.replace(/\.pdf$/i, '');
          droppedCharacters += this.drawCover(page, title, plan, boldFont!, font!);
        } else if (ref.generated === 'toc') {
          // Drawn in the second pass, once every page number is final.
          tocPages.push(page);
        } else if (ref.generated === 'separator') {
          const entry = plan.entries[ref.pageIndex];
          droppedCharacters += this.drawSeparator(page, entry?.sourceName ?? '', boldFont!);
        }
      }

      onProgress?.({
        phase: 'writing',
        completed: i + 1,
        total,
        percent: Math.round(((i + 1) / total) * 100)
      });
    }

    /* Second pass: the contents page, now that the numbers cannot move. */
    if (structure.tableOfContents && tocPages.length > 0) {
      droppedCharacters += this.drawTableOfContents(
        tocPages[0],
        structurePlan.entries,
        boldFont!,
        font!
      );
    }

    /*
     * `copyPages` brings widget annotations across but leaves the target's
     * /AcroForm empty, so a merged form renders and cannot be typed into.
     * Re-registering the fields fixes that — and only runs when the output
     * actually has widgets, so a merge of documents with no forms is
     * unchanged down to the byte.
     */
    this.preflight.rebuildAcroForm(target);

    if (structure.bookmarks) {
      const written = this.writeOutline(
        target,
        structurePlan.entries.map(entry => ({
          title: entry.title,
          pageIndex: entry.outputPage - 1
        }))
      );
      if (written > 0) notices.push({ kind: 'outline-written', count: written });
    }

    if (structure.coverPage) notices.push({ kind: 'cover-added', count: 1 });
    if (structure.tableOfContents) notices.push({ kind: 'toc-added', count: 1 });
    if (structure.separators) {
      notices.push({ kind: 'separators-added', count: plan.entries.length });
    }
    if (droppedCharacters > 0) {
      notices.push({ kind: 'title-characters-dropped', count: droppedCharacters });
    }

    const sourcePageCount = sources.reduce((sum, source) => sum + source.pageCount, 0);
    return this.finish(target, outputName, sourcePageCount, notices);
  }

  /**
   * The visual size of the first page the merge will produce, for the
   * generated pages to match. A4 stands in when there is nothing to measure.
   */
  private async firstPageSize(
    sources: CombineSource[],
    plan: MergePlan
  ): Promise<{ width: number; height: number }> {
    const first = plan.entries[0];
    const source = first ? sources[first.sourceIndex] : undefined;
    if (!source) return { ...LAYOUT_PAPER_SIZES_PT.A4 };

    try {
      const doc = await PDFDocument.load(source.buffer.slice(0), { ignoreEncryption: true });
      const pageIndex = Math.max(0, (first.pageNumbers[0] ?? 1) - 1);
      const page = doc.getPage(Math.min(pageIndex, doc.getPageCount() - 1));
      const box = PdfDrawPageUtil.mediaBoxOf(page);
      const rotation = PdfDrawPageUtil.normalizeRotation(page.getRotation().angle);
      return PdfDrawPageUtil.visualSize(box.width, box.height, rotation);
    } catch {
      return { ...LAYOUT_PAPER_SIZES_PT.A4 };
    }
  }

  private drawCover(
    page: PDFPage,
    title: string,
    plan: MergePlan,
    boldFont: Awaited<ReturnType<PDFDocument['embedFont']>>,
    font: Awaited<ReturnType<PDFDocument['embedFont']>>
  ): number {
    const safe = this.toDrawableText(title);
    const { width, height } = page.getSize();

    page.drawText(safe.text || 'Merged document', {
      x: 56,
      y: height - 150,
      size: 26,
      font: boldFont,
      color: rgb(0.06, 0.09, 0.16),
      maxWidth: width - 112,
      lineHeight: 32
    });

    page.drawLine({
      start: { x: 56, y: height - 172 },
      end: { x: width - 56, y: height - 172 },
      thickness: 1,
      color: rgb(0.85, 0.87, 0.9)
    });

    const files = plan.entries.length;
    page.drawText(`${files} file(s) · ${plan.totalPageCount} page(s)`, {
      x: 56,
      y: height - 198,
      size: 11,
      font,
      color: rgb(0.42, 0.45, 0.5)
    });

    return safe.dropped;
  }

  private drawSeparator(
    page: PDFPage,
    name: string,
    boldFont: Awaited<ReturnType<PDFDocument['embedFont']>>
  ): number {
    const safe = this.toDrawableText(name);
    const { width, height } = page.getSize();

    page.drawText(safe.text || 'Next document', {
      x: 56,
      y: height / 2,
      size: 16,
      font: boldFont,
      color: rgb(0.25, 0.28, 0.33),
      maxWidth: width - 112,
      lineHeight: 20
    });

    return safe.dropped;
  }

  private drawTableOfContents(
    page: PDFPage,
    entries: StructureEntry[],
    boldFont: Awaited<ReturnType<PDFDocument['embedFont']>>,
    font: Awaited<ReturnType<PDFDocument['embedFont']>>
  ): number {
    const { width, height } = page.getSize();
    let dropped = 0;

    page.drawText('Contents', {
      x: 56,
      y: height - 92,
      size: 20,
      font: boldFont,
      color: rgb(0.06, 0.09, 0.16)
    });

    let y = height - 132;
    const lineHeight = 22;
    const bottom = 64;

    for (const entry of entries) {
      if (y < bottom) break; // One contents page; the rest is in the outline.

      const safe = this.toDrawableText(entry.title);
      dropped += safe.dropped;

      const label = safe.text || 'Document';
      const number = String(entry.outputPage);
      const numberWidth = font.widthOfTextAtSize(number, 11);

      page.drawText(label, {
        x: 56,
        y,
        size: 11,
        font,
        color: rgb(0.13, 0.16, 0.22),
        maxWidth: width - 112 - numberWidth - 16
      });
      page.drawText(number, {
        x: width - 56 - numberWidth,
        y,
        size: 11,
        font,
        color: rgb(0.42, 0.45, 0.5)
      });

      y -= lineHeight;
    }

    return dropped;
  }

  private async finish(
    doc: PDFDocument,
    outputName: string,
    sourcePageCount: number,
    notices: CombineNotice[]
  ): Promise<CombineOutput> {
    const bytes = await doc.save({ useObjectStreams: false });
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const file = new File([blob], outputName, { type: 'application/pdf' });

    return {
      name: outputName,
      file,
      blob,
      sizeBytes: file.size,
      pageCount: doc.getPageCount(),
      sourcePageCount,
      notices
    };
  }

  /**
   * Writes an interleaved document from the plan.
   *
   * Pages are copied, never re-drawn, so an interleaved scan keeps its text
   * layer and its annotations.
   */
  async exportInterleaved(
    sources: CombineSource[],
    perDoc: InterleaveDocOptions[],
    outputName: string,
    onProgress?: (p: CombineProgress) => void,
    signal?: AbortSignal
  ): Promise<CombineOutput> {
    const plan = this.planInterleave(
      sources.map(source => source.pageCount),
      perDoc
    );
    if (plan.totalPageCount === 0) throw new Error('No pages were available to mix.');

    const notices: CombineNotice[] = [];
    if (plan.uneven) {
      notices.push({ kind: 'uneven-interleave', count: plan.totalPageCount });
    }

    const target = await PDFDocument.create();
    const loaded = new Map<number, PDFDocument>();
    const total = plan.order.length;

    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw new Error('Mix cancelled by user.');
      const ref = plan.order[i];

      let doc = loaded.get(ref.sourceIndex);
      if (!doc) {
        doc = await PDFDocument.load(sources[ref.sourceIndex].buffer.slice(0), {
          ignoreEncryption: true
        });
        loaded.set(ref.sourceIndex, doc);
      }

      const [copied] = await target.copyPages(doc, [ref.pageIndex]);
      target.addPage(copied);

      onProgress?.({
        phase: 'writing',
        completed: i + 1,
        total,
        percent: Math.round(((i + 1) / total) * 100)
      });
    }

    const sourcePageCount = sources.reduce((sum, source) => sum + source.pageCount, 0);
    return this.finish(target, outputName, sourcePageCount, notices);
  }
}
