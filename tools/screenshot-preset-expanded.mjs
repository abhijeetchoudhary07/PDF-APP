import { chromium } from '@playwright/test';

async function test() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  await page.goto('http://localhost:4173/features/presets', { waitUntil: 'networkidle' });
  const skipBtn = page.locator('.skip-btn');
  if (await skipBtn.isVisible()) await skipBtn.click();

  const addBtn = page.locator('.preset-actions button, app-button button').filter({ hasText: /Preset|New|Custom/i }).first();
  if (await addBtn.isVisible()) {
    await addBtn.click();
    await page.waitForTimeout(500);
  }

  // Toggle photo requirements
  await page.locator('.switch input').first().click();
  await page.waitForTimeout(500);

  await page.screenshot({ path: '/tmp/preset-modal-expanded-mobile-before.png' });
  console.log('Saved expanded screenshot');

  await browser.close();
}

test().catch(console.error);
