# Railway Deployment (Solo-Creator)

Single source of truth for deploying the AI Voiceover app on Railway. Two services: the Next.js app and the self-hosted voice service (`services/xtts`), which synthesizes **every** voice (stock and cloned) with local models. No third-party TTS API or key is involved.

## Prerequisites

- Railway account; project connected to this repo
- Second Railway service for the voice service (Python, `services/xtts`, ~6 GB RAM recommended on CPU)

## Build and deploy

- Railway uses the repo **Dockerfile** and **railway.toml**
- Set variables in Railway Dashboard (or via API). Reference: **.railway/env.template**
- **Health:** `/api/health` is the deploy health check. It always returns **200** so Railway’s healthcheck passes. When `XTTS_URL` is set but XTTS is unreachable, the response body has `status: 'degraded'` and `services.xtts.status: 'unhealthy'` so you can monitor and add XTTS later.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | Set to `production` |
| `NEXTAUTH_SECRET` | Yes | Generate with `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Yes | Your app public URL (e.g. `https://your-app.railway.app`) |
| `XTTS_URL` | Yes | Voice service URL (e.g. `http://xtts-service:8081`). If it is down, health returns 200 with `status: 'degraded'` |
| `UPSTASH_REDIS_REST_URL` | Optional | Redis for rate limiting; app works without it |
| `UPSTASH_REDIS_REST_TOKEN` | Optional | Redis token |
| `VOICES_DIR` | Recommended (voice service) | Persistent path for cloned voices (e.g. `/data/voices`). Mount a volume and set this |
| `XTTS_GPT_COND_LEN` / `XTTS_MAX_REF_LEN` | Optional (voice service) | Seconds of reference audio used for clone conditioning (defaults 30 / 30) |
| `VOICE_DEVICE` | Optional (voice service) | `auto` (default), `cpu` or `cuda` |

**Never commit real secrets.** Rotate any credentials that may have been exposed. Use Railway Dashboard or `scripts/railway-sync-vars.js` with env vars set locally (see script header).

## Verify

- **GET /api/health** — Returns `status`, `capabilities` (`tts_default` = stock voices ready, `cloning` = XTTS ready), and voice-service status. XTTS takes about a minute to load after a cold start; Kokoro is ready in seconds.
- **Sensitive endpoints:** `/api/metrics` and `/api/diagnostic/clone-flow` require header `X-Diagnostic-Secret` matching env `DIAGNOSTIC_SECRET`, or are allowed from localhost only.

## Persistent cloned voices

To keep cloned voices across restarts, add a **volume** in Railway to the XTTS service (or the app if XTTS runs in-process) and set `VOICES_DIR` to the volume mount path. See Railway docs for adding volumes to a service.

## Voice service

Add a Railway service with root directory `services/xtts` (it builds from its own `Dockerfile`), set `XTTS_URL` on the Next.js service to its internal URL, and attach a volume for `VOICES_DIR`. The image bakes in all model weights (Kokoro-82M and XTTS v2) at build time and runs with `HF_HUB_OFFLINE=1`, so it needs no outbound network at runtime. If it is down, the web app's health still returns 200 with `status: 'degraded'`.

Existing cloned voices keep working: on first use each legacy voice is migrated to cleaned references (`ref_*.wav`) and its conditioning latents are cached next to it (`latents_*.pt`).

XTTS v2 weights are under the Coqui Public Model License (non-commercial terms); building the image accepts it. Kokoro-82M is Apache-2.0.

## GPU inference (XTTS)

Railway’s default builders are **CPU-only**. For faster XTTS (voice cloning and long synthesis), run the Python service on a **GPU host** and point the app at it with `XTTS_URL`.

1. **Build** with `services/xtts/Dockerfile.gpu` (CUDA base image + `requirements-common.txt`). Your host must expose an NVIDIA GPU to Docker (`nvidia-container-toolkit` on Linux, or a cloud GPU VM).
2. **Deploy** on a provider that offers GPU containers (e.g. RunPod, Lambda Labs, vast.ai, or self-hosted). Expose the same HTTP port as the CPU image (see the service’s `PORT` / Dockerfile `EXPOSE`).
3. **Wire the app:** set `XTTS_URL` on Railway (or Vercel) to the public or private URL of that GPU service, e.g. `https://xtts-gpu.example.com`.
4. **Verify:** open `GET {XTTS_URL}/health` — when CUDA is available you should see `cuda_available: true`, `cuda_device`, and `cuda_version` in the JSON. The Next.js app’s `/api/health` forwards XTTS fields when configured.

CPU-only XTTS remains supported via the default `services/xtts/Dockerfile`; GPU is optional for throughput and latency, not a requirement for correctness.
