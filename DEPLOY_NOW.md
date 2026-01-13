# 🚀 Quick Railway Deployment Guide

## Your Railway Project
- **Project**: `loyal-acceptance`
- **Environment**: `production`
- **Token**: Configured ✅

## Deployment Steps

### Option 1: Railway Dashboard (Recommended - 5 minutes)

1. **Go to Railway Dashboard**
   - Visit: https://railway.app
   - Login with your account

2. **Select Your Project**
   - Click on project: **loyal-acceptance**

3. **Create New Service**
   - Click **"New"** → **"GitHub Repo"**
   - Select your repository: `AI-Voiceover`
   - Railway will auto-detect:
     - ✅ Dockerfile
     - ✅ railway.toml
     - ✅ Port 3000

4. **Set Environment Variables**
   Go to your service → **Variables** tab → Add these:

   ```
   NEXTAUTH_SECRET=<generate-random-secret>
   NEXTAUTH_URL=https://your-service.railway.app
   UPSTASH_REDIS_REST_URL=<your-upstash-redis-url>
   UPSTASH_REDIS_REST_TOKEN=<your-upstash-redis-token>
   XTTS_SIDECAR_URL=http://localhost:8000
   NODE_ENV=production
   ```

   **To generate NEXTAUTH_SECRET:**
   ```bash
   openssl rand -base64 32
   ```

5. **Deploy**
   - Railway will automatically deploy
   - Or click **"Deploy"** button
   - Watch logs in real-time

6. **Get Your URL**
   - Railway will assign a URL like: `https://your-service.up.railway.app`
   - Update `NEXTAUTH_URL` with this URL

### Option 2: Railway CLI (If you have terminal access)

```bash
# Set token
export RAILWAY_TOKEN=e3d1ece9-2889-448b-a047-3ba37ae0cccf

# Link to service (interactive - select service)
railway service link

# Set environment variables
railway variables --set "NEXTAUTH_SECRET=$(openssl rand -base64 32)"
railway variables --set "XTTS_SIDECAR_URL=http://localhost:8000"
railway variables --set "NODE_ENV=production"

# Deploy
railway up
```

## Required Environment Variables

| Variable | Description | How to Get |
|----------|-------------|------------|
| `NEXTAUTH_SECRET` | Session secret | Generate: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Your app URL | Set after Railway assigns URL |
| `UPSTASH_REDIS_REST_URL` | Redis URL | From Upstash dashboard |
| `UPSTASH_REDIS_REST_TOKEN` | Redis token | From Upstash dashboard |
| `XTTS_SIDECAR_URL` | XTTS service | `http://localhost:8000` |
| `NODE_ENV` | Environment | `production` |

## What Happens During Deployment

1. **Build Stage**
   - Railway builds Docker image
   - Installs Node.js dependencies
   - Installs Python dependencies
   - Downloads XTTS model (~1.5GB, first time only)

2. **Runtime**
   - Next.js starts on port 3000
   - XTTS sidecar starts on port 8000 (internal)
   - Both services run in same container

3. **Health Check**
   - Visit: `https://your-app.railway.app/api/voices`
   - Should return list of available voices

## Troubleshooting

### Build Fails
- Check Railway logs
- Verify Dockerfile syntax
- Check Python dependencies

### Service Won't Start
- Check environment variables
- Verify ports are configured
- Check service logs

### XTTS Not Working
- Verify Python service started
- Check `XTTS_SIDECAR_URL` is correct
- Model downloads on first run (takes time)

## Monitoring

- **Logs**: Railway dashboard → Service → Logs
- **Metrics**: Railway dashboard → Metrics
- **Health**: `https://your-app.railway.app/api/voices`

## Next Steps After Deployment

1. ✅ Test TTS endpoint: `POST /api/tts`
2. ✅ Test voice cloning: `POST /api/clone`
3. ✅ Set up custom domain (optional)
4. ✅ Configure monitoring/alerts

---

**Your Railway token is configured and ready!** 🎉
