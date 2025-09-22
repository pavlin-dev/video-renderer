#!/bin/bash

# Test script for memory-optimized video renderer
echo "🧪 Testing memory-optimized video renderer..."

# Test 1: Low quality, minimal resources
echo "Test 1: Low quality (12 FPS, 2s)"
time curl -X POST http://localhost:3000/api/render \
  -H "Content-Type: application/json" \
  -d '{
    "width": 480,
    "height": 360,
    "duration": 2,
    "fps": 12,
    "quality": "low",
    "render": "(context) => `<div style=\"background: linear-gradient(${context.time * 90}deg, #ff6b6b, #4ecdc4); width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 24px; color: white; font-family: Arial;\">Time: ${context.time.toFixed(1)}s</div>`"
  }'

echo -e "\n\n📊 Memory after test 1:"
docker stats video-renderer --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"

echo -e "\n\n"

# Test 2: Medium quality
echo "Test 2: Medium quality (15 FPS, 3s)"
time curl -X POST http://localhost:3000/api/render \
  -H "Content-Type: application/json" \
  -d '{
    "width": 640,
    "height": 480,
    "duration": 3,
    "fps": 15,
    "quality": "medium",
    "render": "(context) => `<div style=\"background: radial-gradient(circle, hsl(${context.time * 60}, 70%, 50%), #000); width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 32px; color: white;\">Frame: ${context.frame}</div>`"
  }'

echo -e "\n\n📊 Memory after test 2:"
docker stats video-renderer --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"

echo -e "\n\n✅ Testing complete!"