# Performance: Bundle & Lighthouse Optimizations

**Date:** January 22, 2026  
**Scope:** Bundle size reduction, Lighthouse-friendly changes, build tooling

---

## Summary

| Metric | Before | After |
|--------|--------|-------|
| **recharts** | ~200 KB (waveform) | **Removed** – replaced with CSS-based viz |
| **First Load JS (shared)** | ~250 KB+ (with recharts) | **204 KB** |
| **Vendors chunk** | – | **202 KB** |
| **Home `/`** | – | **694 B** page + 204 KB |
| **Playground** | – | **4.1 KB** page + 208 KB |

---

## 1. Bundle Optimizations

### Recharts removed

- **Before:** `WaveformVisualizer` used `recharts` (BarChart, Bar, ResponsiveContainer) ~200 KB.
- **After:** Replaced with a lightweight CSS-based bar chart (20 flex bars, gradient, `minHeight` for CLS).
- **Files:** `components/waveform-visualizer.tsx`  
- **Tests:** `__tests__/components/waveform-visualizer.test.tsx` (mock updated; all pass).

### Lazy-loaded waveform

- **Before:** `WaveformVisualizer` imported statically in `dashboard-v2`.
- **After:** `next/dynamic` import with `ssr: false` and a skeleton placeholder (`h-20` pulse) to avoid layout shift.
- **Files:** `components/dashboard-v2.tsx`  
- **Effect:** Waveform (and `useAudioContext`) only load when the “Generated Audio” card is shown.

### `lucide-react` tree-shaking

- **Config:** `experimental.optimizePackageImports: ['lucide-react']` in `next.config.js`.
- **Effect:** Only icons actually imported are bundled.

### Bundle analyzer

- **Setup:** `@next/bundle-analyzer`; `next.config.js` wrapped with `withBundleAnalyzer`.
- **Script:** `npm run build:analyze` → `ANALYZE=true next build`.
- **Output:** `.next/analyze/client.html`, `nodejs.html`, `edge.html` (no auto-open).

### Recharts dependency removed

- **Change:** `recharts` removed from `package.json` and lockfile.

---

## 2. Lighthouse-Oriented Tweaks

### Dashboard loading (home)

- **Before:** Plain “Loading…” text.
- **After:** Spinner, `role="status"`, `aria-live="polite"`, `aria-busy="true"`, `aria-label="Loading dashboard"`.
- **Files:** `app/page.tsx`  
- **Effect:** Better a11y and consistent loading UX.

### Client boundary for dynamic dashboard

- **Issue:** `next/dynamic` with `ssr: false` used in a Server Component.
- **Fix:** `'use client'` added to `app/page.tsx` so the page is a Client Component.
- **Files:** `app/page.tsx`

### Waveform CLS

- **Change:** Container uses `h-20` and `minHeight: 80` so space is reserved before bars render.

### Web Vitals (existing)

- **Layout:** `WebVitalsTracker` in root layout; `reportWebVitals` in `lib/web-vitals.ts`.
- **Fonts:** Inter with `display: 'swap'`, preload; `dns-prefetch` / `preconnect` for Google Fonts.
- **Headers:** `X-DNS-Prefetch-Control`, `X-Content-Type-Options` in `next.config.js`.

---

## 3. Build Fixes (enabling production build)

These were blocking `next build`; fixes are included so bundle/metrics can be measured:

- **`lib/config.ts`:** Renamed internal `getServiceUrl` → `resolveServiceUrl` to avoid duplicate declaration.
- **`app/api/clone-voice/route.ts`:** `xttsService` declared before duplicate-check block.
- **`app/api/health/route.ts`:** `latency?: number` added to `SidecarStatus`.
- **`app/api/tts/route.ts`:** Duplicate `startTime` removed; `tts_parameters` guarded; RAG stub used.
- **`lib/rag/voice-cloning-rag.ts`:** **New** stub for missing `@/lib/rag/voice-cloning-rag` (always `rag_enhanced: false`).
- **`lib/validation.ts`:** `extractClientIP` `request.get` typing fixed.
- **`middleware.ts`:** `req.auth` typed via `NextRequest & { auth?: { user?: unknown } }`.
- **`components/dashboard-v2.tsx`:** `CardTitle as="h2"` removed (component doesn’t support `as`).
- **`next.config.js`:** `optimizeCss: true` removed (avoids `critters` dependency).

---

## 4. Scripts & Config

### Scripts

```bash
npm run build          # Production build
npm run build:analyze  # Build + bundle analyzer reports
```

### `next.config.js` highlights

- `compress: true`
- `experimental.optimizePackageImports: ['lucide-react']`
- `withBundleAnalyzer` when `ANALYZE=true`
- Existing `splitChunks` / `runtimeChunk` / `moduleIds: 'deterministic'` kept.
- `serverExternalPackages: ['onnxruntime-node']`, `externals` for client.

---

## 5. How to Run

```bash
# Install
npm install

# Build
npm run build

# Bundle report (writes to .next/analyze/)
npm run build:analyze

# Tests
npm run test -- --testPathPattern="waveform|validation"
```

---

## 6. Next Steps (optional)

1. **Voice list caching:** Use SWR or React Query for `/api/voices` (and v2) to avoid refetch on every mount.
2. **`optimizeCss`:** Install `critters` and re-enable `optimizeCss` for critical CSS inlining if desired.
3. **Lighthouse CI:** Add a Lighthouse CI job (e.g. in GitHub Actions) to track LCP, CLS, INP, TTFB.
4. **RAG:** Replace `lib/rag/voice-cloning-rag` stub with real implementation when the RAG service is ready.
