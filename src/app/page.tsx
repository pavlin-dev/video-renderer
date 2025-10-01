'use client';

import { useState, useEffect, useRef } from 'react';

interface Task {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  createdAt: string;
  updatedAt: string;
  result?: {
    success: boolean;
    video?: {
      url: string;
      size: number;
      frames: number;
      duration: number;
      fps: number;
      width: number;
      height: number;
    };
    error?: string;
    details?: string;
  };
  error?: {
    success: boolean;
    error: string;
    details?: string;
  };
}

export default function Home() {
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [error, setError] = useState('');
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const pollTaskStatus = async (taskId: string) => {
    try {
      const response = await fetch(`/api/render/task/${taskId}`);
      const data = await response.json();
      
      if (response.ok) {
        setCurrentTask(data);
        
        // Stop polling when task is completed or failed
        if (data.status === 'completed' || data.status === 'failed') {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        }
      } else {
        console.error('Failed to fetch task status:', data.error);
        setError(data.error || 'Failed to fetch task status');
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
    } catch (err) {
      console.error('Polling error:', err);
      setError('Failed to check task status');
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }
  };

  const startPolling = (taskId: string) => {
    // Clear any existing polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    
    // Start new polling every 1 second
    pollingIntervalRef.current = setInterval(() => {
      pollTaskStatus(taskId);
    }, 1000);
    
    // Also poll immediately
    pollTaskStatus(taskId);
  };

  const examples = [
    {
      name: "Simple Text Animation",
      code: `({time}) => {
  return \`<h1 style="
    color: white; 
    text-align: center; 
    font-family: Arial; 
    font-size: 48px; 
    margin-top: 200px;
    background-color: hsl(\${time * 360}, 70%, 50%);
    padding: 20px;
    border-radius: 10px;
  ">Hello \${time.toFixed(2)}s</h1>\`;
}`
    },
    {
      name: "Moving Circle",
      code: `({time, width, height}) => {
  const x = (Math.sin(time * 2) + 1) * width / 2;
  const y = (Math.cos(time * 3) + 1) * height / 2;
  return \`<div style="
    position: absolute;
    left: \${x}px;
    top: \${y}px;
    width: 50px;
    height: 50px;
    background: radial-gradient(circle, #ff6b6b, #4ecdc4);
    border-radius: 50%;
    transform: translate(-50%, -50%);
  "></div>\`;
}`
    },
    {
      name: "Progress Bar",
      code: `({time, duration}) => {
  const progress = (time / duration) * 100;
  return \`<div style="
    width: 80%;
    height: 40px;
    background: #ddd;
    border-radius: 20px;
    margin: 300px auto;
    overflow: hidden;
  ">
    <div style="
      width: \${progress}%;
      height: 100%;
      background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
      transition: width 0.1s ease;
    "></div>
  </div>
  <p style="text-align: center; font-family: Arial; font-size: 24px; margin-top: 20px;">
    \${progress.toFixed(1)}% Complete
  </p>\`;
}`
    },
    {
      name: "Advanced with waitUntil",
      code: `({time}) => {
  return {
    html: \`<div id="bg" style="width:100%;height:100%;background:#000;"></div>
    <script>
      const bg = document.getElementById('bg');
      const hue = (time * 60) % 360;
      bg.style.background = \`hsl(\${hue}, 70%, 45%)\`;
      
      // Signal when ready
      setTimeout(() => {
        document.body.setAttribute('data-frame-ready', '1');
      }, 100);
    </script>\`,
    waitUntil: () => {
      return document.body.getAttribute('data-frame-ready') === '1';
    }
  };
}`
    }
  ];

  const [selectedExample, setSelectedExample] = useState(examples[0]);
  const [formData, setFormData] = useState({
    width: 1080,
    height: 1920,
    duration: 2,
    render: examples[0].code,
    audioUrl: '',
    audioStart: 0,
    audioEnd: '',
    audioVolume: 0.5
  });

  const handleExampleSelect = (example: { name: string; code: string }) => {
    setSelectedExample(example);
    setFormData(prev => ({ ...prev, render: example.code }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCurrentTask(null);

    // Stop any existing polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    try {
      // Prepare request body with audio if provided
      const requestBody = {
        width: formData.width,
        height: formData.height,
        duration: formData.duration,
        render: formData.render,
        ...(formData.audioUrl.trim() && {
          audio: [{
            url: formData.audioUrl.trim(),
            start: formData.audioStart,
            ...(formData.audioEnd && { end: parseFloat(formData.audioEnd) }),
            volume: formData.audioVolume
          }]
        })
      };

      const response = await fetch('/api/render', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();
      
      if (response.ok && data.taskId) {
        // Set initial task state
        setCurrentTask({
          taskId: data.taskId,
          status: 'pending',
          progress: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        
        // Start polling for task status
        startPolling(data.taskId);
      } else {
        setError(data.error || 'Failed to start rendering');
      }
    } catch {
      setError('Failed to connect to the API');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            🎬 Dynamic Video Renderer
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Generate videos from HTML and JavaScript. Write a render function that returns HTML, 
            and we&apos;ll create a video with your animations frame by frame.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* API Documentation */}
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">📖 How to Use</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-gray-800 mb-3">API Endpoint</h3>
                <div className="bg-gray-100 p-4 rounded-lg">
                  <code className="text-sm">POST /api/render</code>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-gray-800 mb-3">Request Body</h3>
                <div className="bg-gray-100 p-4 rounded-lg text-sm font-mono">
                  <pre>{`{
  "width": 1080,      // Video width in pixels
  "height": 1920,     // Video height in pixels  
  "duration": 2,      // Duration in seconds
  "render": "({time, frame, duration, width, height}) => {
    return \`<h1>Frame \${frame}</h1>\`;
  }",
  // Optional parameters:
  "fps": 24,          // Frames per second (default: 24)
  "quality": "medium", // "low", "medium", "high" (default: "medium")
  "audio": [          // Array of audio tracks
    {
      "url": "https://example.com/audio.mp3",
      "start": 0,     // Start time in seconds
      "end": 2,       // Optional: end time in seconds
      "volume": 0.5   // Volume level (0.0 to 1.0)
    }
  ]
}`}</pre>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-gray-800 mb-3">Render Function</h3>
                <p className="text-gray-600 mb-3">
                  Your render function receives a context object and can return either HTML string or object:
                </p>
                
                <div className="mb-4">
                  <h4 className="text-lg font-medium text-gray-700 mb-2">Simple Format (HTML String)</h4>
                  <div className="bg-gray-100 p-3 rounded-lg text-sm font-mono">
                    <pre>{`({time, frame, duration, width, height}) => {
  return \`<h1>Frame \${frame}</h1>\`;
}`}</pre>
                  </div>
                </div>

                <div className="mb-4">
                  <h4 className="text-lg font-medium text-gray-700 mb-2">Advanced Format (Object with waitUntil)</h4>
                  <div className="bg-gray-100 p-3 rounded-lg text-sm font-mono">
                    <pre>{`({time}) => {
  return {
    html: \`<div id="content">...</div>
           <script>
             // Your animation code here
             document.body.setAttribute('data-ready', '1');
           </script>\`,
    waitUntil: () => {
      // Return true when ready to capture
      return document.body.getAttribute('data-ready') === '1';
    }
  };
}`}</pre>
                  </div>
                </div>

                <div className="mb-3">
                  <h4 className="text-lg font-medium text-gray-700 mb-2">Context Parameters</h4>
                  <ul className="list-disc list-inside text-gray-600 space-y-1">
                    <li><code className="bg-gray-100 px-1 rounded">time</code> - Current time in seconds</li>
                    <li><code className="bg-gray-100 px-1 rounded">frame</code> - Current frame number</li>
                    <li><code className="bg-gray-100 px-1 rounded">duration</code> - Total duration</li>
                    <li><code className="bg-gray-100 px-1 rounded">width</code> - Video width</li>
                    <li><code className="bg-gray-100 px-1 rounded">height</code> - Video height</li>
                  </ul>
                </div>

                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="text-blue-800 text-sm">
                    <strong>💡 Pro Tip:</strong> Use the <code>waitUntil</code> function for complex animations with videos, 
                    async operations, or when you need to wait for specific DOM states before capturing the frame.
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-gray-800 mb-3">Audio Support</h3>
                <p className="text-gray-600 mb-3">
                  You can add background music or sound effects to your videos using the audio parameter:
                </p>
                
                <div className="mb-4">
                  <h4 className="text-lg font-medium text-gray-700 mb-2">Audio Track Properties</h4>
                  <ul className="list-disc list-inside text-gray-600 space-y-1">
                    <li><code className="bg-gray-100 px-1 rounded">url</code> - Direct URL to audio file (MP3, WAV, etc.)</li>
                    <li><code className="bg-gray-100 px-1 rounded">start</code> - When to start playing (in seconds)</li>
                    <li><code className="bg-gray-100 px-1 rounded">end</code> - Optional: when to stop playing</li>
                    <li><code className="bg-gray-100 px-1 rounded">volume</code> - Volume level from 0.0 (silent) to 1.0 (full)</li>
                  </ul>
                </div>

                <div className="bg-amber-50 p-3 rounded-lg">
                  <p className="text-amber-800 text-sm">
                    <strong>🎵 Audio Tips:</strong> You can add multiple audio tracks that will be mixed together. 
                    Audio duration is automatically limited to match video duration.
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-gray-800 mb-3">Examples</h3>
                <div className="space-y-2">
                  {examples.map((example, index) => (
                    <button
                      key={index}
                      onClick={() => handleExampleSelect(example)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedExample.name === example.name
                          ? 'bg-blue-50 border-blue-200'
                          : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <span className="font-medium">{example.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Demo */}
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">🎮 Try It Live</h2>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Width</label>
                  <input
                    type="number"
                    value={formData.width}
                    onChange={(e) => setFormData(prev => ({ ...prev, width: parseInt(e.target.value) }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Height</label>
                  <input
                    type="number"
                    value={formData.height}
                    onChange={(e) => setFormData(prev => ({ ...prev, height: parseInt(e.target.value) }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Duration (seconds)</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.duration}
                  onChange={(e) => setFormData(prev => ({ ...prev, duration: parseFloat(e.target.value) }))}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Audio Section */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">🎵 Background Audio (Optional)</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Audio URL</label>
                    <input
                      type="url"
                      value={formData.audioUrl}
                      onChange={(e) => setFormData(prev => ({ ...prev, audioUrl: e.target.value }))}
                      placeholder="https://example.com/music.mp3"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Direct URL to audio file (MP3, WAV, etc.)</p>
                  </div>

                  {formData.audioUrl.trim() && (
                    <>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Start (seconds)</label>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max={formData.duration}
                            value={formData.audioStart}
                            onChange={(e) => setFormData(prev => ({ ...prev, audioStart: parseFloat(e.target.value) }))}
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">End (optional)</label>
                          <input
                            type="number"
                            step="0.1"
                            min={formData.audioStart}
                            max={formData.duration}
                            value={formData.audioEnd}
                            onChange={(e) => setFormData(prev => ({ ...prev, audioEnd: e.target.value }))}
                            placeholder="Auto"
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Volume</label>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={formData.audioVolume}
                            onChange={(e) => setFormData(prev => ({ ...prev, audioVolume: parseFloat(e.target.value) }))}
                            className="w-full mt-2"
                          />
                          <div className="text-xs text-gray-500 text-center">{(formData.audioVolume * 100).toFixed(0)}%</div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Render Function</label>
                <textarea
                  value={formData.render}
                  onChange={(e) => setFormData(prev => ({ ...prev, render: e.target.value }))}
                  rows={12}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                  placeholder="({time}) => { return `<h1>Hello ${time}</h1>`; }"
                />
              </div>

              <button
                type="submit"
                disabled={currentTask?.status === 'pending' || currentTask?.status === 'processing'}
                className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {currentTask?.status === 'pending' && '⏳ Starting Render...'}
                {currentTask?.status === 'processing' && `🎬 Rendering... ${currentTask.progress}%`}
                {(!currentTask || currentTask.status === 'completed' || currentTask.status === 'failed') && '🚀 Generate Video'}
              </button>
            </form>

            {/* Progress Bar */}
            {currentTask && (currentTask.status === 'pending' || currentTask.status === 'processing') && (
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold text-blue-800">
                    {currentTask.status === 'pending' ? '⏳ Preparing...' : '🎬 Rendering Video...'}
                  </h3>
                  <span className="text-sm text-blue-600 font-medium">{currentTask.progress}%</span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${currentTask.progress}%` }}
                  ></div>
                </div>
                <p className="text-sm text-blue-700 mt-2">Task ID: {currentTask.taskId}</p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700">❌ {error}</p>
              </div>
            )}

            {/* Failed Task */}
            {currentTask?.status === 'failed' && (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <h3 className="text-lg font-semibold text-red-800 mb-2">❌ Rendering Failed</h3>
                <p className="text-red-700">{currentTask.error?.error || 'Unknown error occurred'}</p>
                {currentTask.error?.details && (
                  <p className="text-sm text-red-600 mt-1">{currentTask.error.details}</p>
                )}
                <p className="text-sm text-red-600 mt-2">Task ID: {currentTask.taskId}</p>
              </div>
            )}

            {/* Success Result */}
            {currentTask?.status === 'completed' && currentTask.result?.success && (
              <div className="mt-6 p-6 bg-green-50 border border-green-200 rounded-lg">
                <h3 className="text-lg font-semibold text-green-800 mb-3">✅ Video Created!</h3>
                <div className="space-y-2 text-sm text-green-700">
                  <p><strong>Size:</strong> {((currentTask.result.video?.size ?? 0) / 1024).toFixed(2)} KB</p>
                  <p><strong>Frames:</strong> {currentTask.result.video?.frames}</p>
                  <p><strong>Dimensions:</strong> {currentTask.result.video?.width}x{currentTask.result.video?.height}</p>
                  <p><strong>Duration:</strong> {currentTask.result.video?.duration}s</p>
                  <p><strong>FPS:</strong> {currentTask.result.video?.fps}</p>
                  <p><strong>Task ID:</strong> {currentTask.taskId}</p>
                  <p><strong>Video URL:</strong> <a href={currentTask.result.video?.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{currentTask.result.video?.url}</a></p>
                  <div className="mt-4">
                    <video controls className="w-full max-w-sm mx-auto rounded-lg">
                      <source src={currentTask.result.video?.url} type="video/mp4" />
                      Your browser does not support the video tag.
                    </video>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-gray-500">
          <p>Built with Next.js, Playwright, and FFmpeg</p>
        </div>
      </div>
    </div>
  );
}