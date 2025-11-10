require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const multer = require('multer');
const FormData = require('form-data');
const fs = require('fs');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Use /tmp for Vercel serverless environment
    const uploadDir = process.env.VERCEL ? '/tmp' : './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
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

// Multer error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('Multer error:', err);
    return res.status(400).json({
      error: err.message === 'Unexpected field'
        ? 'Invalid file upload format. Please upload audio files only.'
        : err.message
    });
  } else if (err) {
    console.error('Upload error:', err);
    return res.status(400).json({
      error: err.message || 'File upload error'
    });
  }
  next();
});

// ElevenLabs API Configuration
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

// Voice Storage Configuration - OUR OWN EMPIRE
const VOICES_STORAGE_DIR = './voices-storage';
const VOICES_DB_PATH = './voices-db.json';

// Initialize storage directory
if (!fs.existsSync(VOICES_STORAGE_DIR)) {
  fs.mkdirSync(VOICES_STORAGE_DIR, { recursive: true });
}

// Voice Database Helper Functions
function loadVoicesDB() {
  try {
    if (!fs.existsSync(VOICES_DB_PATH)) {
      fs.writeFileSync(VOICES_DB_PATH, JSON.stringify({ voices: [] }, null, 2));
    }
    const data = fs.readFileSync(VOICES_DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading voices DB:', error);
    return { voices: [] };
  }
}

function saveVoicesDB(db) {
  try {
    fs.writeFileSync(VOICES_DB_PATH, JSON.stringify(db, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving voices DB:', error);
    return false;
  }
}

// Get all available voices - COMBINES ElevenLabs + Our Stored Voices
app.get('/api/voices', async (req, res) => {
  try {
    // Get ElevenLabs voices
    const response = await axios.get(`${ELEVENLABS_BASE_URL}/voices`, {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY
      }
    });

    // Get our locally stored voices
    const db = loadVoicesDB();

    // Merge both - mark which ones we own
    const elevenlabsVoices = response.data.voices.map(v => ({
      ...v,
      stored_locally: db.voices.some(stored => stored.elevenlabs_voice_id === v.voice_id)
    }));

    res.json({
      voices: elevenlabsVoices,
      locally_stored_count: db.voices.length,
      total_count: elevenlabsVoices.length
    });
  } catch (error) {
    console.error('Error fetching voices:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch voices' });
  }
});

// Get OUR stored voices only - THE EMPIRE
app.get('/api/voices/stored', (req, res) => {
  try {
    const db = loadVoicesDB();
    res.json({
      voices: db.voices,
      count: db.voices.length,
      message: 'These are YOUR voices. You own this data.'
    });
  } catch (error) {
    console.error('Error loading stored voices:', error);
    res.status(500).json({ error: 'Failed to load stored voices' });
  }
});

// Get specific stored voice details
app.get('/api/voices/stored/:voice_id', (req, res) => {
  try {
    const { voice_id } = req.params;
    const db = loadVoicesDB();
    const voice = db.voices.find(v => v.id === voice_id || v.elevenlabs_voice_id === voice_id);

    if (!voice) {
      return res.status(404).json({ error: 'Voice not found in local storage' });
    }

    res.json(voice);
  } catch (error) {
    console.error('Error getting voice details:', error);
    res.status(500).json({ error: 'Failed to get voice details' });
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

    console.log('Voice clone request:', { name, description, fileCount: files?.length });

    if (!name || !files || files.length === 0) {
      return res.status(400).json({ error: 'Name and at least one audio file required' });
    }

    // Validate and sanitize name - ElevenLabs expects alphanumeric with spaces, hyphens, underscores
    const sanitizedName = name.trim();
    if (sanitizedName.length === 0) {
      return res.status(400).json({ error: 'Voice name cannot be empty' });
    }
    if (sanitizedName.length > 100) {
      return res.status(400).json({ error: 'Voice name is too long (max 100 characters)' });
    }

    // Create FormData for ElevenLabs API
    const formData = new FormData();
    formData.append('name', sanitizedName);
    if (description && description.trim()) {
      formData.append('description', description.trim());
    }

    // Add files to form data - read as buffers for serverless compatibility
    files.forEach((file, index) => {
      console.log(`Adding file ${index + 1}:`, { name: file.originalname, size: file.size, type: file.mimetype });
      const fileBuffer = fs.readFileSync(file.path);
      formData.append('files', fileBuffer, {
        filename: file.originalname,
        contentType: file.mimetype
      });
    });

    console.log('Sending request to ElevenLabs...');
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

    console.log('Voice cloned successfully:', response.data.voice_id);

    // STORE EVERYTHING LOCALLY - BUILD OUR EMPIRE
    const voiceId = response.data.voice_id;
    const voiceStoragePath = path.join(VOICES_STORAGE_DIR, voiceId);

    // Create directory for this voice
    if (!fs.existsSync(voiceStoragePath)) {
      fs.mkdirSync(voiceStoragePath, { recursive: true });
    }

    // Save audio samples permanently
    const savedFiles = [];
    files.forEach((file, index) => {
      const savedFilePath = path.join(voiceStoragePath, `sample_${index}_${file.originalname}`);
      fs.copyFileSync(file.path, savedFilePath);
      savedFiles.push({
        filename: `sample_${index}_${file.originalname}`,
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype
      });
      console.log(`Saved audio sample: ${savedFilePath}`);
    });

    // Save voice metadata to our database
    const voiceData = {
      id: voiceId,
      name: sanitizedName,
      description: description?.trim() || '',
      elevenlabs_voice_id: voiceId,
      audio_files: savedFiles,
      created_at: new Date().toISOString(),
      source: 'cloned',
      provider: 'elevenlabs'
    };

    const db = loadVoicesDB();
    db.voices.push(voiceData);
    saveVoicesDB(db);

    console.log('Voice stored locally:', voiceId);

    // Clean up temp uploaded files
    files.forEach(file => {
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error('Error deleting temp file:', err);
      }
    });

    res.json({
      success: true,
      voice_id: voiceId,
      message: 'Voice cloned and stored successfully! You own this voice data.',
      stored_locally: true,
      audio_samples_saved: savedFiles.length
    });
  } catch (error) {
    console.error('Error cloning voice:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });

    // Clean up files on error
    if (req.files) {
      req.files.forEach(file => {
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (err) {
          console.error('Error cleaning up file:', err);
        }
      });
    }

    const errorMessage = error.response?.data?.detail?.message
      || error.response?.data?.message
      || error.message
      || 'Failed to clone voice. Make sure audio is clear and 30+ seconds total.';

    res.status(error.response?.status || 500).json({
      error: errorMessage
    });
  }
});

// Delete a cloned voice - from BOTH ElevenLabs AND our storage
app.delete('/api/voices/:voice_id', async (req, res) => {
  try {
    const { voice_id } = req.params;
    const deleteFromElevenlabs = req.query.elevenlabs !== 'false';
    const deleteFromLocal = req.query.local !== 'false';

    let deletedFrom = [];

    // Delete from ElevenLabs if requested
    if (deleteFromElevenlabs) {
      try {
        await axios.delete(`${ELEVENLABS_BASE_URL}/voices/${voice_id}`, {
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY
          }
        });
        deletedFrom.push('ElevenLabs');
      } catch (error) {
        console.error('Error deleting from ElevenLabs:', error.response?.data || error.message);
      }
    }

    // Delete from OUR storage - THE EMPIRE
    if (deleteFromLocal) {
      const db = loadVoicesDB();
      const voiceIndex = db.voices.findIndex(v => v.id === voice_id || v.elevenlabs_voice_id === voice_id);

      if (voiceIndex !== -1) {
        // Delete audio files
        const voiceStoragePath = path.join(VOICES_STORAGE_DIR, voice_id);
        if (fs.existsSync(voiceStoragePath)) {
          fs.rmSync(voiceStoragePath, { recursive: true, force: true });
          console.log(`Deleted voice storage: ${voiceStoragePath}`);
        }

        // Remove from database
        db.voices.splice(voiceIndex, 1);
        saveVoicesDB(db);
        deletedFrom.push('Local Storage');
      }
    }

    res.json({
      success: true,
      message: `Voice deleted from: ${deletedFrom.join(', ')}`,
      deleted_from: deletedFrom
    });
  } catch (error) {
    console.error('Error deleting voice:', error);
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

// Stripe: Get publishable key
app.get('/api/stripe/config', (req, res) => {
  res.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
  });
});

// Stripe: Create checkout session
app.post('/api/stripe/create-checkout-session', async (req, res) => {
  try {
    const { priceId, plan } = req.body;

    // Define your pricing (you can also create these in Stripe Dashboard)
    const prices = {
      'pro-monthly': {
        amount: 900, // $9.00 first month
        name: 'Pro Monthly - First Month',
        description: '250,000 characters, all premium features'
      },
      'pro-regular': {
        amount: 2900, // $29.00 regular
        name: 'Pro Monthly',
        description: '250,000 characters, all premium features'
      }
    };

    const selectedPrice = prices[plan] || prices['pro-monthly'];

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: selectedPrice.name,
              description: selectedPrice.description,
              images: ['https://i.imgur.com/EHyR2nP.png'], // Add your logo URL
            },
            unit_amount: selectedPrice.amount,
            recurring: {
              interval: 'month'
            }
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${req.headers.origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin}/#pricing`,
      customer_email: req.body.email,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Stripe: Webhook to handle events
app.post('/api/stripe/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test' // Add webhook secret to .env
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      console.log('💰 Payment successful:', session.id);
      // TODO: Grant user access to premium features
      // You would typically:
      // 1. Get customer email from session.customer_email
      // 2. Update user in your database to premium status
      // 3. Send confirmation email
      break;

    case 'customer.subscription.deleted':
      const subscription = event.data.object;
      console.log('❌ Subscription cancelled:', subscription.id);
      // TODO: Revoke premium access
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({received: true});
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Serve index.html for root and any non-API routes (for Vercel serverless)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/success.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'success.html'));
});

// Export for Vercel serverless
module.exports = app;

app.listen(PORT, () => {
  console.log(`🚀 AI Voice-Over Generator running on http://localhost:${PORT}`);
  console.log(`📝 API Key loaded: ${ELEVENLABS_API_KEY ? 'Yes ✓' : 'No ✗'}`);
  console.log(`📁 Upload directory: ${process.env.VERCEL ? '/tmp' : './uploads'}`);
  console.log(`🔧 Environment: ${process.env.VERCEL ? 'Vercel Serverless' : 'Local'}`);
});
