'use client';

import { useState } from 'react';

export default function Home() {
  const [result, setResult] = useState<{
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
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    }
  ];

  const [selectedExample, setSelectedExample] = useState(examples[0]);
  const [formData, setFormData] = useState({
    width: 1080,
    height: 1920,
    duration: 2,
    render: examples[0].code
  });

  const handleExampleSelect = (example: { name: string; code: string }) => {
    setSelectedExample(example);
    setFormData(prev => ({ ...prev, render: example.code }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/render', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();
      
      if (response.ok) {
        setResult(data);
      } else {
        setError(data.error || 'Something went wrong');
      }
    } catch {
      setError('Failed to connect to the API');
    } finally {
      setLoading(false);
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
  }"
}`}</pre>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-gray-800 mb-3">Render Function</h3>
                <p className="text-gray-600 mb-3">
                  Your render function receives a context object and must return an HTML string:
                </p>
                <ul className="list-disc list-inside text-gray-600 space-y-1">
                  <li><code className="bg-gray-100 px-1 rounded">time</code> - Current time in seconds</li>
                  <li><code className="bg-gray-100 px-1 rounded">frame</code> - Current frame number</li>
                  <li><code className="bg-gray-100 px-1 rounded">duration</code> - Total duration</li>
                  <li><code className="bg-gray-100 px-1 rounded">width</code> - Video width</li>
                  <li><code className="bg-gray-100 px-1 rounded">height</code> - Video height</li>
                </ul>
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
                disabled={loading}
                className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {loading ? '🎬 Rendering Video...' : '🚀 Generate Video'}
              </button>
            </form>

            {/* Results */}
            {error && (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700">❌ {error}</p>
              </div>
            )}

            {result && (
              <div className="mt-6 p-6 bg-green-50 border border-green-200 rounded-lg">
                <h3 className="text-lg font-semibold text-green-800 mb-3">✅ Video Created!</h3>
                <div className="space-y-2 text-sm text-green-700">
                  <p><strong>Size:</strong> {((result.video?.size ?? 0) / 1024).toFixed(2)} KB</p>
                  <p><strong>Frames:</strong> {result.video?.frames}</p>
                  <p><strong>Dimensions:</strong> {result.video?.width}x{result.video?.height}</p>
                  <p><strong>Duration:</strong> {result.video?.duration}s</p>
                  <p><strong>Video URL:</strong> <a href={result.video?.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{result.video?.url}</a></p>
                  <div className="mt-4">
                    <video controls className="w-full max-w-sm mx-auto rounded-lg">
                      <source src={result.video?.url} type="video/mp4" />
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