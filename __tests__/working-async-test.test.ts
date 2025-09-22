import { chromium, Browser, Page } from 'playwright';

describe('Working Async Test', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  test('should work with direct async script execution', async () => {
    console.log('🧪 Testing direct async script execution...');
    
    await page.setViewportSize({ width: 1080, height: 1920 });

    // Set basic HTML
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { margin: 0; padding: 0; width: 1080px; height: 1920px; overflow: hidden; }
          </style>
        </head>
        <body>
          <div id='box' style='width:1080px;height:1920px;background:#000'></div>
        </body>
      </html>
    `);

    // Execute async script directly in page context
    await page.evaluate(async () => {
      console.log('Starting async operation...');
      const box = document.getElementById('box');
      console.log('Box found:', !!box);
      
      // Async delay
      await new Promise(resolve => {
        console.log('Starting 500ms delay...');
        setTimeout(() => {
          console.log('Delay completed');
          resolve(undefined);
        }, 500);
      });
      
      console.log('Setting background to red...');
      if (box) {
        (box as HTMLElement).style.background = 'red';
      }
      
      console.log('Setting data-ready...');
      document.body.setAttribute('data-ready', '1');
      console.log('Async operation completed!');
    });

    // Check the result
    const colorInfo = await page.evaluate(() => {
      const box = document.getElementById('box');
      if (!box) return { found: false };
      
      const computedStyle = window.getComputedStyle(box);
      const backgroundColor = computedStyle.backgroundColor;
      const inlineStyle = (box as HTMLElement).style.background;
      
      return {
        found: true,
        computedBackgroundColor: backgroundColor,
        inlineStyle: inlineStyle,
        dataReady: document.body.getAttribute('data-ready')
      };
    });

    console.log('Color info:', colorInfo);

    // Take screenshot
    const screenshotPath = `/tmp/working-test-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('Screenshot saved to:', screenshotPath);

    // Assertions
    expect(colorInfo.found).toBe(true);
    expect(colorInfo.dataReady).toBe('1');
    expect(colorInfo.inlineStyle).toBe('red');
    
    console.log('🎉 SUCCESS: Working async test passed!');
  }, 10000);
});