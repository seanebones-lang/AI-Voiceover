#!/bin/bash

# HumanMirage TTS v3 - Quick Start Script
# =======================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TTS_DIR="$PROJECT_ROOT/services/tts_v2"

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║            HumanMirage TTS v3 - Quick Start               ║"
echo "║     Production TTS with Real Voice Cloning                ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Check for Docker
if command -v docker &> /dev/null && command -v docker-compose &> /dev/null; then
    echo "✓ Docker detected"
    USE_DOCKER=true
else
    echo "⚠ Docker not found, will use local Python"
    USE_DOCKER=false
fi

# Check for NVIDIA GPU
if command -v nvidia-smi &> /dev/null; then
    echo "✓ NVIDIA GPU detected"
    GPU_COUNT=$(nvidia-smi -L | wc -l)
    echo "  └─ Found $GPU_COUNT GPU(s)"
    HAS_GPU=true
else
    echo "⚠ No NVIDIA GPU detected, will use CPU (slower)"
    HAS_GPU=false
fi

echo ""

# Start method
if [ "$USE_DOCKER" = true ]; then
    echo "Starting TTS service with Docker..."
    cd "$TTS_DIR"
    
    if [ "$HAS_GPU" = true ]; then
        docker-compose up -d
    else
        # CPU-only mode
        docker-compose up -d --scale redis=0
        echo "  └─ Running in CPU mode"
    fi
    
    echo ""
    echo "Waiting for service to start..."
    
    # Wait for health check
    MAX_WAIT=120
    WAITED=0
    while [ $WAITED -lt $MAX_WAIT ]; do
        if curl -s http://localhost:8082/health > /dev/null 2>&1; then
            echo "✓ TTS service is ready!"
            break
        fi
        sleep 2
        WAITED=$((WAITED + 2))
        echo "  └─ Waiting... ($WAITED/$MAX_WAIT seconds)"
    done
    
    if [ $WAITED -ge $MAX_WAIT ]; then
        echo "⚠ Service did not start in time. Check logs with:"
        echo "  docker-compose logs -f tts"
        exit 1
    fi
    
else
    # Local Python mode
    echo "Starting TTS service with local Python..."
    cd "$TTS_DIR"
    
    # Check Python
    if ! command -v python3 &> /dev/null; then
        echo "✗ Python 3 is required"
        exit 1
    fi
    
    # Create venv if needed
    if [ ! -d "venv" ]; then
        echo "Creating virtual environment..."
        python3 -m venv venv
    fi
    
    # Activate and install
    source venv/bin/activate
    
    echo "Installing dependencies..."
    pip install -q -r requirements.txt
    
    # Install TTS
    pip install -q TTS
    
    echo ""
    echo "Starting server..."
    echo "  └─ Logs will appear below"
    echo ""
    
    python server.py
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                    Service Ready!                         ║"
echo "╠═══════════════════════════════════════════════════════════╣"
echo "║  REST API:    http://localhost:8082                       ║"
echo "║  WebSocket:   ws://localhost:8082/ws/stream               ║"
echo "║  Health:      http://localhost:8082/health                ║"
echo "║  Docs:        http://localhost:8082/docs                  ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "Quick test:"
echo "  curl -X POST http://localhost:8082/tts \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"text\": \"Hello, I am HumanMirage TTS\"}' \\"
echo "    --output test.wav && afplay test.wav"
echo ""
