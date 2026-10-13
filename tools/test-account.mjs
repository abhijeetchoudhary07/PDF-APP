import { chromium } from '@playwright/test';

async function test() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => consoleLogs.push(`[PAGE_ERROR] ${err.message}`));

  await page.goto('http://localhost:4173/account', { waitUntil: 'networkidle' });
  const skipBtn = page.locator('.skip-btn');
  if (await skipBtn.isVisible()) await skipBtn.click();

  // Try to sign in or see account page
  console.log('Account page buttons:', await page.$$eval('button', btns => btns.map(b => b.innerText)));
  
  // Fill email and password to test sign in
  await page.locator('input[type="email"]').fill('test@example.com');
  await page.locator('input[type="password"]').fill('Password123!');
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(2000);

  console.log('Console logs on account sign in:', consoleLogs);
  await page.screenshot({ path: '/tmp/account-error.png', fullPage: true });

  await browser.close();
}

test().catch(console.error);
