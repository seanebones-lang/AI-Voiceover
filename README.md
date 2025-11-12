# 🎙️ AI Voice-Over Generator

A production-ready full-stack web application that converts text to natural-sounding speech using ElevenLabs API. Built with Node.js, Express, and modern vanilla JavaScript with enterprise-grade security and error handling.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)](https://nodejs.org)

## ✨ Features

### Core Features
- **🎤 Voice Cloning** - Clone any voice with 30+ seconds of audio samples
- **🎭 250+ Premium AI Voices** - Professional voices from ElevenLabs
- **🎨 8 Emotion Presets** - Excited, calm, serious, dramatic, whisper, angry, happy, sad
- **🎙️ Voice Recording** - Record directly in-browser with MediaRecorder API
- **🗣️ Multi-Voice Conversations** - Create realistic dialogues with multiple speakers
- **⚖️ Voice Comparison** - Test voices side-by-side before choosing
- **⚙️ Advanced Controls** - Fine-tune stability, similarity, and style parameters
- **💾 Audio Download** - Save generated audio as MP3 files
- **🌓 Dark Mode** - Beautiful light/dark theme with smooth transitions

### Technical Features
- **🔒 Security** - Rate limiting, input validation, security headers
- **📊 Request Logging** - Detailed logging with response times
- **🚀 Vercel Ready** - Optimized for serverless deployment
- **⚡ Performance** - Streaming audio generation, optimized builds
- **🛡️ Error Handling** - Comprehensive error handling and user-friendly messages
- **📱 Responsive** - Works perfectly on desktop, tablet, and mobile

## 🚀 Quick Start

### Prerequisites

- Node.js 14+ installed ([Download](https://nodejs.org/))
- ElevenLabs API key ([Get free credits](https://elevenlabs.io))

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/seanebones-lang/AI-Voiceover.git
cd AI-Voiceover
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**

Copy the example environment file and add your API key:
```bash
cp .env.example .env
```

Edit `.env` and add your ElevenLabs API key:
```env
ELEVENLABS_API_KEY=your_api_key_here
PORT=3000
```

**⚠️ SECURITY WARNING:** Never commit your `.env` file to Git. It's already in `.gitignore`.

4. **Start the server**
```bash
# Development mode with auto-restart
npm run dev

# Production mode
npm start
```

5. **Open in browser**
```
http://localhost:3000
```

## 🛠️ Tech Stack

### Backend
- **Node.js** - JavaScript runtime environment
- **Express** - Fast, unopinionated web framework
- **Multer** - Multipart/form-data handling for file uploads
- **Axios** - Promise-based HTTP client
- **dotenv** - Environment variable management
- **CORS** - Cross-origin resource sharing
- **Stripe** - Payment processing (optional)

### Frontend
- **Vanilla JavaScript** - No framework dependencies, pure performance
- **Tailwind CSS** - Utility-first CSS framework (CDN)
- **Lucide Icons** - Beautiful consistent icons
- **HTML5 Audio API** - Audio playback
- **MediaRecorder API** - In-browser voice recording
- **LocalStorage API** - Client-side persistence

### External APIs
- **ElevenLabs API** - Professional text-to-speech engine
  - Model: `eleven_turbo_v2_5` (fastest generation)
  - Voice cloning capabilities
  - 250+ voices available
  - SSML support for advanced control

## 📁 Project Structure

```
AI-Voiceover/
├── server.js              # Express server with all API endpoints
├── package.json           # NPM dependencies and scripts
├── .env.example           # Example environment variables
├── .env                   # Your secrets (never commit!)
├── .gitignore            # Files to exclude from Git
├── vercel.json           # Vercel deployment configuration
├── README.md             # This file
└── public/               # Frontend static files
    ├── index.html        # Main SPA with Tailwind UI
    ├── success.html      # Payment success page
    ├── styles.css        # Custom styles (minimal)
    └── app.js            # Client-side JavaScript (1000+ lines)
```

## 🔌 API Endpoints

### Voice Endpoints

#### `GET /api/voices`
Get all available voices from ElevenLabs.

**Response:**
```json
{
  "voices": [
    {
      "voice_id": "21m00Tcm4TlvDq8ikWAM",
      "name": "Rachel",
      "category": "premade",
      "labels": {
        "accent": "american",
        "age": "young",
        "gender": "female"
      }
    }
  ]
}
```

#### `POST /api/clone-voice`
Clone a voice from audio samples.

**Request:** `multipart/form-data`
- `name` (string, required): Voice name (max 50 chars)
- `description` (string, optional): Voice description (max 100 chars)
- `files` (files, required): 1-5 audio files (30+ seconds total, max 50MB)

**Response:**
```json
{
  "success": true,
  "voice_id": "abc123xyz",
  "message": "Voice cloned successfully!"
}
```

#### `DELETE /api/voices/:voice_id`
Delete a cloned voice.

**Response:**
```json
{
  "success": true,
  "message": "Voice deleted successfully"
}
```

### Text-to-Speech Endpoints

#### `POST /api/text-to-speech`
Generate speech from text.

**Request:**
```json
{
  "text": "Hello world!",
  "voice_id": "21m00Tcm4TlvDq8ikWAM",
  "stability": 0.5,
  "similarity_boost": 0.85,
  "style": 0.3
}
```

**Response:** Audio file (MP3 stream)

**Parameters:**
- `stability` (0-1): Higher = more consistent, Lower = more expressive
- `similarity_boost` (0-1): How closely to match the original voice
- `style` (0-1): Amount of stylistic variation

#### `POST /api/text-to-speech-ssml`
Generate speech with SSML support for advanced control.

#### `POST /api/conversation`
Generate multi-voice conversation.

**Request:**
```json
{
  "messages": [
    {
      "text": "Hello there!",
      "voice_id": "voice1",
      "speaker_name": "John"
    },
    {
      "text": "Hi, how are you?",
      "voice_id": "voice2",
      "speaker_name": "Mary"
    }
  ]
}
```

### Utility Endpoints

#### `GET /api/user`
Get user information (character count, limits).

**Response:**
```json
{
  "subscription": {
    "character_count": 1500,
    "character_limit": 10000,
    "can_use_instant_voice_cloning": true
  }
}
```

#### `GET /api/presets`
Get emotion presets for voice customization.

**Response:**
```json
{
  "excited": {
    "stability": 0.3,
    "similarity_boost": 0.75,
    "style": 0.8,
    "description": "High energy and enthusiastic"
  }
}
```

#### `GET /health`
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

## ⚙️ Configuration

### Environment Variables

See `.env.example` for all available options:

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `ELEVENLABS_API_KEY` | Your ElevenLabs API key | Yes | - |
| `PORT` | Server port | No | 3000 |
| `NODE_ENV` | Environment (development/production) | No | development |
| `RATE_LIMIT_MAX` | Max requests per 15 min | No | 100 |
| `ALLOWED_ORIGINS` | CORS allowed origins | No | * |
| `STRIPE_SECRET_KEY` | Stripe secret key | No | - |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key | No | - |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret | No | - |

### Voice Settings

Adjust these parameters for different voice characteristics:

- **Stability (0-1)**
  - 0.0-0.3: Very expressive, emotional, variable
  - 0.4-0.6: Balanced, natural conversation
  - 0.7-1.0: Very stable, consistent, audiobook-style

- **Similarity Boost (0-1)**
  - 0.5-0.7: More creative interpretation
  - 0.75-0.85: Recommended balance
  - 0.9-1.0: Maximum similarity to original voice

- **Style (0-1)**
  - 0.0-0.3: Neutral, minimal emotion
  - 0.4-0.7: Moderate expression
  - 0.8-1.0: Maximum dramatic expression

## 🚀 Deployment

### Deploy to Vercel (Recommended)

1. **Install Vercel CLI**
```bash
npm i -g vercel
```

2. **Deploy**
```bash
vercel
```

3. **Add environment variables in Vercel Dashboard**
   - Go to your project settings
   - Add `ELEVENLABS_API_KEY` and other variables
   - Redeploy

### Deploy to Heroku

1. **Create app**
```bash
heroku create your-app-name
```

2. **Set environment variables**
```bash
heroku config:set ELEVENLABS_API_KEY=your_key_here
```

3. **Deploy**
```bash
git push heroku main
```

### Deploy to Railway

1. Connect your GitHub repository
2. Add environment variables in the dashboard
3. Deploy automatically on push

## 🔒 Security

### Implemented Security Measures

- ✅ **API Key Protection** - Keys stored in environment variables only
- ✅ **Rate Limiting** - 100 requests per 15 minutes per IP
- ✅ **Input Validation** - All inputs validated and sanitized
- ✅ **Security Headers** - X-Frame-Options, CSP, X-XSS-Protection, etc.
- ✅ **File Upload Security** - Type validation, size limits (50MB)
- ✅ **Error Handling** - No sensitive data in error responses
- ✅ **CORS Configuration** - Configurable allowed origins
- ✅ **Request Logging** - All requests logged with timing

### Best Practices

1. **Never commit `.env` files** - Already in `.gitignore`
2. **Use environment-specific keys** - Different keys for dev/prod
3. **Rotate API keys regularly** - Generate new keys periodically
4. **Monitor usage** - Check ElevenLabs dashboard for unusual activity
5. **Set up webhooks** - Get notified of suspicious activity

## 📊 Usage Limits

### ElevenLabs Free Tier
- 10,000 characters/month
- All voices available
- Basic features
- No voice cloning

### ElevenLabs Paid Tiers
- 30,000+ characters/month
- Voice cloning included
- Higher rate limits
- Commercial license
- Priority support

## 🐛 Troubleshooting

### Common Issues

**"Failed to fetch voices"**
- Check your API key in `.env`
- Verify internet connection
- Check ElevenLabs API status

**"Failed to generate speech"**
- Text might be too long (max 5,000 characters)
- Check character limit on your account
- Verify voice_id is valid

**"Voice cloning failed"**
- Ensure audio is clear and high quality
- Total audio must be at least 30 seconds
- Maximum 5 files, 50MB total
- Supported formats: MP3, WAV, WebM, OGG
- Requires paid ElevenLabs subscription

**"Rate limit exceeded"**
- Wait 15 minutes or adjust `RATE_LIMIT_MAX` in `.env`
- Consider upgrading to paid plan for higher limits

**Audio doesn't play**
- Check browser console for errors
- Try a different browser (Chrome/Firefox recommended)
- Verify audio format support

## 🎯 Roadmap

- [ ] User authentication and accounts
- [ ] Database integration for history
- [ ] Stripe payment processing
- [ ] Audio editing tools
- [ ] Batch processing
- [ ] Webhook notifications
- [ ] Auto-subtitles with Whisper API
- [ ] Video generation with audio
- [ ] Mobile PWA app
- [ ] API rate limiting dashboard
- [ ] Usage analytics

## 📝 Development

### Run in development mode

```bash
npm run dev
```

This uses `nodemon` for auto-restart on file changes.

### Code Structure

**Server-side** (`server.js`):
- Express app setup and middleware
- Rate limiting and security
- API endpoints for ElevenLabs integration
- File upload handling with Multer
- Stripe payment processing (optional)

**Client-side** (`public/app.js`):
- Voice loading and management
- Audio generation and playback
- Voice recording with MediaRecorder
- File upload and drag-and-drop
- Emotion presets application
- Multi-voice conversation builder

### NPM Scripts

```json
{
  "start": "node server.js",        // Production
  "dev": "nodemon server.js"        // Development with auto-restart
}
```

## 📄 License

MIT License - feel free to use for commercial projects!

Copyright (c) 2024 AI Voice-Over Generator

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 💬 Support

- **GitHub Issues**: [Report a bug](https://github.com/seanebones-lang/AI-Voiceover/issues)
- **Documentation**: This README
- **ElevenLabs Docs**: [https://docs.elevenlabs.io](https://docs.elevenlabs.io)

## 🙏 Credits

- **ElevenLabs** - Text-to-speech API ([https://elevenlabs.io](https://elevenlabs.io))
- **Tailwind CSS** - UI styling framework
- **Lucide** - Icon library
- **Express** - Web framework
- **Vercel** - Hosting platform

## ⭐ Star History

If you find this project helpful, please consider giving it a star on GitHub!

---

**Made with ❤️ by NextEleven Mothership AI**

🚀 Transform your text into professional voice-overs in seconds!
