#!/bin/bash
set -e

echo "========================================"
echo "  NextEleven Voice Services Startup"
echo "========================================"
echo ""
echo "📍 Working directory: $(pwd)"
echo "🐍 Python: $(python --version 2>&1)"
echo "📦 Node: $(node --version 2>&1)"
echo ""

# Create necessary directories
mkdir -p /app/logs /app/cloned_voices /app/uploads

# Verify Python sidecar files exist
echo "📁 Verifying sidecar installation..."
if [ ! -f "/app/services/xtts/main.py" ]; then
    echo "❌ ERROR: /app/services/xtts/main.py not found!"
    exit 1
fi

# Test Python imports
echo "🔍 Testing Python dependencies..."
cd /app/services/xtts
python -c "
import sys
print('Python path:', sys.executable)
try:
    import fastapi
    print('✅ fastapi:', fastapi.__version__)
except ImportError as e:
    print('❌ fastapi:', e)
    sys.exit(1)

try:
    import uvicorn
    print('✅ uvicorn: OK')
except ImportError as e:
    print('❌ uvicorn:', e)
    sys.exit(1)

try:
    import edge_tts
    print('✅ edge_tts: OK')
except ImportError as e:
    print('❌ edge_tts:', e)
    sys.exit(1)

print('✅ All Python dependencies OK')
" 2>&1

if [ $? -ne 0 ]; then
    echo "❌ Python dependency check failed!"
    exit 1
fi

# Start Python sidecar
echo ""
echo "🚀 Starting TTS sidecar on port 8081..."
cd /app/services/xtts
python main.py 2>&1 | tee /app/logs/sidecar.log &
SIDECAR_PID=$!
echo "   PID: $SIDECAR_PID"

# Wait for sidecar to be ready (max 60 seconds)
echo "⏳ Waiting for sidecar to initialize..."
READY=false
for i in {1..60}; do
    # Check if process is still running
    if ! kill -0 $SIDECAR_PID 2>/dev/null; then
        echo "❌ Sidecar process died! Check logs:"
        cat /app/logs/sidecar.log 2>/dev/null | tail -50
        # Don't exit - continue with Next.js, it will show appropriate errors
        break
    fi
    
    # Check if health endpoint responds
    if curl -s "http://localhost:8081/health" > /dev/null 2>&1; then
        echo "✅ Sidecar ready after ${i}s!"
        READY=true
        break
    fi
    
    echo "   Waiting... (${i}/60)"
    sleep 1
done

if [ "$READY" = false ]; then
    echo "⚠️ Sidecar may not be ready, but continuing..."
    echo "   Recent logs:"
    tail -20 /app/logs/sidecar.log 2>/dev/null || echo "   (no logs)"
fi

# Start Next.js
echo ""
echo "🌐 Starting Next.js on port ${PORT:-8080}..."
cd /app
PORT=${PORT:-8080} npm start &
NEXTJS_PID=$!
echo "   PID: $NEXTJS_PID"

echo ""
echo "========================================"
echo "  Services Running"
echo "========================================"
echo "  Sidecar: PID $SIDECAR_PID (port 8081)"
echo "  Next.js: PID $NEXTJS_PID (port ${PORT:-8080})"
echo "========================================"
echo ""

# Handle shutdown gracefully
cleanup() {
    echo ""
    echo "🛑 Shutting down services..."
    kill $SIDECAR_PID 2>/dev/null || true
    kill $NEXTJS_PID 2>/dev/null || true
    exit 0
}
trap cleanup SIGTERM SIGINT

# Wait for either process to exit
wait -n

# One process exited - log and cleanup
echo "⚠️ A service exited unexpectedly"
echo "Sidecar logs:"
tail -30 /app/logs/sidecar.log 2>/dev/null || echo "(no logs)"

cleanup
