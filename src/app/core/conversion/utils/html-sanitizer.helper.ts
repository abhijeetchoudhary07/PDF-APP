export class HtmlSanitizerHelper {
  private static readonly DISALLOWED_TAGS = new Set([
    'script', 'noscript', 'iframe', 'frame', 'object', 'embed', 'applet',
    'meta', 'link', 'base', 'form', 'input', 'button', 'select', 'textarea',
    'style', 'svg'
  ]);

  private static readonly MAX_DEPTH = 64;

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
   * Sanitizes raw HTML string, stripping dangerous tags, event handlers, script URLs,
   * SSRF targets (cloud metadata and private RFC1918 IPs), and enforcing maximum DOM depth.
   */
  static sanitize(rawHtml: string): string {
    const parser = this.getParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');

    this.cleanNode(doc.body, 0);
    return doc.body.innerHTML;
  }

  /**
   * Checks if a URL targets local/cloud metadata or private networks (SSRF defense).
   */
  static isForbiddenUrl(url: string): boolean {
    if (!url) return false;
    const lower = url.trim().toLowerCase();

    // Block script and pseudo-protocols
    if (lower.startsWith('javascript:') || lower.startsWith('vbscript:') || lower.startsWith('file:') || lower.startsWith('ftp:')) {
      return true;
    }

    // Block AWS/GCP/Azure cloud metadata and loopbacks
    if (
      lower.includes('169.254.169.254') ||
      lower.includes('localhost') ||
      lower.includes('127.0.0.1') ||
      lower.includes('0.0.0.0') ||
      lower.includes('[::1]') ||
      lower.includes('metadata.google.internal')
    ) {
      return true;
    }

    // Block private RFC1918 IPv4 ranges (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
    if (/(?:^|\/\/)(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(?::\d+)?(?:\/|$)/i.test(lower)) {
      return true;
    }

    return false;
  }

  private static cleanNode(node: Node, depth: number = 0): void {
    if (depth > this.MAX_DEPTH) {
      // Truncate overly deep nesting to guard against call stack overflow and ReDoS
      while (node.firstChild) {
        node.removeChild(node.firstChild);
      }
      return;
    }

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

        // Clean attributes: remove on*, javascript: href/src, SSRF targets
        const attrs = Array.from(el.attributes);
        for (const attr of attrs) {
          const name = attr.name.toLowerCase();
          const val = attr.value.toLowerCase().trim();

          if (
            name.startsWith('on') ||
            val.startsWith('javascript:') ||
            val.startsWith('data:text/html') ||
            ((name === 'src' || name === 'href' || name === 'action') && this.isForbiddenUrl(val))
          ) {
            el.removeAttribute(attr.name);
          }
        }

        this.cleanNode(child, depth + 1);
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
    this.cleanNode(doc.body, 0);

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
