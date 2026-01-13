#!/bin/bash
set -e

echo "======================================"
echo "  NextEleven Voice Service Starting"
echo "======================================"

# Create directories
mkdir -p /app/cloned_voices /app/uploads /app/logs

# Start Python TTS sidecar in background
echo "🐍 Starting TTS sidecar..."
cd /app/services/xtts
python3 main.py > /app/logs/sidecar.log 2>&1 &
SIDECAR_PID=$!

# Wait for sidecar (max 30 seconds)
echo "⏳ Waiting for sidecar..."
for i in {1..30}; do
    if curl -s http://localhost:8081/health > /dev/null 2>&1; then
        echo "✅ Sidecar ready!"
        break
    fi
    sleep 1
done

# Start Next.js
echo "🌐 Starting Next.js on port ${PORT:-8080}..."
cd /app
exec npm start
