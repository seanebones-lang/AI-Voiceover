# HumanMirage TTS v3

> Production-grade Text-to-Speech with Real Voice Cloning

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.10+-green.svg)](https://python.org)
[![CUDA](https://img.shields.io/badge/CUDA-12.0+-76B900.svg)](https://nvidia.com)

---

## 🚀 Features

- **Real Voice Cloning** - Clone any voice from 3-30 seconds of audio
- **8 Emotion Presets** - Happy, sad, angry, excited, calm, whisper, serious, neutral
- **WebSocket Streaming** - <200ms first-chunk latency
- **Voice Effects** - Reverb, echo, robot, whisper, radio, stadium
- **SSML Support** - Full Speech Synthesis Markup Language parsing
- **Multi-Speaker** - Generate conversations with multiple voices
- **Batch Processing** - Process thousands of texts efficiently
- **100% Self-Hosted** - No external APIs, all processing on your hardware

---

## 📋 Requirements

- Python 3.10+
- CUDA 12.0+ (for GPU acceleration)
- 4GB+ VRAM (recommended)
- 8GB+ RAM

---

## ⚡ Quick Start

### Option 1: Docker (Recommended)

```bash
# Clone the repo
git clone https://github.com/yourusername/humanmirage-tts
cd humanmirage-tts/services/tts_v2

# Start with Docker Compose
docker-compose up -d

# Check health
curl http://localhost:8082/health
```

### Option 2: Local Installation

```bash
cd services/tts_v2

# Run the setup script
./run.sh install

# Start the server
./run.sh server 8082
```

### Option 3: Manual Installation

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
pip install TTS

# Start server
python server.py
```

---

## 🎤 Usage

### Generate Speech

```bash
curl -X POST http://localhost:8082/tts \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello, I am HumanMirage!",
    "emotion": "happy"
  }' \
  --output speech.wav

# Play it
afplay speech.wav  # macOS
aplay speech.wav   # Linux
```

### Clone a Voice

```bash
curl -X POST http://localhost:8082/clone \
  -F "name=MyVoice" \
  -F "files=@sample1.wav" \
  -F "files=@sample2.wav"

# Response: {"voice_id": "abc123", "name": "MyVoice", ...}
```

### Use Cloned Voice

```bash
curl -X POST http://localhost:8082/tts \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Now speaking with my cloned voice!",
    "voice_id": "abc123",
    "emotion": "excited"
  }' \
  --output cloned.wav
```

### CLI Commands

```bash
# Generate speech
./run.sh tts "Hello world" -o output.wav --play

# Clone voice
./run.sh clone "MyVoice" sample1.wav sample2.wav

# List voices
./run.sh voices

# Run benchmarks
./run.sh benchmark --runs 10
```

---

## 🎭 Emotions

| Emotion | Effect | Use Case |
|---------|--------|----------|
| `neutral` | Normal tone | General content |
| `happy` | Upbeat, faster | Positive messages |
| `sad` | Slower, lower pitch | Somber content |
| `angry` | Intense, forceful | Dramatic scenes |
| `excited` | High energy | Announcements |
| `calm` | Relaxed, steady | Meditation, ASMR |
| `whisper` | Soft, breathy | Intimate content |
| `serious` | Authoritative | News, business |

---

## 🎵 Voice Effects

| Effect | Description |
|--------|-------------|
| `none` | No effect |
| `radio` | AM radio filter |
| `stadium` | Large reverb + echo |
| `robot` | Ring modulation |
| `whisper` | Breathy effect |
| `warm` | Bass boost |
| `bright` | Treble boost |
| `broadcast` | Radio compression |

```bash
curl -X POST http://localhost:8082/tts \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Testing stadium effect",
    "effect": "stadium"
  }' \
  --output stadium.wav
```

---

## 📡 API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/voices` | List voices |
| POST | `/tts` | Generate speech |
| POST | `/clone` | Clone voice |
| DELETE | `/voices/{id}` | Delete voice |
| WS | `/ws/stream` | Real-time streaming |
| POST | `/batch` | Batch processing |
| POST | `/conversation` | Multi-speaker |
| GET | `/metrics` | Prometheus metrics |

### TTS Request

```json
{
  "text": "Your text here",
  "voice_id": "optional_voice_id",
  "emotion": "happy",
  "language": "en",
  "speed": 1.0,
  "effect": "none"
}
```

### WebSocket Streaming

```javascript
const ws = new WebSocket('ws://localhost:8082/ws/stream');

ws.onopen = () => {
  ws.send(JSON.stringify({
    text: "Stream this text",
    emotion: "neutral"
  }));
};

ws.onmessage = (event) => {
  if (event.data instanceof ArrayBuffer) {
    // PCM audio chunk (int16, 24kHz)
    playChunk(event.data);
  } else {
    const data = JSON.parse(event.data);
    if (data.done) {
      console.log(`Duration: ${data.duration_ms}ms`);
    }
  }
};
```

---

## 🐍 Python SDK

```python
from sdk_python import HumanMirageClient

async with HumanMirageClient(api_key="hm_xxx") as client:
    # Generate speech
    result = await client.generate(
        "Hello world!",
        emotion="happy"
    )
    result.save("output.wav")
    
    # Clone a voice
    voice = await client.clone_voice(
        "MyVoice",
        ["sample1.wav", "sample2.wav"]
    )
    
    # Use cloned voice
    result = await client.generate(
        "Speaking with cloned voice",
        voice_id=voice.voice_id
    )

# Synchronous version
from sdk_python import HumanMirageSync

with HumanMirageSync() as client:
    result = client.generate("Hello world!")
    result.save("output.wav")
```

---

## 🔧 Configuration

### Environment Variables

```bash
# Server
TTS_PORT=8082
CUDA_VISIBLE_DEVICES=0

# Model
TTS_MODEL=tts_models/multilingual/multi-dataset/xtts_v2

# Caching
REDIS_URL=redis://localhost:6379
CACHE_TTL=3600

# Logging
LOG_LEVEL=INFO
```

### Docker Compose

```yaml
services:
  tts:
    build: .
    ports:
      - "8082:8082"
    volumes:
      - ./data:/app/data
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

---

## 📊 Performance

| Metric | Value |
|--------|-------|
| First-chunk latency | ~180ms |
| Real-time factor | ~0.4x |
| Sample rate | 24kHz |
| VRAM usage | ~2GB |
| Concurrent requests | 10+ |

### Benchmarks

```bash
./run.sh benchmark --runs 20 --streaming

# Output:
# Short sentences: 150ms avg
# Medium sentences: 280ms avg
# Long sentences: 520ms avg
# RTF: 0.38
```

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    FastAPI Server (:8082)                     │
├──────────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌────────────┐  ┌────────────┐             │
│  │ Phonemizer │  │  Speaker   │  │   XTTS v2  │             │
│  │   (G2P)    │  │  Encoder   │  │   Model    │             │
│  └────────────┘  └────────────┘  └────────────┘             │
│         │              │              │                      │
│         └──────────────┼──────────────┘                      │
│                        ▼                                     │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐             │
│  │   Cache    │  │  Effects   │  │  Prosody   │             │
│  │ (Redis/LRU)│  │  Pipeline  │  │   Engine   │             │
│  └────────────┘  └────────────┘  └────────────┘             │
│                        │                                     │
│                        ▼                                     │
│  ┌────────────────────────────────────────────┐             │
│  │            WebSocket Streaming              │             │
│  └────────────────────────────────────────────┘             │
└──────────────────────────────────────────────────────────────┘
```

---

## 🧪 Testing

```bash
# Run all tests
./run.sh test

# Run specific test
python -m pytest tests/test_pipeline.py -v

# With coverage
python -m pytest tests/ --cov=. --cov-report=html
```

---

## 📈 Monitoring

### Prometheus Metrics

```
GET /metrics

# Metrics available:
tts_requests_total
tts_errors_total
tts_audio_seconds_total
tts_active_requests
tts_latency_milliseconds
tts_first_chunk_latency_milliseconds
```

### Grafana Dashboard

Import the dashboard from `monitoring/grafana-dashboard.json`.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request

---

## 📜 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- [Coqui TTS](https://github.com/coqui-ai/TTS) for XTTS v2
- [FastAPI](https://fastapi.tiangolo.com/) for the web framework
- Dr. Michael Hahn's TTS Masterclass methodology

---

**Built with ❤️ for the open-source community**
