import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { promisify } from "util";
import https from "https";
import http from "http";

const mkdir = promisify(fs.mkdir);

export interface AudioTrack {
    url: string;
    start: number;
    end?: number;
    volume: number;
}

export interface ValidatedAudioTrack extends AudioTrack {
    localPath: string;
    duration: number;
    isValid: boolean;
}

export interface AudioValidationResult {
    success: boolean;
    validatedTracks: ValidatedAudioTrack[];
    errors: string[];
}

/**
 * Downloads an audio file from URL to local temp directory
 */
async function downloadAudioFile(url: string, tempDir: string): Promise<string> {
    const filename = `audio_${Date.now()}_${Math.random().toString(36).substring(2, 11)}.${getFileExtension(url)}`;
    const localPath = path.join(tempDir, filename);

    // Handle Google Drive URLs specially
    if (isGoogleDriveUrl(url)) {
        return downloadFromGoogleDrive(url, tempDir, filename);
    }

    // For HTTP URLs, use generic HTTP download to handle redirects better
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return downloadAudioFileGeneric(url, tempDir, filename);
    }

    // For other URLs, try FFmpeg
    return new Promise((resolve, reject) => {
        const ffmpegArgs = [
            '-y', // Overwrite output files
            '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', // Add user agent
            '-i', url,
            '-c', 'copy', // Copy without re-encoding for speed
            '-t', '1800', // Limit to 30 minutes for safety
            localPath
        ];

        const ffmpeg = spawn('ffmpeg', ffmpegArgs);

        let stderr = '';
        ffmpeg.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        ffmpeg.on('close', (code: number) => {
            if (code === 0) {
                resolve(localPath);
            } else {
                console.error('FFmpeg download stderr:', stderr);
                reject(new Error(`Failed to download audio file: ${url} (code ${code})`));
            }
        });

        ffmpeg.on('error', (error) => {
            reject(new Error(`FFmpeg spawn error for ${url}: ${error.message}`));
        });

        // Timeout after 60 seconds
        setTimeout(() => {
            ffmpeg.kill('SIGKILL');
            reject(new Error(`Download timeout for ${url}`));
        }, 60000);
    });
}

/**
 * Gets audio file duration and validates format using ffprobe
 */
async function getAudioDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const ffprobe = spawn('ffprobe', [
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            filePath
        ]);

        let stdout = '';
        let stderr = '';

        ffprobe.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        ffprobe.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        ffprobe.on('close', (code: number) => {
            if (code === 0) {
                try {
                    const metadata = JSON.parse(stdout);
                    
                    // Check if file has audio streams
                    const audioStreams = metadata.streams?.filter((stream: any) => stream.codec_type === 'audio');
                    if (!audioStreams || audioStreams.length === 0) {
                        reject(new Error('No audio streams found in file'));
                        return;
                    }

                    // Get duration from format or first audio stream
                    const duration = parseFloat(metadata.format?.duration) || 
                                   parseFloat(audioStreams[0]?.duration) || 0;
                    
                    if (duration <= 0) {
                        reject(new Error('Invalid audio duration'));
                        return;
                    }

                    resolve(duration);
                } catch (error) {
                    reject(new Error(`Failed to parse ffprobe output: ${error instanceof Error ? error.message : 'Unknown error'}`));
                }
            } else {
                console.error('FFprobe stderr:', stderr);
                reject(new Error(`FFprobe failed with code ${code}`));
            }
        });

        ffprobe.on('error', (error) => {
            reject(new Error(`FFprobe spawn error: ${error.message}`));
        });

        // Timeout after 30 seconds
        setTimeout(() => {
            ffprobe.kill('SIGKILL');
            reject(new Error('FFprobe timeout'));
        }, 30000);
    });
}

/**
 * Validates a single audio track
 */
async function validateAudioTrack(track: AudioTrack, tempDir: string): Promise<ValidatedAudioTrack> {
    const result: ValidatedAudioTrack = {
        ...track,
        localPath: '',
        duration: 0,
        isValid: false
    };

    try {
        // Check if it's already a local file
        let localPath: string;
        if (isLocalFile(track.url)) {
            localPath = track.url;
            if (!fs.existsSync(localPath)) {
                throw new Error(`Local audio file not found: ${localPath}`);
            }
        } else {
            // Validate URL format
            try {
                const url = new URL(track.url);
                if (!['http:', 'https:'].includes(url.protocol)) {
                    throw new Error(`Invalid URL protocol: ${url.protocol}`);
                }
            } catch {
                throw new Error(`Invalid URL format: ${track.url}`);
            }

            // Download the file
            localPath = await downloadAudioFile(track.url, tempDir);
        }

        // Validate file and get duration
        const duration = await getAudioDuration(localPath);
        
        result.localPath = localPath;
        result.duration = duration;
        result.isValid = true;

        console.log(`✓ Audio validation success: ${track.url} (duration: ${duration}s)`);
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`✗ Audio validation failed: ${track.url} - ${errorMessage}`);
        
        // Cleanup downloaded file on error
        if (result.localPath && !isLocalFile(track.url)) {
            try {
                await fs.promises.unlink(result.localPath);
            } catch {}
        }
        
        throw new Error(`Audio validation failed for ${track.url}: ${errorMessage}`);
    }

    return result;
}

/**
 * Validates all audio tracks for a render job
 */
export async function validateAudioTracks(audioTracks: AudioTrack[]): Promise<AudioValidationResult> {
    const result: AudioValidationResult = {
        success: true,
        validatedTracks: [],
        errors: []
    };

    if (!audioTracks || audioTracks.length === 0) {
        return result;
    }

    // Create temp directory for audio files
    const tempDir = path.join(process.cwd(), "temp", "audio");
    await mkdir(tempDir, { recursive: true });

    console.log(`🎵 Validating ${audioTracks.length} audio track(s)...`);

    // Validate all tracks in parallel with limited concurrency
    const maxConcurrency = 3;
    for (let i = 0; i < audioTracks.length; i += maxConcurrency) {
        const batch = audioTracks.slice(i, i + maxConcurrency);
        const batchPromises = batch.map(async (track, batchIndex) => {
            const trackIndex = i + batchIndex;
            try {
                const validatedTrack = await validateAudioTrack(track, tempDir);
                return { index: trackIndex, track: validatedTrack, error: null };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                return { 
                    index: trackIndex, 
                    track: null, 
                    error: `Track ${trackIndex}: ${errorMessage}` 
                };
            }
        });

        const batchResults = await Promise.all(batchPromises);
        
        for (const batchResult of batchResults) {
            if (batchResult.error) {
                result.errors.push(batchResult.error);
                result.success = false;
            } else if (batchResult.track) {
                result.validatedTracks[batchResult.index] = batchResult.track;
            }
        }
    }

    if (result.success) {
        console.log(`✓ All ${audioTracks.length} audio track(s) validated successfully`);
    } else {
        console.error(`✗ Audio validation failed with ${result.errors.length} error(s)`);
        
        // Cleanup any successfully downloaded files
        for (const track of result.validatedTracks) {
            if (track && track.localPath && !isLocalFile(track.url)) {
                try {
                    await fs.promises.unlink(track.localPath);
                } catch {}
            }
        }
    }

    return result;
}

/**
 * Cleanup downloaded audio files
 */
export async function cleanupAudioFiles(validatedTracks: ValidatedAudioTrack[]): Promise<void> {
    for (const track of validatedTracks) {
        if (track.localPath && !isLocalFile(track.url)) {
            try {
                await fs.promises.unlink(track.localPath);
                console.log(`🗑️ Cleaned up audio file: ${track.localPath}`);
            } catch (error) {
                console.warn(`Failed to cleanup audio file ${track.localPath}:`, error);
            }
        }
    }
}

/**
 * Helper function to check if a path is a local file
 */
function isLocalFile(url: string): boolean {
    return url.startsWith('/') || url.startsWith('./') || url.match(/^[A-Za-z]:\\/) !== null;
}

/**
 * Helper function to check if URL is Google Drive
 */
function isGoogleDriveUrl(url: string): boolean {
    return url.includes('drive.google.com') || url.includes('docs.google.com');
}

/**
 * Generic HTTP download function that handles redirects
 */
async function downloadAudioFileGeneric(url: string, tempDir: string, filename: string): Promise<string> {
    const localPath = path.join(tempDir, filename);
    
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        };

        const httpModule = url.startsWith('https:') ? https : http;
        
        const req = httpModule.get(url, options, (res) => {
            // Handle all redirect status codes
            if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || 
                res.statusCode === 307 || res.statusCode === 308) {
                const redirectUrl = res.headers.location;
                if (redirectUrl) {
                    console.log(`HTTP redirect ${res.statusCode} to: ${redirectUrl}`);
                    // Follow redirect
                    downloadAudioFileGeneric(redirectUrl, tempDir, filename)
                        .then(resolve)
                        .catch(reject);
                    return;
                }
            }
            
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                return;
            }

            const fileStream = fs.createWriteStream(localPath);
            res.pipe(fileStream);

            fileStream.on('finish', () => {
                fileStream.close();
                console.log(`✓ HTTP download completed: ${localPath}`);
                resolve(localPath);
            });

            fileStream.on('error', (err) => {
                fs.unlink(localPath, () => {}); // Clean up partial file
                reject(new Error(`File write error: ${err.message}`));
            });
        });

        req.on('error', (err) => {
            reject(new Error(`HTTP request error: ${err.message}`));
        });

        req.setTimeout(120000, () => { // 2 minute timeout
            req.destroy();
            reject(new Error('HTTP download timeout'));
        });
    });
}

/**
 * Downloads file from Google Drive using Node.js HTTP
 */
async function downloadFromGoogleDrive(url: string, tempDir: string, filename: string): Promise<string> {
    console.log(`📥 Downloading from Google Drive: ${url}`);
    return downloadAudioFileGeneric(url, tempDir, filename);
}

/**
 * Helper function to get file extension from URL
 */
function getFileExtension(url: string): string {
    // For Google Drive, always use mp3 as default
    if (isGoogleDriveUrl(url)) {
        return 'mp3';
    }

    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const extension = path.extname(pathname).slice(1);
        
        // Default to mp3 if no extension found
        return extension || 'mp3';
    } catch {
        // If not a valid URL, treat as filename
        const extension = path.extname(url).slice(1);
        return extension || 'mp3';
    }
}