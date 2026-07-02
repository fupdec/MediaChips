import { expect, type Page } from '@playwright/test'

export async function dismissOnboardingIfVisible(page: Page) {
  const skipButton = page.getByRole('button', { name: /^(skip|omitir|пропустить|跳过)$/i })

  if (!(await skipButton.isVisible({ timeout: 10_000 }).catch(() => false))) {
    return
  }

  await skipButton.click()
  await expect(skipButton).toBeHidden({ timeout: 15_000 })
}

export async function waitForAppShell(page: Page) {
  await expect(page.locator('#app')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.v-application')).toBeVisible({ timeout: 30_000 })
}

export async function openSettingsTab(page: Page, tabId: string) {
  await page.goto('/settings')
  await waitForAppShell(page)
  await dismissOnboardingIfVisible(page)
  await page.locator(`#${tabId}`).click()
}
