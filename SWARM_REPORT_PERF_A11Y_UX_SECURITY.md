# Swarm Report: Performance + A11y + UI/UX + Security

**Generated:** January 22, 2026  
**Scope:** Performance, Accessibility, UI/UX, Security (focused swarm)  
**Codebase:** AI-Voiceover (HumanMirage TTS v3)

---

## Executive Summary

| Area | Score | Status | Priority |
|------|-------|--------|----------|
| **Performance** | 84/100 | Good | High |
| **Accessibility** | 86/100 | Good | Medium |
| **UI/UX** | 85/100 | Good | Medium |
| **Security** | 82/100 | Good | **Critical** |

**Overall (average): 84/100**

---

## 1. Performance

### Strengths

- **Next.js optimizations:** `compress: true`, `optimizeCss`, `splitChunks` with vendor/common cache groups, `runtimeChunk: 'single'`, deterministic `moduleIds`. (`next.config.js`)
- **Code splitting:** Dashboard lazy-loaded via `next/dynamic` with loading UI; `ssr: false` for client-only dashboard. (`app/page.tsx`)
- **Web Vitals:** `reportWebVitals` in `lib/web-vitals.ts`; `WebVitalsTracker` in root layout; CLS/FID/FCP/LCP/TTFB/INP tracked; dev logging and optional `NEXT_PUBLIC_ANALYTICS_ENDPOINT`. (`lib/web-vitals.ts`, `app/layout.tsx`)
- **Font loading:** Inter with `display: 'swap'`, `preload: true` to avoid FOIT. (`app/layout.tsx`)
- **Resource hints:** `dns-prefetch` / `preconnect` for Google Fonts. (`app/layout.tsx`)
- **React patterns:** `useMemo` for char/word count and selected voice in dashboard-v2; `React.memo` on presentational components (e.g. `FileUploadZone`); `useCallback` in `useVoices`. (`components/dashboard-v2.tsx`, `hooks/useVoices.ts`)
- **Headers:** `X-DNS-Prefetch-Control`, `X-Content-Type-Options` in `next.config.js` headers.

### Issues

| Issue | Location | Impact | Recommendation |
|-------|----------|--------|----------------|
| **Bundle size** | `waveform-visualizer.tsx`, `lib/icons.ts` | `recharts` ~200KB (only BarChart used); `lucide-react` ~150KB (full set). Total ~250KB+ gzipped. | Tree-shake or replace `recharts`; use `lucide-react` per-icon imports or smaller icon set. |
| **No voice caching** | `hooks/useVoices.ts` | Voices fetched on every mount; no client cache. | Add SWR or React Query for `/api/voices` (and v2) with stale-while-revalidate. |
| **Playground voice fetch** | `app/playground/page.tsx` | `loadVoices()` in `useEffect` on mount, no cache. | Reuse `useVoices` or same SWR/React Query layer. |
| **Generic loading UI** | `app/page.tsx` | Dashboard loading is plain “Loading…” with no spinner/skeleton. | Add subtle spinner or skeleton; consider `aria-busy` and `aria-live="polite"` for loading. |

### Performance Recommendations

1. Replace or tree-shake `recharts` (e.g. lighter chart lib or CSS-based waveform).
2. Introduce SWR/React Query for voice list and use it in dashboard, playground, and any other consumers.
3. Tree-shake `lucide-react` (e.g. `import { Icon } from 'lucide-react/dist/esm/icons/icon'`) or centralize in `lib/icons` and ensure tree-shaking.
4. Add a minimal loading skeleton or spinner for dashboard route with appropriate ARIA.

---

## 2. Accessibility

### Strengths

- **Skip link:** `SkipLink` → `#main-content` on home; `main id="main-content"` in `app/page.tsx` and `dashboard-v2`. (`components/skip-link.tsx`, `app/page.tsx`, `components/dashboard-v2.tsx`)
- **ARIA:** `aria-label` on file upload, voice select, sliders, textarea (dashboard-v2), waveform; `aria-pressed` on emotion/effect toggles; `aria-valuemin/max/now` on sliders; `aria-live="polite"` for status; `aria-live="assertive"` + `role="alert"` for errors; `aria-hidden` on decorative icons. (`file-upload-zone`, `voice-settings`, `dashboard-v2`, `emotion-picker`, `playground`, `toast`, etc.)
- **Keyboard:** `tabIndex={0}`, Enter/Space on emotion/effect buttons; focus styles (`focus:ring-2`, `focus:outline-none`); keyboard-operated file upload zone (tests cover Enter). (`emotion-picker`, `playground`, `file-upload-zone`)
- **Forms:** `htmlFor` / `id` linking; `aria-describedby` for text stats (dashboard-v2); voice/language labels.
- **Semantics:** `main`, `role="group"` for emotion/effect groups, `role="list"` / `role="listitem"` for file list, `role="img"` for waveform.

### Issues

| Issue | Location | Impact | Recommendation |
|-------|----------|--------|----------------|
| **Skip link only on home** | `app/page.tsx` | `/playground` has no skip link or `main`. | Add `SkipLink` and `<main id="main-content">` to playground layout (or shared layout for all main routes). |
| **Error boundary fallback** | `components/error-boundary.tsx` | No `role`, `aria-*`, or focus management. | Add `role="alert"`, `aria-labelledby`/`aria-describedby`; move focus to “Try again” when fallback mounts. |
| **Dashboard loading** | `app/page.tsx` | No `aria-busy` or live region. | Add `aria-busy="true"` and `aria-live="polite"` (and optional “Loading dashboard…”). |
| **Playground gaps** | `app/playground/page.tsx` | Textarea, voice `<select>`, Generate button lack `aria-label`; loading state not announced. | Add `aria-label` (or associated `<label>`) and `aria-busy`/live region for “Generating…”. |
| **Color contrast** | Various | Slate-400 on slate-900, white/40–50% on dark backgrounds may fail WCAG AA. | Audit with contrast checker; increase contrast for body and secondary text. |

### Accessibility Recommendations

1. Use skip link + `main` on all key routes (including `/playground`).
2. Harden error boundary fallback: ARIA roles, descriptions, and focus management.
3. Add `aria-busy` / `aria-live` to dashboard loading and playground generate flow.
4. Add `aria-label` (or proper `<label>`) to playground inputs and primary actions.
5. Run contrast audit and adjust palette to meet WCAG AA.

---

## 3. UI/UX

### Strengths

- **Visual design:** Dark theme, gradients, glassmorphism, subtle orbs in dashboard-v2; consistent purple/cyan/pink accent system.
- **States:** Loading (e.g. “Connecting…”, “Cloning…”, “Generating…”), error toasts/alerts, empty states via `EmptyState`, service status (checking/ready/error) in dashboard-v2.
- **Interactions:** Hover/focus styles, drag-and-drop upload, sliders for speed/volume, emotion/effect toggles.
- **Error recovery:** Error boundary with “Try again” and “Refresh page”; dismissible inline errors; toast container.
- **Responsiveness:** Grid layouts, `max-w-*`, `container`, breakpoints for panels.

### Issues

| Issue | Location | Impact | Recommendation |
|-------|----------|--------|----------------|
| **Inconsistent loading** | Home vs dashboard-v2 vs playground | Home: plain “Loading…”; dashboard-v2: spinner + status; playground: inline “Generating…”. | Standardize loading patterns (spinner/skeleton + short message) and reuse. |
| **Missing retry on fetch errors** | `useVoices`, playground `loadVoices` | Failed voice fetch shows error but no explicit retry. | Add “Retry” (or equivalent) for voice loading. |
| **EmptyState action** | `components/empty-state.tsx` | Optional CTA; no `aria-label` when it’s icon-only. | Ensure primary action has visible text or `aria-label`. |
| **Large components** | `dashboard.tsx` (~1.5k lines), `dashboard-v2.tsx` (~660 lines) | Harder to maintain and test. | Split into smaller feature components and shared sections. |

### UI/UX Recommendations

1. Create a small `LoadingScreen` (or similar) used for route-level loading (e.g. dashboard) and align with dashboard-v2/playground patterns.
2. Add explicit retry for voice fetching in `useVoices` and playground.
3. Ensure empty states and error UIs have clear, accessible primary actions.
4. Refactor dashboards into smaller components for clarity and testability.

---

## 4. Security

### Strengths

- **Middleware headers:** `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`. (`middleware.ts`)
- **CSP:** `unsafe-eval` removed; `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `upgrade-insecure-requests`. Script/style keep `unsafe-inline` (Next.js / Tailwind constraint). (`middleware.ts`)
- **CORS utility:** `lib/cors.ts` with `ALLOWED_ORIGINS`; explicit origin check; no wildcard when origins configured; preflight returns 403 when disallowed. Used by `tts-v2`, `clone-v2`, `clone-voice`.
- **Validation:** Zod schemas for TTS/clone inputs; `validateAudioFile` (size, MIME, ext); `validateAudioDuration`; text sanitization (XSS-like patterns); max text length (e.g. 5k/10k). (`lib/validation.ts`, `app/api/*`)
- **File upload:** 50MB per file and 50MB total; allowed types/extensions; duration checks. (`lib/validation.ts`, `dashboard-v2`, clone routes)
- **Rate limiting:** Upstash Redis limiters for `tts`, `clone`, `clone-voice`; IP-based. (`lib/rate-limit.ts`, `app/api/tts`, `app/api/clone`, `app/api/clone-voice`)
- **Auth:** NextAuth; protected `/dashboard`; public routes defined. (`middleware.ts`, `lib/auth.ts`)

### Issues

| Issue | Location | Impact | Recommendation |
|-------|----------|--------|----------------|
| **CORS `*` with credentials** | `lib/cors.ts` | When `origin` is null, `Access-Control-Allow-Origin` was set to `'*'` with `credentials: true` (invalid). | **Fixed:** We now only set `Access-Control-Allow-Origin` when `origin` is present; same-origin requests omit it. |
| **Rate-limit fallback** | `lib/rate-limit.ts` | If Redis is missing, fallback always allows (`success: true`). Abuse possible when Redis is down. | Use in-memory fallback (e.g. sliding window) with stricter limits and log when fallback is active. |
| **TTS-v2 / Clone-v2 without rate limiting** | `app/api/tts-v2`, `app/api/clone-v2` | No rate limiting on these routes. | Apply `ttsRateLimiter` / `cloneRateLimiter` (or equivalent) to tts-v2 and clone-v2. |
| **CORS only on 3 routes** | `app/api/*` | Only `tts-v2`, `clone-v2`, `clone-voice` use `lib/cors`. Others (e.g. `voices`, `batch`, `conversation`) rely on same-origin or custom logic. | If any of these are called cross-origin, add CORS via `lib/cors`; otherwise document “same-origin only.” |
| **Middleware excludes API** | `middleware.ts` config | Matcher skips `api`, so CSP and other security headers are not applied to API responses. | Confirm Next.js `headers()` in `next.config.js` cover API routes if needed; alternatively extend middleware (e.g. separate matcher) for critical API paths. |
| **File validation** | `lib/validation.ts`, clone routes | MIME/ext checks only; no magic-byte validation. Types can be spoofed. | Add magic-byte (or similar) checks for uploaded audio where feasible. |
| **server.js CORS** | `server.js` | `origin: process.env.ALLOWED_ORIGINS \|\| '*'` defaults to `*`. | If server.js is used, require `ALLOWED_ORIGINS` and never default to `*`. |

### Security Recommendations

1. ~~Fix CORS when `origin` is null~~ **Done:** `lib/cors.ts` now omits `Access-Control-Allow-Origin` when `origin` is null.
2. Replace rate-limit fallback with in-memory limiter and alert when Redis is unavailable.
3. Add rate limiting to `tts-v2` and `clone-v2`.
4. Apply CORS consistently to any API route exposed cross-origin; otherwise document and enforce same-origin.
5. Ensure CSP and security headers apply to API routes if they serve HTML or are sensitive.
6. Harden file uploads with magic-byte validation where possible.
7. Remove `*` default for CORS in `server.js` if that server is in use.

---

## Action Matrix

| Priority | Area | Action |
|----------|------|--------|
| **P0** | Security | ~~Fix CORS `*` + credentials~~ Done; add rate limiting to tts-v2 / clone-v2. |
| **P0** | Security | Replace rate-limit fallback with in-memory limiter. |
| **P1** | Performance | Add SWR/React Query for voice list; reduce recharts/lucide bundle size. |
| **P1** | A11y | Add SkipLink + `main` on `/playground`; improve error boundary a11y and focus. |
| **P1** | UI/UX | Standardize loading states; add retry for voice fetch. |
| **P2** | A11y | `aria-busy`/live for loading; `aria-label` on playground controls; contrast audit. |
| **P2** | Security | Magic-byte validation for uploads; CORS coverage and server.js default. |
| **P2** | UI/UX | Refactor large dashboard components. |

---

## Summary

Performance is solid (splitting, Web Vitals, React patterns) but bundle size and missing voice caching hold it back. Accessibility is strong on home/dashboard-v2 (ARIA, keyboard, skip link) yet incomplete on playground and error boundary. UI/UX is consistent and clear, with room to unify loading and add retries. Security is largely in good shape (CSP, validation, rate limiting on some routes) but has specific gaps: CORS credentials, rate-limit fallback, and unprotected tts-v2/clone-v2.

Addressing the P0 security items and the P1 performance and a11y changes will yield the biggest gains.
