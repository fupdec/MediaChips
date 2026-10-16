import {test, expect} from '@playwright/test'
import {disableFeatureHints, dismissOnboardingIfVisible, waitForAppShell} from './helpers'

test.beforeEach(async ({page}) => {
  await disableFeatureHints(page)
  await page.route('**/api/Task/parsePathTags', route => route.fulfill({json: []}))
})

test('Google Drive remembers its folder and breadcrumb names across sessions and recovers if the folder disappears', async ({page}) => {
  let unavailable = false
  const requestedFolders: string[] = []
  await page.route('**/api/drive/status*', route => route.fulfill({json: {configured: true, authenticated: true, mock: false,
    hasClientId: true, clientId: 'test', redirectUri: 'http://localhost:12321/api/drive/oauth/callback'}}))
  await page.route('**/api/drive/folders/*', route => {
    const folderId = new URL(route.request().url()).pathname.split('/').pop()!
    requestedFolders.push(folderId)
    if (folderId === 'year' && unavailable) return route.fulfill({status: 404, json: {message: 'Folder deleted'}})
    const files = folderId === 'root' ? [{id: 'movies', name: 'Кино', isFolder: true}]
      : folderId === 'movies' ? [{id: 'year', name: '2026', isFolder: true}]
      : [{id: 'movie', name: 'movie.mp4', size: 12345, isFolder: false}]
    return route.fulfill({json: {folderId, files, mock: false}})
  })
  const openDrive = async () => {
    await waitForAppShell(page)
    await dismissOnboardingIfVisible(page)
    await page.getByRole('button', {name: /^(Add media|Добавить медиа)$/}).first().click()
    const adding = page.locator('.media-adding-dialog')
    await adding.getByRole('tab', {name: /^(Sources|Источники)$/}).click()
    return adding.locator('.google-drive-source .media-folder-browser')
  }
  await page.goto('/media?mediaTypeId=1')
  let browser = await openDrive()
  await browser.locator('.v-list-item').filter({hasText: 'Кино'}).click()
  await browser.locator('.v-list-item').filter({hasText: '2026'}).click()
  await expect(browser.locator('.v-list-item').filter({hasText: 'movie.mp4'})).toBeVisible()
  await expect(browser.locator('.media-folder-browser__path')).toContainText('Кино')
  requestedFolders.length = 0
  await page.reload()
  browser = await openDrive()
  await expect(browser.locator('.v-list-item').filter({hasText: 'movie.mp4'})).toBeVisible()
  expect(requestedFolders[0]).toBe('year')
  await expect(browser.locator('.media-folder-browser__path')).toContainText('Кино')
  await expect(browser.locator('.media-folder-browser__path')).toContainText('2026')
  unavailable = true
  requestedFolders.length = 0
  await page.reload()
  browser = await openDrive()
  await expect(browser.locator('.v-list-item').filter({hasText: 'Кино'})).toBeVisible()
  expect(requestedFolders.slice(0, 2)).toEqual(['year', 'root'])
  await expect(browser.locator('.media-folder-browser__path-seg')).toHaveCount(1)
  await expect(browser.locator('.v-alert')).toHaveCount(0)
  requestedFolders.length = 0
  await page.reload()
  browser = await openDrive()
  await expect(browser.locator('.v-list-item').filter({hasText: 'Кино'})).toBeVisible()
  expect(requestedFolders[0]).toBe('root')
})

test('Google Drive adds remote selections with the shared action and keeps other source drafts', async ({page}) => {
  const imports: string[] = []
  await page.route('**/api/drive/status', route => route.fulfill({json: {configured: true, authenticated: true, mock: false, hasClientId: true, clientId: 'test', redirectUri: 'http://localhost:12321/api/drive/oauth/callback'}}))
  await page.route('**/api/drive/folders/*', route => route.fulfill({json: {folderId: 'root', mock: false, files: [
    {id: 'movie', name: 'Drive movie.mp4', mimeType: 'video/mp4', size: 12345, isFolder: false},
    {id: 'document', name: 'Notes.txt', mimeType: 'text/plain', size: 100, isFolder: false},
  ]}}))
  await page.route('**/api/drive/import', async route => {
    imports.push(route.request().postDataJSON().fileId)
    await new Promise(resolve => setTimeout(resolve, 500))
    await route.fulfill({json: {id: 100, title: 'Drive movie.mp4', created: true}})
  })
  await page.setViewportSize({width: 1440, height: 1000})
  await page.goto('/media?mediaTypeId=1')
  await waitForAppShell(page)
  await dismissOnboardingIfVisible(page)
  await page.getByRole('button', {name: /^(Add media|Добавить медиа)$/}).first().click()
  const dialog = page.locator('.media-adding-dialog')
  await dialog.getByRole('tab', {name: /^(Sources|Источники)$/}).click()
  const header = dialog.locator('.dialog-header').first()
  const add = header.getByRole('button', {name: /^(Add|Добавить)$/})
  await expect(add).toBeDisabled()
  await dialog.locator('.google-drive-source .v-list-item').filter({hasText: 'Drive movie.mp4'}).getByRole('checkbox').check()
  await expect(add).toBeEnabled()
  await dialog.getByRole('tab', {name: /^(Files|Файлы)$/}).click()
  await dialog.getByRole('tab', {name: /^(Sources|Источники)$/}).click()
  await expect(add).toBeEnabled()
  await dialog.screenshot({animations: 'disabled', path: test.info().outputPath('drive-import-desktop.png')})
  await page.setViewportSize({width: 390, height: 844})
  expect((await dialog.locator('.media-adding-dialog__tabs').boundingBox())!.height).toBeLessThanOrEqual(50)
  const dimensions = await dialog.evaluate(el => ({width: el.clientWidth, scrollWidth: el.scrollWidth}))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width)
  await dialog.screenshot({animations: 'disabled', path: test.info().outputPath('drive-import-mobile.png')})
  await add.click()
  await expect(header.getByRole('button', {name: /^(Stop|Остановить)$/})).toBeVisible()
  await expect(dialog.getByRole('tab', {name: /^(Files|Файлы)$/})).toBeDisabled()
  await expect(add).toBeVisible()
  await expect(add).toBeDisabled()
  expect(imports).toEqual(['movie'])
  await expect(dialog.locator('.google-drive-source')).toContainText(/Добавлено: 1|Added: 1/)
})

test('Sources settings contain Google authorization, SFTP credentials and the shared import browser', async ({page}) => {
  await page.route('**/api/drive/status', route => route.fulfill({json: {configured: true, authenticated: false, mock: false,
    hasClientId: true, clientId: 'test-client', redirectUri: 'http://localhost:12321/api/drive/oauth/callback'}}))
  await page.route('**/api/nas/connections', route => route.fulfill({json: [{id: '44f4a4b9-8504-42a5-a530-5b48f61c6539', name: 'My NAS', protocol: 'sftp',
    host: 'nas.invalid', port: 22, username: 'reader', root: '/video', hasCredentials: true}]}))
  await page.goto('/settings?tab=connections')
  await waitForAppShell(page)
  await dismissOnboardingIfVisible(page)
  await expect(page.locator('.settings-page')).toContainText(/Источники|Sources/)
  await expect(page.getByRole('button', {name: /Подключить Google Drive|Connect Google Drive/})).toBeVisible()
  await expect(page.locator('.google-drive-source .media-folder-browser')).toHaveCount(0)
  await page.getByRole('button', {name: /Настройка Google OAuth|Google OAuth setup/}).click()
  await expect(page.getByRole('textbox', {name: 'OAuth Client ID', exact: true})).toHaveValue('test-client')
  await expect(page.getByRole('textbox', {name: 'OAuth Client Secret', exact: true})).toHaveValue('')
  await expect(page.getByRole('textbox', {name: /Адрес возврата|Redirect URI/})).toBeVisible()
  const driveEditor = page.locator('.google-drive-source-editor')
  await expect(driveEditor).toBeVisible()
  await driveEditor.screenshot({animations: 'disabled', path: test.info().outputPath('drive-editor-desktop.png')})
  await driveEditor.getByRole('button', {name: /^(Cancel|Отмена)$/}).click()
  await expect(driveEditor).toBeHidden()
  await page.locator('.settings-page').screenshot({animations: 'disabled', path: test.info().outputPath('connections-desktop.png')})
  await page.getByRole('tab', {name: 'NAS / SFTP / FTP / WebDAV', exact: true}).click()
  await expect(page.locator('.nas-sources')).toContainText('My NAS')
  await page.locator('.nas-sources').getByRole('button', {name: /Добавить подключение|Add connection/}).click()
  await expect(page.locator('.nas-source-editor')).toBeVisible()
  await expect(page.getByRole('textbox', {name: /Адрес NAS|NAS host/})).toBeVisible()
})

test('Google connection settings open in a dialog, discard cancelled edits and preserve the saved secret', async ({page}) => {
  const redirectUri = 'http://localhost:12321/api/drive/oauth/callback'
  let status = {configured: false, authenticated: false, mock: false, hasClientId: false, clientId: '', redirectUri}
  const saved: Array<Record<string, unknown>> = []
  await page.route('**/api/drive/status*', route => route.fulfill({json: status}))
  await page.route('**/api/drive/configuration', async route => {
    const input = route.request().postDataJSON()
    saved.push(input)
    if (input.clientId === 'rejected-client') return route.fulfill({status: 400, json: {code: 'invalid_client', message: 'Invalid client'}})
    status = {...status, configured: true, hasClientId: true, clientId: input.clientId}
    await route.fulfill({json: status})
  })
  await page.goto('/media?mediaTypeId=1')
  await waitForAppShell(page)
  await dismissOnboardingIfVisible(page)
  await page.getByRole('button', {name: /^(Add media|Добавить медиа)$/}).first().click()
  const adding = page.locator('.media-adding-dialog')
  await adding.getByRole('tab', {name: /^(Sources|Источники)$/}).click()
  const source = adding.locator('.google-drive-source')
  const setup = source.getByRole('button', {name: /Настройка Google OAuth|Google OAuth setup/})
  const editor = page.locator('.google-drive-source-editor')
  const id = editor.getByRole('textbox', {name: 'OAuth Client ID', exact: true})
  const secret = editor.getByRole('textbox', {name: 'OAuth Client Secret', exact: true})
  const save = editor.getByRole('button', {name: /^(Save|Сохранить)$/})
  const cancel = editor.getByRole('button', {name: /^(Cancel|Отмена)$/})
  await expect(source.locator('.v-expansion-panels')).toHaveCount(0)
  await setup.click()
  await id.fill('cancelled-client')
  await secret.fill('cancelled-secret')
  await cancel.click()
  await setup.click()
  await expect(id).toHaveValue('')
  await expect(secret).toHaveValue('')
  expect(saved).toEqual([])
  await id.fill('saved-client')
  await secret.fill('saved-secret')
  await save.click()
  await expect(editor).toBeHidden()
  await expect(source.getByRole('button', {name: /Подключить Google Drive|Connect Google Drive/})).toBeVisible()
  expect(saved).toEqual([{clientId: 'saved-client', clientSecret: 'saved-secret', redirectUri}])
  await setup.click()
  await expect(id).toHaveValue('saved-client')
  await expect(secret).toHaveValue('')
  await id.fill('rejected-client')
  await save.click()
  await expect(editor.locator('.v-alert')).toContainText(/Client ID.*Client Secret/)
  await expect(editor).toBeVisible()
  await id.fill('saved-client')
  await save.click()
  await expect(editor).toBeHidden()
  expect(saved.at(-1)).toEqual({clientId: 'saved-client', redirectUri})
  await page.setViewportSize({width: 390, height: 844})
  const dimensions = await source.locator('.google-drive-source__connection-bar').evaluate(element => ({width: element.clientWidth, scrollWidth: element.scrollWidth}))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width)
  expect((await source.locator('.google-drive-source__connection-bar').boundingBox())!.height).toBeLessThanOrEqual(48)
  await adding.screenshot({animations: 'disabled', path: test.info().outputPath('drive-connection-mobile.png')})
  await setup.click()
  await expect(editor).toBeVisible()
  await editor.screenshot({animations: 'disabled', path: test.info().outputPath('drive-editor-mobile.png')})
})

test('Google sign-in runs in a separate window and refreshes the open adding dialog', async ({page, context}) => {
  let connected = false
  await page.route('**/api/drive/status', route => route.fulfill({json: {configured: true, authenticated: connected, mock: false,
    hasClientId: true, clientId: 'test', redirectUri: 'http://localhost:12321/api/drive/oauth/callback'}}))
  await page.route('**/api/drive/oauth/start', route => route.fulfill({json: {url: 'http://127.0.0.1:12321/oauth-test-complete'}}))
  await context.route('**/oauth-test-complete', route => {connected = true; return route.fulfill({contentType: 'text/html', body: '<p>Connected</p>'})})
  await page.route('**/api/drive/folders/*', route => route.fulfill({json: {folderId: 'root', mock: false, files: []}}))
  await page.goto('/media?mediaTypeId=1')
  await waitForAppShell(page)
  await dismissOnboardingIfVisible(page)
  await page.getByRole('button', {name: /^(Add media|Добавить медиа)$/}).first().click()
  const dialog = page.locator('.media-adding-dialog')
  await dialog.getByRole('tab', {name: /^(Sources|Источники)$/}).click()
  const popupPromise = page.waitForEvent('popup')
  await dialog.getByRole('button', {name: /Подключить Google Drive|Connect Google Drive/}).click()
  const popup = await popupPromise
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.google-drive-source')).toContainText(/Подключён|Connected/)
  await expect.poll(() => popup.isClosed()).toBe(true)
  await expect(dialog.getByRole('button', {name: /^(Отключить|Disconnect)$/})).toBeVisible()
})

test('a config refresh during Google sign-in does not cancel authorization', async ({page, context}) => {
  let connected = false
  let cancellationCount = 0
  let pendingChecks = 0
  const oauthState = 'a'.repeat(64)
  await page.route('**/api/drive/status*', route => {
    if (new URL(route.request().url()).searchParams.get('oauthState') === oauthState) pendingChecks++
    return route.fulfill({json: {configured: true, authenticated: connected, mock: false, hasClientId: true,
      clientId: 'test-client', redirectUri: 'http://localhost:12321/api/drive/oauth/callback', oauthResult: connected ? 'connected' : 'waiting'}})
  })
  await page.route('**/api/drive/oauth/start', route => route.fulfill({json: {oauthState, url: 'http://127.0.0.1:12321/oauth-consent-test'}}))
  await page.route('**/api/drive/oauth/cancel', route => { cancellationCount++; return route.fulfill({json: {ok: true}}) })
  await context.route('**/oauth-consent-test', route => route.fulfill({contentType: 'text/html', body: '<button onclick="location.href=\'/oauth-finish-test\'">Finish Google sign-in</button>'}))
  await context.route('**/oauth-finish-test', route => { connected = true; return route.fulfill({contentType: 'text/html', body: '<p>Connected</p>'}) })
  await page.goto('/settings?tab=connections')
  await waitForAppShell(page)
  await dismissOnboardingIfVisible(page)
  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('button', {name: /Подключить Google Drive|Connect Google Drive/}).click()
  const popup = await popupPromise
  await expect(popup.getByRole('button', {name: 'Finish Google sign-in'})).toBeVisible()
  // Simulate an ordinary config refresh with the library/server still unchanged.
  await page.evaluate(() => {
    const app = (document.getElementById('app') as unknown as {__vue_app__: {config: {globalProperties: {$pinia: {_s: Map<string, {config: Record<string, unknown>}>}}}}}).__vue_app__
    const store = app.config.globalProperties.$pinia._s.get('app')!
    store.config = {...store.config, seenFeatureHints: 'edit-library-nav,drag-tags-between-cards'}
  })
  await expect.poll(() => pendingChecks).toBeGreaterThan(0)
  expect(cancellationCount).toBe(0)
  await popup.getByRole('button', {name: 'Finish Google sign-in'}).click()
  await expect(page.locator('#settings-google-drive .google-drive-source')).toContainText(/Подключён|Connected/)
  await expect.poll(() => popup.isClosed()).toBe(true)
  expect(cancellationCount).toBe(0)
})

test('a Google token-exchange rejection is shown as a client error, not cancellation', async ({page, context}) => {
  let rejected = false
  const oauthState = 'b'.repeat(64)
  await page.route('**/api/drive/status*', route => route.fulfill({json: {configured: true, authenticated: false, mock: false,
    hasClientId: true, clientId: 'test-client', redirectUri: 'http://localhost:12321/api/drive/oauth/callback',
    oauthResult: rejected ? 'failed' : 'waiting', oauthError: rejected ? 'invalid_client' : undefined}}))
  await page.route('**/api/drive/oauth/start', route => route.fulfill({json: {oauthState, url: 'http://127.0.0.1:12321/oauth-rejected-test'}}))
  await context.route('**/oauth-rejected-test', route => { rejected = true; return route.fulfill({contentType: 'text/html', body: '<p>Google rejected the client</p>'}) })
  await page.goto('/settings?tab=connections')
  await waitForAppShell(page)
  await dismissOnboardingIfVisible(page)
  await page.getByRole('button', {name: /Подключить Google Drive|Connect Google Drive/}).click()
  await expect(page.locator('#settings-google-drive .v-alert')).toContainText(/Client ID.*Client Secret/)
  await expect(page.locator('#settings-google-drive .v-alert')).not.toContainText(/отменён|cancelled/)
})


test('bad OAuth credentials are reported before Google consent is opened', async ({page}) => {
  await page.route('**/api/drive/status*', route => route.fulfill({json: {configured: true, authenticated: false, mock: false,
    hasClientId: true, clientId: 'test-client', redirectUri: 'http://localhost:12321/api/drive/oauth/callback'}}))
  await page.route('**/api/drive/oauth/start', route => route.fulfill({status: 400, json: {code: 'invalid_client', message: 'Google Drive OAuth: invalid_client'}}))
  await page.goto('/settings?tab=connections')
  await waitForAppShell(page)
  await dismissOnboardingIfVisible(page)
  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('button', {name: /Подключить Google Drive|Connect Google Drive/}).click()
  const popup = await popupPromise
  await expect(page.locator('#settings-google-drive .v-alert')).toContainText(/Client ID.*Client Secret/)
  await expect.poll(() => popup.isClosed()).toBe(true)
  await expect(page.getByRole('button', {name: /Подключить Google Drive|Connect Google Drive/})).toBeEnabled()
})
