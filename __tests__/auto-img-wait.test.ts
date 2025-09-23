import { chromium } from 'playwright';
import { spawn } from 'child_process';
import * as fs from 'fs';

describe('Auto Image Wait Test', () => {
  test('should automatically wait for images to load without waitUntil', async () => {
    console.log('🧪 Testing automatic image loading detection...');
    
    const VIDEO_URL = "https://videos.pexels.com/video-files/5538262/5538262-hd_1920_1080_25fps.mp4";
    const duration = 0.5;
    const fps = 12;
    const totalFrames = Math.ceil(duration * fps);
    
    // Pre-load frames
    const startTime = 5.0;
    const frameTimes = [];
    for (let frame = 0; frame < totalFrames; frame++) {
      frameTimes.push(startTime + (frame / fps));
    }
    
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
    console.log(`📦 Pre-loaded ${preloadResult.preloaded} frames`);
    
    // Simple render function - NO waitUntil!
    const renderFunction = `({ time }) => {
      const VIDEO_URL = "https://videos.pexels.com/video-files/5538262/5538262-hd_1920_1080_25fps.mp4";
      const FRAME_API = "http://localhost:3000/api/video-frame";
      const videoTime = 5.0 + time;
      const src = FRAME_API + "?url=" + encodeURIComponent(VIDEO_URL) + "&time=" + encodeURIComponent(videoTime);

      return {
        html: "<div style='width:1080px;height:1920px;background:#000;display:flex;align-items:center;justify-content:center'>" +
              "<img id='frame' src='" + src + "' style='max-width:95%;max-height:95%;object-fit:contain'/>" +
              "</div>"
      };
    }`;

    // Generate video
    console.log('📹 Generating video without waitUntil...');
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

    console.log('✅ Video generated:', result.video.url);

    // Extract and check one frame to verify it's not black
    const videoPath = result.video.path;
    const frameOutputPath = `/tmp/auto_wait_test_${Date.now()}.png`;
    
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-i', videoPath,
        '-ss', '0.1',
        '-vframes', '1',
        '-f', 'image2',
        frameOutputPath
      ]);
      
      ffmpeg.on('close', (code: number) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg failed with code ${code}`));
      });
      
      ffmpeg.on('error', reject);
    });

    // Check if frame has content (not black)
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    const frameData = fs.readFileSync(frameOutputPath);
    const frameBase64 = frameData.toString('base64');
    
    await page.setContent(`
      <html>
        <body style="margin:0; padding:0;">
          <img id="frame" src="data:image/png;base64,${frameBase64}">
          <canvas id="canvas" style="display:none;"></canvas>
        </body>
      </html>
    `);

    const avgColor = await page.evaluate(() => {
      const img = document.getElementById('frame') as HTMLImageElement;
      const canvas = document.getElementById('canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      let totalR = 0, totalG = 0, totalB = 0, count = 0;
      for (let i = 0; i < data.length; i += 4) {
        totalR += data[i];
        totalG += data[i + 1];
        totalB += data[i + 2];
        count++;
      }
      
      return {
        r: Math.round(totalR / count),
        g: Math.round(totalG / count),
        b: Math.round(totalB / count)
      };
    });

    await browser.close();
    
    console.log(`Frame avg color: rgb(${avgColor.r}, ${avgColor.g}, ${avgColor.b})`);
    
    // Should not be pure black (0,0,0)
    expect(avgColor.r + avgColor.g + avgColor.b).toBeGreaterThan(10);
    
    // Cleanup
    try {
      fs.unlinkSync(frameOutputPath);
    } catch {}
    
    console.log('🎉 SUCCESS: Images auto-loaded without waitUntil!');
    
  }, 60000);
});