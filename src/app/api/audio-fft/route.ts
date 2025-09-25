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
function getCacheKey(audioUrl: string, time: number, bars: number, smoothness: number = 0, frames: number = 1): string {
  const hash = crypto.createHash('md5');
  hash.update(`${audioUrl}_${time}_${bars}_${smoothness}_${frames}`);
  return hash.digest('hex');
}

/**
 * Get cached FFT data
 */
function getCachedFFT(cacheKey: string): number[] | number[][] | null {
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
function setCachedFFT(cacheKey: string, spectrum: number[] | number[][]): void {
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
  bars: number = 32,
  smoothness: number = 0,
  frameCount: number = 1 // Number of time frames to analyze
): Promise<number[][] | number[]> {
  const tempDir = path.join(process.cwd(), 'temp');
  const segmentPath = path.join(tempDir, `audio_segment_${Date.now()}_${Math.random().toString(36).substring(2, 11)}.wav`);
  
  // If only one frame is requested, return the original format
  if (frameCount === 1) {
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

    try {
      const wavData = fs.readFileSync(segmentPath);
      const spectrum = analyzeWAVSpectrum(wavData, bars, smoothness);
      
      // Cleanup
      try {
        fs.unlinkSync(segmentPath);
      } catch {}
      
      return spectrum;
    } catch (error) {
      // Cleanup on error
      try {
        fs.unlinkSync(segmentPath);
      } catch {}
      throw error;
    }
  }

  // Multi-frame analysis - return spectrum over time
  const frameSpectrums: number[][] = [];
  const frameDuration = duration; // Duration per frame
  
  for (let frame = 0; frame < frameCount; frame++) {
    const frameTime = time + (frame * frameDuration);
    const frameSegmentPath = path.join(tempDir, `audio_frame_${Date.now()}_${frame}_${Math.random().toString(36).substring(2, 11)}.wav`);
    
    try {
      // Extract this frame's audio segment
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-y',
          '-i', audioPath,
          '-ss', frameTime.toString(),
          '-t', frameDuration.toString(),
          '-ar', '44100',
          '-ac', '1',
          '-f', 'wav',
          frameSegmentPath
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

      // Analyze this frame
      const wavData = fs.readFileSync(frameSegmentPath);
      const frameSpectrum = analyzeWAVSpectrum(wavData, bars, smoothness);
      frameSpectrums.push(frameSpectrum);
      
      // Cleanup frame file
      try {
        fs.unlinkSync(frameSegmentPath);
      } catch {}
      
    } catch (error) {
      console.error(`Error analyzing frame ${frame}:`, error);
      // Add zeros for failed frames to maintain array structure
      frameSpectrums.push(new Array(bars).fill(0));
      
      // Cleanup on error
      try {
        fs.unlinkSync(frameSegmentPath);
      } catch {}
    }
  }

  return frameSpectrums;
}

/**
 * Proper FFT spectrum analysis
 */
function analyzeWAVSpectrum(wavBuffer: Buffer, bars: number, smoothness: number = 0): number[] {
  // WAV header is 44 bytes
  const headerSize = 44;
  const audioData = wavBuffer.slice(headerSize);
  
  // Convert bytes to 16-bit samples
  const samples: number[] = [];
  for (let i = 0; i < audioData.length - 1; i += 2) {
    const sample = audioData.readInt16LE(i);
    samples.push(sample / 32768.0); // Normalize to -1 to 1
  }

  // Perform FFT analysis
  const fftSize = Math.pow(2, Math.floor(Math.log2(samples.length)));
  const fftSamples = samples.slice(0, fftSize);
  
  // Apply windowing function (Hanning window)
  for (let i = 0; i < fftSamples.length; i++) {
    const windowValue = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSamples.length - 1)));
    fftSamples[i] *= windowValue;
  }
  
  // Simple DFT implementation for frequency analysis
  const spectrum: number[] = [];
  const nyquistFreq = fftSize / 2;
  const freqBinSize = nyquistFreq / bars;
  
  for (let band = 0; band < bars; band++) {
    const startBin = Math.floor(band * freqBinSize);
    const endBin = Math.floor((band + 1) * freqBinSize);
    
    let magnitude = 0;
    let count = 0;
    
    for (let freqBin = startBin; freqBin < endBin && freqBin < nyquistFreq; freqBin++) {
      // Calculate magnitude for this frequency bin using DFT
      let real = 0;
      let imag = 0;
      
      const freq = (freqBin * 2 * Math.PI) / fftSize;
      
      for (let n = 0; n < fftSamples.length; n++) {
        real += fftSamples[n] * Math.cos(freq * n);
        imag -= fftSamples[n] * Math.sin(freq * n);
      }
      
      magnitude += Math.sqrt(real * real + imag * imag);
      count++;
    }
    
    if (count > 0) {
      magnitude = (magnitude / count) / fftSize; // Normalize
      spectrum.push(Math.min(magnitude * 4, 1.0)); // Scale and clamp
    } else {
      spectrum.push(0);
    }
  }

  // Apply smoothing if requested
  if (smoothness > 0) {
    const windowSize = Math.max(1, Math.floor(smoothness * bars / 10));
    const halfWindow = Math.floor(windowSize / 2);
    const smoothed: number[] = [];
    
    for (let i = 0; i < spectrum.length; i++) {
      let sum = 0;
      let count = 0;
      
      for (let k = -halfWindow; k <= halfWindow; k++) {
        const idx = i + k;
        if (idx >= 0 && idx < spectrum.length) {
          sum += spectrum[idx];
          count++;
        }
      }
      
      smoothed.push(sum / count);
    }
    
    return smoothed;
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
    const smoothnessParam = searchParams.get('smoothness');
    const framesParam = searchParams.get('frames');

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
    const smoothness = smoothnessParam ? parseFloat(smoothnessParam) : 0;
    const frames = framesParam ? parseInt(framesParam, 10) : 1;

    if (bars < 1 || bars > 256) {
      return NextResponse.json(
        { error: 'bars must be between 1 and 256' },
        { status: 400 }
      );
    }

    if (smoothness < 0 || smoothness > 1) {
      return NextResponse.json(
        { error: 'smoothness must be between 0 and 1' },
        { status: 400 }
      );
    }

    if (frames < 1 || frames > 100) {
      return NextResponse.json(
        { error: 'frames must be between 1 and 100' },
        { status: 400 }
      );
    }

    // Check cache first
    const cacheKey = getCacheKey(audioUrl, time, bars, smoothness, frames);
    const cachedSpectrum = getCachedFFT(cacheKey);
    if (cachedSpectrum) {
      console.log(`FFT cache hit for ${audioUrl} at ${time}s with ${frames} frames`);
      return NextResponse.json({
        success: true,
        time,
        bars,
        frames,
        duration,
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
      } catch {
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
    console.log(`Analyzing FFT for ${audioUrl} at ${time}s with ${bars} bars (smoothness: ${smoothness}, frames: ${frames})...`);
    const spectrum = await analyzeAudioFFT(audioPath, time, duration, bars, smoothness, frames);

    // Cache the result
    setCachedFFT(cacheKey, spectrum);

    return NextResponse.json({
      success: true,
      time,
      bars,
      frames,
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