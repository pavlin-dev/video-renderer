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
      name: "🎯 JSX Text Animation",
      code: `// Modern JSX Syntax
({time}) => {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      width: '100%',
      height: '100%',
      color: 'white',
      fontFamily: 'Arial',
      fontSize: '48px',
      backgroundColor: \`hsl(\${time * 360}, 70%, 50%)\`,
      margin: 0,
      padding: 0
    }}>
      Hello {time.toFixed(2)}s
    </div>
  );
}`
    },
    {
      name: "🔵 JSX Moving Circle",
      code: `// JSX with Dynamic Position
({time, width, height}) => {
  const x = (Math.sin(time * 2) + 1) * width / 2;
  const y = (Math.cos(time * 3) + 1) * height / 2;
  
  return (
    <div style={{
      position: 'absolute',
      left: \`\${x}px\`,
      top: \`\${y}px\`,
      width: '50px',
      height: '50px',
      background: 'radial-gradient(circle, #ff6b6b, #4ecdc4)',
      borderRadius: '50%',
      transform: 'translate(-50%, -50%)'
    }} />
  );
}`
    },
    {
      name: "📊 JSX Progress Bar",
      code: `// JSX Progress Bar with Conditional Rendering
({time, duration}) => {
  const progress = (time / duration) * 100;
  const isComplete = progress >= 100;
  
  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      background: '#2c3e50'
    }}>
      <div style={{
        width: '80%',
        height: '40px',
        background: '#ddd',
        borderRadius: '20px',
        overflow: 'hidden'
      }}>
        <div style={{
          width: \`\${Math.min(progress, 100)}%\`,
          height: '100%',
          background: isComplete 
            ? 'linear-gradient(90deg, #27ae60, #2ecc71)'
            : 'linear-gradient(90deg, #667eea, #764ba2)',
          transition: 'width 0.1s ease'
        }} />
      </div>
      <p style={{
        textAlign: 'center',
        fontFamily: 'Arial',
        fontSize: '24px',
        marginTop: '20px',
        color: 'white'
      }}>
        {progress.toFixed(1)}% {isComplete ? 'Complete!' : 'Loading...'}
      </p>
    </div>
  );
}`
    },
    {
      name: "🖼️ JSX Image Animation",
      code: `// JSX Image with Transform Animation
({time}) => {
  const rotation = time * 180;
  const scale = 0.8 + Math.sin(time * 2) * 0.2;
  
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      width: '100%',
      height: '100%',
      background: 'linear-gradient(45deg, #667eea, #764ba2)'
    }}>
      <img 
        src="https://picsum.photos/400/400?random=1"
        alt="Animated image"
        style={{
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          transform: \`rotate(\${rotation}deg) scale(\${scale})\`,
          transition: 'transform 0.1s ease',
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
        }}
      />
    </div>
  );
}`
    },
    {
      name: "🔀 JSX Conditional Rendering",
      code: `// JSX with Conditional Logic
({time, frame}) => {
  const isEven = frame % 2 === 0;
  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4'];
  
  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: isEven ? '#3498db' : '#e74c3c',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center'
    }}>
      {time > 1 && (
        <h1 style={{ 
          color: 'white',
          fontSize: '48px',
          marginBottom: '20px'
        }}>
          Time is over 1 second!
        </h1>
      )}
      {isEven ? (
        <p style={{ color: 'white', fontSize: '24px' }}>
          Even Frame: {frame}
        </p>
      ) : (
        <p style={{ color: 'white', fontSize: '24px' }}>
          Odd Frame: {frame}
        </p>
      )}
    </div>
  );
}`
    },
    {
      name: "📋 JSX Array Mapping",
      code: `// JSX with Array Mapping
({time, frame}) => {
  const emojis = ['🎬', '🎥', '📹', '🎞️', '📽️'];
  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7'];
  
  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: '#2c3e50',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '20px'
    }}>
      {emojis.map((emoji, index) => (
        <div
          key={index}
          style={{
            fontSize: \`\${40 + Math.sin(time + index) * 10}px\`,
            color: colors[index],
            transform: \`rotate(\${time * 45 + index * 30}deg)\`,
            transition: 'all 0.3s ease'
          }}
        >
          {emoji}
        </div>
      ))}
    </div>
  );
}`
    },
    {
      name: "🎭 JSX waitUntil Example",
      code: `// JSX with waitUntil for Complex Animations
({time}) => {
  return {
    html: (
      <div>
        <div 
          id="bg" 
          style={{
            width: '100%',
            height: '100%',
            background: \`hsl(\${(time * 60) % 360}, 70%, 45%)\`,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          <h1 style={{
            color: 'white',
            fontSize: '48px',
            textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
          }}>
            Loading Animation...
          </h1>
        </div>
        <script>
          {\`
            setTimeout(() => {
              document.body.setAttribute('data-frame-ready', '1');
            }, 100);
          \`}
        </script>
      </div>
    ),
    waitUntil: () => {
      return document.body.getAttribute('data-frame-ready') === '1';
    }
  };
}`
    },
    {
      name: "📜 Legacy HTML String",
      code: `// Legacy Format (still supported)
({time, frame}) => {
  return \`<div style="
    width: 100px;
    height: 100px;
    background: red;
    transform: rotate(\${time * 45}deg);
    margin: 500px auto;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-family: Arial;
  ">Frame \${frame}</div>\`;
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
            <span className="text-3xl ml-4">✨ Now with JSX!</span>
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Generate videos from React-like JSX or HTML code. Write modern JSX render functions 
            and we&apos;ll create professional videos with your animations frame by frame.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 bg-blue-100 text-blue-800 px-4 py-2 rounded-full">
            <span className="text-lg">🚀</span>
            <span className="font-medium">New: React-like JSX syntax support!</span>
          </div>
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
    return \`<div style='display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; font-size: 48px;'>Frame \${frame}</div>\`;
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
                <h3 className="text-xl font-semibold text-gray-800 mb-3">✨ JSX Render Function</h3>
                <div className="bg-blue-50 p-3 rounded-lg mb-3">
                  <p className="text-blue-800 font-medium">🎉 New! You can now use React-like JSX syntax!</p>
                </div>
                <p className="text-gray-600 mb-3">
                  Your render function receives a context object and can return JSX, HTML string, or object:
                </p>
                
                <div className="mb-4">
                  <h4 className="text-lg font-medium text-gray-700 mb-2">🚀 JSX Format (Recommended)</h4>
                  <div className="bg-blue-50 p-3 rounded-lg text-sm font-mono border border-blue-200">
                    <pre>{`({time, frame}) => {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      width: '100%',
      height: '100%',
      fontSize: '48px',
      background: \`hsl(\${time * 60}, 70%, 50%)\`
    }}>
      Frame {frame}
    </div>
  );
}`}</pre>
                  </div>
                </div>

                <div className="mb-4">
                  <h4 className="text-lg font-medium text-gray-700 mb-2">📜 Legacy HTML String (Still Supported)</h4>
                  <div className="bg-gray-100 p-3 rounded-lg text-sm font-mono">
                    <pre>{`({time, frame}) => {
  return \`<div style="display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; font-size: 48px;">Frame \${frame}</div>\`;
}`}</pre>
                  </div>
                </div>

                <div className="mb-4">
                  <h4 className="text-lg font-medium text-gray-700 mb-2">🎭 JSX with waitUntil</h4>
                  <div className="bg-blue-50 p-3 rounded-lg text-sm font-mono border border-blue-200">
                    <pre>{`({time}) => {
  return {
    html: (
      <div style={{ background: \`hsl(\${time * 60}, 70%, 50%)\` }}>
        <h1>Loading...</h1>
        <script>{\`
          document.body.setAttribute('data-ready', '1');
        \`}</script>
      </div>
    ),
    waitUntil: () => document.body.getAttribute('data-ready') === '1'
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