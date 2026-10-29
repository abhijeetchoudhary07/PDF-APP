import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(PROJECT_ROOT, 'docs', 'screenshots', 'responsive');
const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

const WIDTHS = [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 768, height: 1024 },
  { width: 1180, height: 820 },
  { width: 1440, height: 900 }
];

const SCREENS = [
  { id: 'home', name: 'Home', url: '/home' },
  { id: 'pdf-studio', name: 'PDF Studio', url: '/features/pdf' },
  { id: 'organizer', name: 'Organizer', url: '/features/pdf/organize' },
  { id: 'converter', name: 'Converter', url: '/features/pdf/conversion/pdf-to-png' },
  { id: 'modal', name: 'Modal', url: '/features/presets', isModal: true },
  { id: 'header-rail', name: 'Header Rail', url: '/home', isRail: true }
];

const FIXED_SESSION = {
  accessToken: 'demo-token-123',
  refreshToken: 'demo-refresh-123',
  syncedAt: 1729000000000,
  user: {
    id: 'usr_responsive_demo',
    email: 'responsive@example.com',
    displayName: 'Demo User',
    authProvider: 'email',
    isActive: true,
    isVerified: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    lastLoginAt: '2026-10-01T00:00:00.000Z',
  },
  entitlement: {
    isPremium: true,
    planId: 'pro_monthly',
    status: 'active',
    validUntil: null,
    platform: 'play_store',
    daysRemaining: 30,
  },
};

function checkServerReady(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureServerRunning() {
  const ready = await checkServerReady(`${BASE_URL}/index.html`);
  if (ready) {
    console.log(`Static server already running at ${BASE_URL}`);
    return null;
  }

  console.log(`Starting static server for www/ on port ${PORT}...`);
  const serverProc = spawn('node', [path.join(PROJECT_ROOT, 'tools', 'serve-www.mjs'), String(PORT)], {
    cwd: PROJECT_ROOT,
    stdio: 'ignore'
  });

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 400));
    if (await checkServerReady(`${BASE_URL}/index.html`)) {
      console.log(`Static server started successfully at ${BASE_URL}`);
      return serverProc;
    }
  }

  throw new Error(`Failed to start static server at ${BASE_URL}`);
}

async function dismissOnboarding(page) {
  try {
    const skipBtn = page.locator('.onboarding-dialog .skip-btn, button:has-text("Skip")').first();
    if (await skipBtn.isVisible({ timeout: 1200 })) {
      await skipBtn.click();
      await page.waitForTimeout(300);
    }
  } catch {}
}

async function measureTapTargets(page) {
  return page.evaluate(() => {
    const selectors = [
      'button',
      'app-button button',
      '.btn',
      '[role="button"]',
      '.nav-item',
      '.tab-btn',
      '.cat-pill',
      '.back-btn',
      '.mobile-menu-btn',
      '.search-trigger-btn',
      '.lang-trigger-btn',
      '.favorite-star-btn',
      '.modal-close-btn'
    ];

    let minDim = Infinity;
    let minW = 0;
    let minH = 0;
    let minDesc = '';

    const seen = new Set();
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        if (seen.has(el)) continue;
        seen.add(el);

        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

        // In-viewport or reasonable scroll region
        if (rect.bottom < -50 || rect.top > window.innerHeight * 2.5) continue;

        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        const dim = Math.min(w, h);

        if (dim < minDim) {
          minDim = dim;
          minW = w;
          minH = h;
          minDesc = `${el.tagName.toLowerCase()}.${Array.from(el.classList).slice(0, 2).join('.')}`;
        }
      }
    }

    return {
      minDim: minDim === Infinity ? 44 : minDim,
      width: minW,
      height: minH,
      desc: minDesc
    };
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let serverProc = null;
  try {
    serverProc = await ensureServerRunning();
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const results = [];
  let anyFailure = false;

  console.log(`\n========================================================================`);
  console.log(`CAPTURING RESPONSIVE PROOF PASS -> ${OUT_DIR}`);
  console.log(`========================================================================\n`);

  try {
    for (const vp of WIDTHS) {
      const themes = (vp.width === 360) ? ['light', 'dark', 'zoom200'] : ['light', 'dark'];

      for (const theme of themes) {
        const isZoom = theme === 'zoom200';
        const colorScheme = theme === 'dark' ? 'dark' : 'light';
        const isMobile = vp.width < 960;

        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          colorScheme,
          reducedMotion: 'reduce',
          isMobile,
          hasTouch: isMobile
        });

        const page = await context.newPage();

        // Deterministic mocks and settings
        await page.addInitScript(({ session, colorScheme, isZoom }) => {
          try {
            localStorage.setItem('CapacitorStorage.IFH_ONBOARDING_COMPLETED_V1', 'true');
            localStorage.setItem('CapacitorStorage.app_onboarding_completed_v1', 'true');
            localStorage.setItem('IFH_ONBOARDING_COMPLETED_V1', 'true');
            localStorage.setItem('CapacitorStorage.IFH_THEME_MODE', colorScheme);
            localStorage.setItem('CapacitorStorage.IFH_PDF_ACCOUNT_SESSION_V1', JSON.stringify(session));
          } catch (e) {}

          if (isZoom) {
            document.addEventListener('DOMContentLoaded', () => {
              document.documentElement.style.fontSize = '32px';
            });
          }

          // Capacitor Web fallback
          window.Capacitor = {
            isNativePlatform: () => false,
            isPluginAvailable: () => true,
            getPlatform: () => 'web',
            Plugins: {
              Preferences: {
                get: async ({ key }) => ({ value: localStorage.getItem(key) }),
                set: async ({ key, value }) => { localStorage.setItem(key, value); },
                remove: async ({ key }) => { localStorage.removeItem(key); }
              }
            }
          };
        }, { session: FIXED_SESSION, colorScheme, isZoom });

        for (const screen of SCREENS) {
          const fullUrl = `${BASE_URL}${screen.url}`;
          await page.goto(fullUrl, { waitUntil: 'networkidle' });
          await page.waitForTimeout(300);

          // Apply theme directly to DOM for 100% determinism
          await page.evaluate(({ colorScheme, isZoom }) => {
            const root = document.documentElement;
            const body = document.body;
            root.setAttribute('data-theme', colorScheme);
            if (colorScheme === 'dark') {
              body.classList.add('theme-dark');
              body.classList.remove('theme-light');
            } else {
              body.classList.add('theme-light');
              body.classList.remove('theme-dark');
            }
            if (isZoom) {
              root.style.fontSize = '32px';
            }
          }, { colorScheme, isZoom });

          await dismissOnboarding(page);
          await page.waitForTimeout(200);

          // Screen-specific actions
          if (screen.isModal) {
            const createBtn = page.locator('app-page-header app-button[variant="primary"] button, button:has-text("Custom Preset")').first();
            if (await createBtn.isVisible().catch(() => false)) {
              await createBtn.click().catch(() => {});
              await page.waitForSelector('.modal-dialog', { state: 'visible', timeout: 5000 }).catch(() => {});
              await page.waitForTimeout(300);
            }
          }

          if (screen.isRail && isMobile) {
            await page.evaluate(() => {
              const rail = document.querySelector('.header-options-rail');
              if (rail) {
                const maxScroll = rail.scrollWidth - rail.clientWidth;
                rail.scrollLeft = Math.max(40, Math.round(maxScroll * 0.45));
              }
            });
            await page.waitForTimeout(200);
          }

          // Verify horizontal overflow
          const { scrollWidth, clientWidth } = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth
          }));
          const hasOverflow = scrollWidth > clientWidth + 1;

          // Measure smallest tap target
          const target = await measureTapTargets(page);

          // Validation rules:
          // 1. No horizontal overflow on any screen/width
          // 2. Below 960px, tap target must be >= 44px
          const overflowOk = !hasOverflow;
          const targetOk = (vp.width >= 960) || (target.minDim >= 44);
          const isPassed = overflowOk && targetOk;

          if (!isPassed) {
            anyFailure = true;
          }

          // Save screenshot
          const fileName = `${screen.id}-${vp.width}-${theme}.png`;
          const filePath = path.join(OUT_DIR, fileName);
          await page.screenshot({ path: filePath, fullPage: false });

          // Also save alias if zoom200
          if (theme === 'zoom200') {
            const aliasPath = path.join(OUT_DIR, `${screen.id}-${vp.width}-zoom.png`);
            fs.copyFileSync(filePath, aliasPath);
          }

          results.push({
            width: `${vp.width}px`,
            screen: screen.id,
            theme,
            overflow: hasOverflow ? 'YES' : 'NO',
            smallest: `${target.minDim}px (${target.width}x${target.height})`,
            status: isPassed ? 'PASS' : 'FAIL'
          });

          process.stdout.write(`Captured ${fileName.padEnd(32)} -> overflow: ${hasOverflow ? 'YES' : 'NO '}, minTarget: ${target.minDim}px [${isPassed ? 'OK' : 'FAIL'}]\n`);
        }

        await context.close();
      }
    }
  } finally {
    await browser.close();
    if (serverProc) {
      serverProc.kill();
    }
  }

  // Print Summary Table
  console.log(`\n========================================================================================`);
  console.log(`RESPONSIVE PROOF PASS SUMMARY TABLE`);
  console.log(`========================================================================================`);
  console.table(results);

  const failCount = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\nTotal screenshots captured: ${results.length}`);
  console.log(`Passed: ${results.length - failCount} | Failed: ${failCount}`);

  if (anyFailure || failCount > 0) {
    console.error(`\n❌ Responsive proof pass FAILED: horizontal overflow or sub-44px tap target below 960px detected.`);
    process.exit(1);
  } else {
    console.log(`\n✅ Responsive proof pass PASSED: zero horizontal overflow, all targets >= 44px below 960px.`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error during capture-responsive:', err);
  process.exit(1);
});
