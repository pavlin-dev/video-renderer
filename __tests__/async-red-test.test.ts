import { chromium, Browser, Page } from 'playwright';

describe('Async Red Test', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  test('should render red background after async delay', async () => {
    console.log('🧪 Testing async red background...');
    
    const renderFunction = `({ time }) => {
      return {
        html: "<div id='box' style='width:1080px;height:1920px;background:#000'></div>" +
              "<script>" +
              "(async () => {" +
                "console.log('Async script starting...');" +
                "const box = document.getElementById('box');" +
                "console.log('Box element found:', !!box);" +
                "await new Promise(res => {" +
                  "console.log('Starting 500ms delay...');" +
                  "setTimeout(() => {" +
                    "console.log('Delay completed');" +
                    "res();" +
                  "}, 500);" +
                "});" +
                "console.log('Setting background to red...');" +
                "box.style.background = 'red';" +
                "console.log('Setting data-ready attribute...');" +
                "document.body.setAttribute('data-ready','1');" +
                "console.log('Async script completed!');" +
              "})();" +
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

    // Set the HTML content first
    await page.evaluate((html: string) => {
      // Extract HTML and script parts
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const divElement = doc.querySelector('div');
      const scriptElement = doc.querySelector('script');
      
      // Set the div content
      if (divElement) {
        document.body.appendChild(divElement);
      }
      
      // Return script content for separate execution
      return scriptElement ? scriptElement.textContent : null;
    }, renderResult.html);

    // Execute the script using page.evaluate for proper async handling
    const scriptContent = await page.evaluate((html: string) => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const scriptElement = doc.querySelector('script');
      return scriptElement ? scriptElement.textContent : null;
    }, renderResult.html);

    if (scriptContent) {
      console.log('Executing script content...');
      await page.evaluate((script: string) => {
        console.log('About to eval script:', script.substring(0, 100) + '...');
        return eval(script);
      }, scriptContent);
    }

    // Wait for async operation if specified
    if (renderResult.waitUntilString) {
      console.log('Waiting for async operation with waitUntil...');
      await page.waitForFunction(renderResult.waitUntilString, { timeout: 5000 });
      console.log('WaitUntil condition met!');
    } else {
      // If no waitUntil, wait a bit for async operation
      console.log('No waitUntil specified, waiting 2 seconds...');
      await page.waitForTimeout(2000);
    }

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

    console.log('Final color info:', colorInfo);

    // Take screenshot
    const screenshotPath = `/tmp/async-test-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('Screenshot saved to:', screenshotPath);

    // Assertions
    expect(colorInfo.found).toBe(true);
    expect(colorInfo.dataReady).toBe('1');
    expect(colorInfo.inlineStyle).toBe('red');
    
    console.log('🎉 SUCCESS: Async red test passed!');
  }, 15000);
});