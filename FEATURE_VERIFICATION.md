# Feature verification matrix

Manual or automated checks for regression after API or UI changes. CI runs lint, typecheck (app + tests), and Jest.

| Area | What to verify | Notes |
|------|----------------|-------|
| **Health** | `GET /api/health` → 200, JSON shape | Public |
| **Voices** | `GET /api/voices` → 200; cloned list when XTTS up; degraded path when XTTS down | May merge defaults + clones |
| **Cloned voices** | `GET /api/cloned-voices` → 200 or 503 if XTTS missing | Railway without XTTS |
| **TTS v1** | `POST /api/tts` JSON body → audio or structured error | Optional `API_ROUTE_SECRET` (Bearer / `x-api-key`) |
| **TTS v2** | `POST /api/tts-v2` → audio; 400 with `code` on bad input | Same optional secret |
| **Clone** | `POST /api/clone-voice` multipart → success or conflict message | Rate limit + optional secret |
| **Metrics** | `GET /api/metrics` with `x-diagnostic-secret` or strict localhost (no `x-forwarded-for` when secret unset); 403 body includes `code: FORBIDDEN` | Playwright: `e2e/api-metrics.spec.ts` |
| **Diagnostic** | `GET /api/diagnostic/clone-flow` same access as metrics | Smoke steps + telemetry |
| **Auth UI** | Sign-in flows if NextAuth enabled | Middleware does not enforce session |
| **Dashboard** | Generate speech, clone upload, voice select, playback | End-to-end smoke |

Environment flags (see `.env.example`): `DIAGNOSTIC_SECRET`, `API_ROUTE_SECRET`.
