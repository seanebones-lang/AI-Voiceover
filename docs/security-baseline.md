# Enterprise Security Baseline

## Identity and Access

- Clerk-backed authentication with org memberships.
- Server-side RBAC checks for API, worker actions, and admin routes.
- API keys stored hashed with scoped permissions.

## Data Protection

- US-region primary data stores for Postgres, Redis, and object storage.
- Audio assets stored outside Postgres with metadata references only.
- Consent records and retention policies for uploaded voice samples.

## Operational Controls

- Environment separation: dev, preview, staging, production.
- Secrets managed via Vercel and Railway environment managers.
- Audit events for auth, billing, role, key, and destructive actions.
- Webhook idempotency enforced through `webhook_events`.

## Verification Cadence

- Weekly dependency and secrets review.
- Monthly access review for org-level admins.
- Quarterly disaster recovery rehearsal and backup restore test.
