import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { createReadStream, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';

const PORT = 5188;
const ROOT = resolve('www');
const ARTIFACT_DIR = '/Users/abhijeetchoudhary/.gemini/antigravity/brain/ef385a5d-1874-4723-ab6c-15d3f9bc78be';
const SCREENSHOT_DIR = resolve('screenshots/admob');

if (!existsSync(SCREENSHOT_DIR)) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
}
if (!existsSync(ARTIFACT_DIR)) {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

// Start static server
const server = createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/') url = '/index.html';
  let filePath = join(ROOT, url);

  if (!existsSync(filePath) || url.indexOf('.') === -1) {
    filePath = join(ROOT, 'index.html');
  }

  const ext = extname(filePath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  createReadStream(filePath).pipe(res);
});

server.listen(PORT, async () => {
  console.log(`Server listening on http://localhost:${PORT}`);

  try {
    const browser = await chromium.launch({
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true
    });

    // 1. Mobile Portrait view (390 x 844)
    const contextMobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });

    await contextMobile.addInitScript(() => {
      localStorage.setItem('IFH_ONBOARDING_COMPLETED_V1', 'true');
      localStorage.setItem('CapacitorStorage.IFH_ONBOARDING_COMPLETED_V1', 'true');
    });

    const pageMobile = await contextMobile.newPage();
    await pageMobile.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

    // Ensure onboarding backdrop is dismissed if still rendered
    const skipBtn = pageMobile.locator('button.skip-btn');
    if (await skipBtn.count() > 0) {
      await skipBtn.first().click().catch(() => {});
      await pageMobile.waitForTimeout(500);
    }

    // Wait for the ad banner to be visible
    await pageMobile.waitForSelector('aside.admob-banner-container', { state: 'visible', timeout: 10000 });
    await pageMobile.waitForTimeout(1000);

    const mobileHomePath = join(SCREENSHOT_DIR, 'admob-mobile-home.png');
    await pageMobile.screenshot({ path: mobileHomePath, fullPage: false });
    console.log(`Saved: ${mobileHomePath}`);

    // Banner close-up
    const bannerElement = pageMobile.locator('aside.admob-banner-container');
    if (await bannerElement.count() > 0) {
      const closeupPath = join(SCREENSHOT_DIR, 'admob-banner-closeup.png');
      await bannerElement.screenshot({ path: closeupPath });
      console.log(`Saved: ${closeupPath}`);
    }

    // Tool page: Compress PDF view with Ad Banner
    await pageMobile.goto(`http://localhost:${PORT}/compress`, { waitUntil: 'networkidle' });
    await pageMobile.waitForSelector('aside.admob-banner-container', { state: 'visible', timeout: 10000 });
    await pageMobile.waitForTimeout(1000);

    const mobileToolPath = join(SCREENSHOT_DIR, 'admob-mobile-tool.png');
    await pageMobile.screenshot({ path: mobileToolPath, fullPage: false });
    console.log(`Saved: ${mobileToolPath}`);

    // 2. Desktop / Tablet View (768 x 900)
    const contextDesktop = await browser.newContext({
      viewport: { width: 768, height: 900 },
      deviceScaleFactor: 2,
    });
    await contextDesktop.addInitScript(() => {
      localStorage.setItem('IFH_ONBOARDING_COMPLETED_V1', 'true');
      localStorage.setItem('CapacitorStorage.IFH_ONBOARDING_COMPLETED_V1', 'true');
    });

    const pageDesktop = await contextDesktop.newPage();
    await pageDesktop.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
    const skipBtnDesk = pageDesktop.locator('button.skip-btn');
    if (await skipBtnDesk.count() > 0) {
      await skipBtnDesk.first().click().catch(() => {});
      await pageDesktop.waitForTimeout(500);
    }
    await pageDesktop.waitForSelector('aside.admob-banner-container', { state: 'visible', timeout: 10000 });
    await pageDesktop.waitForTimeout(1000);

    const desktopPath = join(SCREENSHOT_DIR, 'admob-desktop-home.png');
    await pageDesktop.screenshot({ path: desktopPath, fullPage: false });
    console.log(`Saved: ${desktopPath}`);

    await browser.close();

    // Copy to artifact directory so Antigravity can embed and render them
    for (const name of [
      'admob-mobile-home.png',
      'admob-mobile-tool.png',
      'admob-banner-closeup.png',
      'admob-desktop-home.png'
    ]) {
      const src = join(SCREENSHOT_DIR, name);
      if (existsSync(src)) {
        const dest = join(ARTIFACT_DIR, name);
        copyFileSync(src, dest);
        console.log(`Copied to artifact dir: ${dest}`);
      }
    }

    console.log('All screenshots captured successfully!');
  } catch (err) {
    console.error('Error during screenshot capture:', err);
  } finally {
    server.close();
    process.exit(0);
  }
});
