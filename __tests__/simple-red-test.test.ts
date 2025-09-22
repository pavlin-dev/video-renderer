import { chromium, Browser, Page } from 'playwright';

describe('Simple Red Test', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  test('should render red background immediately (no async)', async () => {
    console.log('🧪 Testing immediate red background...');
    
    const renderFunction = `({ time }) => {
      return {
        html: "<div id='box' style='width:1080px;height:1920px;background:#000'></div>" +
              "<script>" +
              "console.log('Script is executing!');" +
              "const box = document.getElementById('box');" +
              "console.log('Box element:', box);" +
              "box.style.background = 'red';" +
              "console.log('Background set to red');" +
              "document.body.setAttribute('data-ready','1');" +
              "console.log('Data ready set');" +
              "</script>",
        waitUntil: () => {
          return document.body.getAttribute("data-ready") === "1";
        }
      };
    }`;

    await page.setViewportSize({ width: 1080, height: 1920 });

    const htmlTemplate = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { margin: 0; padding: 0; width: 1080px; height: 1920px; overflow: hidden; }
          </style>
        </head>
        <body>
        </body>
      </html>
    `;

    await page.setContent(htmlTemplate);

    // Execute render function
    const renderResult = await page.evaluate((renderFunctionString: string) => {
      const evalFunc = eval('(' + renderFunctionString + ')');
      const result = evalFunc({ time: 0.1, frame: 1, duration: 1, width: 1080, height: 1920 });
      
      if (typeof result === 'string') {
        return { html: result, waitUntilString: null };
      }
      
      const waitUntilString = result.waitUntil ? result.waitUntil.toString() : null;
      return { html: result.html, waitUntilString };
    }, renderFunction);

    console.log('Render result HTML:', renderResult.html);

    // Set the HTML content
    await page.evaluate((html: string) => {
      console.log('Setting HTML:', html.substring(0, 200) + '...');
      document.body.innerHTML = html;
      
      // Execute scripts manually since they don't auto-execute when set via innerHTML
      const scripts = document.querySelectorAll('script');
      console.log('Found scripts:', scripts.length);
      scripts.forEach((script, index) => {
        if (script.textContent) {
          console.log('Executing script', index, ':', script.textContent.substring(0, 50) + '...');
          try {
            eval(script.textContent);
          } catch (e) {
            console.error('Script execution error:', e);
          }
        }
      });
    }, renderResult.html);

    // Small delay to let scripts execute
    await page.waitForTimeout(100);

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
    const screenshotPath = `/tmp/simple-test-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('Screenshot saved to:', screenshotPath);

    // Assertions
    expect(colorInfo.found).toBe(true);
    expect(colorInfo.dataReady).toBe('1');
    expect(colorInfo.inlineStyle).toBe('red');
    
    console.log('🎉 SUCCESS: Simple red test passed!');
  }, 10000);
});