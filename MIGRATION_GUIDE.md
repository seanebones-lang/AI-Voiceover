# HumanMirage TTS v3 Migration Guide

## Overview

This guide walks you through migrating from the old edge-tts based system to the new HumanMirage TTS v3 with real voice cloning.

## What's Changed

| Feature | Old System | New System |
|---------|-----------|------------|
| TTS Engine | edge-tts (Microsoft cloud) | Coqui XTTS v2 (self-hosted) |
| Voice Cloning | Fake (stored files, used fallback) | Real (speaker embeddings) |
| Emotion Control | Parameter theater | Actual prosody modification |
| Sample Rate | 22kHz | 24kHz |
| Streaming | Buffer-then-send | True WebSocket streaming |
| Privacy | Data sent to Microsoft | 100% local processing |

## Migration Steps

### Step 1: Install New TTS Service

```bash
# Navigate to the new service directory
cd services/tts_v2

# Option A: Docker (recommended)
docker-compose up -d

# Option B: Local Python installation
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt

# Download XTTS v2 model (first run will auto-download ~1.8GB)
python -c "from TTS.api import TTS; TTS('tts_models/multilingual/multi-dataset/xtts_v2')"

# Start server
python server.py
```

### Step 2: Update Environment Variables

Add to your `.env.local`:

```env
# New TTS service URL (REST API)
NEXT_PUBLIC_TTS_API_URL=http://localhost:8082

# WebSocket URL for streaming
NEXT_PUBLIC_TTS_WS_URL=ws://localhost:8082/ws/stream

# Disable old XTTS sidecar
# XTTS_SIDECAR_URL=http://localhost:8081  # Comment this out
```

### Step 3: Update API Routes

Replace `app/api/tts/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const TTS_URL = process.env.NEXT_PUBLIC_TTS_API_URL || 'http://localhost:8082'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const response = await fetch(`${TTS_URL}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: body.text,
        voice_id: body.voice_id,
        emotion: body.emotion || 'neutral',
        language: body.language || 'en',
        speed: body.speed || 1.0,
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      return NextResponse.json(
        { error: error.detail || 'TTS failed' },
        { status: response.status }
      )
    }

    const audioBuffer = await response.arrayBuffer()
    
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Disposition': `attachment; filename="tts-${Date.now()}.wav"`,
      },
    })
  } catch (error) {
    console.error('TTS error:', error)
    return NextResponse.json(
      { error: 'TTS service unavailable' },
      { status: 500 }
    )
  }
}
```

### Step 4: Update Voice Cloning Route

Replace `app/api/clone-voice/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const TTS_URL = process.env.NEXT_PUBLIC_TTS_API_URL || 'http://localhost:8082'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    
    const response = await fetch(`${TTS_URL}/clone`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      return NextResponse.json(
        { error: error.detail || 'Clone failed' },
        { status: response.status }
      )
    }

    return NextResponse.json(await response.json())
  } catch (error) {
    console.error('Clone error:', error)
    return NextResponse.json(
      { error: 'Voice cloning service unavailable' },
      { status: 500 }
    )
  }
}
```

### Step 5: Update Dashboard Component

Replace the import in your page:

```typescript
// Old:
import { Dashboard } from '@/components/dashboard'

// New:
import { DashboardV2 } from '@/components/dashboard-v2'

export default function Home() {
  return <DashboardV2 />
}
```

### Step 6: Test the Migration

```bash
# Check TTS service health
curl http://localhost:8082/health

# List voices
curl http://localhost:8082/voices

# Test TTS
curl -X POST http://localhost:8082/tts \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world", "emotion": "happy"}' \
  --output test.wav

# Play the audio
afplay test.wav  # macOS
# or: aplay test.wav  # Linux
```

## Feature Comparison

### Old Emotion Presets (Fake)

The old system had "emotion presets" that only adjusted `stability` and `similarity` parameters:

```typescript
// Old - did nothing real
const emotions = {
  happy: { stability: 0.3, similarity: 0.8 },
  sad: { stability: 0.7, similarity: 0.6 },
}
```

### New Emotion Control (Real)

The new system modifies actual prosody:

```python
# New - actual speech modification
EMOTION_PARAMS = {
    "happy": {"speed": 1.1, "pitch": 2.0, "energy": 1.2, "variance": 0.7},
    "sad": {"speed": 0.85, "pitch": -2.0, "energy": 0.7, "variance": 0.3},
}
```

### Old Voice Cloning (Fake)

```python
# Old - just saved files and used fallback
if voice_id.startswith("clone_"):
    edge_voice = "en-US-GuyNeural"  # Fallback!
```

### New Voice Cloning (Real)

```python
# New - actual speaker embedding extraction
embedding = self.speaker_encoder.encode_multiple(audio_files)
audio = await self.synthesize(text, speaker_embedding=embedding)
```

## Rollback Plan

If you need to rollback:

1. Restore original `app/api/tts/route.ts`
2. Restore original `app/api/clone-voice/route.ts`
3. Re-enable `XTTS_SIDECAR_URL` in `.env.local`
4. Stop the new TTS service: `docker-compose down`

## GPU Requirements

| Configuration | VRAM Required | Notes |
|---------------|---------------|-------|
| XTTS v2 only | ~2GB | Basic TTS |
| XTTS v2 + Streaming | ~2.5GB | With WebSocket |
| Full pipeline | ~4GB | With LLM prosody |

For CPU-only deployment (slower, ~5x latency):

```yaml
# In docker-compose.yml, remove GPU reservation
services:
  tts:
    environment:
      - CUDA_VISIBLE_DEVICES=""  # Force CPU
```

## Troubleshooting

### Service won't start

```bash
# Check logs
docker-compose logs -f tts

# Common issues:
# - CUDA not available: Install nvidia-docker2
# - Port in use: Change TTS_PORT
# - Model download failed: Check disk space (need ~2GB)
```

### Voice cloning not working

```bash
# Check speaker database
sqlite3 data/speakers.db "SELECT * FROM speakers"

# Verify audio file is valid
ffprobe your_audio.wav
```

### WebSocket connection fails

```bash
# Check if port is accessible
curl http://localhost:8082/health

# Check browser console for CORS errors
# Add your frontend origin to CORS config if needed
```

## Performance Tuning

### Reduce Latency

```python
# In pipeline.py, reduce diffusion steps
self.acoustic.stream_generate(
    num_diffusion_steps=4,  # Default: 8
)
```

### Increase Quality

```python
# More diffusion steps = better quality, higher latency
self.acoustic.stream_generate(
    num_diffusion_steps=12,  # Better quality
)
```

### Enable Caching

```python
# Add to server.py
from functools import lru_cache

@lru_cache(maxsize=100)
def cached_embedding(speaker_id: str):
    return speaker_db.get_embedding(speaker_id)
```

---

## Summary

You've now upgraded from a fake TTS system to a real one:

- ✅ True voice cloning with speaker embeddings
- ✅ Real emotion control via prosody modification
- ✅ Self-hosted (no external APIs)
- ✅ WebSocket streaming for real-time playback
- ✅ Production-ready Docker deployment

Welcome to the future of TTS. Ship it! 🚀
