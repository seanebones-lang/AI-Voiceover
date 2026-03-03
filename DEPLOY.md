# Deployment and Rollout (Railway)

## Canonical runtime

- **Web app**: Next.js — `npm run build` then `next start` (port 3000).
- **Voice cloning / TTS**: XTTS service (`services/xtts`) — main app uses `/api/tts` and `/api/clone-voice` which proxy to this service.
- **Optional**: TTS v2 service (`services/tts_v2`) for playground/advanced flows; not required for main clone flow.

## Railway rollout strategy

### 1. Environments

- **Staging / internal**: Deploy first; run smoke tests (clone flow, `/api/diagnostic/clone-flow`).
- **Production**: Promote after staging passes and SLOs are met.

### 2. Health and readiness

- **Web**: Set health check path in Railway service settings to `/api/health`.
- **XTTS**: Ensure the XTTS service is reachable at `XTTS_URL` (or Railway service name `xtts-service:8081`). Web health reports XTTS status.
- **Timeout**: Default healthcheck timeout is 300s; increase in service settings if builds are slow. Allow `healthcheck.railway.app` if you restrict by hostname.

### 3. SLOs for promotion

Before promoting to production, confirm:

- **Clone flow**: POST `/api/clone-voice` returns 200 and `voice_id`; GET `/api/voices` includes the new clone; POST `/api/tts` with that `voice_id` returns audio with header `X-Voice-Type: cloned`.
- **Diagnostic**: GET `/api/diagnostic/clone-flow` returns `status: "ok"` or `"degraded"` with no critical failures.
- **Latency**: `/api/tts` p95 latency under your target (e.g. &lt; 15s for short text).
- **Errors**: No spike in 5xx or clone_tts_error in `/api/metrics` clone_telemetry.

### 4. Rollback

- **Railway**: Redeploy a previous deployment from the dashboard, or revert the git commit and push.
- **Config rollback**: Restore `railway.toml` and env vars (e.g. `restartPolicyType`, `XTTS_URL`) from a known-good revision.
- **Canonical engine**: Main app uses XTTS only; if XTTS is broken, fix or roll back the XTTS service — there is no in-app toggle to switch to another engine.

### 5. Env vars (canonical)

See `.railway/env.template` and `.env.example`. Key variables:

- **Web**: `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `UPSTASH_REDIS_REST_*`, `XTTS_URL` (or rely on Railway service discovery).
- **XTTS**: `VOICES_DIR`, `CORS_ORIGINS` (set in production to your app origin(s)), `TTS_DEVICE`.

### 6. Build and start

- **Build**: `npm ci && npm run build` (Nixpacks default; no `--production` so devDependencies are available for build).
- **Start**: Inferred from `package.json` — `next start`. Ensure the process listens on `PORT` (Railway sets this).
