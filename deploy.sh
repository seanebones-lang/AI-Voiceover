#!/bin/bash

# AI Voice-Over Generator - Vercel Deployment Script
# This script deploys your app with all environment variables configured

echo "🚀 Starting deployment to Vercel..."
echo ""

# Set Vercel token
export VERCEL_TOKEN="vck_3mOD4BEGf22RsRJMscNsZwqzfPh0nnp6TTtadlfK0eK1O8EyBN2bZtq0"

# Deploy to Vercel
echo "📦 Deploying to Vercel..."
vercel --token=$VERCEL_TOKEN --yes --prod

# Get the deployment URL
echo ""
echo "✅ Deployment initiated!"
echo ""
echo "⚙️ Now configuring environment variables..."
echo ""

# Add environment variables
echo "Adding ELEVENLABS_API_KEY..."
echo "sk_5ac106062e19304d8fb2fda7799bdcdbbfe136cbae778191" | vercel env add ELEVENLABS_API_KEY production --token=$VERCEL_TOKEN

echo "Adding STRIPE_SECRET_KEY..."
echo "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" | vercel env add STRIPE_SECRET_KEY production --token=$VERCEL_TOKEN

echo "Adding STRIPE_PUBLISHABLE_KEY..."
echo "pk_live_51S40C8CHzMTnpYNot9Qlzd98VpmyGsQpm2n32CZtWfAKWyYng2BU0F8QfsLSksSeYLvcLdw6pnXH7QCCYRhoV9yr00dujwaMSO" | vercel env add STRIPE_PUBLISHABLE_KEY production --token=$VERCEL_TOKEN

echo ""
echo "♻️ Redeploying to apply environment variables..."
vercel --token=$VERCEL_TOKEN --yes --prod

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "Your app is now live and ready to accept payments!"
echo ""
echo "Next steps:"
echo "1. Get your live URL from the deployment output above"
echo "2. Go to https://dashboard.stripe.com/webhooks"
echo "3. Add webhook: https://your-app.vercel.app/api/stripe/webhook"
echo "4. Copy webhook secret and add as STRIPE_WEBHOOK_SECRET"
echo ""
echo "💰 Start making money! 🚀"
