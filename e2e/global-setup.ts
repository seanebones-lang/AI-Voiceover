/**
 * Warm Next.js dev server so first page load has compiled routes.
 * Playwright runs this after webServer is ready.
 */
async function globalSetup() {
  const base = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000'
  const timeout = 15000
  for (const path of ['/', '/playground']) {
    try {
      const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(timeout) })
      if (!res.ok) console.warn(`Warmup ${path}: ${res.status}`)
    } catch (e) {
      console.warn(`Warmup ${path}:`, (e as Error).message)
    }
  }
}

export default globalSetup
