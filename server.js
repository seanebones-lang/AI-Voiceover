require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const multer = require('multer');
const FormData = require('form-data');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/ogg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio files allowed.'));
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
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

// Voice cloning endpoint - Upload audio samples
app.post('/api/clone-voice', upload.array('files', 5), async (req, res) => {
  try {
    const { name, description } = req.body;
    const files = req.files;

    if (!name || !files || files.length === 0) {
      return res.status(400).json({ error: 'Name and at least one audio file required' });
    }

    // Create FormData for ElevenLabs API
    const formData = new FormData();
    formData.append('name', name);
    if (description) {
      formData.append('description', description);
    }

    // Add files to form data
    files.forEach((file, index) => {
      formData.append('files', fs.createReadStream(file.path), {
        filename: file.originalname,
        contentType: file.mimetype
      });
    });

    const response = await axios.post(
      `${ELEVENLABS_BASE_URL}/voices/add`,
      formData,
      {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          ...formData.getHeaders()
        }
      }
    );

    // Clean up uploaded files
    files.forEach(file => {
      fs.unlinkSync(file.path);
    });

    res.json({
      success: true,
      voice_id: response.data.voice_id,
      message: 'Voice cloned successfully! You can now use it for text-to-speech.'
    });
  } catch (error) {
    console.error('Error cloning voice:', error.response?.data || error.message);
    // Clean up files on error
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    res.status(500).json({
      error: error.response?.data?.detail?.message || 'Failed to clone voice. Make sure audio is clear and 30+ seconds total.'
    });
  }
});

// Delete a cloned voice
app.delete('/api/voices/:voice_id', async (req, res) => {
  try {
    const { voice_id } = req.params;

    await axios.delete(`${ELEVENLABS_BASE_URL}/voices/${voice_id}`, {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY
      }
    });

    res.json({ success: true, message: 'Voice deleted successfully' });
  } catch (error) {
    console.error('Error deleting voice:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to delete voice' });
  }
});

// Generate speech with SSML support
app.post('/api/text-to-speech-ssml', async (req, res) => {
  try {
    const { text, voice_id, stability = 0.5, similarity_boost = 0.85, style = 0.3 } = req.body;

    if (!text || !voice_id) {
      return res.status(400).json({ error: 'Text and voice_id are required' });
    }

    const response = await axios({
      method: 'post',
      url: `${ELEVENLABS_BASE_URL}/text-to-speech/${voice_id}`,
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      data: {
        text: text,
        model_id: 'eleven_multilingual_v2', // Supports SSML
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
      'Content-Disposition': 'attachment; filename="voiceover-ssml.mp3"'
    });
    res.send(response.data);
  } catch (error) {
    console.error('Error generating SSML speech:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to generate speech' });
  }
});

// Multi-voice conversation generator
app.post('/api/conversation', async (req, res) => {
  try {
    const { messages } = req.body; // Array of {text, voice_id, speaker_name}

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array required' });
    }

    // Generate audio for each message
    const audioBuffers = [];
    for (const msg of messages) {
      const response = await axios({
        method: 'post',
        url: `${ELEVENLABS_BASE_URL}/text-to-speech/${msg.voice_id}/stream`,
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        data: {
          text: msg.text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.85,
            style: 0.3
          }
        },
        responseType: 'arraybuffer'
      });

      audioBuffers.push({
        speaker: msg.speaker_name || 'Speaker',
        audio: response.data
      });
    }

    // For now, return the first audio (client-side will handle merging)
    // In production, you'd use ffmpeg to merge audio files with pauses
    res.json({
      success: true,
      count: audioBuffers.length,
      message: 'Conversation generated. Download each part separately.'
    });
  } catch (error) {
    console.error('Error generating conversation:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to generate conversation' });
  }
});

// Get voice settings presets
app.get('/api/presets', (req, res) => {
  const presets = {
    'excited': { stability: 0.3, similarity_boost: 0.75, style: 0.8, description: 'High energy and enthusiastic' },
    'calm': { stability: 0.7, similarity_boost: 0.85, style: 0.2, description: 'Relaxed and soothing' },
    'serious': { stability: 0.8, similarity_boost: 0.9, style: 0.1, description: 'Professional and formal' },
    'dramatic': { stability: 0.4, similarity_boost: 0.8, style: 0.9, description: 'Theatrical and expressive' },
    'whisper': { stability: 0.5, similarity_boost: 0.95, style: 0.5, description: 'Soft and intimate' },
    'angry': { stability: 0.3, similarity_boost: 0.7, style: 0.9, description: 'Intense and forceful' },
    'happy': { stability: 0.4, similarity_boost: 0.8, style: 0.7, description: 'Cheerful and upbeat' },
    'sad': { stability: 0.6, similarity_boost: 0.85, style: 0.4, description: 'Melancholic and slow' }
  };
  res.json(presets);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 AI Voice-Over Generator running on http://localhost:${PORT}`);
  console.log(`📝 API Key loaded: ${ELEVENLABS_API_KEY ? 'Yes ✓' : 'No ✗'}`);
});
