# Monorepo layout

| Path | Purpose |
|------|---------|
| [apps/web](../apps/web/) | Next.js 16 App Router (Vercel): UI + API routes |
| [apps/workers](../apps/workers/) | Railway BullMQ worker for async voice jobs |
| [packages/contracts](../packages/contracts/) | Shared Zod contracts + RBAC helpers |
| [packages/db](../packages/db/) | Drizzle ORM schema + Postgres client |
| [packages/auth](../packages/auth/) | Clerk verification + permission maps |
| [packages/billing](../packages/billing/) | Stripe webhook handlers + entitlements |

## Commands (from repo root)

```bash
npm install
npm run dev              # Next.js dev server (@ai-voiceover/web)
npm run build            # Web + workers production build
npm test -w @ai-voiceover/web
npm run typecheck:packages
```

## Database

Apply schema to Railway Postgres (development):

```bash
cd packages/db && DATABASE_URL=... npx drizzle-kit push --config=drizzle.config.ts
```

See [.env.example](../.env.example) for required variables.
