#!/bin/bash
# Railway startup script for TTS v2 service
# This script ensures proper environment setup before starting the server

set -e

echo "🚀 Starting TTS v2 Service on Railway..."
echo "========================================"
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found"
    exit 1
fi

echo "✅ Python: $(python3 --version)"
echo ""

# Set working directory
cd "$(dirname "$0")"

# Check if requirements are installed
if ! python3 -c "import fastapi" 2>/dev/null; then
    echo "📦 Installing dependencies..."
    if [ -f "requirements.txt" ]; then
        pip3 install --no-cache-dir -r requirements.txt
    else
        echo "⚠️  requirements.txt not found, installing minimal dependencies..."
        pip3 install --no-cache-dir fastapi uvicorn numpy torch
    fi
    echo "✅ Dependencies installed"
    echo ""
fi

# Get port from Railway (required)
PORT=${PORT:-8082}
echo "🌐 Port: $PORT"
echo ""

# Get device configuration
DEVICE=${TTS_DEVICE:-cpu}
echo "🖥️  Device: $DEVICE"
echo ""

# Display optimization settings
echo "⚙️  Optimization Settings:"
echo "   TensorRT: ${USE_TENSORRT:-false}"
echo "   Flash Attention: ${USE_FLASH_ATTENTION:-true}"
echo "   Quantization: ${USE_QUANTIZATION:-false}"
echo ""

# Start server
echo "🚀 Starting server..."
echo ""

exec python3 -m uvicorn server_v2:app \
    --host 0.0.0.0 \
    --port "$PORT" \
    --workers 1 \
    --log-level info \
    --no-access-log
