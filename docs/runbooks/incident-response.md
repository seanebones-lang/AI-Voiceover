# Incident Response Runbook

## Scope

Applies to web/API outages, worker backlogs, billing webhook failures, and provider degradation.

## First 15 Minutes

1. Confirm incident impact and affected organizations.
2. Check API health and worker queue depth.
3. Validate Stripe and Clerk webhook ingestion status.
4. Inspect latest deploys across Vercel and Railway.
5. Assign an incident commander and communications owner.

## Diagnostics

- API latency and error spikes by route.
- Job backlog by state (`queued`, `running`, `failed`).
- Dead-letter/retry trend.
- Webhook deduplication failures.
- Entitlement check failures.

## Mitigation

- Pause non-critical queue consumers if saturation risk is high.
- Disable high-cost endpoints behind feature flags for impacted orgs.
- Reprocess failed webhook events after dependency restoration.
- Trigger provider failover for voice generation if available.

## Recovery And Follow-up

1. Confirm SLOs are back within target.
2. Backfill delayed usage and billing events.
3. Publish incident timeline and root cause.
4. Add preventive action items to engineering backlog.
