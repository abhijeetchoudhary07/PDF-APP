import * as pdfjsLib from 'pdfjs-dist';

/**
 * Points pdf.js at the worker that ships inside the app.
 *
 * Every service that opens a PDF used to set `workerSrc` itself, to a
 * `cdnjs.cloudflare.com` URL built from `pdfjsLib.version`. That had three
 * problems, and the first is the one that matters:
 *
 *  1. **It needed the internet.** This app's whole premise is that documents
 *     never leave the device, and people use it on trains and in queues
 *     outside exam centres. Fetching the worker from a CDN meant every PDF
 *     feature — open, render, merge, OCR, compare, repair — silently required
 *     a network round trip before it could do anything. Offline, or on a
 *     hostile network, the file dialog accepted the PDF and then nothing
 *     happened.
 *  2. **A Capacitor build has no origin to fall back on.** The Android WebView
 *     refuses mixed content (`allowMixedContent: false`), and a remote module
 *     script is exactly the kind of thing a stricter WebView or a future CSP
 *     will block.
 *  3. **Ten copies drift.** Eight services guarded the assignment with
 *     `if (!GlobalWorkerOptions.workerSrc)` and two set it unconditionally, so
 *     which URL won depended on module evaluation order.
 *
 * Importing this module for its side effect fixes all three: the worker is
 * copied into `assets/pdfjs/` at build time (see `angular.json`), so the
 * version can never disagree with the installed `pdfjs-dist`, and nothing is
 * fetched from a third party.
 */
const WORKER_PATH = 'assets/pdfjs/pdf.worker.min.mjs';

/**
 * Resolved against the document base, not left relative.
 *
 * pdf.js hands `workerSrc` to the Worker constructor, which resolves a
 * relative path against the *current URL* rather than the app's base. On a
 * tool route two segments deep that turns into
 * `/features/pdf/assets/pdfjs/...`, which 404s — and because the app is a
 * single-page app the 404 returns index.html, so the failure surfaces as a
 * syntax error inside the worker rather than as a missing file.
 */
function resolveWorkerSrc(): string {
  if (typeof document === 'undefined' || !document.baseURI) {
    return WORKER_PATH;
  }
  try {
    return new URL(WORKER_PATH, document.baseURI).href;
  } catch {
    return WORKER_PATH;
  }
}

/**
 * Only set when pdf.js has not already chosen a worker.
 *
 * The guard is not defensive tidiness, it is what keeps the unit suite
 * working. Under Node, pdf.js falls back to a "fake worker" that `import()`s
 * `workerSrc`, and Node's ESM loader accepts only `file:` and `data:` URLs —
 * so *any* http(s) value, the old CDN one included, fails with "Setting up
 * fake worker failed". Left alone, pdf.js resolves its own bundled worker
 * through the package and works fine.
 *
 * In a browser `workerSrc` starts empty, so the app still gets the bundled
 * asset. Making the assignment unconditional broke
 * `pdf-analysis.spec.ts` exactly this way, which is how the guard earned its
 * place back.
 */
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = resolveWorkerSrc();
}

export { WORKER_PATH };
