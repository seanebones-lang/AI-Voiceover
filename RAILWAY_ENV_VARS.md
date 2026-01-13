# Railway Environment Variables - Complete Guide

## 📋 All Required Environment Variables

### Next.js Service

```bash
# Core
NODE_ENV=production
PORT=8080

# Authentication
NEXTAUTH_SECRET=<generate-with-openssl-rand-base64-32>
NEXTAUTH_URL=https://your-app.railway.app

# Redis (Upstash)
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token

# Services
XTTS_SIDECAR_URL=http://localhost:8000
TTS_V2_URL=http://localhost:8082
```

### XTTS Service

```bash
# Port (Railway auto-assigns via PORT)
PORT=8081

# Python
PYTHONUNBUFFERED=1

# Storage
VOICES_DIR=/app/cloned_voices
```

### TTS v2 Service ✅ NEW

```bash
# Port (Railway auto-assigns via PORT)
PORT=8082

# Python
PYTHONUNBUFFERED=1

# Device Configuration
TTS_DEVICE=cpu
# Options: cpu, cuda (if GPU available)

# Optimization Flags
USE_TENSORRT=false
# Set to true only if NVIDIA GPU + TensorRT available

USE_FLASH_ATTENTION=true
# Works on CPU, improves attention performance

USE_QUANTIZATION=false
# Set to true for smaller models (may reduce quality)

# Storage (optional)
TTS_DATA_DIR=/app/data
TTS_CHECKPOINTS_DIR=/app/checkpoints
```

---

## 🔧 How to Set in Railway

### Option 1: Railway Dashboard

1. Go to Railway Dashboard → Your Project
2. Click on each service
3. Go to **Variables** tab
4. Click **+ New Variable**
5. Add each variable

### Option 2: Railway CLI

```bash
# Set token
export RAILWAY_TOKEN=e3d1ece9-2889-448b-a047-3ba37ae0cccf

# Next.js service
railway variables --service nextjs --set "NODE_ENV=production"
railway variables --service nextjs --set "NEXTAUTH_SECRET=$(openssl rand -base64 32)"

# TTS v2 service
railway variables --service tts-v2-service --set "TTS_DEVICE=cpu"
railway variables --service tts-v2-service --set "USE_FLASH_ATTENTION=true"
railway variables --service tts-v2-service --set "USE_TENSORRT=false"
railway variables --service tts-v2-service --set "USE_QUANTIZATION=false"
```

---

## 🔑 Generate Secrets

### NEXTAUTH_SECRET
```bash
openssl rand -base64 32
```

### Example Output
```
v5IZ1o//BsqA0tq5N0aotYOqanvKhrQa4/y4ut3RIqg=
```

---

## ✅ Verification

After setting variables, verify:

1. **Check in Dashboard**
   - Railway Dashboard → Service → Variables
   - All variables should be listed

2. **Check in Logs**
   - Railway Dashboard → Service → Logs
   - Look for environment variable usage

3. **Test Endpoints**
   ```bash
   # Health check
   curl https://your-service.railway.app/health
   
   # Should return status with correct configuration
   ```

---

## 📝 Notes

- **PORT:** Railway automatically provides this, don't set manually
- **TTS_DEVICE:** Defaults to `cpu` (Railway doesn't provide GPU by default)
- **USE_TENSORRT:** Only works with NVIDIA GPU + TensorRT installed
- **USE_FLASH_ATTENTION:** Works on CPU, recommended to keep `true`
- **USE_QUANTIZATION:** Reduces model size but may impact quality

---

## 🚀 Quick Setup Script

```bash
#!/bin/bash
# Quick Railway environment setup

export RAILWAY_TOKEN=e3d1ece9-2889-448b-a047-3ba37ae0cccf

# Generate NEXTAUTH_SECRET
NEXTAUTH_SECRET=$(openssl rand -base64 32)

# Set Next.js variables
railway variables --service nextjs --set "NEXTAUTH_SECRET=$NEXTAUTH_SECRET"
railway variables --service nextjs --set "NODE_ENV=production"

# Set TTS v2 variables
railway variables --service tts-v2-service --set "TTS_DEVICE=cpu"
railway variables --service tts-v2-service --set "USE_FLASH_ATTENTION=true"
railway variables --service tts-v2-service --set "USE_TENSORRT=false"
railway variables --service tts-v2-service --set "USE_QUANTIZATION=false"
railway variables --service tts-v2-service --set "PYTHONUNBUFFERED=1"

echo "✅ Environment variables set!"
echo "NEXTAUTH_SECRET: $NEXTAUTH_SECRET"
```

---

**Status: Complete** ✅
