#!/bin/bash
# Railway Deployment Setup Script

set -e

echo "🚂 Railway Deployment Setup"
echo "============================"
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "📦 Installing Railway CLI..."
    npm install -g @railway/cli
fi

echo "✅ Railway CLI installed"
echo ""

# Set Railway token
export RAILWAY_TOKEN="e3d1ece9-2889-448b-a047-3ba37ae0cccf"

echo "🔑 Railway token set"
echo ""

# Check authentication
echo "🔍 Checking authentication..."
railway whoami || {
    echo "⚠️  Authentication required. Please run: railway login"
    echo "   Or set RAILWAY_TOKEN environment variable"
    exit 1
}

echo ""
echo "📋 Next steps:"
echo "1. Run: railway link (to link to existing project)"
echo "   OR"
echo "2. Run: railway init (to create new project)"
echo ""
echo "3. Set environment variables in Railway dashboard or via CLI:"
echo "   railway variables set NEXTAUTH_SECRET=your-secret"
echo "   railway variables set UPSTASH_REDIS_REST_URL=your-url"
echo "   railway variables set UPSTASH_REDIS_REST_TOKEN=your-token"
echo ""
echo "4. Deploy: railway up"
echo ""
