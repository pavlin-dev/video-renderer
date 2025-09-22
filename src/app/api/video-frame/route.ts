import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

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

    // Parse and validate time parameter
    const time = parseFloat(timeParam);
    if (isNaN(time) || time < 0) {
      return NextResponse.json(
        { error: 'Invalid time parameter: must be a non-negative number' },
        { status: 400 }
      );
    }

    // Validate video URL - must be a local video from our API
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    if (!videoUrl.startsWith(`${baseUrl}/api/video/`)) {
      return NextResponse.json(
        { error: 'Invalid video URL: must be a local video from our API' },
        { status: 400 }
      );
    }

    // Extract filename from URL
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

    const videoPath = path.join(process.cwd(), 'temp', filename);
    
    // Check if video file exists
    if (!fs.existsSync(videoPath)) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }

    // Create temporary frame file
    const tempDir = path.join(process.cwd(), 'temp');
    const frameFilename = `frame_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.png`;
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

    // Clean up temporary frame file
    try {
      fs.unlinkSync(frameOutputPath);
    } catch (err) {
      console.warn(`Failed to delete temporary frame: ${frameOutputPath}`, err);
    }

    // Return the frame as PNG image
    return new NextResponse(frameBuffer, {
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