import { test, expect } from '@playwright/test'
import { openSettingsTab, waitForAppShell } from './helpers'

test.describe('Navigation', () => {
  test('opens playlists page', async ({ page }) => {
    await page.goto('/playlists')
    await waitForAppShell(page)

    await expect(page.locator('.playlists-page-title')).toBeVisible({ timeout: 30_000 })
  })

  test('opens media library route', async ({ page }) => {
    await page.goto('/media')
    await waitForAppShell(page)

    await expect(page.locator('.v-application')).toBeVisible()
    await expect(page.locator('.layout-items, .items-page, .v-main').first()).toBeVisible({
      timeout: 30_000,
    })
  })

  test('switches settings to database tab', async ({ page }) => {
    await openSettingsTab(page, 'settings-doc-tab-database')

    await expect(page.locator('#database_backups')).toBeVisible({ timeout: 30_000 })
  })

  test('switches settings to about tab', async ({ page }) => {
    await openSettingsTab(page, 'settings-doc-tab-about')

    await expect(page.getByText(/MediaChips/i).first()).toBeVisible({ timeout: 30_000 })
  })

  test('home page shows main shell without login dialog on fresh server', async ({ page }) => {
    await page.goto('/')
    await waitForAppShell(page)

    await expect(page.locator('.v-dialog--active')).toHaveCount(0)
    await expect(page.locator('.app-bar, .v-app-bar').first()).toBeVisible({ timeout: 30_000 })
  })
})
