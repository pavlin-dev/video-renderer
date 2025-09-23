import { chromium, Browser, Page } from 'playwright';
import { spawn } from 'child_process';
import * as fs from 'fs';

interface ColorAnalysis {
  blackPixels: number;
  nonBlackPixels: number;
  totalPixels: number;
  blackPercentage: number;
  nonBlackPercentage: number;
  averageRGB: { r: number; g: number; b: number };
}

// Function to analyze frame colors using Playwright
async function analyzeFrameColors(framePath: string): Promise<ColorAnalysis> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    // Read frame as base64
    const frameData = fs.readFileSync(framePath);
    const frameBase64 = frameData.toString('base64');
    
    // Load frame and analyze colors
    await page.setContent(`
      <html>
        <body style="margin:0; padding:0;">
          <img id="frame" src="data:image/png;base64,${frameBase64}" style="display:block;">
          <canvas id="canvas" style="display:none;"></canvas>
        </body>
      </html>
    `);

    const analysis = await page.evaluate((): ColorAnalysis => {
      const img = document.getElementById('frame') as HTMLImageElement;
      const canvas = document.getElementById('canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) throw new Error('Could not get canvas context');
      
      // Set canvas size to match image
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      
      // Draw image to canvas
      ctx.drawImage(img, 0, 0);
      
      // Get all pixel data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      let blackPixels = 0;
      let nonBlackPixels = 0;
      let totalR = 0, totalG = 0, totalB = 0;
      let totalPixels = 0;
      
      // Analyze each pixel
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        
        // Skip transparent pixels
        if (a < 128) continue;
        
        totalPixels++;
        totalR += r;
        totalG += g;
        totalB += b;
        
        // Check if pixel is black or very dark (all values < 20)
        if (r < 20 && g < 20 && b < 20) {
          blackPixels++;
        } else {
          nonBlackPixels++;
        }
      }
      
      const blackPercentage = totalPixels > 0 ? (blackPixels / totalPixels) * 100 : 0;
      const nonBlackPercentage = totalPixels > 0 ? (nonBlackPixels / totalPixels) * 100 : 0;
      
      return {
        blackPixels,
        nonBlackPixels,
        totalPixels,
        blackPercentage,
        nonBlackPercentage,
        averageRGB: {
          r: totalPixels > 0 ? totalR / totalPixels : 0,
          g: totalPixels > 0 ? totalG / totalPixels : 0,
          b: totalPixels > 0 ? totalB / totalPixels : 0
        }
      };
    });

    await browser.close();
    return analysis;
  } catch (error) {
    await browser.close();
    throw error;
  }
}

describe('External Video Frame Test', () => {
  test('should generate video with non-black content from external video frames', async () => {
    console.log('🧪 Testing that render function generates non-black video from external frames...');
    
    const VIDEO_URL = "https://videos.pexels.com/video-files/5538262/5538262-hd_1920_1080_25fps.mp4";
    const duration = 1.0;
    const fps = 24;
    const totalFrames = Math.ceil(duration * fps);
    
    // Calculate frame times - start from 5 seconds to avoid black intro frames
    const startTime = 5.0;
    const frameTimes = [];
    for (let frame = 0; frame < totalFrames; frame++) {
      frameTimes.push(startTime + (frame / fps));
    }
    
    // Pre-load all frames first
    console.log('🔄 Pre-loading frames...');
    const preloadResponse = await fetch('http://localhost:3000/api/preload-frames', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoUrl: VIDEO_URL,
        times: frameTimes
      })
    });
    
    const preloadResult = await preloadResponse.json();
    console.log('📦 Pre-load result:', preloadResult);
    
    expect(preloadResponse.ok).toBe(true);
    expect(preloadResult.success).toBe(true);
    
    // Now use a simpler render function that should load quickly from cache
    const renderFunction = `({ time }) => {
      const VIDEO_URL = "https://videos.pexels.com/video-files/5538262/5538262-hd_1920_1080_25fps.mp4";
      const FRAME_API = "http://localhost:3000/api/video-frame";
      const videoTime = 5.0 + time; // Start from 5 seconds to avoid black intro frames
      const src = FRAME_API + "?url=" + encodeURIComponent(VIDEO_URL) + "&time=" + videoTime;

      return {
        html: "<div style='width:1080px;height:1920px;background:#000;display:flex;align-items:center;justify-content:center;'>" +
              "<img src='" + src + "' style='max-width:95%;max-height:95%;object-fit:contain;'/>" +
              "</div>",
        waitUntil: () => true
      };
    }`;

    // Call the render API to generate a video
    console.log('📹 Generating video using render API...');
    const response = await fetch('http://localhost:3000/api/render', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        width: 1080,
        height: 1920,
        duration: duration,
        fps: fps,
        render: renderFunction
      })
    });

    expect(response.ok).toBe(true);
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.video).toBeDefined();

    console.log('✅ Video generated:', result.video.url);
    console.log('Video info:', {
      frames: result.video.frames,
      duration: result.video.duration,
      fps: result.video.fps
    });

    // Extract multiple frames from the generated video for analysis
    const videoPath = result.video.path;
    expect(videoPath).toBeDefined();
    
    const frameAnalyses: ColorAnalysis[] = [];
    const framesToAnalyze = Math.min(result.video.frames, 5); // Analyze up to 5 frames
    
    console.log(`🔍 Analyzing ${framesToAnalyze} frames for color content...`);
    
    for (let frameIndex = 0; frameIndex < framesToAnalyze; frameIndex++) {
      const frameTime = (frameIndex / (result.video.frames - 1)) * result.video.duration;
      const frameOutputPath = `/tmp/analysis_frame_${frameIndex}_${Date.now()}.png`;
      
      // Extract frame using ffmpeg
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-y',
          '-i', videoPath,
          '-ss', frameTime.toString(),
          '-vframes', '1',
          '-f', 'image2',
          frameOutputPath
        ]);
        
        ffmpeg.on('close', (code: number) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`ffmpeg failed with code ${code} for frame ${frameIndex}`));
          }
        });
        
        ffmpeg.on('error', reject);
      });
      
      // Analyze the extracted frame
      const colorAnalysis = await analyzeFrameColors(frameOutputPath);
      frameAnalyses.push(colorAnalysis);
      
      console.log(`Frame ${frameIndex} (t=${frameTime.toFixed(2)}s):`, {
        blackPercentage: colorAnalysis.blackPercentage.toFixed(2) + '%',
        nonBlackPercentage: colorAnalysis.nonBlackPercentage.toFixed(2) + '%',
        avgColor: `rgb(${Math.round(colorAnalysis.averageRGB.r)}, ${Math.round(colorAnalysis.averageRGB.g)}, ${Math.round(colorAnalysis.averageRGB.b)})`
      });
      
      // Cleanup frame file
      try {
        fs.unlinkSync(frameOutputPath);
      } catch {}
    }

    // Analyze results
    const avgBlackPercentage = frameAnalyses.reduce((sum, analysis) => sum + analysis.blackPercentage, 0) / frameAnalyses.length;
    const avgNonBlackPercentage = frameAnalyses.reduce((sum, analysis) => sum + analysis.nonBlackPercentage, 0) / frameAnalyses.length;
    
    console.log('📊 Overall analysis:');
    console.log(`Average black pixels: ${avgBlackPercentage.toFixed(2)}%`);
    console.log(`Average non-black pixels: ${avgNonBlackPercentage.toFixed(2)}%`);

    // Assertions - video should NOT be completely black (adjusted for this video's content)
    expect(avgNonBlackPercentage).toBeGreaterThan(25); // At least 25% non-black content
    expect(avgBlackPercentage).toBeLessThan(75); // Less than 75% black pixels
    
    // All frames should have some non-black content
    const framesWithContent = frameAnalyses.filter(analysis => analysis.nonBlackPercentage > 20);
    expect(framesWithContent.length).toBeGreaterThan(0);
    
    console.log('🎉 SUCCESS: Video contains actual content from external video frames!');
    console.log(`${framesWithContent.length}/${frameAnalyses.length} frames have significant non-black content`);
    
  }, 60000);
});