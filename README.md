# AI Voiceover

**v4.0.0** · NextEleven LLC

Production TTS, voice cloning, and audio effects for creators and teams. Type a script, pick a stock or cloned voice, apply emotion/effects, and get downloadable audio.

Web UI and APIs run on Next.js 16. **Every voice is synthesized by the self-hosted voice service** (`services/xtts`) using local models — no third-party TTS API, no API keys, and the container runs offline once built. Long jobs go through BullMQ workers. Auth is Clerk. Billing is Stripe.

## What it does

- 34 local stock voices in 10 languages plus 4 multilingual studio voices (25 on Kokoro-82M; XTTS studio speakers cover German, Korean, French male and the multilingual set)
- Voice cloning from short reference clips (XTTS v2): references are cleaned automatically and speaker latents are cached per voice
- Emotion / prosody controls, `[pause]` markers that insert real silence, paragraph pauses, pronunciation lexicon and inline IPA (`[ipa:word|phonemes]`)
- Post-synthesis effects (room reverb, echo, denoise, radio/telephone/robot/…) and mastering profiles (podcast, broadcast, cinematic)
- Long-form synthesis: language-aware chunking, runaway-generation guard, level-matched seams, loudness normalization (-19 LUFS)
- WAV or MP3 output
- Clerk login / sign-up and org-ready auth
- Stripe subscriptions with entitlement mapping (Pro / Team)
- Job queue (`/api/voice-jobs`) for async work
- Health endpoint that stays green even if XTTS is degraded

## Stack

| Layer | Tech |
| --- | --- |
| App / API | Next.js 16 (App Router) in `apps/web` |
| Workers | BullMQ in `apps/workers` |
| Auth | Clerk |
| Billing | Stripe |
| Data | Postgres + Drizzle (`packages/db`) |
| Queue / cache | Redis |
| Voices / cloning / effects | Python voice service in `services/xtts` (Kokoro-82M + XTTS v2, FastAPI) |
| Contracts | Zod packages in `packages/contracts` |
| Deploy | Vercel (UI) + Railway (API / workers / XTTS) |

## Repo layout

```
apps/web          Next.js UI + API routes
apps/workers      BullMQ workers
packages/contracts   Shared Zod contracts + RBAC
packages/db          Drizzle schema, migrations, client
packages/auth        Clerk helpers
packages/billing     Stripe + entitlements
services/xtts        Python FastAPI voice service (Kokoro + XTTS, all local)
docs/                Architecture and launch notes
e2e/                 Playwright
```

## Prerequisites

- Node.js >= 22
- npm >= 10
- Python 3.11 and ffmpeg for the voice service (required for audio; Docker image provided)
- Postgres + Redis for full local stack (optional for UI-only)

## Quick start

```bash
npm install
cp .env.example .env
# fill Clerk, Stripe, DATABASE_URL, REDIS_URL, XTTS_URL as needed
npm run dev
```

Web app: `http://localhost:3000`

### Voice service (required for audio)

```bash
cd services/xtts
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip uninstall -y unidic   # use the bundled unidic-lite dictionary for Japanese
COQUI_TOS_AGREED=1 python prefetch_models.py   # one-time model download (~2.2 GB)
HF_HUB_OFFLINE=1 python main.py                # serves on :8081, fully offline
```

Or `docker build -t voice services/xtts` (weights are baked into the image). Point `XTTS_URL` (or `XTTS_SIDECAR_URL`) at the service. Unit tests: `pip install -r requirements-dev.txt && pytest services/xtts/tests`.

**Model licenses:** Kokoro-82M is Apache-2.0. XTTS v2 weights (cloned and studio voices) are under the Coqui Public Model License, which restricts commercial use; building the image accepts it.

## Scripts

```bash
npm run dev              # web app
npm run build            # web + workers
npm run start
npm run lint
npm run typecheck
npm run typecheck:packages
npm run test
npm run e2e
npm run e2e:api
npm run e2e:full
npm run railway:sync
```

## Environment

See `.env.example` and `.railway/env.template`. Minimum for a useful local run:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`
- `STRIPE_SECRET_KEY` + price IDs if you exercise billing
- `DATABASE_URL`
- `REDIS_URL`
- `XTTS_URL` for the voice service (all voices)
- `API_ROUTE_SECRET` to lock TTS/clone routes
- `DIAGNOSTIC_SECRET` to lock `/api/metrics` and `/api/diagnostic/*`

Do not commit real secrets. Rotate anything that has ever lived in a public commit.

## Deploy

- **UI:** Vercel, root workspace `apps/web`
- **API / workers / Redis / Postgres / XTTS:** Railway  
  See [RAILWAY_DEPLOY.md](./RAILWAY_DEPLOY.md)

Health check: `GET /api/health`  
Always HTTP 200 so the platform healthcheck passes. Body reports `status: ok | degraded`, plus `capabilities.tts_default` (Kokoro ready) and `capabilities.cloning` (XTTS ready).

GPU is optional. Kokoro stock voices are many times faster than real time on CPU; XTTS (cloned/studio voices) runs at roughly 1-3x real time on CPU, and a GPU cuts that sharply. Build with `services/xtts/Dockerfile.gpu` on a CUDA host and set `XTTS_URL`.

## API surface (high level)

| Route | Role |
| --- | --- |
| `POST /api/tts` | Primary TTS (`output_format: wav \| mp3`) |
| `POST /api/tts-v2` | Newer TTS path |
| `POST /api/clone-voice` | Create a cloned voice |
| `GET /api/cloned-voices` | List clones |
| `POST /api/cloned-voices/{id}/samples` | Add reference takes to an existing clone |
| `GET /api/voices` | Available voices |
| `POST /api/voice-jobs` | Enqueue async work |
| `GET /api/health` | Deploy + capability probe |
| `/api/webhooks/clerk` | Auth events |
| `/api/webhooks/stripe` | Billing events |

Sensitive diagnostics require `X-Diagnostic-Secret` or localhost.

## Docs

- [docs/ENTERPRISE_DEFAULTS.md](./docs/ENTERPRISE_DEFAULTS.md)
- [docs/MONOREPO.md](./docs/MONOREPO.md)
- [docs/LAUNCH_CHECKLIST.md](./docs/LAUNCH_CHECKLIST.md)
- [docs/releases/v3.0.0.md](./docs/releases/v3.0.0.md)
- [CHANGELOG.md](./CHANGELOG.md)
- [RAILWAY_DEPLOY.md](./RAILWAY_DEPLOY.md)

## Status

Public monorepo, MIT licensed. Last structural release: **3.0.0** (2026-04-24) — Clerk + Stripe + workspace split + XTTS reliability work.

Built and maintained by [NextEleven](https://github.com/seanebones-lang).

## License

MIT. See [LICENSE](./LICENSE).
