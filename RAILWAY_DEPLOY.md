# Railway Deployment (Solo-Creator)

Single source of truth for deploying the AI Voiceover app on Railway. One Next.js service; optional XTTS sidecar for voice cloning and quality TTS.

## Prerequisites

- Railway account; project connected to this repo
- (Optional) Second Railway service for XTTS (Python) if you want cloning and self-contained TTS

## Build and deploy

- Railway uses the repo **Dockerfile** and **railway.toml**
- Set variables in Railway Dashboard (or via API). Reference: **.railway/env.template**
- **Health:** `/api/health` is the deploy health check. When `XTTS_URL` is set, the app returns **503** until XTTS is healthy so deploys only succeed when TTS is ready.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | Set to `production` |
| `NEXTAUTH_SECRET` | Yes | Generate with `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Yes | Your app public URL (e.g. `https://your-app.railway.app`) |
| `XTTS_URL` | Optional | XTTS service URL (e.g. `http://xtts-service:8081`). If set, health returns 503 until XTTS is up |
| `UPSTASH_REDIS_REST_URL` | Optional | Redis for rate limiting; app works without it |
| `UPSTASH_REDIS_REST_TOKEN` | Optional | Redis token |
| `XAI_API_KEY` | Optional | For xAI voices (Eve, Ara, Rex, Sal, Leo) |
| `VOICES_DIR` | Optional | Persistent path for cloned voices (e.g. `/app/cloned_voices`). Mount a volume and set this |

**Never commit real secrets.** Rotate any credentials that may have been exposed. Use Railway Dashboard or `scripts/railway-sync-vars.js` with env vars set locally (see script header).

## Verify

- **GET /api/health** — Returns `status`, `capabilities` (tts_default, tts_xai, cloning), and service status. Use this to confirm what’s available after deploy.
- **Sensitive endpoints:** `/api/metrics` and `/api/diagnostic/clone-flow` require header `X-Diagnostic-Secret` matching env `DIAGNOSTIC_SECRET`, or are allowed from localhost only.

## Persistent cloned voices

To keep cloned voices across restarts, add a **volume** in Railway to the XTTS service (or the app if XTTS runs in-process) and set `VOICES_DIR` to the volume mount path. See Railway docs for adding volumes to a service.

## Single-service vs XTTS sidecar

- **Single service (Next.js only):** Deploy as-is. TTS and cloning will be unavailable unless you use xAI voices with `XAI_API_KEY`. Health returns 200 with `cloning: false`.
- **With XTTS sidecar:** Add a second Railway service for `services/xtts` (Python/FastAPI), set `XTTS_URL` to its internal URL, and (recommended) attach a volume for `VOICES_DIR`. Health will return 503 until XTTS is healthy.
