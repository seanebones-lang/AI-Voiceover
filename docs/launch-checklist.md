# Launch Checklist

## Pre-Beta

- [ ] Migration `packages/db/migrations/0001_enterprise_core.sql` applied in staging.
- [ ] Clerk webhooks validated and deduplicated.
- [ ] Stripe webhook replay test completed.
- [ ] Queue retry/dead-letter behavior validated.
- [ ] Sentry/log/metrics dashboards available.

## Gated Beta

- [ ] Invite pilot organizations.
- [ ] Validate auth, RBAC, billing, and API-key flows.
- [ ] Confirm consent/export/delete workflows.
- [ ] Triaged all high-severity beta defects.

## Production Cutover

- [ ] Freeze legacy writes before DNS/app switch.
- [ ] Execute Vercel and Railway environment promotion.
- [ ] Enable paging and on-call escalation.
- [ ] Verify SLOs and error budgets in first 24h.
