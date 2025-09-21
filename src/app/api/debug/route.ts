import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export async function GET() {
    try {
        const debugInfo = {
            timestamp: new Date().toISOString(),
            nodeUser: process.getuid?.() || 'unknown',
            cacheDir: '/home/node/.cache/ms-playwright',
            directories: {} as Record<string, unknown>,
            files: {} as Record<string, unknown>,
            env: {
                NODE_ENV: process.env.NODE_ENV,
                PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH,
                PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD
            }
        };

        // Check if cache directory exists
        const cacheDir = '/home/node/.cache/ms-playwright';
        if (fs.existsSync(cacheDir)) {
            debugInfo.directories.cacheExists = true;
            try {
                const cacheDirContents = fs.readdirSync(cacheDir);
                debugInfo.directories.cacheContents = cacheDirContents;

                // Check chromium directory
                for (const item of cacheDirContents) {
                    if (item.startsWith('chromium')) {
                        const chromiumDir = path.join(cacheDir, item);
                        const chromeLinuxDir = path.join(chromiumDir, 'chrome-linux');
                        
                        debugInfo.directories[item] = {
                            exists: fs.existsSync(chromiumDir),
                            chromeLinux: fs.existsSync(chromeLinuxDir)
                        };

                        if (fs.existsSync(chromeLinuxDir)) {
                            const chromeLinuxContents = fs.readdirSync(chromeLinuxDir);
                            debugInfo.files[item] = chromeLinuxContents.filter(f => 
                                f.includes('chrome') || f.includes('chromium')
                            );

                            // Check specific executables
                            const executables = [
                                'chrome',
                                'chromium', 
                                'chrome_crashpad_handler',
                                'headless_shell'
                            ];

                            for (const exe of executables) {
                                const exePath = path.join(chromeLinuxDir, exe);
                                debugInfo.files[`${item}_${exe}`] = {
                                    exists: fs.existsSync(exePath),
                                    path: exePath,
                                    executable: fs.existsSync(exePath) ? (fs.statSync(exePath).mode & 0o111) !== 0 : false
                                };
                            }
                        }
                    }
                }
            } catch (error) {
                debugInfo.directories.error = String(error);
            }
        } else {
            debugInfo.directories.cacheExists = false;
        }

        return NextResponse.json(debugInfo, { status: 200 });
    } catch (error) {
        return NextResponse.json(
            { error: 'Debug failed', details: String(error) },
            { status: 500 }
        );
    }
}