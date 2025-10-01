import { NextRequest, NextResponse } from "next/server";
import { chromium } from "playwright";
import ffmpeg from "fluent-ffmpeg";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import * as vm from "vm";
import { renderTaskManager } from "../../../lib/render-tasks";
import { RenderParams } from "@/app/api/render/types";
import { validateAudioTracks, cleanupAudioFiles, ValidatedAudioTrack } from "../../../lib/audio-validation";

const mkdir = promisify(fs.mkdir);
const unlink = promisify(fs.unlink);

interface FrameContext {
    time: number;
    frame: number;
    duration: number;
    width: number;
    height: number;
    [key: string]: unknown;
}

async function performRender(taskId: string, parameters: RenderParams) {
    const {
        width,
        height,
        duration,
        render,
        fps: requestedFps,
        quality,
        args,
        audio
    } = parameters;
    let validatedAudioTracks: ValidatedAudioTrack[] = [];
    try {
        console.log(`Starting render for task ${taskId}`);
        renderTaskManager.updateTaskStatus(taskId, "processing", 0);

        // Validate audio files first if provided
        if (audio && audio.length > 0) {
            console.log(`🎵 Validating ${audio.length} audio file(s) before render...`);
            renderTaskManager.updateTaskProgress(taskId, 5);
            
            const audioValidation = await validateAudioTracks(audio);
            if (!audioValidation.success) {
                throw new Error(`Audio validation failed: ${audioValidation.errors.join(', ')}`);
            }
            
            validatedAudioTracks = audioValidation.validatedTracks;
            console.log(`✓ All audio files validated and downloaded successfully`);
            renderTaskManager.updateTaskProgress(taskId, 10);
        }

        // Use optimized defaults for better performance
        const fps = requestedFps || 24; // Lower default FPS for better performance
        const videoQuality = quality || "medium";
        const totalFrames = Math.ceil(duration * fps);
        const tempDir = path.join(process.cwd(), "temp");
        const framesDir = path.join(tempDir, `frames_${Date.now()}`);
        const outputPath = path.join(tempDir, `video_${Date.now()}.mp4`);

        // Create temp directories
        await mkdir(tempDir, { recursive: true });
        await mkdir(framesDir, { recursive: true });

        // Use system Chromium (fallback to auto-detection if not exists)
        let executablePath: string | undefined = "/usr/lib/chromium/chromium";
        if (!fs.existsSync(executablePath)) {
            executablePath = undefined; // Let Playwright auto-detect
        }

        // Optimized Chrome args for lower CPU usage
        const chromeArgs = [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-gpu-sandbox",
            "--disable-software-rasterizer",
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding",
            "--disable-features=TranslateUI,AudioServiceOutOfProcess",
            "--no-first-run",
            "--disable-extensions",
            "--disable-default-apps",
            "--disable-background-networking",
            "--disable-breakpad",
            "--disable-client-side-phishing-detection",
            "--disable-component-extensions-with-background-pages",
            "--disable-domain-reliability",
            "--disable-hang-monitor",
            "--disable-popup-blocking",
            "--disable-prompt-on-repost",
            "--disable-sync",
            "--disable-translate",
            "--disable-web-security",
            "--hide-scrollbars",
            "--mute-audio",
            "--no-default-browser-check",
            "--no-pings",
            "--no-service-autorun",
            "--password-store=basic",
            "--use-mock-keychain",
            // Performance optimizations for 2GB RAM server
            "--enable-aggressive-domstorage-flushing",
            "--enable-low-end-device-mode",
            "--max_old_space_size=512", // Very low memory limit for 2GB server
            "--memory-pressure-off",
            "--aggressive-cache-discard",
            "--disable-background-media-suspend",
            "--disable-features=VizDisplayCompositor",
            "--force-device-scale-factor=1"
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
            for (
                let batchStart = 0;
                batchStart < totalFrames;
                batchStart += batchSize
            ) {
                const batchEnd = Math.min(batchStart + batchSize, totalFrames);

                for (let frame = batchStart; frame < batchEnd; frame++) {
                    const time = frame / fps;
                    const context: FrameContext = {
                        time,
                        frame,
                        duration,
                        width,
                        height,
                        ...(args || {})
                    };

                    // Update progress based on frames rendered (accounting for audio validation)
                    const baseProgress = validatedAudioTracks.length > 0 ? 10 : 0;
                    const progress = baseProgress + Math.floor((frame / totalFrames) * 65); // 65% for frames, 25% for encoding
                    renderTaskManager.updateTaskProgress(taskId, progress);

                    // Execute render function on server side to avoid browser evaluation issues
                    let renderResultRaw: {
                        html: string;
                        waitUntilString: string | null;
                    };
                    try {
                        // Use vm module for safe evaluation of render function (without template literal escaping)
                        const script = new vm.Script(`(${render})`);
                        const renderFunction = script.runInNewContext({
                            fetch
                        });
                        const result = await Promise.resolve(
                            renderFunction(context)
                        );

                        // Support both old string format and new object format
                        if (typeof result === "string") {
                            renderResultRaw = {
                                html: result,
                                waitUntilString: null
                            };
                        } else {
                            // Convert waitUntil function to string for serialization
                            const waitUntilString = result.waitUntil
                                ? result.waitUntil.toString()
                                : null;
                            renderResultRaw = {
                                html: result.html,
                                waitUntilString
                            };
                        }
                    } catch (error) {
                        console.error(
                            "Render function evaluation error:",
                            error
                        );
                        console.error("Error details:", {
                            message:
                                error instanceof Error
                                    ? error.message
                                    : "Unknown error",
                            stack:
                                error instanceof Error ? error.stack : undefined
                        });
                        throw new Error(
                            "Failed to evaluate render function: " +
                                (error instanceof Error
                                    ? error.message
                                    : "Unknown error")
                        );
                    }

                    // Clear body and set new HTML content
                    await page.evaluate((html: string) => {
                        // Clear previous content
                        document.body.innerHTML = "";
                        document.body.removeAttribute("data-ready");

                        // Extract HTML and script parts
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(html, "text/html");
                        const divElement = doc.querySelector("div");

                        // Set the div content
                        if (divElement) {
                            document.body.appendChild(divElement);
                        }
                    }, renderResultRaw.html);

                    // Execute the script using page.evaluate for proper async handling
                    const scriptContent = await page.evaluate(
                        (html: string) => {
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(
                                html,
                                "text/html"
                            );
                            const scriptElement = doc.querySelector("script");
                            return scriptElement
                                ? scriptElement.textContent
                                : null;
                        },
                        renderResultRaw.html
                    );

                    if (scriptContent) {
                        console.log("Executing script content...");
                        await page.evaluate((script: string) => {
                            console.log(
                                "About to eval script:",
                                script.substring(0, 100) + "..."
                            );
                            return eval(script);
                        }, scriptContent);
                    }

                    // Auto-detect images and wait for them to load
                    const hasImages = await page.evaluate(() => {
                        const imgs = document.querySelectorAll("img");
                        return imgs.length > 0;
                    });

                    if (hasImages) {
                        try {
                            console.log(
                                "Detected images, waiting for them to load..."
                            );
                            // Wait for all images to be loaded or errored
                            await page.evaluate(() => {
                                return new Promise<void>((resolve) => {
                                    const imgs = Array.from(
                                        document.querySelectorAll("img")
                                    );
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

                                    imgs.forEach((img) => {
                                        if (img.complete) {
                                            checkComplete();
                                        } else {
                                            img.addEventListener(
                                                "load",
                                                checkComplete,
                                                { once: true }
                                            );
                                            img.addEventListener(
                                                "error",
                                                checkComplete,
                                                { once: true }
                                            );
                                        }
                                    });
                                });
                            });
                            console.log("All images loaded!");
                        } catch (error) {
                            console.warn("Image loading timeout:", error);
                        }

                        // Always wait for network idle when images are present
                        try {
                            console.log("Waiting for network idle...");
                            await page.waitForLoadState("networkidle", {
                                timeout: 15000
                            });
                            console.log("Network idle!");
                        } catch (error) {
                            console.warn("Network idle timeout:", error);
                        }
                    }

                    // Wait based on waitUntil function (if provided)
                    if (renderResultRaw.waitUntilString) {
                        try {
                            console.log("Waiting for waitUntil condition...");
                            await page.waitForFunction(
                                renderResultRaw.waitUntilString,
                                { timeout: 25000 }
                            );
                            console.log("waitUntil condition met!");

                            // Debug: Check what's actually in the page after condition is met
                            const debugInfo = await page.evaluate(() => {
                                return {
                                    dataReady:
                                        document.body.getAttribute(
                                            "data-ready"
                                        ),
                                    boxElement:
                                        !!document.getElementById("box"),
                                    boxStyle:
                                        document.getElementById("box")?.style
                                            .background || "none",
                                    boxComputedStyle: window.getComputedStyle(
                                        document.getElementById("box") ||
                                            document.body
                                    ).background
                                };
                            });
                            console.log("Success debug info:", debugInfo);
                        } catch (error) {
                            // If timeout, continue anyway
                            console.warn(
                                "waitUntil function timeout, continuing anyway"
                            );
                            console.warn("Error:", error);

                            // Debug: Check what's actually in the page
                            const debugInfo = await page.evaluate(() => {
                                return {
                                    bodyContent:
                                        document.body.innerHTML.substring(
                                            0,
                                            500
                                        ),
                                    dataReady:
                                        document.body.getAttribute(
                                            "data-ready"
                                        ),
                                    boxElement:
                                        !!document.getElementById("box"),
                                    boxStyle:
                                        document.getElementById("box")?.style
                                            .background || "none"
                                };
                            });
                            console.log("Debug info:", debugInfo);
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
                        type: "png",
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
                    await new Promise((resolve) => setTimeout(resolve, 50)); // Longer delay for memory cleanup
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
                await new Promise((resolve) => setTimeout(resolve, 100));
            } catch (err) {
                console.warn("Failed to close browser:", err);
            }

            // Force garbage collection after browser cleanup
            if (global.gc) {
                global.gc();
                console.log("✓ Garbage collection triggered");
            }
        }

        // Update progress for encoding phase
        console.log(`📹 Starting video encoding for task ${taskId}`);
        const baseProgress = validatedAudioTracks.length > 0 ? 10 : 0;
        renderTaskManager.updateTaskProgress(taskId, baseProgress + 65);

        // Generate video with FFmpeg - optimized settings based on quality
        const getFFmpegOptions = (quality: string) => {
            const baseOptions = [
                "-c:v libx264",
                "-pix_fmt yuv420p",
                "-movflags +faststart"
            ];

            switch (quality) {
                case "low":
                    return [
                        ...baseOptions,
                        "-preset ultrafast", // Fastest encoding
                        "-crf 28", // Lower quality, smaller file
                        "-threads 1", // Minimal threads for 2GB RAM
                        "-bufsize 1M" // Low buffer size
                    ];
                case "medium":
                    return [
                        ...baseOptions,
                        "-preset fast", // Fast encoding
                        "-crf 23", // Balanced quality
                        "-threads 2", // Reduced threads for low memory
                        "-bufsize 2M" // Moderate buffer size
                    ];
                case "high":
                    return [
                        ...baseOptions,
                        "-preset medium", // Better quality
                        "-crf 18", // High quality
                        "-threads 3", // Limited threads for memory
                        "-bufsize 4M" // Higher buffer for quality
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
                        console.log(
                            `✓ FFmpeg encoding completed for task ${taskId}`
                        );
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
                })
                .on("progress", (progress) => {
                    if (progress.percent) {
                        const baseProgress = validatedAudioTracks.length > 0 ? 10 : 0;
                        const encodingProgress =
                            baseProgress + 65 + (progress.percent / 100) * 20; // 20% for encoding
                        renderTaskManager.updateTaskProgress(
                            taskId,
                            Math.floor(encodingProgress)
                        );
                    }
                });

            command.run();
        });

        console.log(
            `📊 Video encoding done for task ${taskId}, updating progress to ${baseProgress + 85}%`
        );
        renderTaskManager.updateTaskProgress(taskId, baseProgress + 85);

        // Audio mixing if audio tracks are provided
        if (validatedAudioTracks.length > 0) {
            console.log(`🎵 Adding ${validatedAudioTracks.length} validated audio track(s) to video`);

            const finalOutputPath = path.join(
                tempDir,
                `final_video_${Date.now()}.mp4`
            );

            await new Promise<void>((resolve, reject) => {
                let isResolved = false;

                let command = ffmpeg(outputPath);

                // Add audio inputs and build complex filter for all tracks using validated local files
                const audioFilters: string[] = [];
                const audioInputs: string[] = [];

                for (let i = 0; i < validatedAudioTracks.length; i++) {
                    const audioTrack = validatedAudioTracks[i];
                    command = command.input(audioTrack.localPath);

                    // Build audio filter for this track
                    let audioFilter = `[${i + 1}:a]`;

                    // Apply volume
                    if (audioTrack.volume !== 1) {
                        audioFilter += `volume=${audioTrack.volume}`;
                    } else {
                        audioFilter += `anull`; // pass through
                    }

                    // Apply timing (adelay for start, atrim for end)
                    if (audioTrack.start > 0) {
                        audioFilter += `,adelay=${Math.round(audioTrack.start * 1000)}:all=1`;
                    }

                    if (audioTrack.end !== undefined) {
                        const trimDuration = audioTrack.end - audioTrack.start;
                        audioFilter += `,atrim=duration=${trimDuration}`;
                    }

                    audioFilter += `[a${i}]`;
                    audioFilters.push(audioFilter);
                    audioInputs.push(`[a${i}]`);
                }

                // Mix all audio tracks together, but limit to video duration
                const mixFilter = audioInputs.join('') + `amix=inputs=${validatedAudioTracks.length}:duration=first[mixedaudio]`;
                audioFilters.push(mixFilter);

                // Combine video with mixed audio and limit audio duration to match video
                const complexFilter = audioFilters.join(';') + `;[mixedaudio]atrim=duration=${duration}[finalaudio]`;

                command
                    .complexFilter(complexFilter)
                    .outputOptions(['-map', '0:v', '-map', '[finalaudio]'])
                    .outputOptions(['-c:v', 'copy', '-c:a', 'aac'])
                    .outputOptions(['-shortest']) // Ensure output doesn't exceed video length
                    .output(finalOutputPath)
                    .on("end", () => {
                        if (!isResolved) {
                            isResolved = true;
                            console.log("✓ Audio mixing completed");
                            resolve();
                        }
                    })
                    .on("error", (err) => {
                        if (!isResolved) {
                            isResolved = true;
                            console.error("✗ Audio mixing error:", err);
                            reject(err);
                        }
                    })
                    .on("progress", (progress) => {
                        if (progress.percent) {
                            const baseProgress = validatedAudioTracks.length > 0 ? 10 : 0;
                            const mixingProgress =
                                baseProgress + 85 + (progress.percent / 100) * 5; // 5% for mixing
                            renderTaskManager.updateTaskProgress(
                                taskId,
                                Math.floor(mixingProgress)
                            );
                        }
                    });

                command.run();
            });

            // Replace original video with mixed version
            try {
                await unlink(outputPath);
                await fs.promises.rename(finalOutputPath, outputPath);
                console.log("✓ Replaced video with audio-mixed version");
            } catch (err) {
                console.error("Failed to replace video file:", err);
                throw err;
            }
        }

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
        const baseUrl = process.env.BASE_URL || "http://localhost:3000";
        const videoUrl = `${baseUrl}/api/video/${videoFilename}`;

        // Cleanup validated audio files after successful render
        if (validatedAudioTracks.length > 0) {
            try {
                await cleanupAudioFiles(validatedAudioTracks);
            } catch (cleanupError) {
                console.warn("Audio cleanup error:", cleanupError);
            }
        }

        // Final cleanup to ensure no hanging processes
        if (global.gc) {
            global.gc();
        }

        console.log("🎬 Video rendering completed successfully");

        const result = {
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
        };

        console.log(`✓ Render completed for task ${taskId}, setting result...`);
        renderTaskManager.setTaskResult(taskId, result);
        console.log(`✓ Task result set for ${taskId}`);
    } catch (error) {
        console.error("Render error:", error);

        // Cleanup validated audio files on error
        if (validatedAudioTracks.length > 0) {
            try {
                await cleanupAudioFiles(validatedAudioTracks);
            } catch (cleanupError) {
                console.warn("Audio cleanup error:", cleanupError);
            }
        }

        // Cleanup on error too
        if (global.gc) {
            global.gc();
        }

        const errorResult = {
            success: false,
            error: "Failed to render video",
            details: error instanceof Error ? error.message : "Unknown error"
        };

        console.log(
            `✗ Render failed for task ${taskId}, setting error result...`
        );
        renderTaskManager.setTaskResult(taskId, errorResult);
        console.log(`✗ Error result set for ${taskId}`);
    }
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
            fps?: number;
            quality?: "low" | "medium" | "high";
            args?: Record<string, unknown>;
            audio?: Array<{
                url: string;
                start: number;
                end?: number;
                volume: number;
            }>;
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

        const {
            width,
            height,
            duration,
            render,
            fps: requestedFps,
            quality,
            args,
            audio
        } = body;

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
        if (
            requestedFps !== undefined &&
            (typeof requestedFps !== "number" ||
                requestedFps <= 0 ||
                requestedFps > 60)
        ) {
            return NextResponse.json(
                { error: "fps must be a positive number between 1 and 60" },
                { status: 400 }
            );
        }

        if (
            quality !== undefined &&
            !["low", "medium", "high"].includes(quality)
        ) {
            return NextResponse.json(
                { error: "quality must be 'low', 'medium', or 'high'" },
                { status: 400 }
            );
        }

        // Validate audio parameter
        if (audio !== undefined) {
            if (!Array.isArray(audio)) {
                return NextResponse.json(
                    { error: "audio must be an array" },
                    { status: 400 }
                );
            }

            for (let i = 0; i < audio.length; i++) {
                const audioItem = audio[i];
                if (!audioItem || typeof audioItem !== "object") {
                    return NextResponse.json(
                        { error: `audio[${i}] must be an object` },
                        { status: 400 }
                    );
                }

                if (
                    typeof audioItem.url !== "string" ||
                    audioItem.url.trim() === ""
                ) {
                    return NextResponse.json(
                        { error: `audio[${i}].url must be a non-empty string` },
                        { status: 400 }
                    );
                }

                if (
                    typeof audioItem.start !== "number" ||
                    audioItem.start < 0
                ) {
                    return NextResponse.json(
                        {
                            error: `audio[${i}].start must be a non-negative number`
                        },
                        { status: 400 }
                    );
                }

                if (audioItem.start >= duration) {
                    return NextResponse.json(
                        {
                            error: `audio[${i}].start (${audioItem.start}) must be less than video duration (${duration})`
                        },
                        { status: 400 }
                    );
                }

                if (
                    audioItem.end !== undefined &&
                    (typeof audioItem.end !== "number" ||
                        audioItem.end <= audioItem.start)
                ) {
                    return NextResponse.json(
                        {
                            error: `audio[${i}].end must be a number greater than start`
                        },
                        { status: 400 }
                    );
                }

                if (audioItem.end !== undefined && audioItem.end > duration) {
                    return NextResponse.json(
                        {
                            error: `audio[${i}].end (${audioItem.end}) cannot exceed video duration (${duration})`
                        },
                        { status: 400 }
                    );
                }

                if (
                    typeof audioItem.volume !== "number" ||
                    audioItem.volume < 0 ||
                    audioItem.volume > 1
                ) {
                    return NextResponse.json(
                        {
                            error: `audio[${i}].volume must be a number between 0 and 1`
                        },
                        { status: 400 }
                    );
                }
            }
        }

        // Create a new task
        console.log("Creating new render task...");
        const taskId = renderTaskManager.createTask({
            width,
            height,
            duration,
            render,
            fps: requestedFps,
            quality,
            args,
            audio
        });
        console.log(`Task created with ID: ${taskId}`);

        // Start rendering in the background (don't await)
        performRender(taskId, {
            width,
            height,
            duration,
            render,
            fps: requestedFps,
            quality,
            args,
            audio
        }).catch((error) => {
            console.error(
                `Background render failed for task ${taskId}:`,
                error
            );
            console.error(
                "Error stack:",
                error instanceof Error ? error.stack : "No stack trace"
            );
            renderTaskManager.setTaskResult(taskId, {
                success: false,
                error: "Failed to render video",
                details:
                    error instanceof Error ? error.message : "Unknown error"
            });
        });

        // Return task ID immediately
        return NextResponse.json({
            success: true,
            taskId,
            message: "Rendering started in background"
        });
    } catch (error) {
        console.error("API error:", error);
        return NextResponse.json(
            {
                error: "Internal server error",
                details:
                    error instanceof Error ? error.message : "Unknown error"
            },
            { status: 500 }
        );
    }
}

export async function GET() {
    try {
        console.log("GET /api/render called");

        // Get all tasks from the task manager
        const allTasks = renderTaskManager.getAllTasks();
        console.log(`Found ${allTasks.length} tasks`);

        // Sort by creation time (newest first)
        const sortedTasks = allTasks.sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
        );

        return NextResponse.json({
            success: true,
            tasks: sortedTasks,
            count: sortedTasks.length
        });
    } catch (error) {
        console.error("GET API error:", error);
        return NextResponse.json(
            {
                error: "Internal server error",
                details:
                    error instanceof Error ? error.message : "Unknown error"
            },
            { status: 500 }
        );
    }
}
