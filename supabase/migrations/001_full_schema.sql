-- Full Supabase PG Schema Migration v1.0 (Users/Projects/Voices/Vectors)

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA public;

-- Users (enhanced from auth)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  preferred_voices JSONB DEFAULT '[]'::JSONB,
  credits INTEGER DEFAULT 1000,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Projects (audio workspaces)
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  audios JSONB[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Voices (with embeddings for similarity)
CREATE TABLE IF NOT EXISTS public.voices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  embedding VECTOR(512),
  samples JSONB DEFAULT '{}',
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for scale
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_user ON public.projects(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_voices_user ON public.voices(user_id);
CREATE INDEX IF NOT EXISTS idx_voices_embedding ON public.voices USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Previous tables extend (api_users/podcasts/conversations)
ALTER TABLE api_users ADD COLUMN IF NOT EXISTS preferred_style JSONB DEFAULT '{}';
ALTER TABLE podcasts ADD COLUMN IF NOT EXISTS emotion TEXT[];
ALTER TABLE conversations.messages ADD COLUMN IF NOT EXISTS emotion TEXT;

-- Analytics View
CREATE OR REPLACE VIEW usage_stats AS
SELECT 
  u.id as user_id,
  COUNT(p.id) as projects_count,
  AVG(EXTRACT(EPOCH FROM p.created_at)) as avg_session,
  SUM(u.credits) as total_credits
FROM public.users u
LEFT JOIN public.projects p ON u.id = p.user_id
GROUP BY u.id;

-- RLS Policies (secure)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own" ON public.users FOR SELECT USING (auth.uid() = id);
-- Similar for projects/voices

-- Trigger: Auto-embed voice on insert (future pgml)
