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

  // Go to photo or pdf page to test result-preview share modal or open it directly via DOM
  await page.goto('http://localhost:4173/features/presets', { waitUntil: 'networkidle' });
  const skipBtn = page.locator('.skip-btn');
  if (await skipBtn.isVisible()) await skipBtn.click();

  // Click "+ Custom Preset" button on presets page to open custom preset modal
  const addBtn = page.locator('.preset-actions button, app-button button').filter({ hasText: /Preset|New|Custom/i }).first();
  if (await addBtn.isVisible()) {
    console.log('Clicking Add Preset button...');
    await addBtn.click();
    await page.waitForTimeout(500);
  } else {
    // try finding by text
    const btn = page.getByRole('button', { name: /Preset/i });
    if (await btn.isVisible()) await btn.click();
  }

  await page.screenshot({ path: '/tmp/preset-modal-mobile-before.png' });
  console.log('Saved /tmp/preset-modal-mobile-before.png');

  await browser.close();
}

test().catch(console.error);
