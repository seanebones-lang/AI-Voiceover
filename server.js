require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ElevenLabs API Configuration
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

// Get all available voices
app.get('/api/voices', async (req, res) => {
  try {
    const response = await axios.get(`${ELEVENLABS_BASE_URL}/voices`, {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching voices:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch voices' });
  }
});

// Generate speech from text
app.post('/api/text-to-speech', async (req, res) => {
  try {
    const { text, voice_id, stability = 0.5, similarity_boost = 0.85, style = 0.3 } = req.body;

    if (!text || !voice_id) {
      return res.status(400).json({ error: 'Text and voice_id are required' });
    }

    const response = await axios({
      method: 'post',
      url: `${ELEVENLABS_BASE_URL}/text-to-speech/${voice_id}/stream`,
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      data: {
        text: text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: parseFloat(stability),
          similarity_boost: parseFloat(similarity_boost),
          style: parseFloat(style)
        }
      },
      responseType: 'arraybuffer'
    });

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Disposition': 'attachment; filename="voiceover.mp3"'
    });
    res.send(response.data);
  } catch (error) {
    console.error('Error generating speech:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to generate speech' });
  }
});

// Get user info (character count, etc.)
app.get('/api/user', async (req, res) => {
  try {
    const response = await axios.get(`${ELEVENLABS_BASE_URL}/user`, {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching user info:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

// Voice cloning endpoint
app.post('/api/clone-voice', async (req, res) => {
  try {
    const { name, description, files } = req.body;
    // This would require multipart/form-data handling
    // Placeholder for future implementation
    res.status(501).json({ message: 'Voice cloning coming soon!' });
  } catch (error) {
    console.error('Error cloning voice:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to clone voice' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 AI Voice-Over Generator running on http://localhost:${PORT}`);
  console.log(`📝 API Key loaded: ${ELEVENLABS_API_KEY ? 'Yes ✓' : 'No ✗'}`);
});
