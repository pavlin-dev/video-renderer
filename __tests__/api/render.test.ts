import { createMocks } from 'node-mocks-http';
import { POST } from '@/app/api/render/route';

// Mock ffmpeg to avoid needing actual ffmpeg binary for tests
jest.mock('fluent-ffmpeg', () => {
  const mockCommand = {
    inputFPS: jest.fn().mockReturnThis(),
    outputOptions: jest.fn().mockReturnThis(),
    output: jest.fn().mockReturnThis(),
    on: jest.fn().mockImplementation((event, callback) => {
      if (event === 'end') {
        // Simulate successful completion
        setTimeout(callback, 100);
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
}));

describe('/api/render', () => {
  it('should successfully render video with valid input', async () => {
    const testData = {
      width: 1080,
      height: 1920,
      duration: 1,
      render: "({time}) => { document.body.innerHTML = `ahojda ${time}`; }"
    };

    const { req } = createMocks({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: testData,
    });

    // Mock req.json() to return our test data
    req.json = jest.fn().mockResolvedValue(testData);

    const response = await POST(req as any);
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
    const invalidData = {
      width: 1080,
      // missing height, duration, render
    };

    const { req } = createMocks({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
    });

    req.json = jest.fn().mockResolvedValue(invalidData);

    const response = await POST(req as any);
    const result = await response.json();

    expect(response.status).toBe(400);
    expect(result.error).toContain('must be a positive number');
  });

  it('should return 400 for invalid content type', async () => {
    const { req } = createMocks({
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
    });

    const response = await POST(req as any);
    const result = await response.json();

    expect(response.status).toBe(400);
    expect(result.error).toBe('Content-Type must be application/json');
  });

  it('should return 400 for invalid JSON', async () => {
    const { req } = createMocks({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
    });

    req.json = jest.fn().mockRejectedValue(new Error('Invalid JSON'));

    const response = await POST(req as any);
    const result = await response.json();

    expect(response.status).toBe(400);
    expect(result.error).toBe('Invalid JSON body');
  });
});