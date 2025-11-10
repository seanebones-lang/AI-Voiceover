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

    // Clean up uploaded files
    files.forEach(file => {
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error('Error deleting temp file:', err);
      }
    });

    res.json({
      success: true,
      voice_id: response.data.voice_id,
      message: 'Voice cloned successfully! You can now use it for text-to-speech.'
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
