const { chromium } = require('playwright');
const path = require('path');
async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('http://localhost:3002', { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('text=NPR 24 Hour Program Stream', { timeout: 20000 });
  await page.getByText('NPR', { exact: false }).first().click();
  await page.waitForTimeout(3000);
  const screenshotPath = path.join('C:/Users/user/project/radio-trans', 'radio-waveform.png');
  await page.screenshot({ path: screenshotPath });
  await browser.close();
  console.log('Done. Saved to:', screenshotPath);
}
run().catch(console.error);
