import {test, expect} from '@playwright/test'
import {disableFeatureHints, dismissOnboardingIfVisible, waitForAppShell} from './helpers'

for (const keyboard of [false, true]) {
  test(`global search opens a documentation article with ${keyboard ? 'keyboard' : 'click'}`, async ({page}) => {
    await disableFeatureHints(page)
    await page.addInitScript(() => sessionStorage.setItem('mediachips.locale', 'en'))
    await page.route('**/api/Setting', async route => {
      const response = await route.fetch()
      const rows = await response.json() as Array<{option: string; value: string}>
      await route.fulfill({response, json: [...rows.filter(row => row.option !== 'locale'), {option: 'locale', value: 'en'}]})
    })
    await page.route('**/api/home/search', route => route.fulfill({json: {media: [], tags: []}}))
    const semantic: string[] = []
    page.on('request', request => {
      if (request.method() === 'POST' && request.url().includes('/Media/semanticSearch')) semantic.push(request.url())
    })
    await page.goto('/')
    await waitForAppShell(page)
    await dismissOnboardingIfVisible(page)
    const input = page.locator('.global-search__input-text')
    // A fresh library may redirect from Home right after load and swallow the first shortcut.
    await expect(async () => {
      await page.keyboard.press('/')
      await expect(input).toBeVisible({timeout: 1000})
    }).toPass({timeout: 15_000})
    await input.fill('core concepts')
    const result = page.locator('.global-search__documentation').first()
    await expect(result).toBeVisible()
    await expect(result.locator('mark').first()).toBeVisible()
    const title = (await result.locator('.global-search__setting-copy').innerText()).split(' · ')[0].trim()
    if (keyboard) {
      await input.press('ArrowDown')
      await expect(result).toHaveClass(/global-search__item--active/)
      await input.press('Enter')
    } else {
      await result.click()
    }
    await expect(page.locator('.selected-content .text-h5')).toHaveText(title)
    await expect(page.locator('.global-search__input-text')).not.toBeVisible()
    expect(semantic).toEqual([])
    await page.unrouteAll({behavior: 'wait'})
  })
}
