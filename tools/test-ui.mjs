import { chromium } from '@playwright/test';

async function test() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => consoleLogs.push(`[PAGE_ERROR] ${err.message}`));

  console.log('Navigating to http://localhost:4173/features/premium...');
  await page.goto('http://localhost:4173/features/premium', { waitUntil: 'networkidle' });

  // Dismiss onboarding if present
  const skipBtn = page.locator('.skip-btn');
  if (await skipBtn.isVisible()) {
    console.log('Dismissing onboarding modal...');
    await skipBtn.click();
    await page.waitForTimeout(500);
  }

  // Take screenshot of desktop premium page
  await page.screenshot({ path: '/tmp/premium-desktop-dismissed.png', fullPage: true });

  // Now click the first choose/pay button
  const chooseBtn = page.locator('.pricing-card app-button button').first();
  if (await chooseBtn.count() > 0) {
    const btnText = await chooseBtn.innerText();
    console.log('Clicking button:', btnText);
    await chooseBtn.click();
    await page.waitForTimeout(1500);
  }

  console.log('Current URL after click:', page.url());
  console.log('Console logs after click:', consoleLogs);
  await page.screenshot({ path: '/tmp/after-click.png', fullPage: true });

  await browser.close();
}

test().catch(console.error);
