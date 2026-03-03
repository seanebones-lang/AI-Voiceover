# E2E Tests (Playwright)

End-to-end tests for the AI Voiceover Next.js app.

## Default: API smoke test

By default, only the **API health** test runs (reliable with auto-started dev server):

```bash
npm run e2e
# or
npm run e2e:api
```

## Full E2E (home + playground + API)

The home and playground tests need a **warm** app (dev server can stream an empty shell on first load). Run with the app already up:

```bash
# Terminal 1: start the app
npm run dev

# Terminal 2: run all e2e tests (including home and playground)
E2E_FULL=1 npm run e2e
# or
npm run e2e:full
```

If home/playground tests are flaky with the dev server (streaming), run against a production build for stable results:

```bash
npm run build && npm run start
# In another terminal:
E2E_FULL=1 npm run e2e
```

## UI mode

```bash
npm run e2e:ui
```

## Structure

- `e2e/home.spec.ts` — Home page: main content, skip link (runs when `E2E_FULL=1`)
- `e2e/playground.spec.ts` — TTS Playground: voice select, text area, generate button (runs when `E2E_FULL=1`)
- `e2e/api-health.spec.ts` — `GET /api/health` returns 200 and status (always runs)

Config: `playwright.config.ts` (Chromium, baseURL `http://localhost:3000`, webServer: `npm run dev`, reuseExistingServer: true).
