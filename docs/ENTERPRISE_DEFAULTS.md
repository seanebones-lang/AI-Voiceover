# Enterprise architecture defaults (Apr 2026)

This document locks the recommended defaults for the AI Voiceover platform rebuild.

## Platforms

| Layer | Platform | Role |
|-------|----------|------|
| Web + BFF | **Vercel** | Next.js App Router, Clerk session handling, Stripe Checkout redirect, API routes that proxy to Railway or enqueue jobs |
| Data + async work | **Railway** | Postgres, Redis, long-running workers (TTS, clone, transcoding), webhooks consumer (optional duplicate) |

## Data

- **Postgres**: source of truth (users sync from Clerk ID, orgs/workspaces, projects, jobs, API keys, audit logs, billing state cache).
- **Redis**: queues (BullMQ), rate limits, ephemeral cache.

## Identity & access

- **Clerk**: authentication, organizations, invitations, MFA-capable sessions.
- **RBAC**: organization roles mapped to app permissions (`org:admin`, `org:member`, `org:billing`, `org:viewer`).
- **Entitlements**: derived from Stripe subscription + price → feature flags and quotas (see `packages/billing`).

## Compliance baseline (phase 1)

- SOC 2–oriented practices: audit log table for sensitive actions, least-privilege env vars, separate dev/staging/prod.
- GDPR-aware: consent timestamps, export/delete request hooks (implement before EU traffic).
- **Region**: US-only primary deploy; document cross-region if expanded later.

## Billing

- **Stripe**: flat tier subscriptions; webhooks update `subscription` + `entitlement` rows idempotently.

## Repository layout

- `apps/web` — Next.js UI and API routes.
- `apps/workers` — Railway worker process(es).
- `packages/contracts` — Zod API/domain contracts.
- `packages/db` — Drizzle schema + migrations.
- `packages/auth` — Clerk integration helpers.
- `packages/billing` — Stripe + entitlement resolution.
