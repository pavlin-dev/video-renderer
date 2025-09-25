import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
    try {
        // Get process information
        const [psOutput, memInfo] = await Promise.all([
            execAsync('ps aux | grep -E "(chrome|chromium|ffmpeg|node)" | grep -v grep'),
            execAsync('cat /proc/meminfo | grep -E "(MemTotal|MemFree|MemAvailable)"')
        ]);

        const processInfo = {
            timestamp: new Date().toISOString(),
            processes: psOutput.stdout.split('\n').filter(line => line.trim()),
            memory: memInfo.stdout.split('\n').filter(line => line.trim()),
            nodeMemory: process.memoryUsage(),
            uptime: process.uptime()
        };

        return NextResponse.json(processInfo, { status: 200 });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to get process info', details: String(error) },
            { status: 500 }
        );
    }
}