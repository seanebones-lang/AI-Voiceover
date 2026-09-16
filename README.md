Paste-ready copy. The existing README is accurate but thin; this one is built for the GitHub landing page and for someone cloning the repo.

---

## GitHub About

**Description** (350-char field):

```
Enterprise AI voiceover platform: TTS, voice cloning, and effects. Next.js 16 monorepo with Clerk, Stripe, BullMQ workers, and an XTTS sidecar. Built by NextEleven.
```

**Website:** leave blank until you have a public URL, or put the Railway/Vercel app URL.

**Topics:**

```
ai  tts  text-to-speech  voice-cloning  xtts  nextjs  typescript  clerk  stripe  monorepo  railway
```

Check **Releases** if you want v3.0.0 visible. Leave Issues on.

---

## README.md

```markdown
# AI Voiceover

**v3.0.0** · NextEleven LLC

Production TTS, voice cloning, and audio effects for creators and teams. Type a script, pick a stock or cloned voice, apply emotion/effects, and get downloadable audio.

Web UI and APIs run on Next.js 16. Long jobs go through BullMQ workers. Cloning and effects go through a Python XTTS sidecar. Auth is Clerk. Billing is Stripe.

## What it does

- Text-to-speech from stock voices and cloned voices
- Voice cloning from a short reference clip (XTTS sidecar)
- Emotion / prosody controls and post-synthesis effects
- xAI voices (Eve, Ara, Rex, Sal, Leo) when `XAI_API_KEY` is set
- Long-form synthesis: adaptive timeouts, chunking, server-side WAV stitch
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
| Cloning / effects | Python XTTS service in `services/xtts` |
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
services/xtts        Python FastAPI XTTS sidecar
docs/                Architecture and launch notes
e2e/                 Playwright
```

## Prerequisites

- Node.js >= 22
- npm >= 10
- Python 3.11 (only if you run XTTS locally)
- Postgres + Redis for full local stack (optional for UI-only)

## Quick start

```bash
npm install
cp .env.example .env
# fill Clerk, Stripe, DATABASE_URL, REDIS_URL, XTTS_URL, XAI_API_KEY as needed
npm run dev
```

Web app: `http://localhost:3000`

### Optional: XTTS sidecar (clone + effects)

```bash
cd services/xtts
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python main.py
```

Point `XTTS_URL` (or `XTTS_SIDECAR_URL`) at that service.

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
- `XTTS_URL` for clone/effects
- `XAI_API_KEY` for xAI stock voices
- `API_ROUTE_SECRET` to lock TTS/clone routes
- `DIAGNOSTIC_SECRET` to lock `/api/metrics` and `/api/diagnostic/*`

Do not commit real secrets. Rotate anything that has ever lived in a public commit.

## Deploy

- **UI:** Vercel, root workspace `apps/web`
- **API / workers / Redis / Postgres / XTTS:** Railway  
  See [RAILWAY_DEPLOY.md](./RAILWAY_DEPLOY.md)

Health check: `GET /api/health`  
Always HTTP 200 so the platform healthcheck passes. Body reports `status: ok | degraded` and XTTS capability flags.

GPU XTTS is optional. CPU sidecar works; GPU cuts clone/long-form latency. Build with `services/xtts/Dockerfile.gpu` on a CUDA host and set `XTTS_URL`.

## API surface (high level)

| Route | Role |
| --- | --- |
| `POST /api/tts` | Primary TTS |
| `POST /api/tts-v2` | Newer TTS path |
| `POST /api/clone-voice` | Create a cloned voice |
| `GET /api/cloned-voices` | List clones |
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
```

---

GitHub About: repo → gear next to **About** on the right rail → paste the description, topics, and website.

If you want this committed as `README.md` on `main`, say the word and I will push it.
