# Changelog

All notable changes to this project are documented in this file.

## [3.0.0] - 2026-04-24

### Added
- Workspace monorepo structure with `apps/web`, `apps/workers`, and shared packages under `packages/*`.
- New shared packages:
  - `@ai-voiceover/contracts` (typed contracts, RBAC mapping)
  - `@ai-voiceover/db` (Drizzle schema/client)
  - `@ai-voiceover/auth` (Clerk verification + permission helpers)
  - `@ai-voiceover/billing` (Stripe client/webhook + entitlement mapping)
- New API routes in `apps/web`:
  - `/api/webhooks/clerk`
  - `/api/webhooks/stripe`
  - `/api/voice-jobs`
- Clerk auth pages and wiring:
  - `/login`
  - `/sign-up`
- Documentation:
  - `docs/ENTERPRISE_DEFAULTS.md`
  - `docs/MONOREPO.md`
  - `docs/LAUNCH_CHECKLIST.md`

### Changed
- Migrated app layout from root-level Next.js files to `apps/web`.
- Migrated auth from NextAuth route to Clerk-based flow.
- Updated Docker and CI for monorepo/workspace-aware build/test.
- Updated CSP and media playback handling for production audio reliability.
- Improved UI error surfacing for TTS failures (shows `details`, `hint`, `requestId` when available).
- Replaced deprecated Next.js `middleware.ts` convention with `proxy.ts`.

### Fixed
- `Button` now correctly handles `asChild` without leaking invalid DOM props.
- Effects processing path now routes through XTTS sidecar when effects are requested.
- XTTS local runtime setup reliability:
  - dependency compatibility pinning (`TTS`, `transformers`, `torch`, `torchaudio`)
  - writable local `VOICES_DIR` fallback
  - corrected startup verification logic for multi-speaker XTTS
- Cloned voice long-form reliability:
  - adaptive timeout logic in `/api/tts`
  - automatic long-text chunking and server-side WAV stitching in XTTS service

### Breaking
- Project structure changed to monorepo; root-level app/config paths moved under `apps/web`.
- Environment variable requirements changed/expanded for Clerk, Stripe, DB/Redis, and XTTS.
- Legacy auth route `app/api/auth/[...nextauth]/route.ts` removed.
- Root-level `middleware.ts` and `next.config.js` removed in favor of `apps/web/proxy.ts` and `apps/web/next.config.js`.
