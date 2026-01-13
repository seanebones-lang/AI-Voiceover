-- AI Voice-Over Generator - Supabase Database Schema
-- Run this in your Supabase SQL Editor to set up the database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- VOICES TABLE - Store all voice data
-- ============================================
CREATE TABLE IF NOT EXISTS voices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  elevenlabs_voice_id TEXT,
  provider TEXT NOT NULL DEFAULT 'elevenlabs', -- 'elevenlabs' or 'coqui-xtts-v2'
  source TEXT NOT NULL, -- 'elevenlabs_library', 'cloned', 'cloned_opensource'
  category TEXT,
  language TEXT DEFAULT 'en',
  gender TEXT,
  labels JSONB DEFAULT '{}',
  audio_files JSONB DEFAULT '[]',
  speaker_url TEXT,
  preview_url TEXT,
  free BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_voices_provider ON voices(provider);
CREATE INDEX IF NOT EXISTS idx_voices_source ON voices(source);
CREATE INDEX IF NOT EXISTS idx_voices_elevenlabs_id ON voices(elevenlabs_voice_id);

-- ============================================
-- AUDIO CACHE TABLE - Store generated audio
-- ============================================
CREATE TABLE IF NOT EXISTS audio_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cache_key TEXT UNIQUE NOT NULL,
  text_hash TEXT NOT NULL,
  voice_id TEXT,
  provider TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'mp3',
  audio_url TEXT, -- Cloudflare R2 URL or local path
  audio_size BIGINT, -- Size in bytes
  duration REAL, -- Duration in seconds
  parameters JSONB DEFAULT '{}', -- Stability, similarity_boost, style, etc.
  hit_count INTEGER DEFAULT 0,
  last_accessed TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for cache lookups
CREATE INDEX IF NOT EXISTS idx_audio_cache_key ON audio_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_audio_cache_provider ON audio_cache(provider);
CREATE INDEX IF NOT EXISTS idx_audio_cache_format ON audio_cache(format);
CREATE INDEX IF NOT EXISTS idx_audio_cache_last_accessed ON audio_cache(last_accessed);

-- ============================================
-- BATCH JOBS TABLE - Track batch processing
-- ============================================
CREATE TABLE IF NOT EXISTS batch_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  total INTEGER NOT NULL,
  completed INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'processing', -- 'processing', 'completed', 'completed_with_errors', 'failed'
  provider TEXT,
  results JSONB DEFAULT '[]',
  errors JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Index for batch job lookups
CREATE INDEX IF NOT EXISTS idx_batch_jobs_batch_id ON batch_jobs(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_status ON batch_jobs(status);

-- ============================================
-- ANALYTICS TABLE - Store usage analytics
-- ============================================
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL, -- 'tts_request', 'batch_request', 'conversation', 'voice_clone', etc.
  provider TEXT,
  format TEXT,
  emotion TEXT,
  cache_hit BOOLEAN DEFAULT false,
  text_length INTEGER,
  duration REAL,
  cost_estimate REAL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_provider ON analytics_events(provider);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_cache_hit ON analytics_events(cache_hit);

-- ============================================
-- CONVERSATIONS TABLE - Store generated conversations
-- ============================================
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT,
  messages JSONB NOT NULL, -- Array of speaker messages
  audio_url TEXT, -- Cloudflare R2 URL
  format TEXT DEFAULT 'mp3',
  pause_duration REAL DEFAULT 0.5,
  speaker_count INTEGER,
  total_duration REAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for conversation lookups
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);

-- ============================================
-- API KEYS TABLE - For API marketplace
-- ============================================
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key_hash TEXT UNIQUE NOT NULL, -- Hashed API key
  key_prefix TEXT NOT NULL, -- First 8 chars for display
  name TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'free', -- 'free', 'starter', 'pro', 'enterprise'
  rate_limit INTEGER DEFAULT 100, -- Requests per day
  requests_used INTEGER DEFAULT 0,
  requests_reset_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 day',
  active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used TIMESTAMPTZ
);

-- Indexes for API key lookups
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(active);

-- ============================================
-- USERS TABLE - For future user management
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  tier TEXT DEFAULT 'free', -- 'free', 'pro', 'enterprise'
  stripe_customer_id TEXT,
  subscription_status TEXT, -- 'active', 'cancelled', 'expired'
  subscription_ends_at TIMESTAMPTZ,
  total_requests INTEGER DEFAULT 0,
  total_characters INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);

-- ============================================
-- FUNCTIONS - Auto-update timestamps
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for auto-updating timestamps
CREATE TRIGGER update_voices_updated_at BEFORE UPDATE ON voices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (RLS) - Optional, enable as needed
-- ============================================
-- ALTER TABLE voices ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE audio_cache ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create policies as needed for multi-tenant applications

-- ============================================
-- INITIAL DATA - Add some sample voices
-- ============================================
-- This will be populated by the /api/voices/sync endpoint

-- ============================================
-- ANALYTICS VIEW - Quick stats
-- ============================================
CREATE OR REPLACE VIEW analytics_summary AS
SELECT
  COUNT(*) as total_requests,
  COUNT(*) FILTER (WHERE cache_hit = true) as cache_hits,
  COUNT(*) FILTER (WHERE cache_hit = false) as cache_misses,
  COUNT(DISTINCT provider) as providers_used,
  SUM(text_length) as total_characters,
  SUM(duration) as total_duration,
  SUM(cost_estimate) as total_cost,
  DATE_TRUNC('hour', created_at) as hour
FROM analytics_events
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;

-- ============================================
-- COMPLETED
-- ============================================
-- Your database schema is now ready!
-- Next steps:
-- 1. Update your .env with Supabase credentials
-- 2. Install npm dependencies: npm install
-- 3. The application will automatically use Supabase when configured
