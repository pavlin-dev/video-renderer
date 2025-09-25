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
 * Proper FFT-based frequency spectrum analysis
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

  // Find next power of 2 for FFT size
  let fftSize = 1;
  while (fftSize < samples.length) {
    fftSize *= 2;
  }
  fftSize = Math.min(fftSize, 8192); // Cap at reasonable size

  // Pad or truncate samples to FFT size
  const paddedSamples = new Array(fftSize).fill(0);
  for (let i = 0; i < Math.min(samples.length, fftSize); i++) {
    paddedSamples[i] = samples[i];
  }

  // Apply Hanning window
  for (let i = 0; i < paddedSamples.length; i++) {
    const windowValue = 0.5 * (1 - Math.cos(2 * Math.PI * i / (paddedSamples.length - 1)));
    paddedSamples[i] *= windowValue;
  }

  // Perform FFT
  const fftResult = performFFT(paddedSamples);
  
  // Calculate magnitude spectrum
  const magnitudes: number[] = [];
  for (let i = 0; i < fftResult.length / 2; i++) {
    const real = fftResult[i * 2];
    const imag = fftResult[i * 2 + 1];
    const magnitude = Math.sqrt(real * real + imag * imag);
    magnitudes.push(magnitude);
  }

  // Map FFT bins to frequency bars
  const spectrum: number[] = [];
  const sampleRate = 44100;
  const nyquist = sampleRate / 2;
  
  for (let bar = 0; bar < bars; bar++) {
    // Logarithmic frequency distribution
    const freqStart = 20 * Math.pow(nyquist / 20, bar / bars);
    const freqEnd = 20 * Math.pow(nyquist / 20, (bar + 1) / bars);
    
    // Convert to FFT bin indices
    const binStart = Math.floor(freqStart * fftSize / sampleRate);
    const binEnd = Math.floor(freqEnd * fftSize / sampleRate);
    
    // Average magnitude in this frequency range
    let sum = 0;
    let count = 0;
    for (let bin = binStart; bin <= Math.min(binEnd, magnitudes.length - 1); bin++) {
      sum += magnitudes[bin];
      count++;
    }
    
    const avgMagnitude = count > 0 ? sum / count : 0;
    // Apply logarithmic scaling for better visual representation
    const scaledValue = Math.min(Math.log10(avgMagnitude * 10 + 1) / 2, 1.0);
    spectrum.push(scaledValue);
  }

  // Apply smoothing if requested
  if (smoothness > 0) {
    const smoothed: number[] = [...spectrum];
    const factor = Math.min(smoothness, 0.8);
    
    for (let i = 1; i < spectrum.length - 1; i++) {
      smoothed[i] = spectrum[i] * (1 - factor) + 
                   (spectrum[i-1] + spectrum[i+1]) * factor * 0.5;
    }
    
    return smoothed;
  }

  return spectrum;
}

/**
 * Simple FFT implementation using Cooley-Tukey algorithm
 */
function performFFT(samples: number[]): number[] {
  const N = samples.length;
  if (N <= 1) return [...samples, ...new Array(N).fill(0)];
  
  // Ensure N is power of 2
  if ((N & (N - 1)) !== 0) {
    throw new Error('FFT size must be power of 2');
  }
  
  // Bit-reverse permutation
  const result = new Array(N * 2); // Interleaved real, imaginary
  for (let i = 0; i < N; i++) {
    const j = bitReverse(i, Math.log2(N));
    result[j * 2] = samples[i]; // Real part
    result[j * 2 + 1] = 0; // Imaginary part
  }
  
  // Cooley-Tukey FFT
  for (let size = 2; size <= N; size *= 2) {
    const halfsize = size / 2;
    const tablestep = N / size;
    
    for (let i = 0; i < N; i += size) {
      for (let j = i, k = 0; j < i + halfsize; j++, k += tablestep) {
        const angle = -2 * Math.PI * k / N;
        const wReal = Math.cos(angle);
        const wImag = Math.sin(angle);
        
        const uReal = result[j * 2];
        const uImag = result[j * 2 + 1];
        const vReal = result[(j + halfsize) * 2] * wReal - result[(j + halfsize) * 2 + 1] * wImag;
        const vImag = result[(j + halfsize) * 2] * wImag + result[(j + halfsize) * 2 + 1] * wReal;
        
        result[j * 2] = uReal + vReal;
        result[j * 2 + 1] = uImag + vImag;
        result[(j + halfsize) * 2] = uReal - vReal;
        result[(j + halfsize) * 2 + 1] = uImag - vImag;
      }
    }
  }
  
  return result;
}

/**
 * Bit-reverse function for FFT
 */
function bitReverse(n: number, bits: number): number {
  let result = 0;
  for (let i = 0; i < bits; i++) {
    result = (result << 1) | (n & 1);
    n >>= 1;
  }
  return result;
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