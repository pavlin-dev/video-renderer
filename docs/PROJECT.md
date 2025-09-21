# Dynamic Video Renderer API

This project is a Next.js API service that generates videos from dynamic HTML and JavaScript. It exposes a single endpoint, /api/render, which accepts a POST request containing an HTML template, optional CSS, and a JavaScript render function. The render function is executed for each video frame, allowing you to update text, styles, or animations dynamically based on the current frame number.

The rendering pipeline works as follows: 1. API Request
A client sends a JSON payload with parameters such as width, height, duration, render, and optional data. 2. Frame Rendering with Playwright
The server uses Playwright (Chromium) to open a local HTML document that contains the provided HTML, CSS, and render function. For every frame, the render function is called with the frame context ({ time, frame, fps, duration, width, height, data }), and a screenshot is captured. 3. Video Encoding with FFmpeg
The sequence of screenshots is passed to FFmpeg, which encodes them into an MP4 video (libx264, yuv420p). 4. Response
Once the video is generated, the API responds with metadata (file path, size, frame count, etc.). The rendered file can be served directly or uploaded to a storage service.
