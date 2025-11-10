# AI Voice-Over Generator - Complete API Documentation

## 🎯 Overview

This is a comprehensive TTS (Text-to-Speech) API with dual-provider support, advanced features, and maximum independence from vendor lock-in.

### Core Features
- ✅ **Dual TTS Providers** (ElevenLabs + Open Source)
- ✅ **Multi-Format Export** (MP3, WAV, OGG, FLAC, M4A)
- ✅ **Batch Processing** (Up to 100 items)
- ✅ **Smart Provider Routing** (Cost/Quality/Balanced strategies)
- ✅ **AI Voice Conversations** (Multi-speaker podcast-style)
- ✅ **26 Emotion/Style Presets**
- ✅ **Analytics Dashboard**
- ✅ **Audio Caching System** (90%+ cost reduction)
- ✅ **Voice Cloning** (Both providers)
- ✅ **17 Languages Supported**
- ✅ **Text Preprocessing** (Better TTS pronunciation)
- ✅ **Audiobook Generator** (Automatic chapter detection)
- ✅ **Professional Audio Effects** (Normalize, EQ, compression, noise reduction)
- ✅ **Audio Analysis & Comparison** (Quality assessment)

---

## 📚 API Endpoints

### 1. Text-to-Speech (Standard)

**Endpoint:** `POST /api/text-to-speech`

Generate speech from text using ElevenLabs with format conversion support.

**Request:**
```json
{
  "text": "Hello, world!",
  "voice_id": "voice_id_here",
  "stability": 0.5,
  "similarity_boost": 0.85,
  "style": 0.3,
  "format": "mp3",
  "use_cache": true
}
```

**Supported Formats:** `mp3`, `wav`, `ogg`, `flac`, `m4a`

**Response:** Audio file (binary)

---

### 2. Text-to-Speech (Open Source)

**Endpoint:** `POST /api/text-to-speech/opensource`

Generate speech using Coqui XTTS v2 (100% free, unlimited).

**Request:**
```json
{
  "text": "This is completely free!",
  "language": "en",
  "speaker_url": "https://url-to-voice-sample.wav",
  "format": "mp3",
  "use_cache": true
}
```

**Supported Languages:** `en`, `es`, `fr`, `de`, `it`, `pt`, `pl`, `tr`, `ru`, `nl`, `cs`, `ar`, `zh-cn`, `ja`, `hu`, `ko`, `hi`

**Response:** Audio file (binary)

---

### 3. Smart Provider Routing

**Endpoint:** `POST /api/text-to-speech/smart`

Automatically selects the best provider based on strategy.

**Request:**
```json
{
  "text": "Smart routing example",
  "voice_id": "optional_elevenlabs_voice",
  "speaker_url": "optional_opensource_voice",
  "language": "en",
  "format": "mp3",
  "strategy": "cost"
}
```

**Strategies:**
- `cost` (default): Try open-source first, fallback to ElevenLabs
- `quality`: Prefer ElevenLabs, fallback to open-source
- `balanced`: Use best available provider

**Response:** Audio file (binary)

**Headers:**
- `X-Provider`: Provider used (elevenlabs or coqui-xtts-v2)
- `X-Strategy`: Strategy applied
- `X-Cache`: HIT or MISS

---

### 4. Emotion & Style Controls

**Endpoint:** `POST /api/text-to-speech/with-emotion`

Apply emotion/style presets to your voice generation.

**Request:**
```json
{
  "text": "I'm so excited about this!",
  "voice_id": "voice_id_here",
  "emotion": "excited",
  "format": "mp3"
}
```

**Available Emotions (26 presets):**

**Basic Emotions:**
- `neutral`, `happy`, `sad`, `angry`, `excited`, `fearful`, `surprised`, `disgusted`

**Speaking Styles:**
- `calm`, `serious`, `dramatic`, `whisper`, `shouting`, `conversational`, `storytelling`, `authoritative`, `friendly`, `mysterious`

**Content-Specific:**
- `news_anchor`, `audiobook`, `meditation`, `commercial`, `podcast_host`, `documentary`, `gaming`, `children`

**Get All Presets:**
```bash
GET /api/presets
```

---

### 5. Batch Processing

**Endpoint:** `POST /api/batch/text-to-speech`

Process up to 100 texts in one request.

**Request:**
```json
{
  "items": [
    { "text": "First text", "voice_id": "voice_1", "format": "mp3" },
    { "text": "Second text", "voice_id": "voice_2", "format": "wav" }
  ],
  "batch_name": "My Batch",
  "parallel": true,
  "provider": "elevenlabs"
}
```

**Check Status:**
```bash
GET /api/batch/{batch_id}
```

**Download Single Item:**
```bash
GET /api/batch/{batch_id}/download/{cache_key}
```

**Download All:**
```bash
GET /api/batch/{batch_id}/download-all
```

---

### 6. AI Voice Conversations

**Endpoint:** `POST /api/conversation`

Create multi-speaker conversations (podcasts, interviews, dialogues).

**Request:**
```json
{
  "messages": [
    {
      "text": "Welcome to the show!",
      "voice_id": "host_voice",
      "speaker_name": "Host"
    },
    {
      "text": "Thanks for having me!",
      "voice_id": "guest_voice",
      "speaker_name": "Guest"
    }
  ],
  "pause_duration": 0.5,
  "format": "mp3",
  "provider": "auto"
}
```

**Features:**
- Up to 50 speakers per conversation
- Automatic audio merging
- Customizable pause duration
- Supports both ElevenLabs and open-source voices
- Returns single merged audio file

---

### 7. Voice Management

#### Get All Voices
```bash
GET /api/voices
```

Returns ElevenLabs voices + locally stored voices.

#### Get Stored Voices Only
```bash
GET /api/voices/stored
```

Returns only YOUR voices (stored locally).

#### Get Open Source Voices
```bash
GET /api/voices/opensource
```

Returns free open-source voice library.

#### Sync Voice Library
```bash
POST /api/voices/sync
```

Sync all ElevenLabs voices to local storage.

---

### 8. Voice Cloning

#### Clone with ElevenLabs
```bash
POST /api/clone-voice
```

Upload audio files (30+ seconds recommended) to clone a voice.

#### Clone with Open Source
```bash
POST /api/clone-voice/opensource
```

Upload 6+ second audio sample for free voice cloning.

**Form Data:**
- `name`: Voice name
- `description`: Optional description
- `files`: Audio files (up to 5)

---

### 9. Analytics Dashboard

**Endpoint:** `GET /api/analytics`

Get comprehensive usage statistics.

**Response:**
```json
{
  "overview": {
    "total_requests": 1523,
    "cache_hit_rate": "87.2%",
    "cache_hits": 1328,
    "cache_misses": 195,
    "uptime_hours": "24.5"
  },
  "providers": {
    "elevenlabs": {
      "requests": 423,
      "percentage": "27.8",
      "estimated_cost": "$0.1269"
    },
    "opensource": {
      "requests": 1100,
      "percentage": "72.2",
      "estimated_cost": "$0.0000 (Free!)"
    }
  },
  "formats": [
    { "format": "mp3", "count": 950, "percentage": "62.4" },
    { "format": "wav", "count": 320, "percentage": "21.0" }
  ],
  "emotions": {
    "top_emotions": [
      { "emotion": "excited", "count": 145 },
      { "emotion": "conversational", "count": 98 }
    ]
  },
  "cost_analysis": {
    "estimated_total_cost": "$0.1269",
    "cache_savings": "$0.3984",
    "savings_percentage": "87.2%"
  },
  "insights": [
    "🎯 Great cache utilization!",
    "💰 Excellent cost optimization with open-source!",
    "🚀 High usage detected!"
  ]
}
```

**Reset Analytics:**
```bash
POST /api/analytics/reset
```

---

### 10. Audio Formats

**Endpoint:** `GET /api/formats`

Get all supported audio formats.

**Response:**
```json
{
  "formats": [
    {
      "format": "mp3",
      "contentType": "audio/mpeg",
      "codec": "libmp3lame",
      "extension": "mp3"
    },
    {
      "format": "wav",
      "contentType": "audio/wav",
      "codec": "pcm_s16le",
      "extension": "wav"
    }
  ]
}
```

---

## 🎨 Use Cases

### 1. Generate Simple Audio
```bash
curl -X POST http://localhost:3000/api/text-to-speech \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello, world!",
    "voice_id": "your_voice_id",
    "format": "mp3"
  }' \
  --output hello.mp3
```

### 2. Use Open Source for Cost Savings
```bash
curl -X POST http://localhost:3000/api/text-to-speech/opensource \
  -H "Content-Type: application/json" \
  -d '{
    "text": "This is 100% free!",
    "language": "en",
    "format": "mp3"
  }' \
  --output free.mp3
```

### 3. Smart Routing (Cost-First)
```bash
curl -X POST http://localhost:3000/api/text-to-speech/smart \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Smart routing example",
    "strategy": "cost",
    "format": "mp3"
  }' \
  --output smart.mp3
```

### 4. Generate with Emotion
```bash
curl -X POST http://localhost:3000/api/text-to-speech/with-emotion \
  -H "Content-Type: application/json" \
  -d '{
    "text": "I am so excited!",
    "voice_id": "your_voice_id",
    "emotion": "excited"
  }' \
  --output excited.mp3
```

### 5. Create Podcast Conversation
```bash
curl -X POST http://localhost:3000/api/conversation \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      { "text": "Welcome to our podcast!", "voice_id": "host", "speaker_name": "Host" },
      { "text": "Happy to be here!", "voice_id": "guest", "speaker_name": "Guest" }
    ],
    "pause_duration": 0.5
  }' \
  --output podcast.mp3
```

### 6. Batch Process
```bash
curl -X POST http://localhost:3000/api/batch/text-to-speech \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      { "text": "Chapter 1", "voice_id": "narrator" },
      { "text": "Chapter 2", "voice_id": "narrator" },
      { "text": "Chapter 3", "voice_id": "narrator" }
    ],
    "batch_name": "Audiobook Chapters"
  }'
```

---

## 💡 Best Practices

### 1. Cost Optimization
- Use `strategy: "cost"` in smart routing
- Enable caching (`use_cache: true`)
- Use open-source TTS when quality isn't critical
- Batch similar requests together

### 2. Quality Optimization
- Use ElevenLabs for premium content
- Apply emotion presets for better expression
- Use higher stability (0.7-0.9) for consistent voices
- Test different voices for your content type

### 3. Performance
- Cache is automatic and reduces latency by 90%+
- Batch processing handles up to 100 items efficiently
- Parallel processing for independent requests
- Smart routing minimizes API call overhead

### 4. Storage & Independence
- All voices are stored locally
- Audio cache persists across restarts
- Voice cloning data is stored permanently
- No vendor lock-in

---

## 🚀 Advanced Features

### Voice Preset Combinations
```javascript
// Excited podcast host
{
  "emotion": "podcast_host",
  "style_override": {
    "stability": 0.4,
    "similarity_boost": 0.83,
    "style": 0.8
  }
}
```

### Multi-Language Conversations
```javascript
{
  "messages": [
    { "text": "Hello!", "language": "en", "speaker_url": "english_voice.wav" },
    { "text": "Bonjour!", "language": "fr", "speaker_url": "french_voice.wav" }
  ]
}
```

### Custom Format with High Quality
```javascript
{
  "text": "High quality audio",
  "voice_id": "your_voice",
  "format": "flac", // Lossless quality
  "stability": 0.8,
  "similarity_boost": 0.95
}
```

---

## 🎨 Advanced Quality Features

### Text Preprocessing

**Endpoint:** `POST /api/text/preprocess`

Preview how text will be preprocessed for better TTS pronunciation.

**Request:**
```json
{
  "text": "Dr. Smith earned $5,000 on 12/25/2024 at 3:30 PM. Visit https://example.com for more info."
}
```

**Response:**
```json
{
  "original": "Dr. Smith earned $5,000 on 12/25/2024 at 3:30 PM...",
  "processed": "Doctor Smith earned 5 thousand dollars on December 25, 2024 at 3 30 PM...",
  "changed": true,
  "changes": ["Abbreviations expanded", "Currency formatted", "Dates formatted"],
  "character_diff": 15,
  "improvement_tips": [...]
}
```

**Get Preprocessing Options:** `GET /api/text/preprocessing-options`

Lists all available preprocessing features including:
- Number normalization
- Abbreviation expansion
- Date/time formatting
- URL/email pronunciation
- Currency & percentage handling
- Acronym spacing

---

### Audiobook Generator

**Detect Chapters:** `POST /api/audiobook/detect-chapters`

Automatically detect chapters in your text.

**Request:**
```json
{
  "text": "Chapter 1: Introduction\nOnce upon a time...\n\nChapter 2: The Adventure\nThe journey began..."
}
```

**Response:**
```json
{
  "success": true,
  "chapter_count": 2,
  "chapters": [
    {
      "number": 1,
      "title": "Introduction",
      "word_count": 150,
      "estimated_duration_minutes": 1,
      "preview": "Once upon a time..."
    }
  ],
  "total_words": 300,
  "estimated_total_duration_minutes": 2
}
```

**Generate Audiobook:** `POST /api/audiobook/generate`

Generate a complete audiobook with automatic chapter detection.

**Request:**
```json
{
  "text": "Chapter 1: Introduction\n...\n\nChapter 2: Conclusion\n...",
  "voice_id": "your_voice_id",
  "provider": "elevenlabs",
  "format": "mp3",
  "auto_detect_chapters": true,
  "preprocessing": true,
  "effects": {
    "normalize": true,
    "noiseReduction": true,
    "fadeIn": 1.0,
    "fadeOut": 1.0
  }
}
```

**Response:**
```json
{
  "success": true,
  "audiobook_id": "audiobook_12345",
  "chapters": [
    {
      "chapter_number": 1,
      "chapter_title": "Introduction",
      "filename": "audiobook_12345_chapter_1.mp3",
      "size": 1048576,
      "download_url": "/api/audiobook/audiobook_12345/chapter/1"
    }
  ],
  "total_chapters": 2,
  "download_all_url": "/api/audiobook/audiobook_12345/download-all"
}
```

**Download Chapter:** `GET /api/audiobook/:audiobook_id/chapter/:chapter_number`

Download individual chapter audio file.

---

### Audio Effects

**Apply Effects:** `POST /api/audio/apply-effects`

Apply professional audio effects to existing audio files.

**Request (multipart/form-data):**
- `audio`: Audio file (MP3, WAV, OGG, etc.)
- `normalize`: true/false
- `noiseReduction`: true/false
- `compression`: true/false
- `fadeIn`: number (seconds)
- `fadeOut`: number (seconds)
- `eq`: JSON string `{"bass": 2, "mid": 0, "treble": 1}`

**Response:** Processed audio file (binary)

**Get Effects Options:** `GET /api/audio/effects-options`

Lists all available effects with presets:

```json
{
  "effects": [
    {
      "name": "normalize",
      "description": "Normalizes audio levels for consistent volume",
      "type": "boolean",
      "recommended_for": ["podcasts", "audiobooks"]
    }
  ],
  "presets": {
    "podcast": { "normalize": true, "noiseReduction": true, "compression": true },
    "audiobook": { "normalize": true, "noiseReduction": true },
    "voice_clarity": { "noiseReduction": true, "compression": true, "eq": {"bass": -2, "mid": 3, "treble": 2} }
  }
}
```

---

### Audio Analysis & Comparison

**Analyze Audio:** `POST /api/audio/analyze`

Analyze audio file quality and characteristics.

**Request (multipart/form-data):**
- `audio`: Audio file

**Response:**
```json
{
  "success": true,
  "analysis": {
    "duration": 120.5,
    "bitRate": 128000,
    "sampleRate": 44100,
    "channels": 2,
    "codec": "mp3",
    "size": 1048576,
    "format": "mp3"
  },
  "quality_assessment": {
    "bitrate_quality": "Good",
    "sample_rate_quality": "High",
    "is_stereo": true
  }
}
```

**Compare Audio Files:** `POST /api/audio/compare`

Compare two audio files to determine similarity.

**Request (multipart/form-data):**
- `audio1`: First audio file
- `audio2`: Second audio file

**Response:**
```json
{
  "success": true,
  "audio1": { "duration": 120, "bitRate": 128000, ... },
  "audio2": { "duration": 118, "bitRate": 192000, ... },
  "similarity": {
    "score": 85,
    "details": {
      "durationMatch": 98,
      "bitRateMatch": 66,
      "sampleRateMatch": 100
    }
  },
  "recommendation": "These audio files are very similar"
}
```

---

## 📊 Analytics Insights

Monitor your usage with `/api/analytics`:
- **Cache hit rate**: Higher = more cost savings
- **Provider distribution**: Balance cost vs quality
- **Popular emotions**: Understand your content needs
- **Cost analysis**: Track spending and savings

---

## 🔧 Configuration

### Environment Variables
```bash
ELEVENLABS_API_KEY=your_key_here          # Optional
REPLICATE_API_TOKEN=your_token_here       # Optional
PORT=3000                                 # Default port
```

### Feature Flags
- Both providers are optional
- System works with one or both configured
- Smart routing adapts to available providers

---

## 🎯 Summary

This API provides:
- **Maximum Independence**: Store everything locally
- **Cost Optimization**: 90%+ savings with caching + open-source
- **Flexibility**: Multiple formats, providers, and styles
- **Scalability**: Batch processing, smart routing, analytics
- **Quality**: 26 emotion presets, dual providers
- **Viral Potential**: AI conversations, podcast automation

**You're building an empire, not renting one.** 💪
