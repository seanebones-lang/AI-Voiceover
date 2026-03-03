import { test, expect } from '@playwright/test'

const runPageTests = !!process.env.E2E_FULL

test.describe('Playground', () => {
  test('loads TTS playground with voice select and text area', async ({ page }) => {
    test.skip(!runPageTests, 'Set E2E_FULL=1 and run with app already up (npm run dev)')
    await page.goto('/playground', { waitUntil: 'load', timeout: 30000 })
    await expect(
      page.getByText(/Loading voices|TTS Playground/i)
    ).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('heading', { name: /TTS Playground/i })).toBeVisible({ timeout: 20000 })
    await expect(page.getByLabel(/select voice/i)).toBeVisible()
    await expect(page.getByLabel(/text to speak/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /Generate speech/i })).toBeVisible()
  })

  test('voice dropdown is populated after load', async ({ page }) => {
    test.skip(!runPageTests, 'Set E2E_FULL=1 and run with app already up (npm run dev)')
    await page.goto('/playground', { waitUntil: 'load', timeout: 30000 })
    const select = page.getByLabel(/select voice/i)
    await expect(select).toBeVisible({ timeout: 20000 })
    await select.click()
    const options = page.locator('option').filter({ hasNotText: 'Select a voice' })
    await expect(options.first()).toBeVisible({ timeout: 15000 })
  })
})
