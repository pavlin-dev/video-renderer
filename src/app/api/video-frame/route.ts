import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';

/**
 * Parse time string to seconds
 * Supports formats:
 * - Seconds: "2.5", "10"
 * - Minutes:Seconds: "1:30", "2:45"
 * - Hours:Minutes:Seconds: "1:23:45"
 */
function parseTimeToSeconds(timeStr: string): number | null {
  if (!timeStr) return null;
  
  // Try parsing as simple number (seconds)
  const asNumber = parseFloat(timeStr);
  if (!isNaN(asNumber)) {
    return asNumber;
  }
  
  // Try parsing as time format (MM:SS or HH:MM:SS)
  const timeParts = timeStr.split(':');
  if (timeParts.length === 2) {
    // MM:SS format
    const minutes = parseInt(timeParts[0], 10);
    const seconds = parseFloat(timeParts[1]);
    if (!isNaN(minutes) && !isNaN(seconds)) {
      return minutes * 60 + seconds;
    }
  } else if (timeParts.length === 3) {
    // HH:MM:SS format
    const hours = parseInt(timeParts[0], 10);
    const minutes = parseInt(timeParts[1], 10);
    const seconds = parseFloat(timeParts[2]);
    if (!isNaN(hours) && !isNaN(minutes) && !isNaN(seconds)) {
      return hours * 3600 + minutes * 60 + seconds;
    }
  }
  
  return null;
}

/**
 * Generate cache key for video frame
 */
function getCacheKey(videoUrl: string, time: number): string {
  const hash = crypto.createHash('md5');
  hash.update(`${videoUrl}_${time}`);
  return hash.digest('hex');
}

/**
 * Get cached frame if exists
 */
function getCachedFrame(cacheKey: string): Buffer | null {
  try {
    const tempDir = path.join(process.cwd(), 'temp');
    const cacheDir = path.join(tempDir, 'frame_cache');
    const cachedPath = path.join(cacheDir, `${cacheKey}.png`);
    
    if (fs.existsSync(cachedPath)) {
      const stats = fs.statSync(cachedPath);
      const now = Date.now();
      const cacheAge = now - stats.mtime.getTime();
      
      // Cache valid for 1 hour
      if (cacheAge < 60 * 60 * 1000) {
        return fs.readFileSync(cachedPath);
      } else {
        // Remove expired cache
        fs.unlinkSync(cachedPath);
      }
    }
  } catch (error) {
    console.warn('Cache read error:', error);
  }
  
  return null;
}

/**
 * Save frame to cache
 */
function setCachedFrame(cacheKey: string, frameBuffer: Buffer): void {
  try {
    const tempDir = path.join(process.cwd(), 'temp');
    const cacheDir = path.join(tempDir, 'frame_cache');
    
    // Ensure cache directory exists
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    
    const cachedPath = path.join(cacheDir, `${cacheKey}.png`);
    fs.writeFileSync(cachedPath, frameBuffer);
  } catch (error) {
    console.warn('Cache write error:', error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const videoUrl = searchParams.get('url');
    const timeParam = searchParams.get('time');

    // Validate required parameters
    if (!videoUrl) {
      return NextResponse.json(
        { error: 'Missing required parameter: url' },
        { status: 400 }
      );
    }

    if (!timeParam) {
      return NextResponse.json(
        { error: 'Missing required parameter: time' },
        { status: 400 }
      );
    }

    // Parse and validate time parameter (supports multiple formats)
    const time = parseTimeToSeconds(timeParam);
    if (time === null || time < 0) {
      return NextResponse.json(
        { error: 'Invalid time parameter: must be a non-negative number in seconds (e.g., "2.5") or time format (e.g., "1:30", "1:23:45")' },
        { status: 400 }
      );
    }

    // Check cache first
    const cacheKey = getCacheKey(videoUrl, time);
    const cachedFrame = getCachedFrame(cacheKey);
    if (cachedFrame) {
      console.log(`Cache hit for ${videoUrl} at ${time}s`);
      return new NextResponse(cachedFrame as BodyInit, {
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': cachedFrame.length.toString(),
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Validate video URL format
    let videoPath: string;
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    
    if (videoUrl.startsWith(`${baseUrl}/api/video/`)) {
      // Local video from our API
      const filename = videoUrl.split('/').pop();
      if (!filename || !filename.endsWith('.mp4')) {
        return NextResponse.json(
          { error: 'Invalid video filename' },
          { status: 400 }
        );
      }

      // Security: Prevent path traversal
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return NextResponse.json(
          { error: 'Invalid filename' },
          { status: 400 }
        );
      }

      videoPath = path.join(process.cwd(), 'temp', filename);
      
      // Check if local video file exists
      if (!fs.existsSync(videoPath)) {
        return NextResponse.json(
          { error: 'Video not found' },
          { status: 404 }
        );
      }
    } else {
      // External video URL - validate format
      try {
        const url = new URL(videoUrl);
        if (!['http:', 'https:'].includes(url.protocol)) {
          return NextResponse.json(
            { error: 'Invalid video URL: only HTTP and HTTPS protocols are supported' },
            { status: 400 }
          );
        }
      } catch (error) {
        return NextResponse.json(
          { error: 'Invalid video URL format' },
          { status: 400 }
        );
      }
      
      // For external URLs, use the URL directly as videoPath
      videoPath = videoUrl;
    }

    // Create temporary frame file
    const tempDir = path.join(process.cwd(), 'temp');
    const frameFilename = `frame_${Date.now()}_${Math.random().toString(36).substring(2, 11)}.png`;
    const frameOutputPath = path.join(tempDir, frameFilename);

    // Extract frame using ffmpeg
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-y', // Overwrite output file
        '-i', videoPath, // Input video
        '-ss', time.toString(), // Seek to specific time
        '-vframes', '1', // Extract only 1 frame
        '-f', 'image2', // Output format
        '-q:v', '2', // High quality
        frameOutputPath
      ]);

      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code: number) => {
        if (code === 0) {
          resolve();
        } else {
          console.error('FFmpeg stderr:', stderr);
          reject(new Error(`FFmpeg failed with code ${code}`));
        }
      });

      ffmpeg.on('error', (error) => {
        console.error('FFmpeg spawn error:', error);
        reject(error);
      });
    });

    // Check if frame was created
    if (!fs.existsSync(frameOutputPath)) {
      return NextResponse.json(
        { error: 'Failed to extract frame' },
        { status: 500 }
      );
    }

    // Read the frame file
    const frameBuffer = fs.readFileSync(frameOutputPath);

    // Save to cache
    setCachedFrame(cacheKey, frameBuffer);

    // Clean up temporary frame file
    try {
      fs.unlinkSync(frameOutputPath);
    } catch (err) {
      console.warn(`Failed to delete temporary frame: ${frameOutputPath}`, err);
    }

    // Return the frame as PNG image
    return new NextResponse(frameBuffer as BodyInit, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': frameBuffer.length.toString(),
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });

  } catch (error) {
    console.error('Video frame extraction error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to extract video frame',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}