import { chromium, Browser, Page } from 'playwright';
import { spawn } from 'child_process';
import * as fs from 'fs';

interface FramePixelData {
  frameIndex: number;
  time: number;
  avgColor: { r: number; g: number; b: number };
  samplePixels: number[]; // Sample of pixel values for comparison
}

// Function to extract pixel data from frame
async function getFramePixelData(framePath: string): Promise<{ avgColor: { r: number; g: number; b: number }, samplePixels: number[] }> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    const frameData = fs.readFileSync(framePath);
    const frameBase64 = frameData.toString('base64');
    
    await page.setContent(`
      <html>
        <body style="margin:0; padding:0;">
          <img id="frame" src="data:image/png;base64,${frameBase64}" style="display:block;">
          <canvas id="canvas" style="display:none;"></canvas>
        </body>
      </html>
    `);

    const pixelData = await page.evaluate((): { avgColor: { r: number; g: number; b: number }, samplePixels: number[] } => {
      const img = document.getElementById('frame') as HTMLImageElement;
      const canvas = document.getElementById('canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) throw new Error('Could not get canvas context');
      
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      let totalR = 0, totalG = 0, totalB = 0;
      let pixelCount = 0;
      const samplePixels: number[] = [];
      
      // Sample every 1000th pixel for comparison
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        totalR += r;
        totalG += g;
        totalB += b;
        pixelCount++;
        
        // Sample pixels for detailed comparison
        if (i % 4000 === 0) {
          samplePixels.push(r, g, b);
        }
      }
      
      return {
        avgColor: {
          r: Math.round(totalR / pixelCount),
          g: Math.round(totalG / pixelCount),
          b: Math.round(totalB / pixelCount)
        },
        samplePixels
      };
    });

    await browser.close();
    return pixelData;
  } catch (error) {
    await browser.close();
    throw error;
  }
}

// Function to calculate difference between two frames
function calculatePixelDifference(pixels1: number[], pixels2: number[]): number {
  if (pixels1.length !== pixels2.length) {
    throw new Error('Pixel arrays must have same length');
  }
  
  let totalDiff = 0;
  for (let i = 0; i < pixels1.length; i++) {
    totalDiff += Math.abs(pixels1[i] - pixels2[i]);
  }
  
  return totalDiff / pixels1.length; // Average difference per channel
}

describe('External Video Different Frames Test', () => {
  test('should generate video with different frames, not just one repeated image', async () => {
    console.log('🧪 Testing that video has different frames over time...');
    
    const VIDEO_URL = "https://videos.pexels.com/video-files/5538262/5538262-hd_1920_1080_25fps.mp4";
    const duration = 1.0;
    const fps = 24;
    const totalFrames = Math.ceil(duration * fps);
    
    // Calculate frame times - start from 5 seconds
    const startTime = 5.0;
    const frameTimes = [];
    for (let frame = 0; frame < totalFrames; frame++) {
      frameTimes.push(startTime + (frame / fps));
    }
    
    // Pre-load all frames
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
    expect(preloadResponse.ok).toBe(true);
    expect(preloadResult.success).toBe(true);
    console.log(`📦 Pre-loaded ${preloadResult.preloaded} frames`);
    
    // Render function with cache busting
    const renderFunction = `({ time, frame }) => {
      const VIDEO_URL = "https://videos.pexels.com/video-files/5538262/5538262-hd_1920_1080_25fps.mp4";
      const FRAME_API = "http://localhost:3000/api/video-frame";
      const videoTime = 5.0 + time;
      const src = FRAME_API + "?url=" + encodeURIComponent(VIDEO_URL) + "&time=" + encodeURIComponent(videoTime) + "&_frame=" + frame;

      return {
        html: "<div style='width:1080px;height:1920px;background:#000;display:flex;align-items:center;justify-content:center'>" +
              "<img id='frame' src='" + src + "' style='max-width:95%;max-height:95%;object-fit:contain'/>" +
              "</div>" +
              "<script>" +
                "window.imageLoaded = false;" +
                "var img = document.getElementById('frame');" +
                "img.onload = function() {" +
                  "console.log('Image loaded for frame " + frame + " at time " + time + "');" +
                  "window.imageLoaded = true;" +
                  "document.body.setAttribute('data-ready', '1');" +
                "};" +
                "img.onerror = function() {" +
                  "console.log('Image error!');" +
                  "document.body.setAttribute('data-ready', '1');" +
                "};" +
                "setTimeout(function() {" +
                  "if (!window.imageLoaded) {" +
                    "console.log('Image timeout!');" +
                    "document.body.setAttribute('data-ready', '1');" +
                  "}" +
                "}, 20000);" +
              "</script>",
        waitUntil: () => document.body.getAttribute("data-ready") === "1"
      };
    }`;

    // Generate video
    console.log('📹 Generating video...');
    const response = await fetch('http://localhost:3000/api/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

    // Extract and analyze multiple frames
    const videoPath = result.video.path;
    expect(videoPath).toBeDefined();
    
    const frameData: FramePixelData[] = [];
    const framesToAnalyze = [0, 6, 12, 18, 22]; // First, 25%, 50%, 75%, near-last frame
    
    console.log(`🔍 Analyzing ${framesToAnalyze.length} frames by comparing pixels...`);
    
    for (const frameIndex of framesToAnalyze) {
      const frameTime = Math.min((frameIndex / result.video.fps), result.video.duration - 0.01);
      const frameOutputPath = `/tmp/diff_frame_${frameIndex}_${Date.now()}.png`;
      
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
      
      // Get pixel data from the extracted frame
      const pixelData = await getFramePixelData(frameOutputPath);
      frameData.push({ 
        frameIndex, 
        time: frameTime, 
        avgColor: pixelData.avgColor,
        samplePixels: pixelData.samplePixels
      });
      
      console.log(`Frame ${frameIndex} (t=${frameTime.toFixed(2)}s): avgColor=rgb(${pixelData.avgColor.r}, ${pixelData.avgColor.g}, ${pixelData.avgColor.b}), samples=${pixelData.samplePixels.length}`);
      
      // Cleanup
      try {
        fs.unlinkSync(frameOutputPath);
      } catch {}
    }

    // Compare frames using pixel differences
    const differences: { frame1: number, frame2: number, diff: number }[] = [];
    
    for (let i = 0; i < frameData.length - 1; i++) {
      const diff = calculatePixelDifference(
        frameData[i].samplePixels,
        frameData[i + 1].samplePixels
      );
      differences.push({
        frame1: frameData[i].frameIndex,
        frame2: frameData[i + 1].frameIndex,
        diff: Math.round(diff * 100) / 100
      });
    }
    
    console.log('📊 Pixel difference analysis:');
    differences.forEach(d => {
      console.log(`  Frame ${d.frame1} → ${d.frame2}: avg pixel diff = ${d.diff}`);
    });

    // Assertions - frames should be different
    // If all frames are identical, all differences would be 0
    const significantDifferences = differences.filter(d => d.diff > 1.0); // At least 1.0 average pixel difference
    
    expect(significantDifferences.length).toBeGreaterThan(0);
    
    // Check average colors are different (very small threshold since video is dark)
    const firstFrameColor = frameData[0].avgColor;
    const differentColors = frameData.filter(f => 
      Math.abs(f.avgColor.r - firstFrameColor.r) > 0 ||
      Math.abs(f.avgColor.g - firstFrameColor.g) > 0 ||
      Math.abs(f.avgColor.b - firstFrameColor.b) > 0
    );
    
    expect(differentColors.length).toBeGreaterThan(0);
    
    console.log('🎉 SUCCESS: Video contains different frames over time!');
    console.log(`${significantDifferences.length}/${differences.length} frame pairs have significant pixel differences`);
    console.log(`${differentColors.length}/${frameData.length} frames have different average colors from first frame`);
    
  }, 90000); // 90 second timeout
});