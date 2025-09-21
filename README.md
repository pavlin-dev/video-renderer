# 🎬 Dynamic Video Renderer

> Generate stunning videos from HTML and JavaScript in real-time! Write a simple render function and watch your animations come to life as MP4 videos.

[![Next.js](https://img.shields.io/badge/Next.js-15.5-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Playwright](https://img.shields.io/badge/Playwright-1.55-green?logo=playwright)](https://playwright.dev/)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-8.0-orange?logo=ffmpeg)](https://ffmpeg.org/)

## ✨ Features

- 🎯 **Simple API** - Just send HTML/JS, get back a video
- 🎨 **Dynamic Animations** - Create complex animations with JavaScript
- ⚡ **Real-time Rendering** - Powered by Playwright and FFmpeg
- 🖥️ **Interactive Demo** - Try it live in your browser
- 🔗 **Direct Video URLs** - Shareable links to generated videos
- 🛡️ **Type Safe** - Built with TypeScript
- 📱 **Responsive UI** - Beautiful Tailwind CSS interface

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- FFmpeg (automatically installed via Homebrew on macOS)

### Installation

```bash
git clone <your-repo>
cd video-renderer
npm install

# Install FFmpeg (macOS)
brew install ffmpeg

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the interactive demo!

## 🎮 Usage

### Web Interface

Visit the homepage and use the interactive demo to:
- Choose from example animations
- Customize video dimensions and duration
- Write your own render function
- Generate and preview videos instantly

### API Endpoint

**POST** `/api/render`

```json
{
  "width": 1080,
  "height": 1920,
  "duration": 2,
  "render": "({time, frame, duration, width, height}) => { return `<h1>Frame ${frame}</h1>`; }"
}
```

**Response:**
```json
{
  "success": true,
  "video": {
    "url": "http://localhost:3000/api/video/video_123456789.mp4",
    "size": 24576,
    "frames": 60,
    "duration": 2,
    "fps": 30,
    "width": 1080,
    "height": 1920
  }
}
```

### cURL Example

```bash
curl -X POST http://localhost:3000/api/render \
  -H "Content-Type: application/json" \
  -d '{
    "width": 1080,
    "height": 1920,
    "duration": 1,
    "render": "({time}) => `<h1 style=\"text-align:center;margin-top:400px;color:hsl(${time*360},70%,50%)\">Hello ${time.toFixed(2)}s</h1>`"
  }'
```

## 🎨 Examples

### Simple Text Animation
```javascript
({time}) => {
  return `<h1 style="
    color: white; 
    text-align: center; 
    font-family: Arial; 
    font-size: 48px; 
    margin-top: 200px;
    background-color: hsl(${time * 360}, 70%, 50%);
    padding: 20px;
    border-radius: 10px;
  ">Hello ${time.toFixed(2)}s</h1>`;
}
```

### Moving Circle
```javascript
({time, width, height}) => {
  const x = (Math.sin(time * 2) + 1) * width / 2;
  const y = (Math.cos(time * 3) + 1) * height / 2;
  return `<div style="
    position: absolute;
    left: ${x}px;
    top: ${y}px;
    width: 50px;
    height: 50px;
    background: radial-gradient(circle, #ff6b6b, #4ecdc4);
    border-radius: 50%;
    transform: translate(-50%, -50%);
  "></div>`;
}
```

### Progress Bar
```javascript
({time, duration}) => {
  const progress = (time / duration) * 100;
  return `<div style="
    width: 80%;
    height: 40px;
    background: #ddd;
    border-radius: 20px;
    margin: 300px auto;
    overflow: hidden;
  ">
    <div style="
      width: ${progress}%;
      height: 100%;
      background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
    "></div>
  </div>
  <p style="text-align: center; font-family: Arial; font-size: 24px; margin-top: 20px;">
    ${progress.toFixed(1)}% Complete
  </p>`;
}
```

## 🔧 Configuration

### Environment Variables

Create `.env.local`:

```bash
BASE_URL=http://localhost:3000
```

### Render Function Context

Your render function receives these parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `time` | number | Current time in seconds |
| `frame` | number | Current frame number (0-based) |
| `duration` | number | Total video duration |
| `width` | number | Video width in pixels |
| `height` | number | Video height in pixels |

## 🧪 Testing

```bash
# Run unit tests
npm test

# Test real endpoint (requires running server)
npm run test:real

# Watch mode
npm run test:watch
```

## 🏗️ How It Works

1. **Input Processing** - Validate request and extract render function
2. **Browser Automation** - Launch Playwright with custom HTML template
3. **Frame Generation** - Execute render function for each frame (30 FPS)
4. **Screenshot Capture** - Take screenshot of each rendered frame
5. **Video Encoding** - Use FFmpeg to combine frames into MP4
6. **URL Generation** - Create shareable video URL
7. **Cleanup** - Remove temporary frame files

## 📁 Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── render/         # Main video generation endpoint
│   │   └── video/          # Video serving endpoint
│   ├── page.tsx            # Interactive demo homepage
│   └── layout.tsx
├── __tests__/
│   ├── simple/             # Unit tests
│   └── manual/             # Integration tests
└── temp/                   # Generated videos (auto-created)
```

## 🚢 Deployment

### Vercel (Recommended)

```bash
npm run build
vercel --prod
```

Update `BASE_URL` in your environment variables to your production domain.

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
RUN npx playwright install chromium
RUN apk add --no-cache ffmpeg
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📋 Requirements

- **Node.js** 18 or higher
- **FFmpeg** for video encoding
- **Modern browser** for the demo interface
- **1GB RAM** minimum for video processing

## 🐛 Troubleshooting

### FFmpeg not found
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
apt-get install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html
```

### Playwright issues
```bash
npx playwright install chromium
```

### Memory issues
- Reduce video duration or dimensions
- Lower FPS (modify code to make configurable)
- Ensure adequate system memory

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Next.js](https://nextjs.org/) - React framework
- [Playwright](https://playwright.dev/) - Browser automation
- [FFmpeg](https://ffmpeg.org/) - Video processing
- [Tailwind CSS](https://tailwindcss.com/) - Styling

---

**Built with ❤️ using Next.js, Playwright, and FFmpeg**

[🎬 Try the Demo](http://localhost:3000) | [📖 Documentation](docs/) | [🐛 Report Bug](issues/) | [💡 Request Feature](issues/)