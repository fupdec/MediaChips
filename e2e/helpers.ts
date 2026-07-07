import { expect, type Page } from '@playwright/test'

export async function waitForBlockingOverlaysToClose(page: Page) {
  await expect(page.locator('.v-overlay--active')).toHaveCount(0, { timeout: 15_000 })
}

export async function dismissOnboardingIfVisible(page: Page) {
  const skipButton = page.getByRole('button', { name: /^(skip|omitir|пропустить|跳过)$/i })
  const deadline = Date.now() + 20_000

  while (Date.now() < deadline) {
    if (await skipButton.isVisible().catch(() => false)) {
      await skipButton.click()
      await expect(skipButton).toBeHidden({ timeout: 15_000 })
      await waitForBlockingOverlaysToClose(page)
      return
    }

    const activeOverlays = await page.locator('.v-overlay--active').count()
    if (activeOverlays === 0) {
      await page.waitForTimeout(500)
      if (
        !(await skipButton.isVisible().catch(() => false))
        && await page.locator('.v-overlay--active').count() === 0
      ) {
        return
      }
      continue
    }

    await page.waitForTimeout(250)
  }

  await waitForBlockingOverlaysToClose(page)
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
