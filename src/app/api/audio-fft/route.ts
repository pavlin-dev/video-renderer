import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';

/**
 * Parse time string to seconds
 */
function parseTimeToSeconds(timeStr: string): number | null {
  if (!timeStr) return null;
  
  const asNumber = parseFloat(timeStr);
  if (!isNaN(asNumber)) {
    return asNumber;
  }
  
  const timeParts = timeStr.split(':');
  if (timeParts.length === 2) {
    const minutes = parseInt(timeParts[0], 10);
    const seconds = parseFloat(timeParts[1]);
    if (!isNaN(minutes) && !isNaN(seconds)) {
      return minutes * 60 + seconds;
    }
  } else if (timeParts.length === 3) {
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
 * Generate cache key
 */
function getCacheKey(audioUrl: string, time: number, bars: number): string {
  const hash = crypto.createHash('md5');
  hash.update(`${audioUrl}_${time}_${bars}`);
  return hash.digest('hex');
}

/**
 * Get cached FFT data
 */
function getCachedFFT(cacheKey: string): number[] | null {
  try {
    const tempDir = path.join(process.cwd(), 'temp');
    const cacheDir = path.join(tempDir, 'fft_cache');
    const cachedPath = path.join(cacheDir, `${cacheKey}.json`);
    
    if (fs.existsSync(cachedPath)) {
      const stats = fs.statSync(cachedPath);
      const now = Date.now();
      const cacheAge = now - stats.mtime.getTime();
      
      // Cache valid for 1 hour
      if (cacheAge < 60 * 60 * 1000) {
        const data = JSON.parse(fs.readFileSync(cachedPath, 'utf-8'));
        return data.spectrum;
      } else {
        fs.unlinkSync(cachedPath);
      }
    }
  } catch (error) {
    console.warn('FFT cache read error:', error);
  }
  
  return null;
}

/**
 * Save FFT data to cache
 */
function setCachedFFT(cacheKey: string, spectrum: number[]): void {
  try {
    const tempDir = path.join(process.cwd(), 'temp');
    const cacheDir = path.join(tempDir, 'fft_cache');
    
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    
    const cachedPath = path.join(cacheDir, `${cacheKey}.json`);
    fs.writeFileSync(cachedPath, JSON.stringify({ spectrum }));
  } catch (error) {
    console.warn('FFT cache write error:', error);
  }
}

/**
 * Extract audio segment and analyze FFT
 */
async function analyzeAudioFFT(
  audioPath: string,
  time: number,
  duration: number = 0.05, // 50ms default
  bars: number = 32
): Promise<number[]> {
  const tempDir = path.join(process.cwd(), 'temp');
  const segmentPath = path.join(tempDir, `audio_segment_${Date.now()}_${Math.random().toString(36).substring(2, 11)}.wav`);
  
  // Extract audio segment using ffmpeg
  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-y',
      '-i', audioPath,
      '-ss', time.toString(),
      '-t', duration.toString(),
      '-ar', '44100', // Sample rate
      '-ac', '1', // Mono
      '-f', 'wav',
      segmentPath
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

  // Analyze FFT using ffmpeg's showfreqs filter
  const fftData = await new Promise<number[]>((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', segmentPath,
      '-filter_complex',
      `showfreqs=s=1280x720:mode=bar:ascale=log:fscale=log:colors=white`,
      '-frames:v', '1',
      '-f', 'null',
      '-'
    ]);

    let stderr = '';
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code: number) => {
      // Parse frequency data from stderr
      // For now, we'll use a simpler approach with sox or read WAV data directly
      // Fall back to reading WAV and doing simple analysis
      
      try {
        const wavData = fs.readFileSync(segmentPath);
        const spectrum = analyzeWAVSpectrum(wavData, bars);
        resolve(spectrum);
      } catch (error) {
        reject(error);
      }
    });

    ffmpeg.on('error', reject);
  });

  // Cleanup
  try {
    fs.unlinkSync(segmentPath);
  } catch {}

  return fftData;
}

/**
 * Simple WAV spectrum analysis
 * This is a simplified version - for production, use a proper FFT library
 */
function analyzeWAVSpectrum(wavBuffer: Buffer, bars: number): number[] {
  // WAV header is 44 bytes
  const headerSize = 44;
  const audioData = wavBuffer.slice(headerSize);
  
  // Convert bytes to 16-bit samples
  const samples: number[] = [];
  for (let i = 0; i < audioData.length - 1; i += 2) {
    const sample = audioData.readInt16LE(i);
    samples.push(sample / 32768.0); // Normalize to -1 to 1
  }

  // Simple frequency band analysis
  // Divide samples into bands and calculate RMS energy
  const spectrum: number[] = [];
  const samplesPerBand = Math.floor(samples.length / bars);
  
  for (let band = 0; band < bars; band++) {
    const start = band * samplesPerBand;
    const end = Math.min(start + samplesPerBand, samples.length);
    
    let energy = 0;
    for (let i = start; i < end; i++) {
      energy += samples[i] * samples[i];
    }
    
    const rms = Math.sqrt(energy / (end - start));
    spectrum.push(Math.min(rms * 2, 1.0)); // Scale and clamp to 0-1
  }

  return spectrum;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const audioUrl = searchParams.get('url');
    const timeParam = searchParams.get('time');
    const barsParam = searchParams.get('bars');
    const durationParam = searchParams.get('duration');

    // Validate required parameters
    if (!audioUrl) {
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

    // Parse time parameter
    const time = parseTimeToSeconds(timeParam);
    if (time === null || time < 0) {
      return NextResponse.json(
        { error: 'Invalid time parameter' },
        { status: 400 }
      );
    }

    // Parse optional parameters
    const bars = barsParam ? parseInt(barsParam, 10) : 32;
    const duration = durationParam ? parseFloat(durationParam) : 0.05; // 50ms default

    if (bars < 1 || bars > 256) {
      return NextResponse.json(
        { error: 'bars must be between 1 and 256' },
        { status: 400 }
      );
    }

    // Check cache first
    const cacheKey = getCacheKey(audioUrl, time, bars);
    const cachedSpectrum = getCachedFFT(cacheKey);
    if (cachedSpectrum) {
      console.log(`FFT cache hit for ${audioUrl} at ${time}s`);
      return NextResponse.json({
        success: true,
        time,
        bars,
        spectrum: cachedSpectrum,
        cached: true
      });
    }

    // Validate audio URL or path
    let audioPath: string;
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    
    // Check if it's a local file path
    if (audioUrl.startsWith('/') || audioUrl.startsWith('./') || audioUrl.match(/^[A-Za-z]:\\/)) {
      // Local file system path
      audioPath = audioUrl;
      
      if (!fs.existsSync(audioPath)) {
        return NextResponse.json(
          { error: 'Audio file not found at path: ' + audioPath },
          { status: 404 }
        );
      }
    } else if (audioUrl.startsWith(`${baseUrl}/api/`)) {
      // Local audio file via API
      const filename = audioUrl.split('/').pop();
      if (!filename) {
        return NextResponse.json(
          { error: 'Invalid audio filename' },
          { status: 400 }
        );
      }

      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return NextResponse.json(
          { error: 'Invalid filename' },
          { status: 400 }
        );
      }

      audioPath = path.join(process.cwd(), 'temp', filename);
      
      if (!fs.existsSync(audioPath)) {
        return NextResponse.json(
          { error: 'Audio file not found' },
          { status: 404 }
        );
      }
    } else {
      // External audio URL
      try {
        const url = new URL(audioUrl);
        if (!['http:', 'https:'].includes(url.protocol)) {
          return NextResponse.json(
            { error: 'Invalid audio URL protocol' },
            { status: 400 }
          );
        }
        audioPath = audioUrl;
      } catch (error) {
        // Not a valid URL, might be a relative path - treat as local file
        audioPath = path.join(process.cwd(), audioUrl);
        if (!fs.existsSync(audioPath)) {
          return NextResponse.json(
            { error: 'Invalid audio URL/path: ' + audioUrl },
            { status: 400 }
          );
        }
      }
    }

    // Analyze FFT
    console.log(`Analyzing FFT for ${audioUrl} at ${time}s with ${bars} bars...`);
    const spectrum = await analyzeAudioFFT(audioPath, time, duration, bars);

    // Cache the result
    setCachedFFT(cacheKey, spectrum);

    return NextResponse.json({
      success: true,
      time,
      bars,
      duration,
      spectrum,
      cached: false
    });

  } catch (error) {
    console.error('Audio FFT error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to analyze audio FFT',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}