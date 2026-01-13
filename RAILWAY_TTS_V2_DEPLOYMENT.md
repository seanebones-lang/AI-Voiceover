# Railway Deployment - TTS v2 Service Configuration

## ✅ Railway Configuration Complete

The TTS v2 service is now fully configured for Railway deployment.

---

## 🚀 Services Configuration

Railway is configured with **3 services**:

### 1. Next.js Service (Port 8080)
- **Source:** Root directory
- **Start Command:** `npm start`
- **Health Check:** `/api/health`
- **Purpose:** Main web application

### 2. XTTS Service (Port 8081)
- **Source:** `./services/xtts`
- **Start Command:** `cd services/xtts && python3 -m uvicorn main:app --host 0.0.0.0 --port $PORT`
- **Health Check:** `/health`
- **Purpose:** Legacy XTTS voice cloning

### 3. TTS v2 Service (Port 8082) ✅ NEW
- **Source:** `./services/tts_v2`
- **Start Command:** `cd services/tts_v2 && python3 -m uvicorn server_v2:app --host 0.0.0.0 --port $PORT`
- **Health Check:** `/health`
- **Purpose:** Production TTS v2 with all optimizations

---

## 🔧 Environment Variables

Set these in Railway dashboard → Variables tab:

### Required for All Services
```bash
NODE_ENV=production
PYTHONUNBUFFERED=1
```

### Next.js Service
```bash
PORT=8080
NEXTAUTH_SECRET=<generate-with-openssl-rand-base64-32>
NEXTAUTH_URL=https://your-app.railway.app
UPSTASH_REDIS_REST_URL=<your-redis-url>
UPSTASH_REDIS_REST_TOKEN=<your-redis-token>
```

### XTTS Service
```bash
XTTS_PORT=8081
VOICES_DIR=/app/cloned_voices
```

### TTS v2 Service ✅ NEW
```bash
TTS_V2_PORT=8082
TTS_DEVICE=cpu
USE_TENSORRT=false
USE_FLASH_ATTENTION=true
USE_QUANTIZATION=false
```

**Note:** Railway uses the `PORT` environment variable automatically for each service. The service-specific port variables (XTTS_PORT, TTS_V2_PORT) are for reference only.

---

## 📋 Railway Configuration File

The `railway.toml` file includes:

```toml
[[services]]
name = "tts-v2-service"
source = "./services/tts_v2"
startCommand = "cd services/tts_v2 && python3 -m uvicorn server_v2:app --host 0.0.0.0 --port $PORT"
healthcheckPath = "/health"
healthcheckTimeout = 100
```

---

## ✅ Key Changes Made

1. **Port Configuration** ✅
   - Updated `server_v2.py` to use Railway's `PORT` environment variable
   - Falls back to `TTS_PORT` for local development
   - Railway automatically assigns ports to each service

2. **Device Configuration** ✅
   - Default device set to `cpu` (Railway doesn't provide GPU by default)
   - Can override with `TTS_DEVICE=cuda` if GPU is available

3. **Service Definition** ✅
   - Added TTS v2 service to `railway.toml`
   - Configured health check endpoint
   - Set proper start command

4. **Environment Variables** ✅
   - Added TTS v2 specific environment variables
   - Configured optimization flags (TensorRT, Flash Attention, Quantization)

---

## 🚀 Deployment Steps

### Option 1: Railway Dashboard (Recommended)

1. **Go to Railway Dashboard**
   - Visit: https://railway.app
   - Login with your account

2. **Select Project**
   - Click on project: **loyal-acceptance**

3. **Verify Services**
   - You should see 3 services:
     - `nextjs`
     - `xtts-service`
     - `tts-v2-service` ✅

4. **Set Environment Variables**
   - Go to each service → Variables tab
   - Add the environment variables listed above

5. **Deploy**
   - Railway will automatically deploy on push to main branch
   - Or click "Deploy" button manually

### Option 2: Railway CLI

```bash
# Set token
export RAILWAY_TOKEN=e3d1ece9-2889-448b-a047-3ba37ae0cccf

# Link to project
railway link

# Set environment variables for TTS v2 service
railway variables --service tts-v2-service --set "TTS_DEVICE=cpu"
railway variables --service tts-v2-service --set "USE_FLASH_ATTENTION=true"
railway variables --service tts-v2-service --set "USE_TENSORRT=false"
railway variables --service tts-v2-service --set "USE_QUANTIZATION=false"

# Deploy
railway up
```

---

## 🔍 Verification

After deployment, verify:

1. **Health Checks**
   ```bash
   # Next.js
   curl https://your-app.railway.app/api/health
   
   # XTTS
   curl https://your-xtts-service.railway.app/health
   
   # TTS v2 ✅
   curl https://your-tts-v2-service.railway.app/health
   ```

2. **TTS v2 Endpoints**
   ```bash
   # Health
   GET /health
   
   # TTS
   POST /tts
   {
     "text": "Hello, world!",
     "emotion": "neutral",
     "language": "en"
   }
   
   # Metrics
   GET /metrics
   
   # WebSocket Streaming
   WS /ws/stream
   ```

3. **Service Logs**
   - Check Railway dashboard → Service → Logs
   - Look for: "✅ Production TTS Pipeline ready!"

---

## ⚙️ Configuration Details

### Port Handling
- Railway automatically provides `PORT` environment variable
- Each service gets its own port
- No port conflicts between services

### Device Selection
- **Default:** `cpu` (Railway doesn't provide GPU)
- **Override:** Set `TTS_DEVICE=cuda` if GPU is available
- **Auto-detection:** Falls back to CPU if CUDA not available

### Optimization Flags
- **USE_TENSORRT:** `false` (requires NVIDIA GPU + TensorRT)
- **USE_FLASH_ATTENTION:** `true` (works on CPU)
- **USE_QUANTIZATION:** `false` (can enable for smaller models)

---

## 📊 Service URLs

After deployment, Railway will assign URLs:

- **Next.js:** `https://your-app.up.railway.app`
- **XTTS:** `https://your-xtts-service.up.railway.app`
- **TTS v2:** `https://your-tts-v2-service.up.railway.app` ✅

---

## ✅ Status

**Railway Deployment Configuration: 100% Complete**

- ✅ TTS v2 service added to `railway.toml`
- ✅ Port configuration updated for Railway
- ✅ Environment variables configured
- ✅ Health check endpoint configured
- ✅ Start command configured
- ✅ Device selection optimized for Railway

**Ready for deployment!** 🚀
