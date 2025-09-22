#!/bin/bash

# Simple deployment script for video-renderer
echo "🚀 Deploying video-renderer..."

# Load .env file if it exists
if [ -f .env ]; then
    echo "📝 Loading environment variables from .env"
    export $(grep -v '^#' .env | xargs)
fi

# Stop and remove existing container
echo "🛑 Stopping existing container..."
docker stop video-renderer 2>/dev/null || true
docker rm video-renderer 2>/dev/null || true

# Build new image
echo "🏗️  Building Docker image..."
docker build -t video-renderer .

# Run new container
echo "▶️  Starting new container..."
docker run -d \
  --name video-renderer \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e BASE_URL=${BASE_URL:-https://video-renderer.pavlin.dev} \
  --restart unless-stopped \
  video-renderer

# Show status
echo "✅ Deployment complete!"
echo "📊 Container status:"
docker ps | grep video-renderer

echo "🏥 Health check (waiting 10 seconds)..."
sleep 10
curl -s http://localhost:3000/api/health | jq . 2>/dev/null || curl -s http://localhost:3000/api/health

echo "🎬 Ready for video rendering!"