import { chromium, Browser, Page } from 'playwright';
import { spawn } from 'child_process';
import * as fs from 'fs';

interface RenderApiResponse {
  success: boolean;
  video?: {
    url: string;
    path: string;
    size: number;
    frames: number;
    duration: number;
    fps: number;
    width: number;
    height: number;
  };
  error?: string;
  details?: string;
}

interface ColorAnalysis {
  redPixels: number;
  blackPixels: number;
  otherPixels: number;
  totalPixels: number;
  redPercentage: number;
  blackPercentage: number;
}

describe('Render API - Red Background Test', () => {
  beforeAll(async () => {
    // Ensure the dev server is running
    // This test assumes Next.js dev server is already running on localhost:3000
  });

  afterAll(async () => {
    // Cleanup if needed
  });

  test('should render red background after async delay', async () => {
    console.log('🧪 Testing red background render...');
    
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

    // Call the render API
    const response = await fetch('http://localhost:3000/api/render', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        width: 1080,
        height: 1920,
        duration: 0.1, // Very short video for testing
        render: renderFunction
      })
    });

    const result: RenderApiResponse = await response.json();
    
    // Assert API call was successful
    expect(response.ok).toBe(true);
    expect(result.success).toBe(true);
    expect(result.video).toBeDefined();
    expect(result.video?.url).toBeDefined();
    
    console.log('✅ Video generated:', result.video?.url);
    
    // Now analyze the first frame to check if it's red using ffmpeg
    const videoPath = result.video?.path;
    expect(videoPath).toBeDefined();
    
    if (!videoPath) {
      throw new Error('Video path is undefined');
    }
    
    // Extract first frame using ffmpeg  
    const frameOutputPath = `/tmp/frame_analysis_${Date.now()}.png`;
    
    // Use ffmpeg to extract first frame
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-i', videoPath,
        '-vframes', '1',
        '-f', 'image2',
        frameOutputPath
      ]);
      
      ffmpeg.on('close', (code: number) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`ffmpeg failed with code ${code}`));
        }
      });
      
      ffmpeg.on('error', reject);
    });
    
    // Analyze extracted frame using playwright
    const browser: Browser = await chromium.launch({ headless: true });
    const page: Page = await browser.newPage();
    
    try {
      // Read the extracted frame as base64
      const frameData = fs.readFileSync(frameOutputPath);
      const frameBase64 = frameData.toString('base64');
      
      // Load the extracted frame as image using data URL
      await page.setContent(`
        <html>
          <body style="margin:0; padding:0;">
            <img id="frame" src="data:image/png;base64,${frameBase64}" width="1080" height="1920" style="display:block;">
            <canvas id="canvas" width="1080" height="1920" style="display:none;"></canvas>
          </body>
        </html>
      `);

      // Wait for image to load and analyze
      const colorAnalysis: ColorAnalysis = await page.evaluate(async (): Promise<ColorAnalysis> => {
        const img = document.getElementById('frame') as HTMLImageElement;
        const canvas = document.getElementById('canvas') as HTMLCanvasElement;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          throw new Error('Could not get canvas context');
        }
        
        // Wait for image to load
        await new Promise<void>((resolve, reject) => {
          if (img.complete) {
            resolve();
          } else {
            img.addEventListener('load', () => resolve());
            img.addEventListener('error', () => reject(new Error('Image load error')));
          }
        });
        
        // Draw image to canvas
        ctx.drawImage(img, 0, 0, 1080, 1920);
        
        // Sample pixels from center area to check if they're red
        const imageData = ctx.getImageData(540, 960, 100, 100); // 100x100 sample from center
        const data = imageData.data;
        
        let redPixels = 0;
        let blackPixels = 0;
        let otherPixels = 0;
        let totalPixels = 0;
        
        // Check each pixel
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          
          // Skip transparent pixels
          if (a < 128) continue;
          
          totalPixels++;
          
          // Check if pixel is predominantly red (r > 200, g < 50, b < 50)
          if (r > 200 && g < 50 && b < 50) {
            redPixels++;
          }
          // Check if pixel is black/dark (all values < 50)
          else if (r < 50 && g < 50 && b < 50) {
            blackPixels++;
          }
          else {
            otherPixels++;
          }
        }
        
        const redPercentage = totalPixels > 0 ? (redPixels / totalPixels) * 100 : 0;
        const blackPercentage = totalPixels > 0 ? (blackPixels / totalPixels) * 100 : 0;
        
        return {
          redPixels,
          blackPixels,
          otherPixels,
          totalPixels,
          redPercentage,
          blackPercentage
        };
      });

      await browser.close();
      
      console.log('Color analysis:', colorAnalysis);
      console.log(`Red pixels: ${colorAnalysis.redPixels}/${colorAnalysis.totalPixels} (${colorAnalysis.redPercentage.toFixed(2)}%)`);
      console.log(`Black pixels: ${colorAnalysis.blackPixels}/${colorAnalysis.totalPixels} (${colorAnalysis.blackPercentage.toFixed(2)}%)`);
      
      // Assert that the background is red
      expect(colorAnalysis.totalPixels).toBeGreaterThan(0);
      expect(colorAnalysis.redPercentage).toBeGreaterThan(50); // More than 50% should be red
      expect(colorAnalysis.blackPercentage).toBeLessThan(30); // Less than 30% should be black (initial color)
      
      console.log('🎉 SUCCESS: Background is red!');
      
      // Cleanup
      fs.unlinkSync(frameOutputPath);
      
    } catch (error) {
      await browser.close();
      // Cleanup on error
      try {
        fs.unlinkSync(frameOutputPath);
      } catch {}
      throw error;
    }
  }, 30000); // 30 second timeout for the entire test
});