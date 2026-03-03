import { test, expect } from '@playwright/test'

const runPageTests = !!process.env.E2E_FULL

test.describe('Home', () => {
  test('home page loads with app title', async ({ page }) => {
    test.skip(!runPageTests, 'Set E2E_FULL=1 and run with app already up (npm run dev)')
    await page.goto('/', { waitUntil: 'load', timeout: 30000 })
    await expect(page).toHaveTitle(/VoiceClone|TTS|Voice/i)
  })

  test('home has main landmark or skip link in DOM', async ({ page }) => {
    test.skip(!runPageTests, 'Set E2E_FULL=1 and run with app already up (npm run dev)')
    await page.goto('/', { waitUntil: 'load', timeout: 30000 })
    const mainOrSkip = page.locator('#main-content, main, [role="main"], a[href="#main-content"]').first()
    await expect(mainOrSkip).toBeAttached({ timeout: 25000 })
  })
})
