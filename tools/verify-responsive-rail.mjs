import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const ARTIFACT_DIR = '/Users/abhijeetchoudhary/.gemini/antigravity/brain/89d5e8b7-41d6-4540-9a2b-225e9b47ccc9';
if (!existsSync(ARTIFACT_DIR)) {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
}

async function preparePage(page) {
  await page.addInitScript(() => {
    localStorage.setItem('IFH_ONBOARDING_COMPLETED_V1', 'true');
    localStorage.setItem('_cap_IFH_ONBOARDING_COMPLETED_V1', 'true');
    localStorage.setItem('hasCompletedOnboarding', 'true');
    localStorage.setItem('hasSeenOrganizerIntro', 'true');
  });
}

async function dismissOnboardingIfPresent(page) {
  try {
    const skipBtn = page.locator('.onboarding-dialog .skip-btn');
    if (await skipBtn.isVisible({ timeout: 500 })) {
      await skipBtn.click();
      await page.waitForTimeout(300);
    }
  } catch {}
}

async function runVerification() {
  console.log('🚀 Starting R0 Responsive UI & Auto-Sliding Rail Verification...');
  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { width: 320, height: 600, name: '320_small_mobile' },
    { width: 360, height: 780, name: '360_standard_mobile' },
    { width: 390, height: 844, name: '390_iphone' },
    { width: 412, height: 915, name: '412_pixel' },
    { width: 768, height: 1024, name: '768_tablet' },
    { width: 1180, height: 820, name: '1180_laptop' },
    { width: 1440, height: 900, name: '1440_desktop' }
  ];

  // 1. Viewport verification: No horizontal scroll & touch targets
  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      hasTouch: vp.width <= 768,
      isMobile: vp.width <= 768
    });
    const page = await context.newPage();
    await preparePage(page);

    await page.goto('http://localhost:4173/home', { waitUntil: 'networkidle' });
    await dismissOnboardingIfPresent(page);
    await page.waitForTimeout(400);

    // Verify zero horizontal scroll
    const scrollInfo = await page.evaluate(() => {
      const docEl = document.documentElement;
      const body = document.body;
      return {
        docScrollWidth: docEl.scrollWidth,
        docClientWidth: docEl.clientWidth,
        bodyScrollWidth: body.scrollWidth,
        bodyClientWidth: body.clientWidth,
        hasHorizontalScroll: docEl.scrollWidth > docEl.clientWidth || body.scrollWidth > body.clientWidth
      };
    });

    console.log(`[Viewport ${vp.width}x${vp.height} (${vp.name})] Horizontal Scroll: ${scrollInfo.hasHorizontalScroll ? 'FAIL ❌' : 'PASS ✅'} (doc: ${scrollInfo.docClientWidth}/${scrollInfo.docScrollWidth})`);

    // On mobile viewports (<=960px), check rail existence and visibility
    if (vp.width <= 960) {
      const railVisible = await page.isVisible('.header-nav-rail-wrap');
      const railItemsCount = await page.locator('.rail-item').count();
      console.log(`[Viewport ${vp.width}] Rail wrap visible: ${railVisible ? '✅' : '❌'}, Rail items count: ${railItemsCount} (Expected: 7)`);

      // Touch target verification on mobile (<=768px)
      if (vp.width <= 768) {
        const touchTargets = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('.back-btn, .search-trigger-btn, .mobile-menu-btn, .rail-item'));
          return buttons.map(b => {
            const rect = b.getBoundingClientRect();
            return {
              tag: b.tagName,
              class: b.className,
              width: rect.width,
              height: rect.height,
              meetsTouchTarget: rect.height >= 43.5
            };
          });
        });

        const failing = touchTargets.filter(t => !t.meetsTouchTarget);
        if (failing.length > 0) {
          console.log(`⚠️ Small touch targets on ${vp.width}px:`, failing.slice(0, 3));
        } else {
          console.log(`[Viewport ${vp.width}] Touch targets >=44px floor: PASS ✅ (${touchTargets.length} controls tested)`);
        }
      }
    }

    await context.close();
  }

  // 2. Auto-sliding Header Rail Animation & Gliding Verification
  console.log('\n--- Testing Auto-Sliding Rail Gliding & Interaction ---');
  {
    const context = await browser.newContext({
      viewport: { width: 360, height: 780 },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true
    });
    const page = await context.newPage();
    await preparePage(page);

    await page.goto('http://localhost:4173/home', { waitUntil: 'networkidle' });
    await dismissOnboardingIfPresent(page);

    // Initial scroll position of rail
    const initialScroll = await page.evaluate(() => {
      const rail = document.querySelector('.header-nav-rail');
      return rail ? rail.scrollLeft : 0;
    });

    // edgePauseDuration is 1200ms; wait 3000ms so it completes edge pause and glides forward
    await page.waitForTimeout(3000);

    const glidedScroll = await page.evaluate(() => {
      const rail = document.querySelector('.header-nav-rail');
      return rail ? rail.scrollLeft : 0;
    });

    console.log(`Rail scroll position: Initial = ${initialScroll}px, After auto-glide = ${glidedScroll}px`);
    const autoScrollWorking = glidedScroll > initialScroll + 10;
    console.log(`Auto-glide left-to-right: ${autoScrollWorking ? 'PASS ✅' : 'FAIL ❌'} (${glidedScroll.toFixed(1)}px glided)`);

    // Test pause on touch interaction
    await page.dispatchEvent('.header-nav-rail', 'touchstart');
    await page.waitForTimeout(100);
    const scrollAtTouch = await page.evaluate(() => {
      const rail = document.querySelector('.header-nav-rail');
      return rail ? rail.scrollLeft : 0;
    });

    await page.waitForTimeout(800);
    const scrollAfterPause = await page.evaluate(() => {
      const rail = document.querySelector('.header-nav-rail');
      return rail ? rail.scrollLeft : 0;
    });

    const isPaused = Math.abs(scrollAfterPause - scrollAtTouch) <= 2;
    console.log(`Pause on touch: ${isPaused ? 'PASS ✅' : 'FAIL ❌'} (at touch: ${scrollAtTouch.toFixed(1)}px, after pause: ${scrollAfterPause.toFixed(1)}px)`);

    await context.close();
  }

  // 3. Screenshots Capture
  console.log('\n--- Capturing High-DPI Screenshots ---');

  // Screenshot 1: Mobile 360px Home with Auto-Sliding Rail
  {
    const context = await browser.newContext({
      viewport: { width: 360, height: 780 },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true
    });
    const page = await context.newPage();
    await preparePage(page);
    await page.goto('http://localhost:4173/home', { waitUntil: 'networkidle' });
    await dismissOnboardingIfPresent(page);
    await page.waitForTimeout(600);
    const path1 = resolve(ARTIFACT_DIR, 'mobile_r0_header_rail_360.png');
    await page.screenshot({ path: path1, fullPage: false });
    console.log(`Saved screenshot 1: ${path1}`);
    await context.close();
  }

  // Screenshot 2: Mobile 390px iPhone Home (fluid controls & grid)
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true
    });
    const page = await context.newPage();
    await preparePage(page);
    await page.goto('http://localhost:4173/home', { waitUntil: 'networkidle' });
    await dismissOnboardingIfPresent(page);
    await page.waitForTimeout(600);
    const path2 = resolve(ARTIFACT_DIR, 'mobile_r0_header_rail_390.png');
    await page.screenshot({ path: path2, fullPage: false });
    console.log(`Saved screenshot 2: ${path2}`);
    await context.close();
  }

  // Screenshot 3: Active Route Rail on PDF Dashboard (/features/pdf)
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true
    });
    const page = await context.newPage();
    await preparePage(page);
    await page.goto('http://localhost:4173/features/pdf', { waitUntil: 'networkidle' });
    await dismissOnboardingIfPresent(page);
    await page.waitForTimeout(800);
    const path3 = resolve(ARTIFACT_DIR, 'mobile_r0_active_pdf_route_390.png');
    await page.screenshot({ path: path3, fullPage: false });
    console.log(`Saved screenshot 3: ${path3}`);
    await context.close();
  }

  // Screenshot 4: 200% Font Scale at 360px (User Zoom / Accessibility resilience)
  {
    const context = await browser.newContext({
      viewport: { width: 360, height: 780 },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true
    });
    const page = await context.newPage();
    await preparePage(page);
    await page.goto('http://localhost:4173/home', { waitUntil: 'networkidle' });
    await dismissOnboardingIfPresent(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    await page.waitForTimeout(500);
    const path4 = resolve(ARTIFACT_DIR, 'mobile_r0_font_scale_200.png');
    await page.screenshot({ path: path4, fullPage: false });
    console.log(`Saved screenshot 4: ${path4}`);
    await context.close();
  }

  // Screenshot 5: Mobile Drawer Menu (opened from hamburger)
  {
    const context = await browser.newContext({
      viewport: { width: 360, height: 780 },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true
    });
    const page = await context.newPage();
    await preparePage(page);
    await page.goto('http://localhost:4173/home', { waitUntil: 'networkidle' });
    await dismissOnboardingIfPresent(page);
    await page.waitForTimeout(400);
    await page.locator('.mobile-menu-btn').click();
    await page.waitForTimeout(400);
    const path5 = resolve(ARTIFACT_DIR, 'mobile_r0_drawer_menu_360.png');
    await page.screenshot({ path: path5, fullPage: false });
    console.log(`Saved screenshot 5: ${path5}`);
    await context.close();
  }

  // Screenshot 6: Desktop 1440px Viewport (Full nav, mega menu, search, pro chip)
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2
    });
    const page = await context.newPage();
    await preparePage(page);
    await page.goto('http://localhost:4173/home', { waitUntil: 'networkidle' });
    await dismissOnboardingIfPresent(page);
    await page.waitForTimeout(600);
    const path6 = resolve(ARTIFACT_DIR, 'desktop_r0_header_1440.png');
    await page.screenshot({ path: path6, fullPage: false });
    console.log(`Saved screenshot 6: ${path6}`);
    await context.close();
  }

  await browser.close();
  console.log('🎉 Verification and screenshot capture complete!');
}

runVerification().catch(err => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
