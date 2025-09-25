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
    input: jest.fn().mockReturnThis(),
    complexFilter: jest.fn().mockReturnThis(),
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
        setDefaultTimeout: jest.fn(),
        setDefaultNavigationTimeout: jest.fn(),
        evaluate: jest.fn().mockImplementation((func) => {
          // Mock different behaviors based on the function being evaluated
          if (typeof func === 'function') {
            const funcStr = func.toString();
            if (funcStr.includes('querySelectorAll(\'img\')')) {
              return []; // No images
            }
            if (funcStr.includes('DOMParser')) {
              return null; // No script content
            }
          }
          return Promise.resolve();
        }),
        waitForFunction: jest.fn().mockResolvedValue(true),
        waitForLoadState: jest.fn().mockResolvedValue(true),
        screenshot: jest.fn().mockResolvedValue(Buffer.from('fake-image')),
        close: jest.fn(),
      }),
      contexts: jest.fn().mockReturnValue([]),
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
    rename: jest.fn().mockResolvedValue(undefined),
  },
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  unlink: jest.fn(),
  existsSync: jest.fn().mockReturnValue(false), // Mock existsSync to return false
}));

// Mock path module
jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
  basename: jest.fn((path) => path.split('/').pop()),
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
      render: "({time}) => { return `<div>ahojda ${time}</div>`; }"
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
      frames: 24, // 1 second * 24 fps (default)
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

  it('should validate audio parameter correctly', async () => {
    const { POST } = await import('../../src/app/api/render/route');
    
    // Test invalid audio - not an array
    const invalidAudioData = {
      width: 800,
      height: 600,
      duration: 0.1,
      render: "({time}) => `<div>${time}</div>`",
      audio: "not an array"
    };

    let request = new NextRequest('http://localhost:3000/api/render', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(invalidAudioData),
    });

    let response = await POST(request);
    let result = await response.json();
    expect(response.status).toBe(400);
    expect(result.error).toBe('audio must be an array');

    // Test invalid audio item - missing url
    const missingUrlData = {
      width: 800,
      height: 600,
      duration: 0.1,
      render: "({time}) => `<div>${time}</div>`",
      audio: [{ start: 0, volume: 0.5 }]
    };

    request = new NextRequest('http://localhost:3000/api/render', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(missingUrlData),
    });

    response = await POST(request);
    result = await response.json();
    expect(response.status).toBe(400);
    expect(result.error).toBe('audio[0].url must be a non-empty string');

    // Test invalid volume
    const invalidVolumeData = {
      width: 800,
      height: 600,
      duration: 0.1,
      render: "({time}) => `<div>${time}</div>`",
      audio: [{ url: "test.mp3", start: 0, volume: 2 }]
    };

    request = new NextRequest('http://localhost:3000/api/render', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(invalidVolumeData),
    });

    response = await POST(request);
    result = await response.json();
    expect(response.status).toBe(400);
    expect(result.error).toBe('audio[0].volume must be a number between 0 and 1');

    // Test audio start time exceeding video duration
    const startTooLateData = {
      width: 800,
      height: 600,
      duration: 2,
      render: "({time}) => `<div>${time}</div>`",
      audio: [{ url: "test.mp3", start: 3, volume: 0.5 }]
    };

    request = new NextRequest('http://localhost:3000/api/render', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(startTooLateData),
    });

    response = await POST(request);
    result = await response.json();
    expect(response.status).toBe(400);
    expect(result.error).toBe('audio[0].start (3) must be less than video duration (2)');

    // Test audio end time exceeding video duration
    const endTooLateData = {
      width: 800,
      height: 600,
      duration: 2,
      render: "({time}) => `<div>${time}</div>`",
      audio: [{ url: "test.mp3", start: 0, end: 3, volume: 0.5 }]
    };

    request = new NextRequest('http://localhost:3000/api/render', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(endTooLateData),
    });

    response = await POST(request);
    result = await response.json();
    expect(response.status).toBe(400);
    expect(result.error).toBe('audio[0].end (3) cannot exceed video duration (2)');
  });

  it('should accept valid audio parameter', async () => {
    const { POST } = await import('../../src/app/api/render/route');
    
    const testData = {
      width: 800,
      height: 600,
      duration: 3, // Increase duration to accommodate audio tracks
      render: "({time}) => `<div>${time}</div>`",
      audio: [
        {
          url: "https://example.com/track1.mp3",
          start: 0,
          end: 2, // Within duration
          volume: 0.8
        },
        {
          url: "https://example.com/track2.mp3", 
          start: 1, // Within duration
          volume: 0.5
          // no end - should play until the end
        }
      ]
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