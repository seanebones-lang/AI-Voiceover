#!/bin/bash
set -e

echo "🚀 Running Supabase DB Migration..."

# Local dev
if [ "$1" = "local" ]; then
  supabase db reset
  supabase db push
  echo "✅ Local migration complete."
  exit 0
fi

# Production (Railway/Supabase CLI)
supabase link --project-ref $SUPABASE_PROJECT_REF
supabase db push
supabase db diff --schema public

echo "✅ Production schema deployed. Views/indexes live."
echo "Vector search ready for voices. Run tests: npm test db"