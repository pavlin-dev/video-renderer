/**
 * @jest-environment node
 */

import { spawn, ChildProcess } from 'child_process';

// Use dynamic import for node-fetch to avoid ES module issues
const fetch = async (url: string, options?: any) => {
  const { default: nodeFetch } = await import('node-fetch');
  return nodeFetch(url, options);
};

describe('Video Render API Integration Test', () => {
  let serverProcess: ChildProcess;
  const serverPort = 3001;
  const serverUrl = `http://localhost:${serverPort}`;

  beforeAll(async () => {
    // Start the Next.js dev server
    serverProcess = spawn('npm', ['run', 'dev', '--', '--port', serverPort.toString()], {
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'development' }
    });

    // Wait for server to start
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server failed to start within 30 seconds'));
      }, 30000);

      const checkServer = async () => {
        try {
          const response = await fetch(`${serverUrl}/api/render`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}' // This will fail but confirms server is running
          });
          clearTimeout(timeout);
          resolve();
        } catch (error) {
          // Server not ready yet, try again
          setTimeout(checkServer, 1000);
        }
      };

      checkServer();
    });
  }, 35000);

  afterAll(async () => {
    // Kill the server process
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      
      // Wait a bit for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Force kill if still running
      if (!serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
    }
  });

  it('should successfully render video with real data and functions', async () => {
    const testData = {
      width: 1080,
      height: 1920, 
      duration: 1,
      render: "({time}) => { document.body.innerHTML = `<h1>ahojda ${time}</h1>`; document.body.style.backgroundColor = 'red'; }"
    };

    const response = await fetch(`${serverUrl}/api/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData)
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Response error:', result);
    }

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.video).toMatchObject({
      frames: 30, // 1 second * 30 fps
      duration: 1,
      width: 1080,
      height: 1920,
    });
    expect(result.video.size).toBeGreaterThan(0);
    expect(result.video.path).toContain('.mp4');
  }, 60000); // 60 second timeout for video rendering

  it('should return 400 for invalid data', async () => {
    const invalidData = {
      width: 1080,
      // missing required fields
    };

    const response = await fetch(`${serverUrl}/api/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(invalidData)
    });

    const result = await response.json();

    expect(response.status).toBe(400);
    expect(result.error).toBeDefined();
  });

  it('should return 400 for invalid content type', async () => {
    const response = await fetch(`${serverUrl}/api/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'width=1080&height=1920'
    });

    const result = await response.json();

    expect(response.status).toBe(400);
    expect(result.error).toBe('Content-Type must be application/json');
  });
});