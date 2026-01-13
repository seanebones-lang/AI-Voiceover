#!/bin/bash
# Railway Deployment Script
# Uses Railway token from environment or provided token

set -e

RAILWAY_TOKEN="${RAILWAY_TOKEN:-e3d1ece9-2889-448b-a047-3ba37ae0cccf}"
export RAILWAY_TOKEN

echo "🚂 Railway Deployment"
echo "====================="
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "📦 Installing Railway CLI..."
    npm install -g @railway/cli
fi

echo "✅ Railway CLI ready"
echo ""

# Check project status
echo "📋 Current project status:"
railway status || true
echo ""

# Since Railway CLI requires interactive prompts for some operations,
# we'll prepare the deployment and provide instructions

echo "📝 Deployment Instructions:"
echo ""
echo "Since Railway CLI requires interactive selection for services,"
echo "please use one of these methods:"
echo ""
echo "METHOD 1: Railway Dashboard (Easiest)"
echo "1. Go to https://railway.app"
echo "2. Select project: loyal-acceptance"
echo "3. Click 'New Service' → 'GitHub Repo'"
echo "4. Select this repository"
echo "5. Railway will auto-detect Dockerfile"
echo "6. Set environment variables in Variables tab"
echo ""
echo "METHOD 2: Railway CLI (Interactive)"
echo "Run these commands locally:"
echo "  export RAILWAY_TOKEN=$RAILWAY_TOKEN"
echo "  railway service"
echo "  railway up"
echo ""
echo "Environment variables to set in Railway dashboard:"
echo "  NEXTAUTH_SECRET=<generate-random-secret>"
echo "  NEXTAUTH_URL=https://your-app.railway.app"
echo "  UPSTASH_REDIS_REST_URL=<your-redis-url>"
echo "  UPSTASH_REDIS_REST_TOKEN=<your-redis-token>"
echo "  XTTS_SIDECAR_URL=http://localhost:8000"
echo "  NODE_ENV=production"
echo ""

# Try to get project info if possible
echo "🔍 Attempting to get project information..."
railway status 2>&1 || echo "   (Interactive selection required)"
echo ""

echo "✅ Setup complete! Use Railway dashboard for easiest deployment."
