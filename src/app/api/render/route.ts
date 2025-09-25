import { NextRequest, NextResponse } from "next/server";
import { chromium } from "playwright";
import ffmpeg from "fluent-ffmpeg";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import * as vm from "vm";

const mkdir = promisify(fs.mkdir);
const unlink = promisify(fs.unlink);


interface FrameContext {
    time: number;
    frame: number;
    duration: number;
    width: number;
    height: number;
}

interface RenderResult {
    html: string;
    waitUntil?: () => boolean; // function that returns true when ready to render
}

type RenderFunction = (ctx: FrameContext) => RenderResult | Promise<RenderResult> | string;

export async function POST(request: NextRequest) {
    try {
        // Check content type
        const contentType = request.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            return NextResponse.json(
                { error: "Content-Type must be application/json" },
                { status: 400 }
            );
        }

        // Parse and validate JSON body
        let body: {
            width?: number;
            height?: number;
            duration?: number;
            render?: string;
            fps?: number;
            quality?: 'low' | 'medium' | 'high';
        };
        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                { error: "Invalid JSON body" },
                { status: 400 }
            );
        }

        // Check if body is an object
        if (!body || typeof body !== "object") {
            return NextResponse.json(
                { error: "Request body must be a JSON object" },
                { status: 400 }
            );
        }

        const { width, height, duration, render, fps: requestedFps, quality } = body;

        // Validate required fields and types
        if (typeof width !== "number" || width <= 0) {
            return NextResponse.json(
                { error: "width must be a positive number" },
                { status: 400 }
            );
        }

        if (typeof height !== "number" || height <= 0) {
            return NextResponse.json(
                { error: "height must be a positive number" },
                { status: 400 }
            );
        }

        if (typeof duration !== "number" || duration <= 0) {
            return NextResponse.json(
                { error: "duration must be a positive number" },
                { status: 400 }
            );
        }

        if (typeof render !== "string" || render.trim() === "") {
            return NextResponse.json(
                { error: "render must be a non-empty string" },
                { status: 400 }
            );
        }

        // Validate optional fields
        if (requestedFps !== undefined && (typeof requestedFps !== "number" || requestedFps <= 0 || requestedFps > 60)) {
            return NextResponse.json(
                { error: "fps must be a positive number between 1 and 60" },
                { status: 400 }
            );
        }

        if (quality !== undefined && !['low', 'medium', 'high'].includes(quality)) {
            return NextResponse.json(
                { error: "quality must be 'low', 'medium', or 'high'" },
                { status: 400 }
            );
        }

        // Use optimized defaults for better performance
        const fps = requestedFps || 24; // Lower default FPS for better performance
        const videoQuality = quality || 'medium';
        const totalFrames = Math.ceil(duration * fps);
        const tempDir = path.join(process.cwd(), "temp");
        const framesDir = path.join(tempDir, `frames_${Date.now()}`);
        const outputPath = path.join(tempDir, `video_${Date.now()}.mp4`);

        // Create temp directories
        await mkdir(tempDir, { recursive: true });
        await mkdir(framesDir, { recursive: true });

        // Use system Chromium (fallback to auto-detection if not exists)
        let executablePath: string | undefined = '/usr/lib/chromium/chromium';
        if (!fs.existsSync(executablePath)) {
            executablePath = undefined; // Let Playwright auto-detect
        }

        // Optimized Chrome args for lower CPU usage
        const chromeArgs = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-gpu-sandbox',
            '--disable-software-rasterizer',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI,AudioServiceOutOfProcess',
            '--no-first-run',
            '--disable-extensions',
            '--disable-default-apps',
            '--disable-background-networking',
            '--disable-breakpad',
            '--disable-client-side-phishing-detection',
            '--disable-component-extensions-with-background-pages',
            '--disable-domain-reliability',
            '--disable-hang-monitor',
            '--disable-popup-blocking',
            '--disable-prompt-on-repost',
            '--disable-sync',
            '--disable-translate',
            '--disable-web-security',
            '--hide-scrollbars',
            '--mute-audio',
            '--no-default-browser-check',
            '--no-pings',
            '--no-service-autorun',
            '--password-store=basic',
            '--use-mock-keychain',
            // Performance optimizations for 2GB RAM server
            '--enable-aggressive-domstorage-flushing',
            '--enable-low-end-device-mode',
            '--max_old_space_size=512',  // Very low memory limit for 2GB server
            '--memory-pressure-off',
            '--aggressive-cache-discard',
            '--disable-background-media-suspend',
            '--disable-features=VizDisplayCompositor',
            '--force-device-scale-factor=1'
        ];

        const browser = await chromium.launch({
            executablePath,
            headless: true,
            args: chromeArgs
        });

        let page;
        const framePaths: string[] = [];

        try {
            page = await browser.newPage();
            await page.setViewportSize({ width, height });

            // Create HTML template
            const htmlTemplate = `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { margin: 0; padding: 0; width: ${width}px; height: ${height}px; overflow: hidden; }
              </style>
            </head>
            <body>
            </body>
          </html>
        `;

            await page.setContent(htmlTemplate);

            // Optimize page settings for performance
            page.setDefaultTimeout(5000); // Shorter timeout
            page.setDefaultNavigationTimeout(5000);

            // Render frames with very small batches for 2GB RAM server
            const batchSize = 2; // Very small batches to minimize memory usage
            for (let batchStart = 0; batchStart < totalFrames; batchStart += batchSize) {
                const batchEnd = Math.min(batchStart + batchSize, totalFrames);
                
                for (let frame = batchStart; frame < batchEnd; frame++) {
                    const time = frame / fps;
                    const context: FrameContext = {
                        time,
                        frame,
                        duration,
                        width,
                        height
                    };

                    // Execute render function on server side to avoid browser evaluation issues
                    let renderResultRaw: { html: string, waitUntilString: string | null };
                    try {
                        // Debug: Log the render function string
                        console.log('=== RENDER FUNCTION DEBUG ===');
                        console.log('Raw render string length:', render.length);
                        console.log('Full render function:');
                        console.log(render);
                        console.log('Contains hsl:', render.includes('hsl'));
                        console.log('=== END DEBUG ===');
                        
                        // Use vm module for safe evaluation of render function (without template literal escaping)
                        const script = new vm.Script(`(${render})`);
                        const renderFunction = script.runInNewContext({ fetch });
                        const result = await Promise.resolve(renderFunction(context));
                        
                        // Support both old string format and new object format
                        if (typeof result === 'string') {
                            renderResultRaw = { html: result, waitUntilString: null };
                        } else {
                            // Convert waitUntil function to string for serialization
                            const waitUntilString = result.waitUntil ? result.waitUntil.toString() : null;
                            renderResultRaw = { html: result.html, waitUntilString };
                        }
                    } catch (error) {
                        console.error('Render function evaluation error:', error);
                        console.error('Error details:', {
                            message: error instanceof Error ? error.message : 'Unknown error',
                            stack: error instanceof Error ? error.stack : undefined
                        });
                        throw new Error('Failed to evaluate render function: ' + (error instanceof Error ? error.message : 'Unknown error'));
                    }

                    // Clear body and set new HTML content
                    await page.evaluate((html: string) => {
                        // Clear previous content
                        document.body.innerHTML = '';
                        document.body.removeAttribute('data-ready');
                        
                        // Extract HTML and script parts
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(html, 'text/html');
                        const divElement = doc.querySelector('div');
                        
                        // Set the div content
                        if (divElement) {
                            document.body.appendChild(divElement);
                        }
                    }, renderResultRaw.html);

                    // Execute the script using page.evaluate for proper async handling
                    const scriptContent = await page.evaluate((html: string) => {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(html, 'text/html');
                        const scriptElement = doc.querySelector('script');
                        return scriptElement ? scriptElement.textContent : null;
                    }, renderResultRaw.html);

                    if (scriptContent) {
                        console.log('Executing script content...');
                        await page.evaluate((script: string) => {
                            console.log('About to eval script:', script.substring(0, 100) + '...');
                            return eval(script);
                        }, scriptContent);
                    }

                    // Auto-detect images and wait for them to load
                    const hasImages = await page.evaluate(() => {
                        const imgs = document.querySelectorAll('img');
                        return imgs.length > 0;
                    });

                    if (hasImages) {
                        try {
                            console.log('Detected images, waiting for them to load...');
                            // Wait for all images to be loaded or errored
                            await page.evaluate(() => {
                                return new Promise<void>((resolve) => {
                                    const imgs = Array.from(document.querySelectorAll('img'));
                                    if (imgs.length === 0) {
                                        resolve();
                                        return;
                                    }
                                    
                                    let loaded = 0;
                                    const total = imgs.length;
                                    
                                    const checkComplete = () => {
                                        loaded++;
                                        if (loaded >= total) {
                                            resolve();
                                        }
                                    };
                                    
                                    imgs.forEach(img => {
                                        if (img.complete) {
                                            checkComplete();
                                        } else {
                                            img.addEventListener('load', checkComplete, { once: true });
                                            img.addEventListener('error', checkComplete, { once: true });
                                        }
                                    });
                                });
                            });
                            console.log('All images loaded!');
                        } catch (error) {
                            console.warn('Image loading timeout:', error);
                        }

                        // Always wait for network idle when images are present
                        try {
                            console.log('Waiting for network idle...');
                            await page.waitForLoadState('networkidle', { timeout: 15000 });
                            console.log('Network idle!');
                        } catch (error) {
                            console.warn('Network idle timeout:', error);
                        }
                    }

                    // Wait based on waitUntil function (if provided)
                    if (renderResultRaw.waitUntilString) {
                        try {
                            console.log('Waiting for waitUntil condition...');
                            await page.waitForFunction(renderResultRaw.waitUntilString, { timeout: 25000 });
                            console.log('waitUntil condition met!');
                            
                            // Debug: Check what's actually in the page after condition is met
                            const debugInfo = await page.evaluate(() => {
                                return {
                                    dataReady: document.body.getAttribute('data-ready'),
                                    boxElement: !!document.getElementById('box'),
                                    boxStyle: document.getElementById('box')?.style.background || 'none',
                                    boxComputedStyle: window.getComputedStyle(document.getElementById('box') || document.body).background
                                };
                            });
                            console.log('Success debug info:', debugInfo);
                        } catch (error) {
                            // If timeout, continue anyway
                            console.warn('waitUntil function timeout, continuing anyway');
                            console.warn('Error:', error);
                            
                            // Debug: Check what's actually in the page
                            const debugInfo = await page.evaluate(() => {
                                return {
                                    bodyContent: document.body.innerHTML.substring(0, 500),
                                    dataReady: document.body.getAttribute('data-ready'),
                                    boxElement: !!document.getElementById('box'),
                                    boxStyle: document.getElementById('box')?.style.background || 'none'
                                };
                            });
                            console.log('Debug info:', debugInfo);
                        }
                    }

                    // Capture screenshot with optimized settings
                    const framePath = path.join(
                        framesDir,
                        `frame_${frame.toString().padStart(6, "0")}.png`
                    );
                    await page.screenshot({ 
                        path: framePath, 
                        fullPage: false,
                        type: 'png',
                        omitBackground: false
                    });
                    framePaths.push(framePath);
                }

                // Force garbage collection and delay between batches for memory management
                if (batchEnd < totalFrames) {
                    // Force garbage collection to free memory
                    if (global.gc) {
                        global.gc();
                    }
                    await new Promise(resolve => setTimeout(resolve, 50)); // Longer delay for memory cleanup
                }
            }
        } finally {
            // Aggressive cleanup to prevent CPU hanging
            try {
                if (page) {
                    await page.close();
                    console.log("✓ Page closed");
                }
            } catch (err) {
                console.warn("Failed to close page:", err);
            }
            
            try {
                // Force browser context cleanup
                const contexts = browser.contexts();
                for (const context of contexts) {
                    await context.close();
                }
                
                await browser.close();
                console.log("✓ Browser closed");
                
                // Small delay to ensure cleanup
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (err) {
                console.warn("Failed to close browser:", err);
            }
            
            // Force garbage collection after browser cleanup
            if (global.gc) {
                global.gc();
                console.log("✓ Garbage collection triggered");
            }
        }

        // Generate video with FFmpeg - optimized settings based on quality
        const getFFmpegOptions = (quality: string) => {
            const baseOptions = [
                "-c:v libx264",
                "-pix_fmt yuv420p", 
                "-movflags +faststart"
            ];

            switch (quality) {
                case 'low':
                    return [
                        ...baseOptions,
                        "-preset ultrafast", // Fastest encoding
                        "-crf 28",           // Lower quality, smaller file
                        "-threads 1",        // Minimal threads for 2GB RAM
                        "-bufsize 1M"        // Low buffer size
                    ];
                case 'medium':
                    return [
                        ...baseOptions,
                        "-preset fast",      // Fast encoding
                        "-crf 23",          // Balanced quality
                        "-threads 2",       // Reduced threads for low memory
                        "-bufsize 2M"       // Moderate buffer size
                    ];
                case 'high':
                    return [
                        ...baseOptions,
                        "-preset medium",    // Better quality
                        "-crf 18",          // High quality
                        "-threads 3",       // Limited threads for memory
                        "-bufsize 4M"       // Higher buffer for quality
                    ];
                default:
                    return baseOptions;
            }
        };

        // FFmpeg with timeout and process cleanup
        await new Promise<void>((resolve, reject) => {
            let isResolved = false;
            
            // Set timeout for FFmpeg (based on video length)
            const timeoutMs = Math.max(30000, duration * 10000); // At least 30s, or 10s per second of video
            const timeoutId = setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    reject(new Error(`FFmpeg timeout after ${timeoutMs}ms`));
                }
            }, timeoutMs);
            
            const command = ffmpeg(path.join(framesDir, "frame_%06d.png"))
                .inputFPS(fps)
                .outputOptions(getFFmpegOptions(videoQuality))
                .output(outputPath)
                .on("end", () => {
                    if (!isResolved) {
                        isResolved = true;
                        clearTimeout(timeoutId);
                        console.log("✓ FFmpeg encoding completed");
                        resolve();
                    }
                })
                .on("error", (err) => {
                    if (!isResolved) {
                        isResolved = true;
                        clearTimeout(timeoutId);
                        console.error("✗ FFmpeg error:", err);
                        reject(err);
                    }
                });

            command.run();
        });

        // Clean up frame files
        for (const framePath of framePaths) {
            try {
                await unlink(framePath);
            } catch (err) {
                console.warn(`Failed to delete frame: ${framePath}`, err);
            }
        }

        // Remove frames directory
        try {
            await fs.promises.rmdir(framesDir);
        } catch (err) {
            console.warn(
                `Failed to remove frames directory: ${framesDir}`,
                err
            );
        }

        // Get video file stats
        const stats = await fs.promises.stat(outputPath);

        // Create video URL
        const videoFilename = path.basename(outputPath);
        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        const videoUrl = `${baseUrl}/api/video/${videoFilename}`;

        // Final cleanup to ensure no hanging processes
        if (global.gc) {
            global.gc();
        }
        
        console.log("🎬 Video rendering completed successfully");
        
        return NextResponse.json({
            success: true,
            video: {
                url: videoUrl,
                path: outputPath,
                size: stats.size,
                frames: totalFrames,
                duration,
                fps,
                width,
                height
            }
        });
    } catch (error) {
        console.error("Render error:", error);
        
        // Cleanup on error too
        if (global.gc) {
            global.gc();
        }
        
        return NextResponse.json(
            {
                error: "Failed to render video",
                details:
                    error instanceof Error ? error.message : "Unknown error"
            },
            { status: 500 }
        );
    }
}
