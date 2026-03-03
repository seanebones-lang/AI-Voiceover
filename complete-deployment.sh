#!/bin/bash
# Complete Railway Deployment Script
# Requires RAILWAY_TOKEN in environment. Do not hardcode secrets.
set -e

if [ -z "$RAILWAY_TOKEN" ]; then
    echo "Error: Set RAILWAY_TOKEN (e.g. export RAILWAY_TOKEN=your-token)"
    exit 1
fi
export RAILWAY_TOKEN

echo "🚀 Completing Railway Deployment"
echo "================================="
echo ""

# Generate secrets
NEXTAUTH_SECRET=$(openssl rand -base64 32)
echo "✅ Generated NEXTAUTH_SECRET"

# Check if Railway CLI is available
if ! command -v railway &> /dev/null; then
    echo "📦 Installing Railway CLI..."
    npm install -g @railway/cli
fi

echo "✅ Railway CLI ready"
echo ""

# Check current status
echo "📋 Current Railway status:"
railway status || true
echo ""

# Since Railway CLI requires interactive service selection,
# we'll prepare everything and provide the final command

echo "🔧 Setting up deployment configuration..."
echo ""

# Create .railway directory if needed
mkdir -p .railway

# Save configuration
cat > .railway/config.json << EOF
{
  "project": "loyal-acceptance",
  "environment": "production",
  "service": null
}
EOF

echo "✅ Configuration saved"
echo ""

# Prepare environment variables file for Railway
cat > .railway/env.template << EOF
NEXTAUTH_SECRET=$NEXTAUTH_SECRET
NEXTAUTH_URL=https://your-app.railway.app
UPSTASH_REDIS_REST_URL=your-upstash-redis-url
UPSTASH_REDIS_REST_TOKEN=your-upstash-redis-token
XTTS_SIDECAR_URL=http://localhost:8000
NODE_ENV=production
EOF

echo "✅ Environment template created"
echo ""

echo "📝 Next Steps:"
echo ""
echo "1. Run this command to link service (interactive):"
echo "   export RAILWAY_TOKEN=<your-token>"
echo "   railway service link"
echo ""
echo "2. Set environment variables in Railway dashboard (do not paste secrets in shell history):"
echo "   NEXTAUTH_SECRET, NEXTAUTH_URL, UPSTASH_*, XTTS_SIDECAR_URL, NODE_ENV"
echo ""
echo "3. Deploy:"
echo "   railway up"
echo ""
echo "OR use Railway Dashboard (easier):"
echo "1. Go to https://railway.app"
echo "2. Select project: loyal-acceptance"
echo "3. Create new service from GitHub repo"
echo "4. Copy variables from .railway/env.template"
echo ""

echo "✅ Deployment preparation complete!"
echo "   Set NEXTAUTH_SECRET and other secrets in Railway dashboard (see .railway/env.template)."
echo ""
