#!/bin/bash

# Monitor CPU usage and processes after video rendering
echo "🔍 Monitoring CPU and processes..."

echo "📊 Current Docker stats:"
docker stats video-renderer --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"

echo -e "\n🔍 Active processes in container:"
docker exec video-renderer ps aux | grep -E "(chrome|chromium|ffmpeg|node)" | grep -v grep

echo -e "\n💾 Memory info:"
curl -s http://localhost:3000/api/processes | jq .memory 2>/dev/null || curl -s http://localhost:3000/api/processes

echo -e "\n⏱️  Continuous monitoring (Ctrl+C to stop):"
watch -n 2 'docker stats video-renderer --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"'