/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

// Mock ffmpeg to avoid needing actual ffmpeg binary for tests
jest.mock('fluent-ffmpeg', () => {
  const mockCommand = {
    inputFPS: jest.fn().mockReturnThis(),
    outputOptions: jest.fn().mockReturnThis(),
    output: jest.fn().mockReturnThis(),
    on: jest.fn().mockImplementation((event: string, callback: () => void) => {
      if (event === 'end') {
        // Simulate successful completion
        setTimeout(callback, 10);
      }
      return mockCommand;
    }),
    run: jest.fn(),
    setFfmpegPath: jest.fn().mockReturnThis(),
  };
  
  return jest.fn(() => mockCommand);
});

// Mock playwright
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newPage: jest.fn().mockResolvedValue({
        setViewportSize: jest.fn(),
        setContent: jest.fn(),
        evaluate: jest.fn(),
        screenshot: jest.fn().mockResolvedValue(Buffer.from('fake-image')),
        close: jest.fn(),
      }),
      close: jest.fn(),
    }),
  },
}));

// Mock fs operations
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    rmdir: jest.fn().mockResolvedValue(undefined),
    stat: jest.fn().mockResolvedValue({ size: 1024 }),
    unlink: jest.fn().mockResolvedValue(undefined),
  },
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  unlink: jest.fn(),
}));

// Mock path module
jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
}));

// Mock util module
jest.mock('util', () => ({
  promisify: jest.fn((fn) => fn),
}));

describe('/api/render', () => {
  it('should successfully render video with valid input', async () => {
    // Import here to ensure mocks are applied
    const { POST } = await import('../../src/app/api/render/route');
    
    const testData = {
      width: 1080,
      height: 1920,
      duration: 1,
      render: "({time}) => { document.body.innerHTML = `ahojda ${time}`; }"
    };

    // Create a proper NextRequest mock
    const request = new NextRequest('http://localhost:3000/api/render', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(testData),
    });

    const response = await POST(request);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.video).toMatchObject({
      frames: 30, // 1 second * 30 fps
      duration: 1,
      width: 1080,
      height: 1920,
    });
  });

  it('should return 400 for missing required fields', async () => {
    const { POST } = await import('../../src/app/api/render/route');
    
    const invalidData = {
      width: 1080,
      // missing height, duration, render
    };

    const request = new NextRequest('http://localhost:3000/api/render', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(invalidData),
    });

    const response = await POST(request);
    const result = await response.json();

    expect(response.status).toBe(400);
    expect(result.error).toContain('must be a positive number');
  });

  it('should return 400 for invalid content type', async () => {
    const { POST } = await import('../../src/app/api/render/route');
    
    const request = new NextRequest('http://localhost:3000/api/render', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'invalid=data',
    });

    const response = await POST(request);
    const result = await response.json();

    expect(response.status).toBe(400);
    expect(result.error).toBe('Content-Type must be application/json');
  });

  it('should return 400 for invalid JSON', async () => {
    const { POST } = await import('../../src/app/api/render/route');
    
    const request = new NextRequest('http://localhost:3000/api/render', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: 'invalid json',
    });

    const response = await POST(request);
    const result = await response.json();

    expect(response.status).toBe(400);
    expect(result.error).toBe('Invalid JSON body');
  });

  it('should pass args to render function context', async () => {
    const { POST } = await import('../../src/app/api/render/route');
    
    const testArgs = {
      color: 'red',
      title: 'Test Video',
      speed: 2
    };
    
    const testData = {
      width: 800,
      height: 600,
      duration: 0.1,
      render: "({time, frame, color, title, speed}) => { return `<div style='color: ${color}'>${title} - Frame ${frame} - Speed ${speed} - Time ${time}</div>`; }",
      args: testArgs
    };

    const request = new NextRequest('http://localhost:3000/api/render', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(testData),
    });

    const response = await POST(request);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.video).toMatchObject({
      width: 800,
      height: 600,
      duration: 0.1,
    });
  });

  it('should work without args parameter', async () => {
    const { POST } = await import('../../src/app/api/render/route');
    
    const testData = {
      width: 800,
      height: 600,
      duration: 0.1,
      render: "({time, frame}) => { return `<div>Frame ${frame} at ${time}s</div>`; }"
      // no args provided
    };

    const request = new NextRequest('http://localhost:3000/api/render', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(testData),
    });

    const response = await POST(request);
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
  });
});