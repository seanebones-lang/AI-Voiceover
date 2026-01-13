# Railway Deployment Guide

## Quick Start

### Option 1: Via Railway Dashboard (Recommended)

1. **Go to Railway Dashboard**
   - Visit: https://railway.app
   - Login with your account

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Connect your repository
   - Railway will auto-detect the Dockerfile

3. **Set Environment Variables**
   In Railway dashboard, go to your project → Variables tab and add:
   ```
   NEXTAUTH_SECRET=your-secret-key-here
   NEXTAUTH_URL=https://your-app.railway.app
   UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
   UPSTASH_REDIS_REST_TOKEN=your-redis-token
   XTTS_SIDECAR_URL=http://localhost:8000
   NODE_ENV=production
   ```

4. **Deploy**
   - Railway will automatically deploy on push to main branch
   - Or click "Deploy" button manually

### Option 2: Via Railway CLI

1. **Install Railway CLI** (if not installed)
   ```bash
   npm install -g @railway/cli
   ```

2. **Login**
   ```bash
   railway login
   ```
   This will open a browser for authentication.

3. **Link to Project** (if project exists)
   ```bash
   railway link
   ```
   Select your project from the list.

   OR **Create New Project**
   ```bash
   railway init
   ```

4. **Set Environment Variables**
   ```bash
   railway variables set NEXTAUTH_SECRET=your-secret-key
   railway variables set UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
   railway variables set UPSTASH_REDIS_REST_TOKEN=your-token
   railway variables set XTTS_SIDECAR_URL=http://localhost:8000
   ```

5. **Deploy**
   ```bash
   railway up
   ```

## Using Your Railway Token

Your Railway token: `e3d1ece9-2889-448b-a047-3ba37ae0cccf`

### Set as Environment Variable:
```bash
export RAILWAY_TOKEN=e3d1ece9-2889-448b-a047-3ba37ae0cccf
```

### Or use in Railway CLI commands:
```bash
RAILWAY_TOKEN=e3d1ece9-2889-448b-a047-3ba37ae0cccf railway whoami
```

## Project Configuration

Railway will automatically detect:
- ✅ `Dockerfile` - Multi-stage build for Node.js + Python
- ✅ `railway.toml` - Deployment configuration
- ✅ Port 3000 (Next.js) - Auto-exposed
- ✅ Port 8000 (XTTS sidecar) - Internal only

## Environment Variables Required

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXTAUTH_SECRET` | Secret for NextAuth sessions | ✅ Yes |
| `NEXTAUTH_URL` | Your Railway app URL | ✅ Yes |
| `UPSTASH_REDIS_REST_URL` | Redis REST URL | ✅ Yes |
| `UPSTASH_REDIS_REST_TOKEN` | Redis token | ✅ Yes |
| `XTTS_SIDECAR_URL` | XTTS service URL | ✅ Yes (default: localhost:8000) |
| `GOOGLE_CLIENT_ID` | Google OAuth (optional) | ❌ No |
| `GOOGLE_CLIENT_SECRET` | Google OAuth (optional) | ❌ No |

## Troubleshooting

### Build Fails
- Check Railway logs: `railway logs`
- Ensure Dockerfile is correct
- Verify all dependencies are in package.json

### XTTS Sidecar Not Starting
- Check Python service logs in Railway dashboard
- Verify Python dependencies in `services/xtts/requirements.txt`
- Model download happens on first run (~1.5GB)

### Rate Limiting Not Working
- Verify Upstash Redis credentials
- Check `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`

## Monitoring

- **Logs**: Railway dashboard → Deployments → View logs
- **Metrics**: Railway dashboard → Metrics tab
- **Health Check**: `https://your-app.railway.app/api/voices`

## Security Note

⚠️ **Important**: Your Railway token is sensitive. Never commit it to Git or share it publicly. Consider rotating it if exposed.
