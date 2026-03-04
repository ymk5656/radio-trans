const { chromium } = require('playwright');

async function runTests() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const screenshotDir = process.cwd();

  try {
    await page.goto('http://localhost:3002', { waitUntil: 'networkidle', timeout: 15000 });
    await page.screenshot({ path: screenshotDir + '/radio-trans-initial.png' });
    console.log('Screenshot saved: radio-trans-initial.png');

    const channelItems = await page.locator('[data-testid=channel-item], button').count();
    console.log('Total buttons/items:', channelItems);

    const sidebarText = await page.locator('.flex-1.overflow-y-auto').first().innerText().catch(() => 'N/A');
    console.log('Sidebar content:', sidebarText.substring(0, 500));

    const title = await page.title();
    console.log('Title:', title);

    const bodyText = await page.locator('body').innerText();
    console.log('Has NPR:', bodyText.includes('NPR'));
    console.log('Has KBS:', bodyText.includes('KBS'));
    console.log('Has MBC:', bodyText.includes('MBC'));
    console.log('Has SBS:', bodyText.includes('SBS'));
    console.log('Has EBS:', bodyText.includes('EBS'));
    console.log('Has KCRW:', bodyText.includes('KCRW'));
    console.log('Has WFMU:', bodyText.includes('WFMU'));
    console.log('Has Classic FM:', bodyText.includes('Classic FM'));

    const nprButton = page.getByText('NPR', { exact: false }).first();
    if (await nprButton.count() > 0) {
      await nprButton.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: screenshotDir + '/radio-trans-npr-selected.png' });
      console.log('Clicked NPR, screenshot saved: radio-trans-npr-selected.png');
      const playerText = await page.locator('.flex-1.flex.flex-col').first().innerText().catch(() => 'N/A');
      console.log('Player area after click:', playerText.substring(0, 300));
    }

    console.log('Full body text (first 1000 chars):');
    console.log(bodyText.substring(0, 1000));

  } catch (err) {
    console.error('Error:', err.message);
    await page.screenshot({ path: screenshotDir + '/radio-trans-error.png' }).catch(() => {});
  } finally {
    await browser.close();
  }
}

runTests();