# AI Voiceover Monorepo (v3)

Enterprise-first AI voice platform rebuilt for the 2026 stack:
- `apps/web` on Next.js 16 (Vercel)
- `apps/workers` queue workers (Railway)
- shared domain packages in `packages/*`
- Clerk auth + Stripe billing + XTTS sidecar integration

## Monorepo layout

- `apps/web` - Next.js App Router UI and API routes
- `apps/workers` - BullMQ job workers
- `packages/contracts` - shared Zod contracts
- `packages/db` - Drizzle schema, migrations, and DB client
- `packages/auth` - Clerk auth helpers and permission mapping
- `packages/billing` - Stripe billing and entitlements
- `services/xtts` - Python XTTS service for clone/effects workloads

## Prerequisites

- Node.js `>=22`
- npm `>=10`
- Python `3.11` (for `services/xtts`)

## Quick start

1) Install dependencies

```bash
npm install
```

2) Configure environment

```bash
cp .env.example .env
```

At minimum, set Clerk, Stripe, DB/Redis, and XTTS-related values as needed for your local setup.

3) Start the web app

```bash
npm run dev
```

4) (Optional) Start XTTS service for clone/effects

```bash
cd services/xtts
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python main.py
```

## Common commands (repo root)

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run test
npm run e2e:api
```

## Documentation

- `docs/ENTERPRISE_DEFAULTS.md` - architecture defaults
- `docs/MONOREPO.md` - workspace layout and workflows
- `docs/LAUNCH_CHECKLIST.md` - launch readiness tasks
- `docs/releases/v3.0.0.md` - release notes draft
- `CHANGELOG.md` - top-level change history

## Notes

- Generated artifacts like `.next`, `test-results`, and local virtualenvs are not source-of-truth and should not be committed.
- Deploy app/UI to Vercel and backend workloads (DB/Redis/workers/XTTS) to Railway.
