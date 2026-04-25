# Big-bang launch checklist (enterprise)

Use this before switching production traffic to the rebuilt stack (Vercel + Railway + Clerk + Stripe).

## Identity (Clerk)

- [ ] Production `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` set on Vercel.
- [ ] Organizations enabled; webhook URL points to `https://<app>/api/webhooks/clerk`.
- [ ] `CLERK_WEBHOOK_SIGNING_SECRET` configured and matches the Clerk dashboard endpoint.
- [ ] Verify a test org syncs to Postgres (`organizations`, `org_members`).

## Billing (Stripe)

- [ ] Stripe live keys restricted to production domains / IPs where possible.
- [ ] Webhook endpoint `https://<app>/api/webhooks/stripe` with signing secret `STRIPE_WEBHOOK_SECRET`.
- [ ] Products/prices created; `STRIPE_PRICE_ID_PRO`, `STRIPE_PRICE_ID_TEAM` (and starter if used) match Dashboard IDs in env.
- [ ] Test subscription creates/updates `subscriptions` + `entitlements` rows idempotently (replay same event).

## Data (Railway)

- [ ] `DATABASE_URL` for production Postgres; run schema (`npm run db:push -w @ai-voiceover/db` or migration pipeline).
- [ ] Backups enabled; restore drill performed.
- [ ] `REDIS_URL` for BullMQ queue; worker service deployed and healthy.

## Workers

- [ ] Railway worker service runs `npm run start -w @ai-voiceover/workers` against production `REDIS_URL` + `DATABASE_URL`.
- [ ] Dead-letter / failed job visibility (logs + alerts).

## Security

- [ ] Secrets only in platform env — never in repo.
- [ ] CSP reviewed after any new third-party script (Clerk, Stripe.js).
- [ ] Rate limits and API route secrets (`API_ROUTE_SECRET`) reviewed for public endpoints.

## Observability

- [ ] Sentry DSN (or equivalent) for web + worker.
- [ ] Structured logs with request/correlation IDs on critical paths.
- [ ] Uptime checks for `/api/health` and Stripe webhook success rate.

## Rollback

- [ ] Document DNS / env toggle to revert to previous deployment.
- [ ] Runbook for disabling checkout or putting app in maintenance mode.
