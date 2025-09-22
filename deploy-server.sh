#!/bin/bash

# Deploy script for server with 2GB RAM optimizations
echo "🚀 Deploying memory-optimized video-renderer to server..."

# Build image with memory optimizations
echo "🏗️  Building optimized Docker image..."
docker build -t video-renderer:memory-optimized .

# Stop existing container
echo "🛑 Stopping existing container..."
docker stop video-renderer 2>/dev/null || true
docker rm video-renderer 2>/dev/null || true

# Run with memory limits for 2GB server
echo "▶️  Starting memory-optimized container..."
docker run -d \
  --name video-renderer \
  --memory=1500m \
  --memory-swap=1500m \
  --oom-kill-disable=false \
  -p 3000:3000 \
  -e BASE_URL=${BASE_URL:-http://localhost:3000} \
  video-renderer:memory-optimized

# Wait for health check
echo "🏥 Waiting for health check..."
sleep 15

# Check status
echo "📊 Container status:"
docker ps | grep video-renderer

# Check memory usage
echo "💾 Memory usage:"
docker stats video-renderer --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"

echo "✅ Memory-optimized deployment complete!"
echo "🎬 Ready for video rendering on 2GB RAM server!"