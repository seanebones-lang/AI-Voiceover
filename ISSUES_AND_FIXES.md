# System Status & Issue Report — March 3, 2026

## Executive Summary

This document provides a **full and detailed account** of the current system state after pulling the latest repository, including: (1) why the 4–6 natural voices that were working days ago are currently failing, (2) what was changed to remove auth/paywall/restrictions for single-user use, and (3) how xAI TTS is integrated with current (March 2026) API behavior.

---

## 1. Why the 4–6 Natural Voices Stopped Working

### Architecture (unchanged)

- **Voice list**: The app exposes many voices via `GET /api/voices`. These include **default (edge-tts) voices** (e.g. Guy, Jenny, Ryan, Sonia, Alvaro, Elvira, …) and, when available, **cloned voices** from the XTTS service.
- **Synthesis**: **Every** TTS request (including the “natural” default voices) is sent to the **XTTS Python service** at `XTTS_URL` (e.g. `http://xtts-service:8081` or `http://localhost:8081`). There is **no in-app TTS**; the Next.js app is a proxy.
- The XTTS service (`services/xtts/main.py`) does two things:
  - **Standard (non-clone) voices**: Handled with **edge-tts** inside the Python process.
  - **Cloned voices** (`clone_*`): Handled with XTTS model and local voice files.

So the “4–6 fully functional natural voices” you had working were the **default edge-tts voices** (e.g. Guy, Jenny, Davis, Amber, Ryan, Sonia, etc.). They worked because the **XTTS service was running** and reachable. The Next app only shows the list and forwards requests; it does not synthesize audio itself.

### Root cause of current failures

- **Only the Next.js app is deployed** (e.g. on Railway). The **XTTS service is not deployed** (or not reachable).
- So:
  - `GET /api/voices` still returns the full default list (and cloned count 0).
  - **Every** `POST /api/tts` call does `fetch(XTTS_URL + '/tts', …)`. That request **fails** (e.g. `fetch failed`, connection refused, ENOTFOUND).
- Result: **All TTS fails with 503** (“TTS service error” / “fetch failed”), including the same 4–6 natural voices that worked before. The voices did not disappear; **the backend that generates audio for them is not running**.

### What “working a few days ago” implies

- Either:
  - The XTTS service was running (locally or as a second Railway service), and `XTTS_URL` was set correctly, or
  - You were using an environment where that service was up (e.g. local `npm run dev` + XTTS on 8081).

### Fix for the 4–6 natural voices (and all others)

1. **Run the XTTS service** so it is reachable:
   - **Option A (Railway):** Add a second service from `services/xtts` (Dockerfile or Nixpacks), deploy it, and set `XTTS_URL` in the Next.js service to the internal URL (e.g. `http://<xtts-service-name>:8081`).
   - **Option B (local):** Run the XTTS server locally (e.g. `cd services/xtts && pip install -r requirements.txt && python main.py` or the project’s run script) and set `XTTS_URL=http://localhost:8081` for the Next app.
2. Ensure **no firewall or network policy** blocks the Next app from reaching `XTTS_URL`.
3. After that, the same default voices (and any cloned voices) will work again without code changes to the voice list or the TTS route.

No auth or paywall change will fix this; the failure is **backend unreachable**, not permission or rate limit.

---

## 2. Changes Made for Single-User: No Auth, No Paywall, No Restrictions

### Rate limiting

- **File:** `lib/rate-limit.ts`
- **Change:** All limiters (general, TTS, clone) now use a very high ceiling (e.g. 100,000 requests per window) so they **never** block a single user in practice. Windows (15m, 1h, 1d) are unchanged; only the max request count was raised.

### Authentication

- **File:** `lib/auth.ts`
- **Change:** In the `authorized` callback, the middleware now **always returns `true`**. No route requires login; `/dashboard` and all other pages are accessible without signing in. Credentials provider remains disabled; no paywall or gated content.

### Middleware

- **File:** `middleware.ts`
- **Change:** Replaced the previous placeholder comment with a minimal middleware that only calls `NextResponse.next()`. No auth checks, no CSRF, no blocking. CORS for API routes remains handled per-route via `lib/cors.ts` (e.g. clone-voice, tts-v2) where needed.

### What was not added

- No API key requirement was added; optional API key middleware in the codebase is unchanged and not enforced for these routes.
- No new paywalls or usage caps. Any remaining limits are from external services (e.g. xAI, XTTS) if you configure them.

---

## 3. xAI TTS Integration (Current as of March 3, 2026)

### xAI API state (March 2026)

- xAI does **not** expose a dedicated REST “text-to-speech” endpoint. The only voice API documented is the **Grok Voice Agent API**:
  - **Endpoint:** WebSocket `wss://api.x.ai/v1/realtime` (region: `us-east-1`).
  - **Auth:** `Authorization: Bearer <XAI_API_KEY>` (server-side) or ephemeral token from `POST https://api.x.ai/v1/realtime/client_secrets`.
  - **Voices:** Exactly **5** — Eve (female, energetic), Ara (female, warm), Rex (male, confident), Sal (neutral, smooth), Leo (male, authoritative).
  - **Flow:** Session config (`session.update` with `voice`), then `conversation.item.create` (e.g. `input_text`), then `response.create`; audio is streamed back in the response (e.g. base64 PCM). So “TTS” is implemented by sending a single user text turn and consuming the assistant’s audio output.

### What was implemented in this repo

- **GET `/api/tts-xai/voices`**  
  Returns the 5 xAI voices (Eve, Ara, Rex, Sal, Leo) in the same shape as the rest of the app’s voice list so the UI can show them.
- **POST `/api/tts-xai/speech`**  
  Accepts `text` and `voice_id` (one of the 5). The server opens a WebSocket to `wss://api.x.ai/v1/realtime`, sends `session.update` with that voice, then `conversation.item.create` with the text, then `response.create`, and collects the returned audio chunks. It then returns the combined audio (e.g. as WAV or the format chosen) so the frontend can play it like other TTS.
- **Environment:** Set `XAI_API_KEY` in the environment for the Next.js app so the server can authenticate to xAI.

### How this fits “add xAI TTS voices”

- The 5 xAI voices are exposed as first-class voices in the system. The app can merge them into the main voice list (e.g. in `GET /api/voices` or in the playground) so you can choose “Eve”, “Rex”, etc. Synthesis for those is done via the xAI Voice Agent WebSocket flow above, not via XTTS. So you have:
  - **Default (natural) voices:** Still require the XTTS service (edge-tts inside XTTS). Fix: deploy/run XTTS and set `XTTS_URL`.
  - **xAI voices:** Work as soon as `XAI_API_KEY` is set and the xAI WebSocket is reachable; no XTTS needed.

---

## 4. Checklist for “Everything Working” for Your Use

- [ ] **XTTS service** running and reachable; `XTTS_URL` set in the Next app (so the 4–6 natural voices and all default/cloned voices work).
- [ ] **xAI:** `XAI_API_KEY` set; use `/api/tts-xai/voices` and `/api/tts-xai/speech` (and optionally merge xAI voices into the main list/playground).
- [ ] **Auth / paywall / restrictions:** Already removed or relaxed as above (rate limits effectively off, auth bypass, minimal middleware).
- [ ] **CORS:** If you use a separate frontend origin, set `ALLOWED_ORIGINS` (or equivalent) in env so the API allows that origin.

---

## EXECUTE_TO_100 Checklist (March 3, 2026)

| Item | Status |
|------|--------|
| Build (`npm run build`) | ✅ |
| Env templates (`.env.example`, `.railway/env.template`) | ✅ |
| Single-user (no auth/paywall/limits) | ✅ |
| xAI TTS (5 voices, WebSocket flow) | ✅ |
| XTTS / natural voices documented | ✅ |
| Tests | ✅ All suites and tests pass (db suite runs as placeholders until DB re-enabled) |

**Skipped test suites:** None.

**Note:** `__tests__/db.test.ts` runs as placeholder tests (expect(true).toBe(true)); replace with real DB tests when the DB layer is re-enabled.

**Previously skipped, now re-enabled and passing:**

- `app/api/tts-v2/route.test.ts` — Jest polyfills added for `Request#json()` and `Response.json()` in `jest.setup.js`.
- `__tests__/app/api/health/route.test.ts` — same polyfills.
- `__tests__/components/voice-select.test.tsx` — JSDOM polyfills for `hasPointerCapture`, `scrollIntoView`; tests use `getByRole('option')` after opening combobox.
- `__tests__/components/voice-settings.test.tsx` — `ResizeObserver` mock added; slider assertions use `getAllByRole('slider')` and `aria-valuemax` to identify speed slider.
- `__tests__/components/error-boundary.test.tsx` — `waitFor` for async fallback; query button with `getByRole('button', { name: /Try Again/i })` to avoid multiple matches.
- `__tests__/components/file-upload-zone.test.tsx` — Assertions updated to match component copy and ARIA (e.g. “Drag & drop audio files here”, Browse button, input aria-label).

---

## 5. References

- xAI Voice Agent API: https://docs.x.ai/developers/model-capabilities/audio/voice-agent  
- xAI Voice overview: https://docs.x.ai/developers/model-capabilities/audio/voice  
- Internal: `services/xtts/main.py` (XTTS + edge-tts), `app/api/tts/route.ts` (proxy to XTTS), `lib/config.ts` (XTTS_URL / service discovery).
