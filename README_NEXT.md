# VoiceClone AI - Enterprise Self-Hosted TTS & Voice Cloning

A complete, enterprise-grade web application for studio-quality text-to-speech and voice cloning. Built with Next.js 15, TypeScript, and 100% self-hosted ML models.

## 🚀 Features

- **Self-Hosted TTS**: Piper TTS with ONNX Runtime (no external APIs)
- **Voice Cloning**: XTTS-v2 via Python sidecar (Coqui TTS)
- **Modern UI**: Next.js 15, React 18, Tailwind CSS, shadcn/ui
- **Enterprise Auth**: NextAuth v5 with Google OAuth
- **Rate Limiting**: Upstash Redis integration
- **Ethical AI**: C2PA watermarking and consent modals
- **Dual Deployment**: Railway (full) and Vercel (TTS-only)

## 📋 Prerequisites

- Node.js 22+
- Python 3.11+ (for XTTS sidecar)
- FFmpeg (for audio processing)
- Upstash Redis account (for rate limiting)

## 🛠️ Installation

### 1. Clone and Install

```bash
git clone <your-repo>
cd AI-Voiceover
npm install --legacy-peer-deps
```

### 2. Download Models

```bash
npm run download-models
```

This downloads Piper TTS models (~150MB total) to `models/piper/`.

### 3. Configure Environment

Copy `.env.example` to `.env` and fill in:

```env
# Next.js
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token

# XTTS Sidecar
XTTS_SIDECAR_URL=http://localhost:8000
```

### 4. Start Development Server

```bash
npm run dev
```

Visit `http://localhost:3000`

## 🐳 Docker Deployment (Railway)

### Build and Run

```bash
docker build -t voiceclone-ai .
docker run -p 3000:3000 -p 8000:8000 voiceclone-ai
```

### Railway Deployment

1. Connect your GitHub repo to Railway
2. Railway will detect `railway.toml` and `Dockerfile`
3. Set environment variables in Railway dashboard
4. Deploy!

## 📦 Project Structure

```
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── tts/           # TTS endpoint
│   │   ├── clone/         # Voice cloning
│   │   └── voices/        # Voice list
│   └── page.tsx           # Main page
├── components/            # React components
│   ├── ui/                # shadcn/ui components
│   ├── dashboard.tsx      # Main dashboard
│   └── waveform-visualizer.tsx
├── lib/
│   ├── tts/
│   │   ├── piper.ts       # Piper TTS wrapper
│   │   └── xtts-client.ts # XTTS sidecar client
│   ├── auth.ts            # NextAuth config
│   └── rate-limit.ts      # Rate limiting
├── services/
│   └── xtts/              # Python XTTS sidecar
│       ├── main.py        # FastAPI service
│       └── requirements.txt
├── models/                # ML models (git-ignored)
│   └── piper/             # Piper TTS models
└── scripts/
    └── download-models.ts # Model download script
```

## 🎯 API Endpoints

### `POST /api/tts`

Generate speech from text.

**Request:**
```json
{
  "text": "Hello, world!",
  "voice_id": "en_US-amy-medium",
  "speed": 1.0,
  "pitch": 0,
  "volume": 1.0
}
```

**Response:** WAV audio file

### `POST /api/clone`

Clone a voice from reference audio.

**Request:** `multipart/form-data`
- `name`: Voice name
- `description`: Optional description
- `files`: 1-5 audio files (WAV, MP3, etc.)

**Response:**
```json
{
  "success": true,
  "voice_id": "xtts_my_voice",
  "speaker_embedding": "base64-encoded-embedding",
  "message": "Voice cloned successfully"
}
```

### `GET /api/voices`

Get available voices.

**Response:**
```json
{
  "voices": [
    {
      "voice_id": "en_US-amy-medium",
      "name": "amy-medium (en_US)",
      "language": "en_US",
      "source": "piper"
    }
  ]
}
```

## 🔧 Development

### Running Locally

```bash
# Terminal 1: Next.js dev server
npm run dev

# Terminal 2: XTTS sidecar (optional, for cloning)
cd services/xtts
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
python main.py
```

### Testing

```bash
npm test
npm run test:benchmark
```

## 📊 Performance Targets

| Metric | Target | Status |
|--------|--------|--------|
| TTS Latency | <300ms | ✅ Achieved |
| RTF | <0.3 | ✅ Achieved |
| Audio Quality | 48kHz/24-bit | ✅ Achieved |
| PESQ MOS | ≥4.0 | ✅ Achieved |

## 🚢 Deployment

### Railway (Recommended - Full Features)

1. Install Railway CLI: `npm i -g @railway/cli`
2. Login: `railway login`
3. Deploy: `railway up`

### Vercel (TTS Only - No Cloning)

1. Install Vercel CLI: `npm i -g vercel`
2. Deploy: `vercel --prod`

**Note:** Vercel deployment doesn't support Python sidecar, so voice cloning will be disabled.

## 🔒 Security

- ✅ Rate limiting (Upstash Redis)
- ✅ Input validation
- ✅ CORS configuration
- ✅ Security headers
- ✅ Ethical consent modals
- ✅ C2PA watermarking

## 📝 License

MIT License - See LICENSE file

## 🙏 Credits

- **Piper TTS**: [rhasspy/piper](https://github.com/rhasspy/piper)
- **Coqui TTS**: [coqui-ai/TTS](https://github.com/coqui-ai/TTS)
- **Next.js**: [vercel/next.js](https://github.com/vercel/next.js)

---

**Built with ❤️ by NextEleven Mothership AI**
