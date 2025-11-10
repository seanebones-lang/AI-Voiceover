require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const multer = require('multer');
const FormData = require('form-data');
const fs = require('fs');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Replicate = require('replicate');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffmpeg = require('fluent-ffmpeg');

// Configure ffmpeg
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

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

// Replicate API Configuration - OPEN SOURCE TTS
const replicate = process.env.REPLICATE_API_TOKEN
  ? new Replicate({ auth: process.env.REPLICATE_API_TOKEN })
  : null;

// Voice Storage Configuration - OUR OWN EMPIRE
const VOICES_STORAGE_DIR = process.env.VERCEL ? '/tmp/voices-storage' : './voices-storage';
const VOICES_DB_PATH = process.env.VERCEL ? '/tmp/voices-db.json' : './voices-db.json';
const AUDIO_CACHE_DIR = process.env.VERCEL ? '/tmp/audio-cache' : './audio-cache';

// Initialize storage directories
if (!fs.existsSync(VOICES_STORAGE_DIR)) {
  fs.mkdirSync(VOICES_STORAGE_DIR, { recursive: true });
}
if (!fs.existsSync(AUDIO_CACHE_DIR)) {
  fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
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

// Audio Format Conversion - MAXIMUM FLEXIBILITY
const AUDIO_FORMATS = {
  mp3: { contentType: 'audio/mpeg', codec: 'libmp3lame' },
  wav: { contentType: 'audio/wav', codec: 'pcm_s16le' },
  ogg: { contentType: 'audio/ogg', codec: 'libvorbis' },
  flac: { contentType: 'audio/flac', codec: 'flac' },
  m4a: { contentType: 'audio/mp4', codec: 'aac' }
};

function convertAudioFormat(inputBuffer, inputFormat, outputFormat) {
  return new Promise((resolve, reject) => {
    if (outputFormat === inputFormat || !AUDIO_FORMATS[outputFormat]) {
      // No conversion needed or invalid format
      return resolve(inputBuffer);
    }

    const tempDir = process.env.VERCEL ? '/tmp' : './temp-audio';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const inputPath = path.join(tempDir, `input_${Date.now()}.${inputFormat}`);
    const outputPath = path.join(tempDir, `output_${Date.now()}.${outputFormat}`);

    try {
      // Write input buffer to temp file
      fs.writeFileSync(inputPath, inputBuffer);

      const formatConfig = AUDIO_FORMATS[outputFormat];

      // Convert using ffmpeg
      ffmpeg(inputPath)
        .audioCodec(formatConfig.codec)
        .toFormat(outputFormat)
        .on('end', () => {
          try {
            const outputBuffer = fs.readFileSync(outputPath);

            // Clean up temp files
            fs.unlinkSync(inputPath);
            fs.unlinkSync(outputPath);

            resolve(outputBuffer);
          } catch (error) {
            reject(error);
          }
        })
        .on('error', (error) => {
          // Clean up on error
          try {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
          } catch (e) {}
          reject(error);
        })
        .save(outputPath);
    } catch (error) {
      // Clean up on error
      try {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch (e) {}
      reject(error);
    }
  });
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

// SYNC ALL ElevenLabs voices to local storage - BUILD THE LIBRARY
app.post('/api/voices/sync', async (req, res) => {
  try {
    console.log('Starting voice library sync from ElevenLabs...');

    // Get all voices from ElevenLabs
    const response = await axios.get(`${ELEVENLABS_BASE_URL}/voices`, {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY
      }
    });

    const elevenlabsVoices = response.data.voices;
    const db = loadVoicesDB();
    let syncedCount = 0;
    let skippedCount = 0;

    // Store each voice metadata
    for (const voice of elevenlabsVoices) {
      // Check if already stored
      const existing = db.voices.find(v => v.elevenlabs_voice_id === voice.voice_id);

      if (!existing) {
        const voiceData = {
          id: voice.voice_id,
          name: voice.name,
          description: voice.description || '',
          elevenlabs_voice_id: voice.voice_id,
          category: voice.category || 'general',
          labels: voice.labels || {},
          preview_url: voice.preview_url || null,
          created_at: new Date().toISOString(),
          source: 'elevenlabs_library',
          provider: 'elevenlabs',
          audio_files: []
        };

        db.voices.push(voiceData);
        syncedCount++;
        console.log(`Synced voice: ${voice.name} (${voice.voice_id})`);
      } else {
        skippedCount++;
      }
    }

    saveVoicesDB(db);

    res.json({
      success: true,
      message: `Voice library synced! ${syncedCount} new voices added.`,
      synced: syncedCount,
      skipped: skippedCount,
      total_stored: db.voices.length,
      note: 'Voice metadata stored. Audio generation still uses ElevenLabs API.'
    });

    console.log(`Voice sync complete: ${syncedCount} new, ${skippedCount} skipped, ${db.voices.length} total`);
  } catch (error) {
    console.error('Error syncing voices:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to sync voice library',
      details: error.message
    });
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

// Generate speech from text - WITH CACHING AND MULTI-FORMAT SUPPORT
app.post('/api/text-to-speech', async (req, res) => {
  try {
    const {
      text,
      voice_id,
      stability = 0.5,
      similarity_boost = 0.85,
      style = 0.3,
      use_cache = true,
      format = 'mp3' // NEW: Support mp3, wav, ogg, flac, m4a
    } = req.body;

    if (!text || !voice_id) {
      return res.status(400).json({ error: 'Text and voice_id are required' });
    }

    // Validate format
    const outputFormat = format.toLowerCase();
    if (!AUDIO_FORMATS[outputFormat]) {
      return res.status(400).json({
        error: `Invalid format. Supported formats: ${Object.keys(AUDIO_FORMATS).join(', ')}`
      });
    }

    // Create cache key from request parameters (including format)
    const crypto = require('crypto');
    const cacheKey = crypto.createHash('md5')
      .update(`${text}_${voice_id}_${stability}_${similarity_boost}_${style}_${outputFormat}`)
      .digest('hex');
    const cachePath = path.join(AUDIO_CACHE_DIR, `${cacheKey}.${outputFormat}`);

    // Check cache first - INDEPENDENCE FROM ELEVENLABS
    if (use_cache && fs.existsSync(cachePath)) {
      console.log(`Cache hit for ${cacheKey} - serving ${outputFormat} from local storage`);
      const cachedAudio = fs.readFileSync(cachePath);
      res.set({
        'Content-Type': AUDIO_FORMATS[outputFormat].contentType,
        'Content-Disposition': `attachment; filename="voiceover.${outputFormat}"`,
        'X-Cache': 'HIT',
        'X-Cache-Key': cacheKey,
        'X-Format': outputFormat
      });
      return res.send(cachedAudio);
    }

    // Cache miss - call ElevenLabs API (always returns MP3)
    console.log(`Cache miss - calling ElevenLabs API`);
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

    let audioBuffer = Buffer.from(response.data);

    // Convert format if needed (ElevenLabs returns MP3)
    if (outputFormat !== 'mp3') {
      console.log(`Converting audio from mp3 to ${outputFormat}...`);
      audioBuffer = await convertAudioFormat(audioBuffer, 'mp3', outputFormat);
    }

    // Cache the audio for future use - BUILD THE EMPIRE
    if (use_cache) {
      fs.writeFileSync(cachePath, audioBuffer);
      console.log(`Cached ${outputFormat} audio: ${cachePath}`);
    }

    res.set({
      'Content-Type': AUDIO_FORMATS[outputFormat].contentType,
      'Content-Disposition': `attachment; filename="voiceover.${outputFormat}"`,
      'X-Cache': 'MISS',
      'X-Cache-Key': cacheKey,
      'X-Format': outputFormat
    });
    res.send(audioBuffer);
  } catch (error) {
    console.error('Error generating speech:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to generate speech' });
  }
});

// OPEN SOURCE TTS - Coqui XTTS v2 via Replicate (100% FREE & LEGAL + MULTI-FORMAT)
app.post('/api/text-to-speech/opensource', async (req, res) => {
  try {
    const {
      text,
      language = 'en',
      speaker_url = null,
      use_cache = true,
      format = 'wav' // NEW: Support mp3, wav, ogg, flac, m4a
    } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    if (!replicate) {
      return res.status(503).json({
        error: 'Open source TTS not configured. Add REPLICATE_API_TOKEN to .env',
        provider: 'replicate/coqui-xtts-v2'
      });
    }

    // Validate format
    const outputFormat = format.toLowerCase();
    if (!AUDIO_FORMATS[outputFormat]) {
      return res.status(400).json({
        error: `Invalid format. Supported formats: ${Object.keys(AUDIO_FORMATS).join(', ')}`
      });
    }

    // Create cache key (including format)
    const crypto = require('crypto');
    const cacheKey = crypto.createHash('md5')
      .update(`opensource_${text}_${language}_${speaker_url || 'default'}_${outputFormat}`)
      .digest('hex');
    const cachePath = path.join(AUDIO_CACHE_DIR, `${cacheKey}.${outputFormat}`);

    // Check cache first
    if (use_cache && fs.existsSync(cachePath)) {
      console.log(`Open source TTS cache hit: ${cacheKey} (${outputFormat})`);
      const cachedAudio = fs.readFileSync(cachePath);
      res.set({
        'Content-Type': AUDIO_FORMATS[outputFormat].contentType,
        'Content-Disposition': `attachment; filename="voiceover_opensource.${outputFormat}"`,
        'X-Cache': 'HIT',
        'X-Provider': 'coqui-xtts-v2',
        'X-Cache-Key': cacheKey,
        'X-Format': outputFormat
      });
      return res.send(cachedAudio);
    }

    console.log('Calling Coqui XTTS v2 via Replicate...');

    // Call Replicate API for Coqui XTTS v2 (returns WAV)
    const output = await replicate.run(
      "lucataco/xtts-v2:684bc3855b37866c0c65add2ff39c78f3dea3f4ff103a436465326e0f438d55e",
      {
        input: {
          text: text,
          language: language,
          speaker: speaker_url || "https://replicate.delivery/pbxt/Jt5YHPJqKFgYBjpm2tQlVdCgwvHChNpzFJXdHVL9H6yqVWfa/female.wav"
        }
      }
    );

    // Download the audio from Replicate's URL
    const audioResponse = await axios.get(output, { responseType: 'arraybuffer' });
    let audioBuffer = Buffer.from(audioResponse.data);

    // Convert format if needed (Coqui returns WAV)
    if (outputFormat !== 'wav') {
      console.log(`Converting audio from wav to ${outputFormat}...`);
      audioBuffer = await convertAudioFormat(audioBuffer, 'wav', outputFormat);
    }

    // Cache it
    if (use_cache) {
      fs.writeFileSync(cachePath, audioBuffer);
      console.log(`Cached opensource ${outputFormat} audio: ${cachePath}`);
    }

    res.set({
      'Content-Type': AUDIO_FORMATS[outputFormat].contentType,
      'Content-Disposition': `attachment; filename="voiceover_opensource.${outputFormat}"`,
      'X-Cache': 'MISS',
      'X-Provider': 'coqui-xtts-v2',
      'X-Cache-Key': cacheKey,
      'X-Format': outputFormat
    });
    res.send(audioBuffer);

  } catch (error) {
    console.error('Error with open source TTS:', error);
    res.status(500).json({
      error: 'Failed to generate speech with open source TTS',
      details: error.message,
      provider: 'coqui-xtts-v2'
    });
  }
});

// Get available audio formats
app.get('/api/formats', (req, res) => {
  res.json({
    formats: Object.keys(AUDIO_FORMATS).map(format => ({
      format: format,
      contentType: AUDIO_FORMATS[format].contentType,
      codec: AUDIO_FORMATS[format].codec,
      extension: format
    })),
    message: 'All TTS endpoints support these formats via the "format" parameter',
    example: {
      request: {
        text: 'Hello world',
        voice_id: 'voice_id_here',
        format: 'flac'
      }
    }
  });
});

// ANALYTICS TRACKING - In-memory storage (in production, use database)
const analytics = {
  total_requests: 0,
  cache_hits: 0,
  cache_misses: 0,
  providers: {
    elevenlabs: 0,
    'coqui-xtts-v2': 0
  },
  formats: {
    mp3: 0,
    wav: 0,
    ogg: 0,
    flac: 0,
    m4a: 0
  },
  emotions: {},
  total_characters: 0,
  total_audio_seconds: 0,
  batch_requests: 0,
  conversation_requests: 0,
  smart_routing_requests: 0,
  voices_cloned: 0,
  started_at: new Date().toISOString()
};

function trackAnalytics(data) {
  analytics.total_requests++;

  if (data.cache_hit) {
    analytics.cache_hits++;
  } else {
    analytics.cache_misses++;
  }

  if (data.provider) {
    analytics.providers[data.provider] = (analytics.providers[data.provider] || 0) + 1;
  }

  if (data.format) {
    analytics.formats[data.format] = (analytics.formats[data.format] || 0) + 1;
  }

  if (data.emotion) {
    analytics.emotions[data.emotion] = (analytics.emotions[data.emotion] || 0) + 1;
  }

  if (data.text_length) {
    analytics.total_characters += data.text_length;
  }

  if (data.batch) {
    analytics.batch_requests++;
  }

  if (data.conversation) {
    analytics.conversation_requests++;
  }

  if (data.smart_routing) {
    analytics.smart_routing_requests++;
  }

  if (data.voice_cloned) {
    analytics.voices_cloned++;
  }
}

// BATCH PROCESSING SYSTEM - Process multiple texts at once
const batchJobs = new Map(); // In-memory storage (in production, use Redis or database)

app.post('/api/batch/text-to-speech', async (req, res) => {
  try {
    const {
      items, // Array of {text, voice_id, stability, similarity_boost, style, format, provider}
      batch_name = 'Batch TTS',
      parallel = true, // Process in parallel or sequential
      provider = 'elevenlabs' // 'elevenlabs' or 'opensource'
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: 'Items array required with at least one item',
        example: {
          items: [
            { text: 'First text', voice_id: 'voice_1', format: 'mp3' },
            { text: 'Second text', voice_id: 'voice_2', format: 'wav' }
          ]
        }
      });
    }

    if (items.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 items per batch' });
    }

    // Create batch job
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const batchJob = {
      id: batchId,
      name: batch_name,
      total: items.length,
      completed: 0,
      failed: 0,
      status: 'processing',
      results: [],
      errors: [],
      created_at: new Date().toISOString(),
      provider: provider
    };

    batchJobs.set(batchId, batchJob);

    // Process batch (don't await - run in background)
    processBatch(batchId, items, parallel, provider).catch(err => {
      console.error('Batch processing error:', err);
      batchJob.status = 'failed';
      batchJob.error = err.message;
    });

    // Return immediately with batch ID
    res.json({
      success: true,
      batch_id: batchId,
      message: `Batch job created with ${items.length} items`,
      status_url: `/api/batch/${batchId}`,
      total_items: items.length
    });

  } catch (error) {
    console.error('Error creating batch job:', error);
    res.status(500).json({ error: 'Failed to create batch job' });
  }
});

// Process batch items
async function processBatch(batchId, items, parallel, provider) {
  const batchJob = batchJobs.get(batchId);
  if (!batchJob) return;

  const crypto = require('crypto');

  if (parallel) {
    // Process all items in parallel
    await Promise.allSettled(items.map(async (item, index) => {
      try {
        const result = await processBatchItem(item, index, provider);
        batchJob.results.push(result);
        batchJob.completed++;
      } catch (error) {
        console.error(`Batch item ${index} failed:`, error.message);
        batchJob.errors.push({
          index: index,
          text: item.text?.substring(0, 50) + '...',
          error: error.message
        });
        batchJob.failed++;
      }
    }));
  } else {
    // Process sequentially
    for (let i = 0; i < items.length; i++) {
      try {
        const result = await processBatchItem(items[i], i, provider);
        batchJob.results.push(result);
        batchJob.completed++;
      } catch (error) {
        console.error(`Batch item ${i} failed:`, error.message);
        batchJob.errors.push({
          index: i,
          text: items[i].text?.substring(0, 50) + '...',
          error: error.message
        });
        batchJob.failed++;
      }
    }
  }

  batchJob.status = batchJob.failed === 0 ? 'completed' : 'completed_with_errors';
  batchJob.completed_at = new Date().toISOString();
}

// Process a single batch item
async function processBatchItem(item, index, provider) {
  const {
    text,
    voice_id,
    stability = 0.5,
    similarity_boost = 0.85,
    style = 0.3,
    format = 'mp3',
    language = 'en',
    speaker_url = null
  } = item;

  const crypto = require('crypto');
  const outputFormat = format.toLowerCase();

  if (provider === 'opensource') {
    // Open source TTS
    const cacheKey = crypto.createHash('md5')
      .update(`opensource_${text}_${language}_${speaker_url || 'default'}_${outputFormat}`)
      .digest('hex');
    const cachePath = path.join(AUDIO_CACHE_DIR, `${cacheKey}.${outputFormat}`);

    // Check cache
    if (fs.existsSync(cachePath)) {
      return {
        index: index,
        text_preview: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
        cache_key: cacheKey,
        format: outputFormat,
        cached: true,
        provider: 'coqui-xtts-v2'
      };
    }

    // Generate with Coqui
    const output = await replicate.run(
      "lucataco/xtts-v2:684bc3855b37866c0c65add2ff39c78f3dea3f4ff103a436465326e0f438d55e",
      {
        input: {
          text: text,
          language: language,
          speaker: speaker_url || "https://replicate.delivery/pbxt/Jt5YHPJqKFgYBjpm2tQlVdCgwvHChNpzFJXdHVL9H6yqVWfa/female.wav"
        }
      }
    );

    const audioResponse = await axios.get(output, { responseType: 'arraybuffer' });
    let audioBuffer = Buffer.from(audioResponse.data);

    if (outputFormat !== 'wav') {
      audioBuffer = await convertAudioFormat(audioBuffer, 'wav', outputFormat);
    }

    fs.writeFileSync(cachePath, audioBuffer);

    return {
      index: index,
      text_preview: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
      cache_key: cacheKey,
      format: outputFormat,
      cached: false,
      provider: 'coqui-xtts-v2'
    };

  } else {
    // ElevenLabs TTS
    const cacheKey = crypto.createHash('md5')
      .update(`${text}_${voice_id}_${stability}_${similarity_boost}_${style}_${outputFormat}`)
      .digest('hex');
    const cachePath = path.join(AUDIO_CACHE_DIR, `${cacheKey}.${outputFormat}`);

    // Check cache
    if (fs.existsSync(cachePath)) {
      return {
        index: index,
        text_preview: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
        cache_key: cacheKey,
        format: outputFormat,
        cached: true,
        provider: 'elevenlabs'
      };
    }

    // Generate with ElevenLabs
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

    let audioBuffer = Buffer.from(response.data);

    if (outputFormat !== 'mp3') {
      audioBuffer = await convertAudioFormat(audioBuffer, 'mp3', outputFormat);
    }

    fs.writeFileSync(cachePath, audioBuffer);

    return {
      index: index,
      text_preview: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
      cache_key: cacheKey,
      format: outputFormat,
      cached: false,
      provider: 'elevenlabs'
    };
  }
}

// Get batch job status
app.get('/api/batch/:batch_id', (req, res) => {
  const { batch_id } = req.params;
  const batchJob = batchJobs.get(batch_id);

  if (!batchJob) {
    return res.status(404).json({ error: 'Batch job not found' });
  }

  res.json({
    ...batchJob,
    progress: Math.round((batchJob.completed + batchJob.failed) / batchJob.total * 100)
  });
});

// Download batch item
app.get('/api/batch/:batch_id/download/:cache_key', (req, res) => {
  const { batch_id, cache_key } = req.params;
  const batchJob = batchJobs.get(batch_id);

  if (!batchJob) {
    return res.status(404).json({ error: 'Batch job not found' });
  }

  const result = batchJob.results.find(r => r.cache_key === cache_key);
  if (!result) {
    return res.status(404).json({ error: 'Item not found in batch' });
  }

  const cachePath = path.join(AUDIO_CACHE_DIR, `${cache_key}.${result.format}`);
  if (!fs.existsSync(cachePath)) {
    return res.status(404).json({ error: 'Audio file not found' });
  }

  const audioBuffer = fs.readFileSync(cachePath);
  res.set({
    'Content-Type': AUDIO_FORMATS[result.format].contentType,
    'Content-Disposition': `attachment; filename="batch_${batch_id}_${result.index}.${result.format}"`
  });
  res.send(audioBuffer);
});

// Download all batch items as individual files (returns JSON with download links)
app.get('/api/batch/:batch_id/download-all', (req, res) => {
  const { batch_id } = req.params;
  const batchJob = batchJobs.get(batch_id);

  if (!batchJob) {
    return res.status(404).json({ error: 'Batch job not found' });
  }

  if (batchJob.status === 'processing') {
    return res.status(400).json({ error: 'Batch still processing. Wait for completion.' });
  }

  const downloadLinks = batchJob.results.map(result => ({
    index: result.index,
    text_preview: result.text_preview,
    download_url: `/api/batch/${batch_id}/download/${result.cache_key}`,
    format: result.format,
    cached: result.cached,
    provider: result.provider
  }));

  res.json({
    batch_id: batch_id,
    batch_name: batchJob.name,
    total: batchJob.total,
    completed: batchJob.completed,
    failed: batchJob.failed,
    downloads: downloadLinks,
    errors: batchJob.errors
  });
});

// SMART PROVIDER ROUTING - Use open-source first, ElevenLabs as fallback
app.post('/api/text-to-speech/smart', async (req, res) => {
  try {
    const {
      text,
      voice_id = null,
      speaker_url = null,
      language = 'en',
      stability = 0.5,
      similarity_boost = 0.85,
      style = 0.3,
      format = 'mp3',
      use_cache = true,
      strategy = 'cost' // 'cost' (opensource first), 'quality' (elevenlabs first), 'balanced'
    } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const crypto = require('crypto');
    const outputFormat = format.toLowerCase();

    if (!AUDIO_FORMATS[outputFormat]) {
      return res.status(400).json({
        error: `Invalid format. Supported formats: ${Object.keys(AUDIO_FORMATS).join(', ')}`
      });
    }

    let provider = 'opensource'; // Default to open-source
    let audioBuffer;
    let cacheKey;
    let cachePath;
    let cacheHit = false;

    // STRATEGY 1: Cost-first (default) - Try open-source, fallback to ElevenLabs
    if (strategy === 'cost') {
      if (replicate) {
        try {
          // Try open-source first
          cacheKey = crypto.createHash('md5')
            .update(`opensource_${text}_${language}_${speaker_url || 'default'}_${outputFormat}`)
            .digest('hex');
          cachePath = path.join(AUDIO_CACHE_DIR, `${cacheKey}.${outputFormat}`);

          // Check cache
          if (use_cache && fs.existsSync(cachePath)) {
            audioBuffer = fs.readFileSync(cachePath);
            cacheHit = true;
            provider = 'coqui-xtts-v2';
          } else {
            console.log('Smart routing: Trying open-source TTS first...');
            const output = await replicate.run(
              "lucataco/xtts-v2:684bc3855b37866c0c65add2ff39c78f3dea3f4ff103a436465326e0f438d55e",
              {
                input: {
                  text: text,
                  language: language,
                  speaker: speaker_url || "https://replicate.delivery/pbxt/Jt5YHPJqKFgYBjpm2tQlVdCgwvHChNpzFJXdHVL9H6yqVWfa/female.wav"
                }
              }
            );

            const audioResponse = await axios.get(output, { responseType: 'arraybuffer' });
            audioBuffer = Buffer.from(audioResponse.data);

            if (outputFormat !== 'wav') {
              audioBuffer = await convertAudioFormat(audioBuffer, 'wav', outputFormat);
            }

            if (use_cache) {
              fs.writeFileSync(cachePath, audioBuffer);
            }

            provider = 'coqui-xtts-v2';
          }
        } catch (opensourceError) {
          console.error('Open-source TTS failed, falling back to ElevenLabs:', opensourceError.message);
          // Fallback to ElevenLabs
          if (!voice_id) {
            throw new Error('voice_id required for ElevenLabs fallback');
          }
          provider = 'elevenlabs';
          ({ audioBuffer, cacheKey, cachePath, cacheHit } = await generateWithElevenLabs(
            text, voice_id, stability, similarity_boost, style, outputFormat, use_cache
          ));
        }
      } else {
        // No Replicate configured, use ElevenLabs
        if (!voice_id) {
          return res.status(400).json({
            error: 'voice_id required when Replicate is not configured'
          });
        }
        console.log('Smart routing: Replicate not configured, using ElevenLabs...');
        provider = 'elevenlabs';
        ({ audioBuffer, cacheKey, cachePath, cacheHit } = await generateWithElevenLabs(
          text, voice_id, stability, similarity_boost, style, outputFormat, use_cache
        ));
      }
    }
    // STRATEGY 2: Quality-first - Use ElevenLabs, fallback to open-source
    else if (strategy === 'quality') {
      if (voice_id && ELEVENLABS_API_KEY) {
        try {
          console.log('Smart routing: Using ElevenLabs for quality...');
          provider = 'elevenlabs';
          ({ audioBuffer, cacheKey, cachePath, cacheHit } = await generateWithElevenLabs(
            text, voice_id, stability, similarity_boost, style, outputFormat, use_cache
          ));
        } catch (elevenlabsError) {
          console.error('ElevenLabs failed, falling back to open-source:', elevenlabsError.message);
          if (replicate) {
            provider = 'coqui-xtts-v2';
            ({ audioBuffer, cacheKey, cachePath, cacheHit } = await generateWithOpensource(
              text, language, speaker_url, outputFormat, use_cache
            ));
          } else {
            throw elevenlabsError;
          }
        }
      } else {
        // No ElevenLabs configured, use open-source
        if (!replicate) {
          return res.status(503).json({
            error: 'Neither ElevenLabs nor Replicate is configured'
          });
        }
        console.log('Smart routing: ElevenLabs not configured, using open-source...');
        provider = 'coqui-xtts-v2';
        ({ audioBuffer, cacheKey, cachePath, cacheHit } = await generateWithOpensource(
          text, language, speaker_url, outputFormat, use_cache
        ));
      }
    }
    // STRATEGY 3: Balanced - Use whichever is available, prefer quality if both work
    else if (strategy === 'balanced') {
      const bothAvailable = replicate && voice_id && ELEVENLABS_API_KEY;

      if (bothAvailable) {
        // Use ElevenLabs for quality
        console.log('Smart routing (balanced): Both available, using ElevenLabs for quality...');
        provider = 'elevenlabs';
        ({ audioBuffer, cacheKey, cachePath, cacheHit } = await generateWithElevenLabs(
          text, voice_id, stability, similarity_boost, style, outputFormat, use_cache
        ));
      } else if (replicate) {
        console.log('Smart routing (balanced): Using open-source...');
        provider = 'coqui-xtts-v2';
        ({ audioBuffer, cacheKey, cachePath, cacheHit } = await generateWithOpensource(
          text, language, speaker_url, outputFormat, use_cache
        ));
      } else if (voice_id && ELEVENLABS_API_KEY) {
        console.log('Smart routing (balanced): Using ElevenLabs...');
        provider = 'elevenlabs';
        ({ audioBuffer, cacheKey, cachePath, cacheHit } = await generateWithElevenLabs(
          text, voice_id, stability, similarity_boost, style, outputFormat, use_cache
        ));
      } else {
        return res.status(503).json({
          error: 'No TTS provider configured. Configure either REPLICATE_API_TOKEN or ELEVENLABS_API_KEY.'
        });
      }
    }

    res.set({
      'Content-Type': AUDIO_FORMATS[outputFormat].contentType,
      'Content-Disposition': `attachment; filename="voiceover_smart.${outputFormat}"`,
      'X-Cache': cacheHit ? 'HIT' : 'MISS',
      'X-Provider': provider,
      'X-Strategy': strategy,
      'X-Cache-Key': cacheKey,
      'X-Format': outputFormat
    });
    res.send(audioBuffer);

  } catch (error) {
    console.error('Smart TTS error:', error);
    res.status(500).json({
      error: 'Failed to generate speech with smart routing',
      details: error.message
    });
  }
});

// Helper: Generate with ElevenLabs
async function generateWithElevenLabs(text, voice_id, stability, similarity_boost, style, outputFormat, use_cache) {
  const crypto = require('crypto');
  const cacheKey = crypto.createHash('md5')
    .update(`${text}_${voice_id}_${stability}_${similarity_boost}_${style}_${outputFormat}`)
    .digest('hex');
  const cachePath = path.join(AUDIO_CACHE_DIR, `${cacheKey}.${outputFormat}`);

  // Check cache
  if (use_cache && fs.existsSync(cachePath)) {
    return {
      audioBuffer: fs.readFileSync(cachePath),
      cacheKey,
      cachePath,
      cacheHit: true
    };
  }

  // Generate with ElevenLabs
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

  let audioBuffer = Buffer.from(response.data);

  if (outputFormat !== 'mp3') {
    audioBuffer = await convertAudioFormat(audioBuffer, 'mp3', outputFormat);
  }

  if (use_cache) {
    fs.writeFileSync(cachePath, audioBuffer);
  }

  return {
    audioBuffer,
    cacheKey,
    cachePath,
    cacheHit: false
  };
}

// Helper: Generate with Open Source
async function generateWithOpensource(text, language, speaker_url, outputFormat, use_cache) {
  const crypto = require('crypto');
  const cacheKey = crypto.createHash('md5')
    .update(`opensource_${text}_${language}_${speaker_url || 'default'}_${outputFormat}`)
    .digest('hex');
  const cachePath = path.join(AUDIO_CACHE_DIR, `${cacheKey}.${outputFormat}`);

  // Check cache
  if (use_cache && fs.existsSync(cachePath)) {
    return {
      audioBuffer: fs.readFileSync(cachePath),
      cacheKey,
      cachePath,
      cacheHit: true
    };
  }

  // Generate with Coqui
  const output = await replicate.run(
    "lucataco/xtts-v2:684bc3855b37866c0c65add2ff39c78f3dea3f4ff103a436465326e0f438d55e",
    {
      input: {
        text: text,
        language: language,
        speaker: speaker_url || "https://replicate.delivery/pbxt/Jt5YHPJqKFgYBjpm2tQlVdCgwvHChNpzFJXdHVL9H6yqVWfa/female.wav"
      }
    }
  );

  const audioResponse = await axios.get(output, { responseType: 'arraybuffer' });
  let audioBuffer = Buffer.from(audioResponse.data);

  if (outputFormat !== 'wav') {
    audioBuffer = await convertAudioFormat(audioBuffer, 'wav', outputFormat);
  }

  if (use_cache) {
    fs.writeFileSync(cachePath, audioBuffer);
  }

  return {
    audioBuffer,
    cacheKey,
    cachePath,
    cacheHit: false
  };
}

// Get open source voices library
app.get('/api/voices/opensource', (req, res) => {
  try {
    const voicesData = JSON.parse(fs.readFileSync('./opensource-voices.json', 'utf8'));
    res.json({
      ...voicesData,
      total_count: voicesData.voices.length,
      message: '100% free, open-source voices. Add your own by providing audio samples!'
    });
  } catch (error) {
    console.error('Error loading opensource voices:', error);
    res.status(500).json({ error: 'Failed to load opensource voices' });
  }
});

// Voice clone with open source - Upload audio and clone instantly
app.post('/api/clone-voice/opensource', upload.array('files', 5), async (req, res) => {
  try {
    const { name, description, language = 'en' } = req.body;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'At least one audio file required for voice cloning' });
    }

    if (!replicate) {
      return res.status(503).json({
        error: 'Open source voice cloning not configured. Add REPLICATE_API_TOKEN to .env'
      });
    }

    // For now, just store the voice sample locally
    // In production, you'd upload to a CDN/storage service
    const voiceId = `opensource_${Date.now()}`;
    const voiceStoragePath = path.join(VOICES_STORAGE_DIR, voiceId);

    if (!fs.existsSync(voiceStoragePath)) {
      fs.mkdirSync(voiceStoragePath, { recursive: true });
    }

    // Save first audio file as the speaker sample
    const speakerSamplePath = path.join(voiceStoragePath, 'speaker_sample.wav');
    fs.copyFileSync(files[0].path, speakerSamplePath);

    // Save to database
    const db = loadVoicesDB();
    const voiceData = {
      id: voiceId,
      name: name || `Custom Voice ${db.voices.length + 1}`,
      description: description || 'Custom cloned voice',
      language: language,
      speaker_url: `file://${speakerSamplePath}`, // In production, use public URL
      provider: 'coqui-xtts-v2',
      source: 'cloned_opensource',
      free: true,
      created_at: new Date().toISOString()
    };

    db.voices.push(voiceData);
    saveVoicesDB(db);

    // Clean up temp files
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
      message: 'Voice cloned with open source TTS! 100% free, no vendor lock-in.',
      provider: 'coqui-xtts-v2',
      note: 'To use this voice, upload the speaker sample to a public URL and update the voice record.'
    });

  } catch (error) {
    console.error('Error cloning opensource voice:', error);
    res.status(500).json({
      error: 'Failed to clone voice with open source TTS',
      details: error.message
    });
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

// AI VOICE CONVERSATIONS - Multi-speaker podcast-style conversations
app.post('/api/conversation', async (req, res) => {
  try {
    const {
      messages, // Array of {text, voice_id, speaker_name, speaker_url, language, provider}
      pause_duration = 0.5, // Seconds of pause between speakers
      format = 'mp3',
      use_cache = true,
      provider = 'auto' // 'elevenlabs', 'opensource', or 'auto'
    } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: 'Messages array required',
        example: {
          messages: [
            { text: 'Hello, welcome to the show!', voice_id: 'voice_1', speaker_name: 'Host' },
            { text: 'Thanks for having me!', voice_id: 'voice_2', speaker_name: 'Guest' }
          ],
          pause_duration: 0.5,
          format: 'mp3'
        }
      });
    }

    if (messages.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 messages per conversation' });
    }

    const outputFormat = format.toLowerCase();
    if (!AUDIO_FORMATS[outputFormat]) {
      return res.status(400).json({
        error: `Invalid format. Supported formats: ${Object.keys(AUDIO_FORMATS).join(', ')}`
      });
    }

    console.log(`Generating conversation with ${messages.length} messages...`);

    const tempDir = process.env.VERCEL ? '/tmp' : './temp-conversations';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const audioFiles = [];

    // Generate audio for each message
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const msgProvider = msg.provider || provider;

      console.log(`Generating message ${i + 1}/${messages.length} (${msg.speaker_name || 'Speaker'})...`);

      let audioBuffer;

      // Auto-detect provider or use specified
      if (msgProvider === 'auto') {
        // Try opensource first for cost savings
        if (replicate && msg.speaker_url) {
          try {
            ({ audioBuffer } = await generateWithOpensource(
              msg.text,
              msg.language || 'en',
              msg.speaker_url,
              'mp3', // Generate as MP3 for consistency
              use_cache
            ));
          } catch (err) {
            console.warn('Open-source TTS failed, falling back to ElevenLabs:', err.message);
            if (msg.voice_id) {
              ({ audioBuffer } = await generateWithElevenLabs(
                msg.text,
                msg.voice_id,
                msg.stability || 0.5,
                msg.similarity_boost || 0.85,
                msg.style || 0.3,
                'mp3',
                use_cache
              ));
            } else {
              throw new Error('No voice_id provided for ElevenLabs fallback');
            }
          }
        } else if (msg.voice_id) {
          ({ audioBuffer } = await generateWithElevenLabs(
            msg.text,
            msg.voice_id,
            msg.stability || 0.5,
            msg.similarity_boost || 0.85,
            msg.style || 0.3,
            'mp3',
            use_cache
          ));
        } else {
          throw new Error('Either speaker_url or voice_id required for each message');
        }
      } else if (msgProvider === 'opensource') {
        if (!msg.speaker_url) {
          throw new Error('speaker_url required for open-source provider');
        }
        ({ audioBuffer } = await generateWithOpensource(
          msg.text,
          msg.language || 'en',
          msg.speaker_url,
          'mp3',
          use_cache
        ));
      } else {
        // Use ElevenLabs
        if (!msg.voice_id) {
          throw new Error('voice_id required for ElevenLabs provider');
        }
        ({ audioBuffer } = await generateWithElevenLabs(
          msg.text,
          msg.voice_id,
          msg.stability || 0.5,
          msg.similarity_boost || 0.85,
          msg.style || 0.3,
          'mp3',
          use_cache
        ));
      }

      // Save audio to temp file
      const audioPath = path.join(tempDir, `${conversationId}_${i}.mp3`);
      fs.writeFileSync(audioPath, audioBuffer);
      audioFiles.push(audioPath);
    }

    console.log('All messages generated. Merging audio files...');

    // Create silence file for pauses
    const silencePath = path.join(tempDir, `${conversationId}_silence.mp3`);
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input('anullsrc=r=44100:cl=stereo')
        .inputFormat('lavfi')
        .duration(pause_duration)
        .audioCodec('libmp3lame')
        .on('end', resolve)
        .on('error', reject)
        .save(silencePath);
    });

    // Create concat file list
    const concatListPath = path.join(tempDir, `${conversationId}_concat.txt`);
    let concatContent = '';
    audioFiles.forEach((file, index) => {
      concatContent += `file '${file}'\n`;
      if (index < audioFiles.length - 1) {
        // Add pause between messages (but not after last message)
        concatContent += `file '${silencePath}'\n`;
      }
    });
    fs.writeFileSync(concatListPath, concatContent);

    // Merge all audio files with ffmpeg
    const outputPath = path.join(tempDir, `${conversationId}_final.mp3`);
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(concatListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .audioCodec('libmp3lame')
        .on('end', resolve)
        .on('error', reject)
        .save(outputPath);
    });

    // Read the merged audio
    let mergedAudio = fs.readFileSync(outputPath);

    // Convert to requested format if needed
    if (outputFormat !== 'mp3') {
      console.log(`Converting conversation to ${outputFormat}...`);
      mergedAudio = await convertAudioFormat(mergedAudio, 'mp3', outputFormat);
    }

    // Clean up temp files
    audioFiles.forEach(file => {
      try { fs.unlinkSync(file); } catch (e) {}
    });
    try { fs.unlinkSync(silencePath); } catch (e) {}
    try { fs.unlinkSync(concatListPath); } catch (e) {}
    try { fs.unlinkSync(outputPath); } catch (e) {}

    console.log(`Conversation generated successfully (${messages.length} speakers, ${outputFormat})`);

    res.set({
      'Content-Type': AUDIO_FORMATS[outputFormat].contentType,
      'Content-Disposition': `attachment; filename="conversation.${outputFormat}"`,
      'X-Message-Count': messages.length,
      'X-Pause-Duration': pause_duration,
      'X-Format': outputFormat
    });
    res.send(mergedAudio);

  } catch (error) {
    console.error('Error generating conversation:', error);
    res.status(500).json({
      error: 'Failed to generate conversation',
      details: error.message
    });
  }
});

// EMOTION & STYLE CONTROLS - Comprehensive voice presets
app.get('/api/presets', (req, res) => {
  const presets = {
    // Basic Emotions
    'neutral': {
      stability: 0.5,
      similarity_boost: 0.85,
      style: 0.3,
      description: 'Balanced and natural',
      category: 'emotion',
      use_cases: ['General narration', 'Balanced content']
    },
    'happy': {
      stability: 0.4,
      similarity_boost: 0.8,
      style: 0.7,
      description: 'Cheerful and upbeat',
      category: 'emotion',
      use_cases: ['Positive announcements', 'Celebrations', 'Marketing']
    },
    'sad': {
      stability: 0.6,
      similarity_boost: 0.85,
      style: 0.4,
      description: 'Melancholic and somber',
      category: 'emotion',
      use_cases: ['Emotional stories', 'Sympathetic content']
    },
    'angry': {
      stability: 0.3,
      similarity_boost: 0.7,
      style: 0.9,
      description: 'Intense and forceful',
      category: 'emotion',
      use_cases: ['Conflict scenes', 'Confrontational dialogue']
    },
    'excited': {
      stability: 0.3,
      similarity_boost: 0.75,
      style: 0.8,
      description: 'High energy and enthusiastic',
      category: 'emotion',
      use_cases: ['Sports commentary', 'Hype content', 'Promotions']
    },
    'fearful': {
      stability: 0.4,
      similarity_boost: 0.75,
      style: 0.7,
      description: 'Anxious and tense',
      category: 'emotion',
      use_cases: ['Thriller narration', 'Suspenseful content']
    },
    'surprised': {
      stability: 0.35,
      similarity_boost: 0.8,
      style: 0.75,
      description: 'Shocked and amazed',
      category: 'emotion',
      use_cases: ['Plot twists', 'Reveal moments']
    },
    'disgusted': {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.6,
      description: 'Repulsed and disdainful',
      category: 'emotion',
      use_cases: ['Negative reviews', 'Critical commentary']
    },

    // Speaking Styles
    'calm': {
      stability: 0.7,
      similarity_boost: 0.85,
      style: 0.2,
      description: 'Relaxed and soothing',
      category: 'style',
      use_cases: ['Meditation', 'ASMR', 'Bedtime stories']
    },
    'serious': {
      stability: 0.8,
      similarity_boost: 0.9,
      style: 0.1,
      description: 'Professional and formal',
      category: 'style',
      use_cases: ['News', 'Corporate content', 'Documentation']
    },
    'dramatic': {
      stability: 0.4,
      similarity_boost: 0.8,
      style: 0.9,
      description: 'Theatrical and expressive',
      category: 'style',
      use_cases: ['Movie trailers', 'Dramatic readings']
    },
    'whisper': {
      stability: 0.5,
      similarity_boost: 0.95,
      style: 0.5,
      description: 'Soft and intimate',
      category: 'style',
      use_cases: ['ASMR', 'Secrets', 'Intimate moments']
    },
    'shouting': {
      stability: 0.2,
      similarity_boost: 0.7,
      style: 0.95,
      description: 'Loud and emphatic',
      category: 'style',
      use_cases: ['Action scenes', 'Urgent announcements']
    },
    'conversational': {
      stability: 0.5,
      similarity_boost: 0.85,
      style: 0.5,
      description: 'Natural and casual',
      category: 'style',
      use_cases: ['Podcasts', 'Casual content', 'Vlogs']
    },
    'storytelling': {
      stability: 0.55,
      similarity_boost: 0.82,
      style: 0.65,
      description: 'Engaging narrative voice',
      category: 'style',
      use_cases: ['Audiobooks', 'Story narration']
    },
    'authoritative': {
      stability: 0.75,
      similarity_boost: 0.88,
      style: 0.3,
      description: 'Commanding and confident',
      category: 'style',
      use_cases: ['Leadership content', 'Instructions', 'Tutorials']
    },
    'friendly': {
      stability: 0.45,
      similarity_boost: 0.83,
      style: 0.6,
      description: 'Warm and approachable',
      category: 'style',
      use_cases: ['Customer service', 'Greetings', 'Social content']
    },
    'mysterious': {
      stability: 0.6,
      similarity_boost: 0.8,
      style: 0.7,
      description: 'Enigmatic and intriguing',
      category: 'style',
      use_cases: ['Mystery stories', 'Suspense', 'Teasers']
    },

    // Content-Specific Presets
    'news_anchor': {
      stability: 0.8,
      similarity_boost: 0.9,
      style: 0.2,
      description: 'Clear, professional news delivery',
      category: 'content',
      use_cases: ['News broadcasts', 'Current events']
    },
    'audiobook': {
      stability: 0.6,
      similarity_boost: 0.85,
      style: 0.6,
      description: 'Engaging long-form narration',
      category: 'content',
      use_cases: ['Audiobooks', 'Long-form content']
    },
    'meditation': {
      stability: 0.75,
      similarity_boost: 0.9,
      style: 0.15,
      description: 'Ultra-calm and peaceful',
      category: 'content',
      use_cases: ['Meditation guides', 'Relaxation']
    },
    'commercial': {
      stability: 0.4,
      similarity_boost: 0.8,
      style: 0.75,
      description: 'Persuasive and energetic',
      category: 'content',
      use_cases: ['Advertisements', 'Sales', 'Marketing']
    },
    'podcast_host': {
      stability: 0.5,
      similarity_boost: 0.83,
      style: 0.55,
      description: 'Engaging podcast personality',
      category: 'content',
      use_cases: ['Podcasts', 'Interviews', 'Discussions']
    },
    'documentary': {
      stability: 0.65,
      similarity_boost: 0.87,
      style: 0.4,
      description: 'Informative and authoritative',
      category: 'content',
      use_cases: ['Documentaries', 'Educational content']
    },
    'gaming': {
      stability: 0.35,
      similarity_boost: 0.78,
      style: 0.8,
      description: 'Energetic gaming commentary',
      category: 'content',
      use_cases: ['Gaming videos', 'Live streams']
    },
    'children': {
      stability: 0.4,
      similarity_boost: 0.85,
      style: 0.7,
      description: 'Playful and animated',
      category: 'content',
      use_cases: ['Children\'s content', 'Educational kids']
    }
  };

  res.json({
    presets: presets,
    total_count: Object.keys(presets).length,
    categories: {
      emotion: 'Emotional states and feelings',
      style: 'Speaking styles and delivery methods',
      content: 'Optimized for specific content types'
    },
    usage_note: 'Apply presets to any TTS endpoint by using the preset name or copying the stability/similarity_boost/style values'
  });
});

// Apply emotion/style preset to text
app.post('/api/text-to-speech/with-emotion', async (req, res) => {
  try {
    const {
      text,
      voice_id,
      emotion = 'neutral', // Preset name
      format = 'mp3',
      use_cache = true,
      provider = 'auto'
    } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Load presets
    const presets = {
      'neutral': { stability: 0.5, similarity_boost: 0.85, style: 0.3 },
      'happy': { stability: 0.4, similarity_boost: 0.8, style: 0.7 },
      'sad': { stability: 0.6, similarity_boost: 0.85, style: 0.4 },
      'angry': { stability: 0.3, similarity_boost: 0.7, style: 0.9 },
      'excited': { stability: 0.3, similarity_boost: 0.75, style: 0.8 },
      'calm': { stability: 0.7, similarity_boost: 0.85, style: 0.2 },
      'serious': { stability: 0.8, similarity_boost: 0.9, style: 0.1 },
      'dramatic': { stability: 0.4, similarity_boost: 0.8, style: 0.9 },
      'whisper': { stability: 0.5, similarity_boost: 0.95, style: 0.5 },
      'shouting': { stability: 0.2, similarity_boost: 0.7, style: 0.95 },
      'conversational': { stability: 0.5, similarity_boost: 0.85, style: 0.5 },
      'storytelling': { stability: 0.55, similarity_boost: 0.82, style: 0.65 },
      'authoritative': { stability: 0.75, similarity_boost: 0.88, style: 0.3 },
      'friendly': { stability: 0.45, similarity_boost: 0.83, style: 0.6 },
      'mysterious': { stability: 0.6, similarity_boost: 0.8, style: 0.7 },
      'fearful': { stability: 0.4, similarity_boost: 0.75, style: 0.7 },
      'surprised': { stability: 0.35, similarity_boost: 0.8, style: 0.75 },
      'disgusted': { stability: 0.5, similarity_boost: 0.75, style: 0.6 },
      'news_anchor': { stability: 0.8, similarity_boost: 0.9, style: 0.2 },
      'audiobook': { stability: 0.6, similarity_boost: 0.85, style: 0.6 },
      'meditation': { stability: 0.75, similarity_boost: 0.9, style: 0.15 },
      'commercial': { stability: 0.4, similarity_boost: 0.8, style: 0.75 },
      'podcast_host': { stability: 0.5, similarity_boost: 0.83, style: 0.55 },
      'documentary': { stability: 0.65, similarity_boost: 0.87, style: 0.4 },
      'gaming': { stability: 0.35, similarity_boost: 0.78, style: 0.8 },
      'children': { stability: 0.4, similarity_boost: 0.85, style: 0.7 }
    };

    const preset = presets[emotion];
    if (!preset) {
      return res.status(400).json({
        error: `Invalid emotion preset. Available: ${Object.keys(presets).join(', ')}`
      });
    }

    const outputFormat = format.toLowerCase();
    if (!AUDIO_FORMATS[outputFormat]) {
      return res.status(400).json({
        error: `Invalid format. Supported formats: ${Object.keys(AUDIO_FORMATS).join(', ')}`
      });
    }

    console.log(`Generating speech with ${emotion} emotion...`);

    let audioBuffer, cacheKey, cachePath, cacheHit;

    // Use smart routing with emotion preset
    if (provider === 'auto' || provider === 'elevenlabs') {
      if (!voice_id) {
        return res.status(400).json({ error: 'voice_id required for ElevenLabs' });
      }
      ({ audioBuffer, cacheKey, cachePath, cacheHit } = await generateWithElevenLabs(
        text,
        voice_id,
        preset.stability,
        preset.similarity_boost,
        preset.style,
        outputFormat,
        use_cache
      ));
    } else {
      return res.status(400).json({
        error: 'Emotion presets currently only supported for ElevenLabs provider'
      });
    }

    res.set({
      'Content-Type': AUDIO_FORMATS[outputFormat].contentType,
      'Content-Disposition': `attachment; filename="voiceover_${emotion}.${outputFormat}"`,
      'X-Cache': cacheHit ? 'HIT' : 'MISS',
      'X-Emotion': emotion,
      'X-Stability': preset.stability,
      'X-Similarity-Boost': preset.similarity_boost,
      'X-Style': preset.style,
      'X-Format': outputFormat
    });
    res.send(audioBuffer);

  } catch (error) {
    console.error('Error generating speech with emotion:', error);
    res.status(500).json({
      error: 'Failed to generate speech with emotion',
      details: error.message
    });
  }
});

// ANALYTICS DASHBOARD - Usage statistics and insights
app.get('/api/analytics', (req, res) => {
  const now = new Date();
  const startedAt = new Date(analytics.started_at);
  const uptimeMs = now - startedAt;
  const uptimeHours = uptimeMs / (1000 * 60 * 60);

  const cacheHitRate = analytics.total_requests > 0
    ? ((analytics.cache_hits / analytics.total_requests) * 100).toFixed(2)
    : 0;

  // Calculate cost savings (assuming $0.30 per 1000 chars for ElevenLabs)
  const elevenLabsCost = analytics.providers.elevenlabs * 0.0003; // Rough estimate
  const cacheSavings = analytics.cache_hits * 0.0003; // Saved API calls

  // Top formats
  const sortedFormats = Object.entries(analytics.formats)
    .sort(([,a], [,b]) => b - a)
    .map(([format, count]) => ({ format, count, percentage: ((count / analytics.total_requests) * 100).toFixed(1) }));

  // Top emotions
  const sortedEmotions = Object.entries(analytics.emotions)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([emotion, count]) => ({ emotion, count }));

  res.json({
    overview: {
      total_requests: analytics.total_requests,
      cache_hit_rate: `${cacheHitRate}%`,
      cache_hits: analytics.cache_hits,
      cache_misses: analytics.cache_misses,
      uptime_hours: uptimeHours.toFixed(2),
      started_at: analytics.started_at
    },
    providers: {
      elevenlabs: {
        requests: analytics.providers.elevenlabs,
        percentage: analytics.total_requests > 0
          ? ((analytics.providers.elevenlabs / analytics.total_requests) * 100).toFixed(1)
          : 0,
        estimated_cost: `$${elevenLabsCost.toFixed(4)}`
      },
      opensource: {
        requests: analytics.providers['coqui-xtts-v2'] || 0,
        percentage: analytics.total_requests > 0
          ? (((analytics.providers['coqui-xtts-v2'] || 0) / analytics.total_requests) * 100).toFixed(1)
          : 0,
        estimated_cost: '$0.0000 (Free!)'
      }
    },
    formats: sortedFormats,
    emotions: {
      top_emotions: sortedEmotions,
      total_emotion_requests: Object.values(analytics.emotions).reduce((a, b) => a + b, 0)
    },
    content: {
      total_characters: analytics.total_characters,
      avg_characters_per_request: analytics.total_requests > 0
        ? Math.round(analytics.total_characters / analytics.total_requests)
        : 0
    },
    features: {
      batch_requests: analytics.batch_requests,
      conversation_requests: analytics.conversation_requests,
      smart_routing_requests: analytics.smart_routing_requests,
      voices_cloned: analytics.voices_cloned
    },
    cost_analysis: {
      estimated_total_cost: `$${elevenLabsCost.toFixed(4)}`,
      cache_savings: `$${cacheSavings.toFixed(4)}`,
      savings_percentage: analytics.total_requests > 0
        ? `${((analytics.cache_hits / analytics.total_requests) * 100).toFixed(1)}%`
        : '0%',
      note: 'Cost estimates based on $0.30 per 1000 characters for ElevenLabs'
    },
    insights: [
      cacheHitRate > 50 ? '🎯 Great cache utilization!' : '💡 Consider caching more requests',
      analytics.providers['coqui-xtts-v2'] > analytics.providers.elevenlabs
        ? '💰 Excellent cost optimization with open-source!' : '💡 Try using more open-source TTS to save costs',
      analytics.total_requests > 100 ? '🚀 High usage detected!' : '📈 Building momentum',
      analytics.voices_cloned > 0 ? `🎤 ${analytics.voices_cloned} custom voices created!` : '💡 Try voice cloning for unique sounds'
    ]
  });
});

// Reset analytics (admin only - in production, add authentication)
app.post('/api/analytics/reset', (req, res) => {
  analytics.total_requests = 0;
  analytics.cache_hits = 0;
  analytics.cache_misses = 0;
  analytics.providers = { elevenlabs: 0, 'coqui-xtts-v2': 0 };
  analytics.formats = { mp3: 0, wav: 0, ogg: 0, flac: 0, m4a: 0 };
  analytics.emotions = {};
  analytics.total_characters = 0;
  analytics.total_audio_seconds = 0;
  analytics.batch_requests = 0;
  analytics.conversation_requests = 0;
  analytics.smart_routing_requests = 0;
  analytics.voices_cloned = 0;
  analytics.started_at = new Date().toISOString();

  res.json({
    success: true,
    message: 'Analytics reset successfully'
  });
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

// PODCAST AUTOMATION PLATFORM - Professional podcast production

// Store podcast episodes
const podcastEpisodes = new Map();
const podcastShows = new Map();

// WEBHOOK SYSTEM - Integration with Zapier, Make, n8n, etc.
const webhooks = new Map();
const webhookEvents = new Map(); // Store recent events

// Supported webhook events
const WEBHOOK_EVENTS = {
  'tts.completed': 'Triggered when text-to-speech generation completes',
  'voice.cloned': 'Triggered when a new voice is cloned',
  'batch.completed': 'Triggered when a batch job completes',
  'conversation.created': 'Triggered when a conversation is generated',
  'podcast.episode.created': 'Triggered when a podcast episode is created',
  'cache.hit': 'Triggered on cache hits (optional, high volume)',
  'error.occurred': 'Triggered when an error occurs'
};

// Register webhook
app.post('/api/webhooks/register', (req, res) => {
  const { url, events, secret } = req.body;

  if (!url || !events || !Array.isArray(events)) {
    return res.status(400).json({
      error: 'url and events array required',
      example: {
        url: 'https://your-server.com/webhook',
        events: ['tts.completed', 'voice.cloned'],
        secret: 'optional_secret_for_verification'
      }
    });
  }

  // Validate events
  const invalidEvents = events.filter(e => !WEBHOOK_EVENTS[e]);
  if (invalidEvents.length > 0) {
    return res.status(400).json({
      error: `Invalid events: ${invalidEvents.join(', ')}`,
      supported_events: Object.keys(WEBHOOK_EVENTS)
    });
  }

  const webhookId = `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const webhook = {
    id: webhookId,
    url,
    events,
    secret: secret || null,
    active: true,
    created_at: new Date().toISOString(),
    total_calls: 0,
    last_called: null,
    failures: 0
  };

  webhooks.set(webhookId, webhook);

  res.json({
    success: true,
    webhook_id: webhookId,
    webhook: webhook,
    test_url: `/api/webhooks/${webhookId}/test`
  });
});

// Trigger webhook (internal function)
async function triggerWebhook(eventType, data) {
  const relevantWebhooks = Array.from(webhooks.values()).filter(
    wh => wh.active && wh.events.includes(eventType)
  );

  if (relevantWebhooks.length === 0) return;

  const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const eventData = {
    id: eventId,
    event: eventType,
    timestamp: new Date().toISOString(),
    data: data
  };

  // Store event for history
  webhookEvents.set(eventId, eventData);

  // Trigger all relevant webhooks
  for (const webhook of relevantWebhooks) {
    try {
      const payload = {
        ...eventData,
        webhook_id: webhook.id
      };

      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'AI-VoiceOver-Webhooks/1.0'
      };

      // Add signature if secret provided
      if (webhook.secret) {
        const crypto = require('crypto');
        const signature = crypto
          .createHmac('sha256', webhook.secret)
          .update(JSON.stringify(payload))
          .digest('hex');
        headers['X-Webhook-Signature'] = signature;
      }

      const response = await axios.post(webhook.url, payload, {
        headers,
        timeout: 5000 // 5 second timeout
      });

      webhook.total_calls++;
      webhook.last_called = new Date().toISOString();

      console.log(`Webhook ${webhook.id} triggered successfully for ${eventType}`);

    } catch (error) {
      webhook.failures++;
      console.error(`Webhook ${webhook.id} failed:`, error.message);

      // Disable webhook after 10 consecutive failures
      if (webhook.failures >= 10) {
        webhook.active = false;
        console.warn(`Webhook ${webhook.id} disabled due to failures`);
      }
    }
  }
}

// Test webhook
app.post('/api/webhooks/:webhook_id/test', async (req, res) => {
  const { webhook_id } = req.params;
  const webhook = webhooks.get(webhook_id);

  if (!webhook) {
    return res.status(404).json({ error: 'Webhook not found' });
  }

  const testData = {
    test: true,
    message: 'This is a test webhook event',
    webhook_id: webhook_id,
    timestamp: new Date().toISOString()
  };

  try {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'AI-VoiceOver-Webhooks/1.0'
    };

    if (webhook.secret) {
      const crypto = require('crypto');
      const signature = crypto
        .createHmac('sha256', webhook.secret)
        .update(JSON.stringify(testData))
        .digest('hex');
      headers['X-Webhook-Signature'] = signature;
    }

    const response = await axios.post(webhook.url, testData, {
      headers,
      timeout: 5000
    });

    res.json({
      success: true,
      message: 'Webhook test successful',
      response_status: response.status
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Webhook test failed',
      details: error.message
    });
  }
});

// List all webhooks
app.get('/api/webhooks', (req, res) => {
  const allWebhooks = Array.from(webhooks.values());

  res.json({
    webhooks: allWebhooks,
    total_count: allWebhooks.length,
    active_count: allWebhooks.filter(wh => wh.active).length
  });
});

// Get webhook details
app.get('/api/webhooks/:webhook_id', (req, res) => {
  const { webhook_id } = req.params;
  const webhook = webhooks.get(webhook_id);

  if (!webhook) {
    return res.status(404).json({ error: 'Webhook not found' });
  }

  res.json(webhook);
});

// Update webhook
app.patch('/api/webhooks/:webhook_id', (req, res) => {
  const { webhook_id } = req.params;
  const webhook = webhooks.get(webhook_id);

  if (!webhook) {
    return res.status(404).json({ error: 'Webhook not found' });
  }

  const { url, events, secret, active } = req.body;

  if (url) webhook.url = url;
  if (events) {
    // Validate events
    const invalidEvents = events.filter(e => !WEBHOOK_EVENTS[e]);
    if (invalidEvents.length > 0) {
      return res.status(400).json({
        error: `Invalid events: ${invalidEvents.join(', ')}`,
        supported_events: Object.keys(WEBHOOK_EVENTS)
      });
    }
    webhook.events = events;
  }
  if (secret !== undefined) webhook.secret = secret;
  if (active !== undefined) webhook.active = active;

  res.json({
    success: true,
    webhook: webhook
  });
});

// Delete webhook
app.delete('/api/webhooks/:webhook_id', (req, res) => {
  const { webhook_id } = req.params;

  if (!webhooks.has(webhook_id)) {
    return res.status(404).json({ error: 'Webhook not found' });
  }

  webhooks.delete(webhook_id);

  res.json({
    success: true,
    message: 'Webhook deleted successfully'
  });
});

// Get recent webhook events
app.get('/api/webhooks/events/recent', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const eventType = req.query.event;

  let events = Array.from(webhookEvents.values());

  if (eventType) {
    events = events.filter(e => e.event === eventType);
  }

  events = events
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);

  res.json({
    events: events,
    total_count: events.length,
    available_events: Object.keys(WEBHOOK_EVENTS)
  });
});

// Get supported webhook events
app.get('/api/webhooks/events/supported', (req, res) => {
  res.json({
    events: WEBHOOK_EVENTS,
    total_count: Object.keys(WEBHOOK_EVENTS).length
  });
});

// Create podcast show
app.post('/api/podcast/create-show', async (req, res) => {
  try {
    const {
      title,
      description,
      author,
      email,
      category = 'Technology',
      language = 'en',
      explicit = false,
      cover_image_url
    } = req.body;

    if (!title || !description || !author) {
      return res.status(400).json({
        error: 'title, description, and author are required'
      });
    }

    const showId = `show_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const show = {
      id: showId,
      title,
      description,
      author,
      email,
      category,
      language,
      explicit,
      cover_image_url: cover_image_url || null,
      episodes: [],
      rss_url: `/api/podcast/${showId}/rss`,
      created_at: new Date().toISOString()
    };

    podcastShows.set(showId, show);

    res.json({
      success: true,
      show_id: showId,
      show: show,
      rss_url: `${req.protocol}://${req.get('host')}/api/podcast/${showId}/rss`
    });

  } catch (error) {
    console.error('Error creating podcast show:', error);
    res.status(500).json({ error: 'Failed to create podcast show' });
  }
});

// Generate podcast episode with professional features
app.post('/api/podcast/create-episode', async (req, res) => {
  try {
    const {
      show_id,
      title,
      description,
      messages, // Conversation messages
      intro_music_url,
      outro_music_url,
      intro_text,
      outro_text,
      intro_voice_id,
      outro_voice_id,
      pause_duration = 0.5,
      music_volume = 0.3, // Background music volume (0-1)
      format = 'mp3'
    } = req.body;

    if (!show_id || !title || !messages) {
      return res.status(400).json({
        error: 'show_id, title, and messages are required'
      });
    }

    const show = podcastShows.get(show_id);
    if (!show) {
      return res.status(404).json({ error: 'Podcast show not found' });
    }

    console.log(`Generating podcast episode: ${title}`);

    const tempDir = process.env.VERCEL ? '/tmp' : './temp-podcasts';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const episodeId = `ep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const audioFiles = [];

    // Generate intro if provided
    if (intro_text && intro_voice_id) {
      console.log('Generating intro...');
      const { audioBuffer } = await generateWithElevenLabs(
        intro_text,
        intro_voice_id,
        0.6,
        0.85,
        0.4,
        'mp3',
        true
      );
      const introPath = path.join(tempDir, `${episodeId}_intro.mp3`);
      fs.writeFileSync(introPath, audioBuffer);
      audioFiles.push(introPath);
    }

    // Add intro music if provided
    if (intro_music_url) {
      console.log('Downloading intro music...');
      const musicResponse = await axios.get(intro_music_url, { responseType: 'arraybuffer' });
      const musicPath = path.join(tempDir, `${episodeId}_intro_music.mp3`);
      fs.writeFileSync(musicPath, Buffer.from(musicResponse.data));
      audioFiles.push(musicPath);
    }

    // Generate main conversation
    console.log(`Generating conversation with ${messages.length} messages...`);
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      let audioBuffer;

      if (msg.voice_id) {
        ({ audioBuffer } = await generateWithElevenLabs(
          msg.text,
          msg.voice_id,
          msg.stability || 0.5,
          msg.similarity_boost || 0.85,
          msg.style || 0.3,
          'mp3',
          true
        ));
      } else if (msg.speaker_url) {
        ({ audioBuffer } = await generateWithOpensource(
          msg.text,
          msg.language || 'en',
          msg.speaker_url,
          'mp3',
          true
        ));
      } else {
        throw new Error(`Message ${i} missing voice_id or speaker_url`);
      }

      const msgPath = path.join(tempDir, `${episodeId}_msg_${i}.mp3`);
      fs.writeFileSync(msgPath, audioBuffer);
      audioFiles.push(msgPath);
    }

    // Generate outro if provided
    if (outro_text && outro_voice_id) {
      console.log('Generating outro...');
      const { audioBuffer } = await generateWithElevenLabs(
        outro_text,
        outro_voice_id,
        0.6,
        0.85,
        0.4,
        'mp3',
        true
      );
      const outroPath = path.join(tempDir, `${episodeId}_outro.mp3`);
      fs.writeFileSync(outroPath, audioBuffer);
      audioFiles.push(outroPath);
    }

    // Add outro music if provided
    if (outro_music_url) {
      console.log('Downloading outro music...');
      const musicResponse = await axios.get(outro_music_url, { responseType: 'arraybuffer' });
      const musicPath = path.join(tempDir, `${episodeId}_outro_music.mp3`);
      fs.writeFileSync(musicPath, Buffer.from(musicResponse.data));
      audioFiles.push(musicPath);
    }

    console.log('Merging all audio files...');

    // Create silence for pauses
    const silencePath = path.join(tempDir, `${episodeId}_silence.mp3`);
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input('anullsrc=r=44100:cl=stereo')
        .inputFormat('lavfi')
        .duration(pause_duration)
        .audioCodec('libmp3lame')
        .on('end', resolve)
        .on('error', reject)
        .save(silencePath);
    });

    // Create concat file
    const concatListPath = path.join(tempDir, `${episodeId}_concat.txt`);
    let concatContent = '';
    audioFiles.forEach((file, index) => {
      concatContent += `file '${file}'\n`;
      if (index < audioFiles.length - 1) {
        concatContent += `file '${silencePath}'\n`;
      }
    });
    fs.writeFileSync(concatListPath, concatContent);

    // Merge all audio
    const outputPath = path.join(tempDir, `${episodeId}_final.mp3`);
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(concatListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .audioCodec('libmp3lame')
        .audioBitrate('128k') // Podcast-optimized bitrate
        .on('end', resolve)
        .on('error', reject)
        .save(outputPath);
    });

    // Read final audio
    let finalAudio = fs.readFileSync(outputPath);

    // Get audio duration
    const stats = fs.statSync(outputPath);
    const durationSeconds = Math.round(stats.size / 16000); // Rough estimate

    // Convert format if needed
    if (format !== 'mp3') {
      finalAudio = await convertAudioFormat(finalAudio, 'mp3', format);
    }

    // Clean up temp files
    audioFiles.forEach(file => {
      try { fs.unlinkSync(file); } catch (e) {}
    });
    try { fs.unlinkSync(silencePath); } catch (e) {}
    try { fs.unlinkSync(concatListPath); } catch (e) {}
    try { fs.unlinkSync(outputPath); } catch (e) {}

    // Store episode metadata
    const episode = {
      id: episodeId,
      show_id,
      title,
      description: description || '',
      duration: durationSeconds,
      format,
      speaker_count: messages.length,
      has_intro: !!intro_text,
      has_outro: !!outro_text,
      has_music: !!(intro_music_url || outro_music_url),
      published_at: new Date().toISOString(),
      download_url: `/api/podcast/episode/${episodeId}/download`
    };

    podcastEpisodes.set(episodeId, {
      ...episode,
      audio: finalAudio
    });

    // Add episode to show
    show.episodes.push(episode);

    console.log(`Podcast episode generated: ${title} (${durationSeconds}s)`);

    res.json({
      success: true,
      episode: episode,
      download_url: `${req.protocol}://${req.get('host')}/api/podcast/episode/${episodeId}/download`,
      rss_url: `${req.protocol}://${req.get('host')}/api/podcast/${show_id}/rss`
    });

  } catch (error) {
    console.error('Error creating podcast episode:', error);
    res.status(500).json({
      error: 'Failed to create podcast episode',
      details: error.message
    });
  }
});

// Download podcast episode
app.get('/api/podcast/episode/:episode_id/download', (req, res) => {
  const { episode_id } = req.params;
  const episode = podcastEpisodes.get(episode_id);

  if (!episode) {
    return res.status(404).json({ error: 'Episode not found' });
  }

  res.set({
    'Content-Type': AUDIO_FORMATS[episode.format].contentType,
    'Content-Disposition': `attachment; filename="episode_${episode_id}.${episode.format}"`
  });
  res.send(episode.audio);
});

// Generate RSS feed for podcast
app.get('/api/podcast/:show_id/rss', (req, res) => {
  const { show_id } = req.params;
  const show = podcastShows.get(show_id);

  if (!show) {
    return res.status(404).send('Podcast show not found');
  }

  const baseUrl = `${req.protocol}://${req.get('host')}`;

  // Build RSS 2.0 feed with iTunes tags
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(show.title)}</title>
    <description>${escapeXml(show.description)}</description>
    <link>${baseUrl}/api/podcast/${show_id}/rss</link>
    <language>${show.language}</language>
    <copyright>Copyright ${new Date().getFullYear()} ${escapeXml(show.author)}</copyright>
    <itunes:author>${escapeXml(show.author)}</itunes:author>
    <itunes:summary>${escapeXml(show.description)}</itunes:summary>
    <itunes:owner>
      <itunes:name>${escapeXml(show.author)}</itunes:name>
      <itunes:email>${escapeXml(show.email || 'podcast@example.com')}</itunes:email>
    </itunes:owner>
    <itunes:explicit>${show.explicit ? 'yes' : 'no'}</itunes:explicit>
    <itunes:category text="${escapeXml(show.category)}"/>
    ${show.cover_image_url ? `<itunes:image href="${escapeXml(show.cover_image_url)}"/>` : ''}
    ${show.episodes.map(ep => `
    <item>
      <title>${escapeXml(ep.title)}</title>
      <description>${escapeXml(ep.description)}</description>
      <pubDate>${new Date(ep.published_at).toUTCString()}</pubDate>
      <enclosure url="${baseUrl}/api/podcast/episode/${ep.id}/download" type="audio/mpeg"/>
      <itunes:duration>${ep.duration}</itunes:duration>
      <itunes:summary>${escapeXml(ep.description)}</itunes:summary>
      <guid>${baseUrl}/api/podcast/episode/${ep.id}/download</guid>
    </item>
    `).join('')}
  </channel>
</rss>`;

  res.set('Content-Type', 'application/rss+xml');
  res.send(rss);
});

// Helper function to escape XML
function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Get all podcast shows
app.get('/api/podcast/shows', (req, res) => {
  const shows = Array.from(podcastShows.values()).map(show => ({
    ...show,
    episode_count: show.episodes.length
  }));

  res.json({
    shows: shows,
    total_count: shows.length
  });
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
