import { expect, type Page } from '@playwright/test'

export async function waitForAppShell(page: Page) {
  await expect(page.locator('#app')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.v-application')).toBeVisible({ timeout: 30_000 })
}

export async function openSettingsTab(page: Page, tabId: string) {
  await page.goto('/settings')
  await waitForAppShell(page)
  await page.locator(`#${tabId}`).click()
}
