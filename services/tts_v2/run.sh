#!/bin/bash

# HumanMirage TTS - Quick Run Script
# Usage: ./run.sh [command] [args]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Activate venv if it exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Default to server if no command
COMMAND="${1:-server}"

case "$COMMAND" in
    install)
        echo "📦 Installing dependencies..."
        python3 -m venv venv
        source venv/bin/activate
        pip install -r requirements.txt
        pip install TTS
        echo "✅ Installation complete!"
        ;;
    
    server|serve)
        echo "🚀 Starting TTS server..."
        python3 -m uvicorn server:app --host 0.0.0.0 --port "${2:-8082}"
        ;;
    
    tts|speak)
        shift
        python3 cli.py synthesize "$@"
        ;;
    
    clone)
        shift
        python3 cli.py clone "$@"
        ;;
    
    voices|list)
        python3 cli.py voices
        ;;
    
    benchmark|bench)
        shift
        python3 cli.py benchmark "$@"
        ;;
    
    test)
        echo "🧪 Running tests..."
        python3 -m pytest tests/ -v
        ;;
    
    docker)
        echo "🐳 Building Docker image..."
        docker build -t humanmirage-tts .
        echo "✅ Image built!"
        echo "   Run with: docker run -p 8082:8082 --gpus all humanmirage-tts"
        ;;
    
    help|--help|-h)
        echo "HumanMirage TTS - Quick Run Script"
        echo ""
        echo "Usage: ./run.sh [command] [args]"
        echo ""
        echo "Commands:"
        echo "  install         Install dependencies"
        echo "  server [port]   Start the TTS server (default port: 8082)"
        echo "  tts <text>      Generate speech from text"
        echo "  clone <name> <files...>  Clone a voice"
        echo "  voices          List available voices"
        echo "  benchmark       Run performance benchmarks"
        echo "  test            Run test suite"
        echo "  docker          Build Docker image"
        echo "  help            Show this help"
        echo ""
        echo "Examples:"
        echo "  ./run.sh server 8082"
        echo "  ./run.sh tts 'Hello world' -o hello.wav --play"
        echo "  ./run.sh clone 'MyVoice' sample.wav"
        ;;
    
    *)
        echo "Unknown command: $COMMAND"
        echo "Run './run.sh help' for usage"
        exit 1
        ;;
esac
