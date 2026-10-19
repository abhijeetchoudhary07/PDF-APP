import '../utilities/pdf-iterator-polyfill';
import { Injectable } from '@angular/core';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFString
} from 'pdf-lib';
import {
  HeadingCandidate,
  HeadingScanOptions,
  NavigationProgress,
  OutlineNode,
  OutlineNotice,
  OutlineOutput,
  defaultHeadingScanOptions
} from '../models/pdf-navigation.types';
import '../utilities/pdfjs-worker';

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * Bookmarks and the document outline — E1.
 *
 * pdf-lib has no outline API, so the whole /Outlines tree is built here from
 * dictionaries. The shape is fiddly and every part of it has to agree with
 * every other part, which is why the tree the screen edits is a plain nested
 * array and exactly one function turns it into an object graph:
 *
 *   • Every item carries /Parent, and /Prev and /Next to its siblings, so the
 *     list is doubly linked at each level.
 *   • A parent carries /First and /Last. A leaf carries neither.
 *   • /Count is where this usually goes wrong. It is the number of *visible*
 *     descendants at all levels, and it is **negative** when the item is shown
 *     closed — the magnitude being how many would appear if it were opened.
 *     A positive count on a closed item makes readers draw a disclosure
 *     triangle that does nothing.
 *   • The root /Outlines dictionary's own /Count is always non-negative.
 *
 * Destinations are written as explicit `[pageRef /XYZ null top null]` arrays
 * rather than named destinations: a named destination needs a /Dests name tree
 * that this app would then also have to maintain, and an explicit array cannot
 * dangle.
 */
@Injectable({
  providedIn: 'root'
})
export class PdfOutlineService {
  /** Deepest tree this will read or write, so a cyclic file cannot hang a phone. */
  readonly MAX_DEPTH = 12;

  /** Most bookmarks one document may carry, for the same reason. */
  readonly MAX_NODES = 5000;

  // ════════════════════════════════════════════════════════════════════
  // Reading
  // ════════════════════════════════════════════════════════════════════

  /**
   * Reads the existing outline through pdf.js.
   *
   * pdf.js resolves named destinations, page refs and the several destination
   * array shapes for us, which is a meaningful amount of the work; doing it
   * from the dictionaries would mean reimplementing its /Dests handling.
   *
   * An entry whose destination cannot be resolved to a page is kept, pointed
   * at the page its parent points at, and reported — dropping a bookmark
   * silently is worse than one that lands a page early.
   */
  async readOutline(
    buffer: ArrayBuffer,
    onProgress?: (p: NavigationProgress) => void
  ): Promise<{ nodes: OutlineNode[]; notices: OutlineNotice[] }> {
    const notices: OutlineNotice[] = [];
    const pdfjsLib = await import('pdfjs-dist');
    const task = pdfjsLib.getDocument({
      data: new Uint8Array(buffer.slice(0))
    } as Parameters<typeof pdfjsLib.getDocument>[0]);
    const pdf = await task.promise;

    try {
      const raw = await pdf.getOutline();
      if (!raw || raw.length === 0) {
        notices.push({ kind: 'no-outline' });
        return { nodes: [], notices };
      }

      let unresolved = 0;
      let visited = 0;

      const convert = async (
        items: Awaited<ReturnType<typeof pdf.getOutline>>,
        depth: number,
        fallbackPage: number
      ): Promise<OutlineNode[]> => {
        if (!items || depth > this.MAX_DEPTH) return [];
        const out: OutlineNode[] = [];

        for (const item of items) {
          if (visited >= this.MAX_NODES) break;
          visited++;

          let pageIndex = fallbackPage;
          try {
            const dest = Array.isArray(item.dest)
              ? item.dest
              : typeof item.dest === 'string'
                ? await pdf.getDestination(item.dest)
                : null;
            if (dest && dest[0]) {
              pageIndex = await pdf.getPageIndex(dest[0] as never);
            } else {
              unresolved++;
            }
          } catch {
            unresolved++;
          }

          out.push({
            id: newId(),
            title: (item.title || '').trim() || 'Untitled',
            pageIndex: Math.max(0, pageIndex),
            // pdf.js exposes the open state, which is the sign of /Count.
            collapsed: item.items && item.items.length > 0 ? item.count === undefined ? false : (item.count ?? 0) < 0 : undefined,
            children: await convert(
              item.items as Awaited<ReturnType<typeof pdf.getOutline>>,
              depth + 1,
              pageIndex
            )
          });

          onProgress?.({
            phase: 'reading',
            completed: visited,
            total: Math.max(visited, raw.length),
            percent: 100
          });
        }

        return out;
      };

      const nodes = await convert(raw, 0, 0);
      if (unresolved > 0) {
        notices.push({ kind: 'unresolved-destination', count: unresolved });
      }

      return { nodes, notices };
    } finally {
      try {
        await task.destroy();
      } catch {
        // A document that will not close is not worth failing the read for.
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // Counting — the part that is easy to get wrong
  // ════════════════════════════════════════════════════════════════════

  /**
   * How many items a reader would show for this list, at all levels.
   *
   * The list itself is always visible; an item's children are visible only if
   * that item is open. This is the number the root /Outlines /Count takes, and
   * the magnitude of every item's own /Count.
   */
  visibleCount(nodes: OutlineNode[], depth = 0): number {
    if (depth > this.MAX_DEPTH) return 0;
    let total = nodes.length;
    for (const node of nodes) {
      if (!node.collapsed && node.children.length > 0) {
        total += this.visibleCount(node.children, depth + 1);
      }
    }
    return total;
  }

  /**
   * The /Count entry for one item: positive when open, negative when closed,
   * and absent for a leaf.
   */
  countFor(node: OutlineNode): number | undefined {
    if (node.children.length === 0) return undefined;
    const open = this.visibleCount(node.children);
    return node.collapsed ? -open : open;
  }

  /** Every node in the tree, depth first — the order a reader lists them in. */
  flatten(nodes: OutlineNode[], depth = 0): Array<{ node: OutlineNode; depth: number }> {
    if (depth > this.MAX_DEPTH) return [];
    const out: Array<{ node: OutlineNode; depth: number }> = [];
    for (const node of nodes) {
      out.push({ node, depth });
      out.push(...this.flatten(node.children, depth + 1));
    }
    return out;
  }

  /** Total bookmarks at all levels, open or closed. */
  totalCount(nodes: OutlineNode[]): number {
    return this.flatten(nodes).length;
  }

  // ════════════════════════════════════════════════════════════════════
  // Writing
  // ════════════════════════════════════════════════════════════════════

  /**
   * Writes a complete /Outlines tree, replacing whatever was there.
   *
   * Refs for every item are allocated first, so each one can name its parent,
   * its siblings and its children while they are still being built — a tree
   * written depth-first without that step cannot fill in /Next until it has
   * already written the item that needs it.
   *
   * Returns how many bookmarks were written.
   */
  writeOutline(doc: PDFDocument, nodes: OutlineNode[]): number {
    const context = doc.context;
    const pageCount = doc.getPageCount();

    this.removeOutline(doc);
    if (nodes.length === 0 || pageCount === 0) return 0;

    const flat = this.flatten(nodes).slice(0, this.MAX_NODES);
    if (flat.length === 0) return 0;

    const refs = new Map<string, PDFRef>();
    for (const entry of flat) refs.set(entry.node.id, context.nextRef());

    const outlinesRef = context.nextRef();

    const writeLevel = (level: OutlineNode[], parentRef: PDFRef, depth: number): void => {
      if (depth > this.MAX_DEPTH) return;

      level.forEach((node, index) => {
        const ref = refs.get(node.id);
        if (!ref) return;

        const pageIndex = Math.min(Math.max(0, node.pageIndex), pageCount - 1);
        const page = doc.getPage(pageIndex);

        const item = context.obj({
          // Hex, not a literal string: a bookmark title may be in any script.
          Title: PDFHexString.fromText(node.title || 'Untitled'),
          Parent: parentRef,
          /*
           * /XYZ with a null zoom scrolls to the top of the page and leaves
           * the reader's own magnification alone. /Fit would fight it.
           */
          Dest: [page.ref, PDFName.of('XYZ'), null, page.getHeight(), null]
        }) as PDFDict;

        const prev = index > 0 ? refs.get(level[index - 1].id) : undefined;
        const next = index < level.length - 1 ? refs.get(level[index + 1].id) : undefined;
        if (prev) item.set(PDFName.of('Prev'), prev);
        if (next) item.set(PDFName.of('Next'), next);

        if (node.children.length > 0) {
          const firstChild = refs.get(node.children[0].id);
          const lastChild = refs.get(node.children[node.children.length - 1].id);
          if (firstChild) item.set(PDFName.of('First'), firstChild);
          if (lastChild) item.set(PDFName.of('Last'), lastChild);

          const count = this.countFor(node);
          if (count !== undefined) {
            item.set(PDFName.of('Count'), PDFNumber.of(count));
          }
        }

        context.assign(ref, item);
        writeLevel(node.children, ref, depth + 1);
      });
    };

    writeLevel(nodes, outlinesRef, 0);

    const firstRef = refs.get(nodes[0].id);
    const lastRef = refs.get(nodes[nodes.length - 1].id);
    const root = context.obj({
      Type: 'Outlines',
      Count: this.visibleCount(nodes)
    }) as PDFDict;
    if (firstRef) root.set(PDFName.of('First'), firstRef);
    if (lastRef) root.set(PDFName.of('Last'), lastRef);

    context.assign(outlinesRef, root);
    doc.catalog.set(PDFName.of('Outlines'), outlinesRef);
    // Open the bookmark pane, so an outline somebody just built is noticed.
    doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));

    return flat.length;
  }

  /**
   * Removes the outline and the page mode that goes with it.
   *
   * The item dictionaries themselves are left to be dropped by the structure
   * pass: deleting them here would mean walking a tree that may be the broken
   * one this tool was opened to fix.
   */
  removeOutline(doc: PDFDocument): boolean {
    const had = doc.catalog.get(PDFName.of('Outlines')) !== undefined;
    if (had) doc.catalog.delete(PDFName.of('Outlines'));

    const mode = doc.catalog.lookupMaybe(PDFName.of('PageMode'), PDFName);
    if (mode?.asString() === '/UseOutlines') {
      doc.catalog.delete(PDFName.of('PageMode'));
    }
    return had;
  }

  /** Writes the tree onto the document and returns the saved file. */
  async exportWithOutline(
    buffer: ArrayBuffer,
    nodes: OutlineNode[],
    outputName: string,
    onProgress?: (p: NavigationProgress) => void,
    signal?: AbortSignal
  ): Promise<OutlineOutput> {
    const doc = await PDFDocument.load(buffer.slice(0), { ignoreEncryption: true });
    if (signal?.aborted) throw new Error('Bookmark write cancelled by user.');

    const notices: OutlineNotice[] = [];
    const pageCount = doc.getPageCount();

    const clamped = this.flatten(nodes).filter(
      entry => entry.node.pageIndex < 0 || entry.node.pageIndex > pageCount - 1
    ).length;
    if (clamped > 0) notices.push({ kind: 'clamped-destination', count: clamped });

    onProgress?.({ phase: 'writing', completed: 0, total: 1, percent: 0 });
    const written = this.writeOutline(doc, nodes);
    onProgress?.({ phase: 'writing', completed: 1, total: 1, percent: 100 });

    notices.push(
      written > 0
        ? { kind: 'outline-written', count: written }
        : { kind: 'outline-cleared' }
    );

    const bytes = await doc.save({ useObjectStreams: false });
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const file = new File([blob], outputName, { type: 'application/pdf' });

    return {
      name: outputName,
      file,
      blob,
      sizeBytes: file.size,
      pageCount,
      notices,
      bookmarkCount: written
    };
  }

  /** True when the document already declares an outline. */
  hasOutline(doc: PDFDocument): boolean {
    try {
      return doc.catalog.get(PDFName.of('Outlines')) !== undefined;
    } catch {
      return false;
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // Generating from headings
  // ════════════════════════════════════════════════════════════════════

  /**
   * Ranks text runs by font size and calls the large ones headings.
   *
   * This is a heuristic and the UI says so. A PDF carries no heading
   * structure — there is no `<h1>` — so the only signal available without a
   * tagged document is that headings are set larger than body text. Lines are
   * grouped by their y position, the most common size in the document is
   * taken as the body, and anything clearly bigger becomes a candidate.
   */
  scanHeadings(
    runs: Array<{ text: string; fontSize: number; pageIndex: number; y: number }>,
    options: HeadingScanOptions = defaultHeadingScanOptions()
  ): HeadingCandidate[] {
    if (runs.length === 0) return [];

    /* Group runs that sit on the same line of the same page. */
    const lines = new Map<string, { text: string[]; fontSize: number; pageIndex: number }>();
    for (const run of runs) {
      const text = run.text.trim();
      if (text.length === 0) continue;
      const key = `${run.pageIndex}:${Math.round(run.y)}`;
      const line = lines.get(key);
      if (line) {
        line.text.push(text);
        line.fontSize = Math.max(line.fontSize, run.fontSize);
      } else {
        lines.set(key, { text: [text], fontSize: run.fontSize, pageIndex: run.pageIndex });
      }
    }

    const entries = [...lines.values()].map(line => ({
      text: line.text.join(' ').replace(/\s+/g, ' ').trim(),
      fontSize: line.fontSize,
      pageIndex: line.pageIndex
    }));
    if (entries.length === 0) return [];

    /* The body size is the one the most lines are set in. */
    const histogram = new Map<number, number>();
    for (const entry of entries) {
      const bucket = Math.round(entry.fontSize * 2) / 2;
      histogram.set(bucket, (histogram.get(bucket) ?? 0) + 1);
    }
    let bodySize = 0;
    let bodyLines = -1;
    for (const [size, count] of histogram) {
      if (count > bodyLines || (count === bodyLines && size < bodySize)) {
        bodySize = size;
        bodyLines = count;
      }
    }

    const threshold = bodySize * options.minSizeRatio;
    const candidates = entries.filter(
      entry =>
        entry.fontSize >= threshold &&
        entry.text.length > 0 &&
        entry.text.length <= options.maxTitleLength
    );
    if (candidates.length === 0) return [];

    /* Distinct heading sizes, largest first, become levels 1, 2, 3… */
    const sizes: number[] = [];
    for (const candidate of [...candidates].sort((a, b) => b.fontSize - a.fontSize)) {
      const matched = sizes.find(
        size => Math.abs(size - candidate.fontSize) / size <= options.sizeTolerance
      );
      if (matched === undefined) sizes.push(candidate.fontSize);
    }

    const levelOf = (fontSize: number): number => {
      const index = sizes.findIndex(
        size => Math.abs(size - fontSize) / size <= options.sizeTolerance
      );
      return index < 0 ? sizes.length : index + 1;
    };

    return candidates
      .map(candidate => ({
        text: candidate.text,
        pageIndex: candidate.pageIndex,
        fontSize: candidate.fontSize,
        level: levelOf(candidate.fontSize)
      }))
      .filter(candidate => candidate.level <= options.maxLevels);
  }

  /**
   * Turns a flat list of ranked headings into a nested tree.
   *
   * A heading nests under the nearest preceding heading of a smaller level. A
   * document that starts at level 2 is not an error — its first entries simply
   * sit at the root.
   */
  headingsToTree(headings: HeadingCandidate[]): OutlineNode[] {
    const root: OutlineNode[] = [];
    const stack: Array<{ level: number; node: OutlineNode }> = [];

    for (const heading of headings) {
      const node: OutlineNode = {
        id: newId(),
        title: heading.text,
        pageIndex: heading.pageIndex,
        children: []
      };

      while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
        stack.pop();
      }

      if (stack.length === 0) {
        root.push(node);
      } else {
        stack[stack.length - 1].node.children.push(node);
      }
      stack.push({ level: heading.level, node });
    }

    return root;
  }

  /**
   * Reads the document's text and generates an outline from it.
   *
   * Falls back with a notice rather than a guess: a document with no text
   * layer gets `no-text-layer`, one whose text is all the same size gets
   * `no-headings-found`, and neither produces a tree.
   */
  async generateFromHeadings(
    buffer: ArrayBuffer,
    options: HeadingScanOptions = defaultHeadingScanOptions(),
    callbacks?: { onProgress?: (p: NavigationProgress) => void; signal?: AbortSignal }
  ): Promise<{ nodes: OutlineNode[]; notices: OutlineNotice[] }> {
    const notices: OutlineNotice[] = [];
    const pdfjsLib = await import('pdfjs-dist');
    const task = pdfjsLib.getDocument({
      data: new Uint8Array(buffer.slice(0))
    } as Parameters<typeof pdfjsLib.getDocument>[0]);
    const pdf = await task.promise;

    try {
      const runs: Array<{ text: string; fontSize: number; pageIndex: number; y: number }> = [];
      const total = pdf.numPages;

      for (let pageNumber = 1; pageNumber <= total; pageNumber++) {
        if (callbacks?.signal?.aborted) throw new Error('Heading scan cancelled by user.');

        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();

        for (const item of content.items) {
          if (!('str' in item)) continue;
          const text = item.str;
          if (!text || text.trim().length === 0) continue;

          /*
           * The transform's vertical scale is the rendered font size — the
           * `height` field is the glyph box and is 0 for some producers.
           */
          const transform = item.transform as number[];
          const fontSize = Math.abs(transform?.[3] ?? item.height ?? 0) || item.height || 0;
          if (fontSize <= 0) continue;

          runs.push({
            text,
            fontSize,
            pageIndex: pageNumber - 1,
            y: transform?.[5] ?? 0
          });
        }

        callbacks?.onProgress?.({
          phase: 'scanning',
          completed: pageNumber,
          total,
          percent: Math.round((pageNumber / total) * 100)
        });
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      if (runs.length === 0) {
        notices.push({ kind: 'no-text-layer' });
        return { nodes: [], notices };
      }

      const headings = this.scanHeadings(runs, options);
      if (headings.length === 0) {
        notices.push({ kind: 'no-headings-found' });
        return { nodes: [], notices };
      }

      notices.push({ kind: 'generated-from-headings', count: headings.length });
      return { nodes: this.headingsToTree(headings), notices };
    } finally {
      try {
        await task.destroy();
      } catch {
        // See readOutline.
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // Tree editing — pure, so the screen holds no tree logic
  // ════════════════════════════════════════════════════════════════════

  /** A deep copy, so an edit never mutates the tree a view is rendering. */
  clone(nodes: OutlineNode[]): OutlineNode[] {
    return nodes.map(node => ({ ...node, children: this.clone(node.children) }));
  }

  /** Finds a node and the list it belongs to. */
  private locate(
    nodes: OutlineNode[],
    id: string,
    depth = 0
  ): { list: OutlineNode[]; index: number; node: OutlineNode } | undefined {
    if (depth > this.MAX_DEPTH) return undefined;
    for (let index = 0; index < nodes.length; index++) {
      if (nodes[index].id === id) return { list: nodes, index, node: nodes[index] };
      const found = this.locate(nodes[index].children, id, depth + 1);
      if (found) return found;
    }
    return undefined;
  }

  addNode(
    nodes: OutlineNode[],
    title: string,
    pageIndex: number,
    afterId?: string
  ): OutlineNode[] {
    const next = this.clone(nodes);
    const node: OutlineNode = { id: newId(), title, pageIndex, children: [] };

    if (!afterId) {
      next.push(node);
      return next;
    }

    const found = this.locate(next, afterId);
    if (!found) {
      next.push(node);
      return next;
    }

    found.list.splice(found.index + 1, 0, node);
    return next;
  }

  updateNode(nodes: OutlineNode[], id: string, patch: Partial<OutlineNode>): OutlineNode[] {
    const next = this.clone(nodes);
    const found = this.locate(next, id);
    if (found) Object.assign(found.node, patch);
    return next;
  }

  /** Removes a node and everything under it. */
  removeNode(nodes: OutlineNode[], id: string): OutlineNode[] {
    const next = this.clone(nodes);
    const found = this.locate(next, id);
    if (found) found.list.splice(found.index, 1);
    return next;
  }

  /** Moves a node up or down among its own siblings. */
  moveNode(nodes: OutlineNode[], id: string, delta: number): OutlineNode[] {
    const next = this.clone(nodes);
    const found = this.locate(next, id);
    if (!found) return next;

    const target = found.index + delta;
    if (target < 0 || target >= found.list.length) return next;

    const [moved] = found.list.splice(found.index, 1);
    found.list.splice(target, 0, moved);
    return next;
  }

  /**
   * Nests a node under the sibling above it.
   *
   * The first item in a list has nothing to nest under, so indenting it is a
   * no-op rather than an error.
   */
  indentNode(nodes: OutlineNode[], id: string): OutlineNode[] {
    const next = this.clone(nodes);
    const found = this.locate(next, id);
    if (!found || found.index === 0) return next;

    const parent = found.list[found.index - 1];
    const depth = this.depthOf(next, parent.id);
    if (depth >= this.MAX_DEPTH - 1) return next;

    const [moved] = found.list.splice(found.index, 1);
    parent.children.push(moved);
    parent.collapsed = false;
    return next;
  }

  /** Lifts a node out to sit after its parent. */
  outdentNode(nodes: OutlineNode[], id: string): OutlineNode[] {
    const next = this.clone(nodes);
    const parentInfo = this.parentOf(next, id);
    if (!parentInfo) return next;

    const found = this.locate(next, id);
    if (!found) return next;

    const grandparentList = parentInfo.list;
    const parentIndex = parentInfo.index;

    const [moved] = found.list.splice(found.index, 1);
    grandparentList.splice(parentIndex + 1, 0, moved);
    return next;
  }

  /** The list and index of a node's parent, or undefined at the root. */
  private parentOf(
    nodes: OutlineNode[],
    id: string,
    list: OutlineNode[] = nodes,
    depth = 0
  ): { list: OutlineNode[]; index: number; node: OutlineNode } | undefined {
    if (depth > this.MAX_DEPTH) return undefined;
    for (let index = 0; index < list.length; index++) {
      const node = list[index];
      if (node.children.some(child => child.id === id)) {
        return { list, index, node };
      }
      const found = this.parentOf(nodes, id, node.children, depth + 1);
      if (found) return found;
    }
    return undefined;
  }

  /** How deep a node sits. 0 is the root level. */
  depthOf(nodes: OutlineNode[], id: string): number {
    const entry = this.flatten(nodes).find(item => item.node.id === id);
    return entry?.depth ?? 0;
  }

  /** Reads a /Dest array's page, for the low-level round-trip assertions. */
  destinationPageRef(item: PDFDict): PDFRef | undefined {
    const dest = item.lookupMaybe(PDFName.of('Dest'), PDFArray);
    if (!dest || dest.size() === 0) return undefined;
    const first = dest.get(0);
    return first instanceof PDFRef ? first : undefined;
  }

  /** Reads an item's title, whichever string flavour it was written as. */
  titleOf(item: PDFDict): string | undefined {
    const value = item.get(PDFName.of('Title'));
    if (value instanceof PDFString || value instanceof PDFHexString) {
      try {
        return value.decodeText();
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}
