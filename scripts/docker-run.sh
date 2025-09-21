#!/bin/bash

# Docker run script for video-renderer

set -e

echo "🐳 Building Docker image..."
docker build -t video-renderer .

echo "🚀 Starting container..."
docker run -d \
  --name video-renderer \
  --restart unless-stopped \
  -p 3000:3000 \
  -e BASE_URL=http://localhost:3000 \
  -v $(pwd)/temp:/app/temp \
  video-renderer

echo "✅ Container started successfully!"
echo "🌐 Access the app at: http://localhost:3000"
echo "📊 Health check: http://localhost:3000/api/health"

# Follow logs
echo "📝 Following logs (Ctrl+C to exit)..."
docker logs -f video-renderer