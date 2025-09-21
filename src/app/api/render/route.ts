import { NextRequest, NextResponse } from "next/server";
import { chromium } from "playwright";
import ffmpeg from "fluent-ffmpeg";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";

const mkdir = promisify(fs.mkdir);
const unlink = promisify(fs.unlink);


interface FrameContext {
    time: number;
    frame: number;
    duration: number;
    width: number;
    height: number;
}

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

        const { width, height, duration, render } = body;

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

        const fps = 30;
        const totalFrames = Math.ceil(duration * fps);
        const tempDir = path.join(process.cwd(), "temp");
        const framesDir = path.join(tempDir, `frames_${Date.now()}`);
        const outputPath = path.join(tempDir, `video_${Date.now()}.mp4`);

        // Create temp directories
        await mkdir(tempDir, { recursive: true });
        await mkdir(framesDir, { recursive: true });

        // Launch browser with fallback executable paths for different architectures
        const possiblePaths = [
            '/home/node/.cache/ms-playwright/chromium-1187/chrome-linux/chrome',  // x64
            '/home/node/.cache/ms-playwright/chromium-1187/chrome-linux/chromium', // fallback
        ];
        
        let executablePath: string | undefined = undefined;
        for (const path of possiblePaths) {
            try {
                if (fs.existsSync(path)) {
                    executablePath = path;
                    break;
                }
            } catch {
                // Continue to next path
            }
        }

        const browser = await chromium.launch({
            executablePath,
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-extensions'
            ]
        });
        const page = await browser.newPage();
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
          <script>
            const renderFunction = ${render};
            window.updateFrame = (context) => {
              const html = renderFunction(context);
              document.body.innerHTML = html;
            };
          </script>
        </body>
      </html>
    `;

        await page.setContent(htmlTemplate);

        const framePaths: string[] = [];

        // Render frames
        for (let frame = 0; frame < totalFrames; frame++) {
            const time = frame / fps;
            const context: FrameContext = {
                time,
                frame,
                duration,
                width,
                height
            };

            // Execute render function
            await page.evaluate((ctx: FrameContext) => {
                (window as unknown as { updateFrame: (ctx: FrameContext) => void }).updateFrame(ctx);
            }, context);

            // Capture screenshot
            const framePath = path.join(
                framesDir,
                `frame_${frame.toString().padStart(6, "0")}.png`
            );
            await page.screenshot({ path: framePath, fullPage: false });
            framePaths.push(framePath);
        }

        await browser.close();

        // Generate video with FFmpeg
        await new Promise<void>((resolve, reject) => {
            const command = ffmpeg(path.join(framesDir, "frame_%06d.png"))
                .inputFPS(fps)
                .outputOptions([
                    "-c:v libx264",
                    "-pix_fmt yuv420p",
                    "-movflags +faststart"
                ])
                .output(outputPath)
                .on("end", () => resolve())
                .on("error", reject);

            // Use system ffmpeg - make sure it's installed
            // You can install it with: brew install ffmpeg

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
