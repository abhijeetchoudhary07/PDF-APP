/**
 * A static server for the production bundle in `www/`.
 *
 * Why this exists rather than `ng serve`: the dev server compiles each lazy
 * route the first time something asks for it, so the first visit to a tool can
 * take tens of seconds. With the whole release suite running in parallel, those
 * compiles queue behind each other and tests fail on navigation timeouts that
 * have nothing to do with the app — the same tests pass one at a time. A
 * pre-built bundle removes the variable entirely, and it is also what actually
 * ships, so the suite ends up testing the artefact rather than a development
 * approximation of it.
 *
 * No dependencies on purpose: a test harness that needs a network install
 * before it can run is one more thing to go wrong in CI.
 *
 *   node tools/serve-www.mjs [port]
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve(process.argv[3] ?? 'www');
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 4173);

const TYPES = new Map(
  Object.entries({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.wasm': 'application/wasm',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
  }),
);

/**
 * Resolves a URL path to a file inside ROOT, or null.
 *
 * The normalise-then-prefix-check is the traversal guard: without it a request
 * for `/../../etc/passwd` is served happily, and a test server on localhost is
 * still a server.
 */
async function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const candidate = resolve(join(ROOT, normalize(decoded)));
  if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) {
    return null;
  }
  try {
    const info = await stat(candidate);
    return info.isDirectory() ? null : candidate;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const file = (await resolveFile(req.url ?? '/')) ?? join(ROOT, 'index.html');

  let info;
  try {
    info = await stat(file);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found. Run `npm run build` first.');
    return;
  }

  const isIndex = file === join(ROOT, 'index.html');

  /*
   * Everything but index.html is revalidated rather than re-sent.
   *
   * This used to be a flat `no-store`, which meant the browser re-downloaded
   * every chunk on every navigation. With the suite running fully parallel and
   * the app's chunks running to megabytes — the pdf.js worker alone is 1.2MB —
   * a few hundred navigations moved gigabytes through one Node process, and
   * tests started failing on timeouts that had nothing to do with the app.
   * Which tests failed changed from run to run, which is the signature of load
   * rather than a defect.
   *
   * `no-cache` still forces a request every time, so nothing stale is ever
   * used; the ETag just lets that request come back as an empty 304. index.html
   * keeps `no-store` outright, because serving yesterday's entry point is the
   * one failure that would be genuinely confusing.
   */
  const etag = `W/"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`;

  if (!isIndex && req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache' });
    res.end();
    return;
  }

  res.writeHead(200, {
    'Content-Type': TYPES.get(extname(file).toLowerCase()) ?? 'application/octet-stream',
    'Cache-Control': isIndex ? 'no-store' : 'no-cache',
    ...(isIndex ? {} : { ETag: etag }),
  });
  createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Serving ${ROOT} on http://localhost:${PORT}`);
});
