import { chromium, devices } from '@playwright/test';

async function test() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  // Clear storage so onboarding opens
  await page.goto('http://localhost:4173/home', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/onboarding-mobile-before.png' });
  console.log('Saved /tmp/onboarding-mobile-before.png');

  await browser.close();
}

test().catch(console.error);
