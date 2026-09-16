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
