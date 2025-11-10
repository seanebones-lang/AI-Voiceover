# 🎙️ AI Voice-Over Generator

A full-stack web application that converts text to natural-sounding speech using ElevenLabs API. Built with Node.js, Express, and vanilla JavaScript.

**Live Demo**: [Your deployed URL here]

## ✨ Features

- **250+ Premium AI Voices** - Morgan Freeman, David Attenborough, and more
- **Real-time Text-to-Speech** - Generate voice-overs in seconds
- **Voice Customization** - Adjust stability, similarity, and style settings
- **Audio Download** - Save as MP3 files
- **History Tracking** - Keep track of your generated voice-overs
- **Responsive Design** - Works on desktop, tablet, and mobile
- **Social Sharing** - Easy Twitter/social media sharing

## 🚀 Quick Start

### Prerequisites

- Node.js 14+ installed
- ElevenLabs API key (get free $250 credits at https://elevenlabs.io)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/AI-Voiceover.git
cd AI-Voiceover
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**

The `.env` file is already set up with your API key:
```env
ELEVENLABS_API_KEY=sk_5ac106062e19304d8fb2fda7799bdcdbbfe136cbae778191
PORT=3000
```

4. **Start the server**
```bash
npm start
```

5. **Open in browser**
```
http://localhost:3000
```

## 🛠️ Tech Stack

### Backend
- **Node.js** - Runtime environment
- **Express** - Web framework
- **Axios** - HTTP client for API calls
- **dotenv** - Environment variable management
- **CORS** - Cross-origin resource sharing

### Frontend
- **Vanilla JavaScript** - No framework dependencies
- **HTML5 & CSS3** - Modern, responsive UI
- **LocalStorage** - Client-side history storage

### API
- **ElevenLabs API** - Text-to-speech engine
  - Model: `eleven_turbo_v2_5`
  - Streaming audio generation
  - 250+ voices available

## 📁 Project Structure

```
AI-Voiceover/
├── server.js           # Express server & API endpoints
├── package.json        # Dependencies & scripts
├── .env               # Environment variables (API keys)
├── .gitignore         # Git ignore rules
├── README.md          # This file
└── public/            # Frontend files
    ├── index.html     # Main HTML page
    ├── styles.css     # Styling
    └── app.js         # Client-side JavaScript
```

## 🔌 API Endpoints

### GET `/api/voices`
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
        "age": "young"
      }
    }
  ]
}
```

### POST `/api/text-to-speech`
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

### GET `/api/user`
Get user information (character count, limits).

**Response:**
```json
{
  "subscription": {
    "character_count": 1500,
    "character_limit": 10000
  }
}
```

## 🎨 Customization

### Voice Settings

Adjust these parameters for different voice characteristics:

- **Stability (0-1)**: Higher = more consistent, Lower = more expressive
- **Similarity Boost (0-1)**: How closely to match the original voice
- **Style (0-1)**: Amount of stylistic variation

### Adding Custom Voices

To add your own cloned voice:

1. Go to https://elevenlabs.io
2. Clone a voice (requires subscription)
3. Get the `voice_id`
4. It will automatically appear in the voice dropdown

## 🚀 Deployment

### Deploy to Vercel

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
vercel
```

3. Add environment variable in Vercel dashboard:
   - Key: `ELEVENLABS_API_KEY`
   - Value: Your API key

### Deploy to Heroku

1. Create `Procfile`:
```
web: node server.js
```

2. Deploy:
```bash
heroku create your-app-name
heroku config:set ELEVENLABS_API_KEY=your_key_here
git push heroku main
```

### Deploy to Railway

1. Connect your GitHub repo
2. Add environment variable: `ELEVENLABS_API_KEY`
3. Deploy automatically

## 💰 Pricing Integration (Coming Soon)

The pricing section is already built in the UI. To integrate Stripe:

1. Get Stripe API keys from https://stripe.com
2. Install Stripe SDK:
```bash
npm install stripe
```

3. Add checkout endpoints (see Stripe docs)

## 🔒 Security

- API key stored in `.env` (never commit to git)
- `.env` is in `.gitignore`
- Server-side API calls only (API key never exposed to frontend)
- CORS enabled for security
- Input validation on all endpoints

## 📈 Usage Limits

**Free ElevenLabs Account:**
- 10,000 characters/month
- All voices available
- API rate limits apply

**Paid ElevenLabs Account:**
- Up to 500,000+ characters/month
- Voice cloning
- Higher rate limits

## 🐛 Troubleshooting

### "Failed to fetch voices"
- Check your API key in `.env`
- Verify internet connection
- Check ElevenLabs API status

### "Failed to generate speech"
- Text might be too long (max 5,000 characters)
- Check character limit on your account
- Verify voice_id is valid

### Audio doesn't play
- Check browser console for errors
- Try a different browser (Chrome/Firefox recommended)
- Check audio format support

## 📝 Development

### Run in development mode with auto-restart:
```bash
npm run dev
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ELEVENLABS_API_KEY` | Your ElevenLabs API key | Yes |
| `PORT` | Server port (default: 3000) | No |

## 🎯 Roadmap

- [ ] Voice cloning feature
- [ ] User authentication
- [ ] Stripe payment integration
- [ ] Audio history in database
- [ ] Batch processing
- [ ] Auto-subtitles (Whisper API)
- [ ] Video generation with audio
- [ ] Mobile PWA app

## 📄 License

MIT License - feel free to use for commercial projects!

## 🤝 Contributing

Contributions welcome! Please open an issue or PR.

## 💬 Support

- GitHub Issues: [Report a bug](https://github.com/yourusername/AI-Voiceover/issues)
- Email: your@email.com
- Twitter: @yourusername

## 🙏 Credits

- Built with [ElevenLabs API](https://elevenlabs.io)
- Inspired by voiceclone.ai
- UI design: Custom gradient theme

---

**Made with ❤️ by [Your Name]**

⭐ Star this repo if you found it helpful!

 
