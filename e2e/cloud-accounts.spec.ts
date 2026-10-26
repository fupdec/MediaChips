import {test, expect} from '@playwright/test'
import {disableFeatureHints, dismissOnboardingIfVisible, waitForAppShell} from './helpers'
for (const provider of ['gdrive', 'onedrive', 'dropbox']) {
  test(`${provider}: selects an account, imports a file and starts bounded background processing`, async ({page}) => {
    await disableFeatureHints(page)
    const first = '11111111-1111-4111-8111-111111111111', second = '22222222-2222-4222-8222-222222222222'
    const imports: string[] = []
    let job: any
    await page.route('**/api/Task/parsePathTags', route => route.fulfill({json: []}))
    await page.route('**/api/cloud-accounts**', route => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/files')) return route.fulfill({json: {entries: [
        {resourceKey: 'folder', name: 'Folder', isDirectory: true, size: 0, contentType: 'inode/directory'},
        {resourceKey: 'video', name: url.pathname.includes(second) ? 'Second movie.mp4' : 'First movie.mp4', size: 1024, isDirectory: false, contentType: 'video/mp4'},
        {resourceKey: 'document', name: 'Notes.txt', size: 100, isDirectory: false, contentType: 'text/plain'},
      ]}})
      if (url.pathname.endsWith('/import')) { imports.push(url.pathname); return route.fulfill({json: {id: 100, title: 'Second movie.mp4', created: true}}) }
      return route.fulfill({json: [
        {id: first, provider, name: 'First account', authenticated: true, redirectUri: ''},
        {id: second, provider, name: 'Second account', authenticated: true, redirectUri: ''},
      ]})
    })
    await page.route('**/api/remote-processing/**', route => {
      if (route.request().method() === 'POST') {
        const payload = route.request().postDataJSON()
        job = {id: '33333333-3333-4333-8333-333333333333', mediaId: payload.mediaId, kind: payload.kind, state: 'completed', resultUrl: '/mock-storyboard.jpg'}
        return route.fulfill({status: 202, json: job})
      }
      return route.fulfill({json: job ? [job] : []})
    })
    await page.setViewportSize({width: 1440, height: 1200})
    await page.goto('/media?mediaTypeId=1'); await waitForAppShell(page); await dismissOnboardingIfVisible(page)
    await page.getByRole('button', {name: /^(Add media|Добавить медиа)$/}).first().click()
    const dialog = page.locator('.media-adding-dialog')
    await dialog.getByRole('tab', {name: /^(Sources|Источники)$/}).click()
    await dialog.getByRole('tab', {name: /^(Cloud|Облако)$/}).click()
    await dialog.getByRole('combobox', {name: /Cloud account|Облачный аккаунт/}).press('ArrowDown')
    await page.getByRole('option', {name: 'First account'}).click()
    const cloud = dialog.locator('.cloud-accounts-source')
    await expect(cloud.getByText('First movie.mp4', {exact: true})).toBeVisible()
    await dialog.getByRole('combobox', {name: /Cloud account|Облачный аккаунт/}).press('ArrowDown')
    await page.getByRole('option', {name: 'Second account'}).click()
    await expect(cloud.getByText('Second movie.mp4', {exact: true})).toBeVisible()
    const textFile = cloud.locator('.v-list-item').filter({hasText: 'Notes.txt'})
    await expect(textFile.getByRole('checkbox')).toBeDisabled()
    await cloud.locator('.v-list-item').filter({hasText: 'Second movie.mp4'}).getByRole('checkbox').check()
    const add = dialog.locator('.dialog-header').first().getByRole('button', {name: /^(Add|Добавить)$/})
    await expect(add).toBeEnabled(); await add.click()
    await expect.poll(() => imports).toEqual([`/api/cloud-accounts/${second}/import`])
    await expect(page.locator('.media-adding-process .process-percents')).toHaveText('100 %')
    await page.goto('/settings?tab=connections'); await waitForAppShell(page)
    await page.getByRole('tab', {name: /^(Cloud|Облако)$/}).click()
    await page.getByRole('combobox', {name: /Cloud account|Облачный аккаунт/}).press('ArrowDown')
    await page.getByRole('option', {name: 'Second account'}).click()
    const processing = page.locator('.settings-page .cloud-accounts-source')
    await processing.getByText(/Background server processing|Фоновая обработка на сервере/).click()
    await processing.getByLabel(/Imported media ID|ID импортированного медиа/).fill('100')
    await processing.getByRole('button', {name: /^(Start|Запустить)$/}).click()
    await expect.poll(() => job?.kind).toBe('storyboard')
    await expect(processing.getByRole('link', {name: /^(Open|Открыть)$/})).toBeVisible()
  })
}
