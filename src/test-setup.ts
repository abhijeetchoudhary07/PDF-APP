// Polyfills for running unit tests under jsdom (the default Vitest environment).
// Ionic components such as ion-menu and ion-split-pane query `window.matchMedia`,
// which jsdom does not implement.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// Polyfill DOMParser, Node, HTMLElement for jsdom in Node environments
if (typeof (globalThis as any).DOMParser === 'undefined') {
  try {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM();
    (globalThis as any).DOMParser = dom.window.DOMParser;
    (globalThis as any).Node = dom.window.Node;
    (globalThis as any).HTMLElement = dom.window.HTMLElement;
  } catch {}
}

// Polyfill Iterator for pdfjs-dist v6 in Node 20
if (typeof (globalThis as any).Iterator === 'undefined') {
  (globalThis as any).Iterator = class {};
}

// Polyfill Promise.withResolvers for pdfjs-dist v6 in Node 20
if (typeof (Promise as any).withResolvers === 'undefined') {
  (Promise as any).withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// Polyfill Promise.try for pdfjs-dist v6 in Node 20
if (typeof (Promise as any).try === 'undefined') {
  (Promise as any).try = function <T>(fn: (...args: any[]) => T | PromiseLike<T>, ...args: any[]): Promise<T> {
    return new Promise(resolve => resolve(fn(...args)));
  };
}

// Polyfill Uint8Array.prototype.toHex for pdfjs-dist v6 in Node 20
if (typeof Uint8Array !== 'undefined' && !(Uint8Array.prototype as any).toHex) {
  (Uint8Array.prototype as any).toHex = function () {
    return Array.from(this)
      .map((b: any) => b.toString(16).padStart(2, '0'))
      .join('');
  };
}

// Polyfill Blob.prototype.arrayBuffer and text for jsdom
if (typeof Blob !== 'undefined') {
  if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function() {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(this);
      });
    };
  }
  if (!Blob.prototype.text) {
    Blob.prototype.text = function() {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsText(this);
      });
    };
  }
}

// Initialize Angular TestBed environment for Vitest
import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting
} from '@angular/platform-browser-dynamic/testing';

try {
  getTestBed().initTestEnvironment(
    BrowserDynamicTestingModule,
    platformBrowserDynamicTesting()
  );
} catch {
  // Already initialized
}

/*
 * Resolve external component resources (templateUrl / styleUrls) for tests.
 *
 * The Vitest setup compiles TypeScript directly and has no Angular resource
 * loader, so any component declared with `templateUrl` threw
 * "Failed to load <file>" / "Did you run and wait for resolveComponentResources()?"
 * the moment TestBed touched its definition. Angular exposes the resolver it
 * uses internally; pointing it at the filesystem lets component specs compile
 * the real templates instead of each spec stubbing its own.
 *
 * Template names are unique in this project, so a basename index is enough to
 * map "./home.page.html" back to a file on disk.
 */
import { ɵresolveComponentResources as resolveComponentResources } from '@angular/core';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename, resolve as resolvePath } from 'node:path';

const resourceIndex = new Map<string, string>();

function indexResources(dir: string) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      indexResources(full);
    } else if (/\.(html|css|scss)$/.test(entry)) {
      // First writer wins; names are unique here.
      if (!resourceIndex.has(entry)) resourceIndex.set(entry, full);
    }
  }
}

try {
  indexResources(resolvePath(process.cwd(), 'src'));
} catch {
  // If the index cannot be built, specs that need templates will say so.
}

/**
 * Resolve every pending component's `templateUrl` / `styleUrls` from disk.
 *
 * Call this at the start of a component spec's `beforeEach`, before
 * `TestBed.configureTestingModule`, which reads component definitions eagerly.
 */
export async function resolveAngularResources(): Promise<void> {
  await resolveComponentResources(async (url: string) => {
    const file = resourceIndex.get(basename(url));
    if (!file) return '';
    // Only templates are returned: SCSS would need a compiler, and these specs
    // assert structure and behaviour rather than styling.
    return /\.html$/.test(file) ? readFileSync(file, 'utf8') : '';
  });
}
