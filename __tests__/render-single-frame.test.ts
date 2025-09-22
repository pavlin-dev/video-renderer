import { chromium, Browser, Page } from 'playwright';

describe('Render API - Single Frame Test', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  test('should render red background in single frame after async delay', async () => {
    console.log('🧪 Testing single frame red background render...');
    
    const renderFunction = `({ time }) => {
      return {
        html:
          "<div id='box' style='width:1080px;height:1920px;background:#000'></div>" +
          "<script>" +
          "(async () => {" +
            "const box = document.getElementById('box');" +
            // umělý delay 1s
            "await new Promise(res => setTimeout(res, 1000));" +
            // po čekání nastavíme červenou
            "box.style.background = 'red';" +
            // signalizace, že je hotovo
            "document.body.setAttribute('data-ready','1');" +
          "})();" +
          "</script>",

        waitUntil: () => {
          return document.body.getAttribute("data-ready") === "1";
        }
      };
    }`;

    // Set page size
    await page.setViewportSize({ width: 1080, height: 1920 });

    // Create HTML template (similar to render API)
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

    // Execute render function directly in page (simulating server-side execution)
    const renderResult = await page.evaluate((renderFunctionString: string) => {
      const evalFunc = eval(`(${renderFunctionString})`);
      const result = evalFunc({ time: 0.1, frame: 1, duration: 1, width: 1080, height: 1920 });
      
      if (typeof result === 'string') {
        return { html: result, waitUntilString: null };
      }
      
      const waitUntilString = result.waitUntil ? result.waitUntil.toString() : null;
      return { html: result.html, waitUntilString };
    }, renderFunction);

    // Set the HTML content
    await page.evaluate((html: string) => {
      document.body.innerHTML = html;
      
      // Execute any scripts in the HTML
      const scripts = document.querySelectorAll('script');
      scripts.forEach(script => {
        if (script.textContent) {
          try {
            eval(script.textContent);
          } catch (e) {
            console.error('Script execution error:', e);
          }
        }
      });
    }, renderResult.html);

    // Wait for async operation to complete if waitUntil is specified
    if (renderResult.waitUntilString) {
      console.log('Waiting for async operation to complete...');
      await page.waitForFunction(renderResult.waitUntilString, { timeout: 10000 });
      console.log('Async operation completed!');
    }

    // Check the background color
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

    // Take screenshot for visual verification
    const screenshotPath = `/tmp/test-frame-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('Screenshot saved to:', screenshotPath);

    // Assertions
    expect(colorInfo.found).toBe(true);
    expect(colorInfo.dataReady).toBe('1');
    expect(colorInfo.inlineStyle).toBe('red');
    
    console.log('🎉 SUCCESS: Single frame test passed!');
  }, 20000);
});