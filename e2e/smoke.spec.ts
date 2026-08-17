import { test, expect } from '@playwright/test'

test('loads the home page shell', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle(/MediaChips/)
  await expect(page.locator('#app')).toBeVisible()
  await expect(page.locator('.v-application')).toBeVisible({timeout: 30_000})
})

test('opens the settings route', async ({ page }) => {
  await page.goto('/settings')

  await expect(page.locator('.v-application')).toBeVisible({timeout: 30_000})
  await expect(page.locator('.settings-page, .settings-nav').first()).toBeVisible({timeout: 30_000})
})

test('settings API responds for a fresh server', async ({ request }) => {
  const response = await request.get('/api/Setting')

  expect(response.status()).toBe(200)
  expect(Array.isArray(await response.json())).toBe(true)
})
