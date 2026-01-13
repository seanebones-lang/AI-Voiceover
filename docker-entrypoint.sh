#!/bin/bash
set -e

echo "🚀 Starting NextEleven Voice Services..."
echo "📍 Working directory: $(pwd)"
echo "🐍 Python version: $(python --version 2>&1)"

# Create log directory
mkdir -p /app/logs

# Check if sidecar files exist
echo "📁 Checking sidecar files..."
ls -la /app/services/xtts/ 2>&1 | head -10

# Start Python XTTS sidecar in background with logging
echo "📦 Starting TTS sidecar on port 8081..."
cd /app/services/xtts

# Test Python can import the dependencies
echo "🔍 Testing Python imports..."
python -c "import fastapi; import uvicorn; import edge_tts; print('✅ All imports OK')" 2>&1 || echo "❌ Import failed"

python main.py > /app/logs/sidecar.log 2>&1 &
XTTS_PID=$!
echo "📦 Sidecar PID: $XTTS_PID"

# Wait for sidecar to be ready (max 30 seconds)
echo "⏳ Waiting for TTS sidecar to initialize..."
for i in {1..30}; do
    if curl -s "http://localhost:${XTTS_PORT:-8081}/health" > /dev/null 2>&1; then
        echo "✅ TTS sidecar ready!"
        break
    fi
    if ! kill -0 $XTTS_PID 2>/dev/null; then
        echo "❌ TTS sidecar failed to start. Logs:"
        cat /app/logs/sidecar.log 2>/dev/null || echo "No logs available"
        # Continue anyway - Next.js will show appropriate error
        break
    fi
    sleep 1
done

# Start Next.js app
echo "🌐 Starting Next.js on port ${PORT:-8080}..."
cd /app
npm start &
NEXTJS_PID=$!

echo "✅ All services started. PIDs: sidecar=$XTTS_PID, nextjs=$NEXTJS_PID"

# Handle shutdown gracefully
trap "echo 'Shutting down...'; kill $XTTS_PID $NEXTJS_PID 2>/dev/null; exit 0" SIGTERM SIGINT

# Wait for either process to exit
wait -n

# If one process dies, kill the other and exit
echo "⚠️ A service exited. Shutting down..."
kill $XTTS_PID $NEXTJS_PID 2>/dev/null || true
exit 1
