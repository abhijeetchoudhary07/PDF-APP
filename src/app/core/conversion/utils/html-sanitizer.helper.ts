export class HtmlSanitizerHelper {
  private static readonly DISALLOWED_TAGS = new Set([
    'script', 'noscript', 'iframe', 'frame', 'object', 'embed', 'applet',
    'meta', 'link', 'base', 'form', 'input', 'button', 'select', 'textarea'
  ]);

  private static getParser(): DOMParser {
    if (typeof DOMParser !== 'undefined') {
      return new DOMParser();
    }
    if (typeof (globalThis as any).DOMParser !== 'undefined') {
      return new (globalThis as any).DOMParser();
    }
    try {
      // In Node/test environments where DOMParser is not globally present
      const req = (typeof module !== 'undefined' && (module as any).require) || (globalThis as any).require;
      if (req) {
        const { JSDOM } = req('jsdom');
        const dom = new JSDOM();
        return new dom.window.DOMParser();
      }
    } catch {
      // fallback to error below
    }
    throw new Error('DOMParser is not available in this environment.');
  }

  /**
   * Sanitizes raw HTML string, stripping dangerous tags, event handlers, and script URLs.
   */
  static sanitize(rawHtml: string): string {
    const parser = this.getParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');

    this.cleanNode(doc.body);
    return doc.body.innerHTML;
  }

  private static cleanNode(node: Node): void {
    const toRemove: Node[] = [];

    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i];

      if (child.nodeType === 1) { // ELEMENT_NODE
        const el = child as HTMLElement;
        const tagName = el.tagName.toLowerCase();

        if (this.DISALLOWED_TAGS.has(tagName)) {
          toRemove.push(child);
          continue;
        }

        // Clean attributes: remove on*, javascript: href/src
        const attrs = Array.from(el.attributes);
        for (const attr of attrs) {
          const name = attr.name.toLowerCase();
          const val = attr.value.toLowerCase().trim();

          if (name.startsWith('on') || val.startsWith('javascript:') || val.startsWith('data:text/html')) {
            el.removeAttribute(attr.name);
          }
        }

        this.cleanNode(child);
      } else if (child.nodeType === 8) { // COMMENT_NODE
        toRemove.push(child);
      }
    }

    for (const deadNode of toRemove) {
      deadNode.parentNode?.removeChild(deadNode);
    }
  }

  /**
   * Extracts clean semantic plain text with preserved paragraphs and headings.
   */
  static extractStructuredText(rawHtml: string): string {
    const parser = this.getParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');
    this.cleanNode(doc.body);

    const paragraphs: string[] = [];
    const blockElements = doc.body.querySelectorAll('h1, h2, h3, h4, h5, h6, p, div, li, tr');

    if (blockElements.length > 0) {
      blockElements.forEach(el => {
        const text = el.textContent?.trim();
        if (text) {
          paragraphs.push(text);
        }
      });
    } else {
      const text = doc.body.textContent?.trim();
      if (text) paragraphs.push(text);
    }

    return paragraphs.join('\n\n');
  }
}
