import {test, expect, type Page} from '@playwright/test'
import {disableFeatureHints, dismissOnboardingIfVisible, waitForAppShell} from './helpers'
const connection = {id: '11111111-1111-4111-8111-111111111111', name: 'Studio NAS', protocol: 'sftp',
  host: 'nas.test', port: 22, username: 'reader', root: '/media', hasCredentials: true, hasPassword: true, hasPrivateKey: false,
  capabilities: {view: true, seek: true, download: true, move: false, delete: false}}
async function openSources(page: Page) {
  await page.goto('/settings?tab=connections')
  await waitForAppShell(page)
  await dismissOnboardingIfVisible(page)
}
test.beforeEach(async ({page}) => {
  await disableFeatureHints(page)
  await page.route('**/api/drive/status*', route => route.fulfill({json: {configured: true, authenticated: true, mock: false,
    hasClientId: true, clientId: 'test', redirectUri: 'http://localhost:12321/api/drive/oauth/callback'}}))
  await page.route('**/api/nas/connections', route => route.fulfill({json: [connection]}))
  await page.route('**/api/nas/connections/*/files*', route => route.fulfill({json: {path: '', entries: [], truncated: false}}))
})
for (const provider of ['drive', 'nas']) {
  test(`${provider}: network, permission and expired sign-in have distinct recovery guidance`, async ({page}) => {
    let failure = ''
    const endpoint = provider === 'drive' ? '**/api/drive/folders/*' : '**/api/nas/connections/*/files*'
    await page.route(endpoint, route => failure ? route.fulfill({status: failure === 'network_error' ? 502 : failure === 'permission_denied' ? 403 : 409,
      json: {code: failure, message: 'Remote failure'}}) : route.fulfill({json: provider === 'drive' ? {folderId: 'root', files: []} : {path: '', entries: [], truncated: false}}))
    await openSources(page)
    if (provider === 'nas') await page.getByRole('tab', {name: 'NAS / SFTP / FTP / WebDAV', exact: true}).click()
    const source = page.locator(provider === 'drive' ? '#settings-google-drive' : '#settings-nas')
    const health = source.locator('.source-health')
    const check = source.locator('[class$="__connection-actions"]').getByRole('button', {name: /^(Check connection|Проверить подключение)$/})
    await expect(health).toHaveCount(0)
    failure = 'network_error'
    await check.click()
    await expect(health).toContainText(/Cannot reach source|Нет связи с источником/)
    await expect(health).toContainText(/VPN|прокси/)
    await expect(health.getByRole('button', {name: /^(Reconnect|Подключить заново)$/})).toHaveCount(0)
    failure = 'permission_denied'
    await check.click()
    await expect(health).toContainText(/Permission denied|Недостаточно прав/)
    await expect(health).toContainText(/permission to read|чтение папки/)
    failure = 'auth_required'
    await check.click()
    await expect(health).toContainText(/Sign in again|Требуется повторный вход/)
    await expect(health.getByRole('button', {name: /^(Reconnect|Подключить заново)$/})).toBeVisible()
    failure = 'unknown'
    await check.click()
    await expect(health).toContainText(/Check failed|Не удалось проверить/)
    await expect(source.locator('.v-alert')).toContainText('Remote failure')
    await expect(health.getByRole('button', {name: /^(Reconnect|Подключить заново)$/})).toHaveCount(0)
    failure = ''
    await check.click()
    await expect(health).toHaveCount(0)
    await page.setViewportSize({width: 390, height: 844})
    const box = await source.evaluate(el => ({width: el.clientWidth, scrollWidth: el.scrollWidth}))
    expect(box.scrollWidth).toBeLessThanOrEqual(box.width)
    await source.screenshot({animations: 'disabled', path: test.info().outputPath(`${provider}-sources-mobile.png`)})
  })
}
test('Drive favorites preserve readable paths, imported-file badges and sorting after reopening', async ({page}) => {
  await page.route('**/api/drive/folders/*', route => {
    const id = new URL(route.request().url()).pathname.split('/').pop()
    return route.fulfill({json: {folderId: id, files: id === 'root' ? [{id: 'movies', name: 'Movies', isFolder: true}]
      : [{id: 'old', name: 'Already added.mp4', isFolder: false, size: 200, mediaId: 1},
        {id: 'new', name: 'New clip.mp4', isFolder: false, size: 400}]}})
  })
  await openSources(page)
  const browser = page.locator('#settings-google-drive .media-folder-browser')
  await browser.locator('.media-folder-browser__list .v-list-item').filter({hasText: 'Movies'}).click()
  const addFavorite = browser.getByRole('button', {name: /^(Add folder to favorites|Добавить папку в избранное)$/})
  await addFavorite.click()
  await expect(browser.getByRole('button', {name: /^(Remove folder from favorites|Убрать папку из избранного)$/})).toHaveAttribute('aria-pressed', 'true')
  await browser.locator('.media-folder-browser__path-seg').first().click()
  await page.reload()
  await waitForAppShell(page)
  await browser.getByRole('button', {name: /^(Open favorite folders|Открыть избранные папки)$/}).click()
  await page.getByRole('listitem').filter({hasText: 'Google Drive / Movies'}).click()
  await expect(browser.locator('.media-folder-browser__path')).toContainText('Movies')
  await expect(browser.locator('.media-folder-browser__list .v-list-item').filter({hasText: 'Already added.mp4'}).getByRole('checkbox')).toBeDisabled()
  await browser.locator('.media-folder-browser__header button').nth(1).click()
  await expect(browser.locator('.media-folder-browser__col--name.text-truncate').first()).toHaveText('New clip.mp4')
})
test('NAS credentials can be replaced, disconnected and restored without recreating the source', async ({page}) => {
  let current = {...connection}
  const saved: Array<Record<string, unknown>> = []
  await page.route('**/api/nas/connections', route => route.fulfill({json: [current]}))
  await page.route(`**/api/nas/connections/${connection.id}`, route => {
    saved.push(route.request().postDataJSON())
    current = {...current, hasCredentials: true, hasPassword: true}
    return route.fulfill({json: current})
  })
  await page.route('**/api/nas/connections/*/disconnect', route => {
    current = {...current, hasCredentials: false, hasPassword: false}
    return route.fulfill({json: {ok: true}})
  })
  await openSources(page)
  await page.getByRole('tab', {name: 'NAS / SFTP / FTP / WebDAV', exact: true}).click()
  const source = page.locator('#settings-nas')
  await source.getByRole('button', {name: /^(Credentials|Учётные данные)$/}).click()
  const editor = page.locator('.nas-source-editor')
  await editor.getByLabel(/^(Password|Пароль)$/, {exact: true}).fill('replacement')
  await editor.getByRole('button', {name: /^(Check and save|Проверить и сохранить)$/}).click()
  await expect(editor).toBeHidden()
  expect(saved[0]).toMatchObject({password: 'replacement'})
  expect(saved[0]).not.toHaveProperty('capabilities')
  await source.getByRole('button', {name: /^(Disconnect|Отключить)$/}).click()
  await expect(source.locator('.source-health')).toContainText(/Disconnected|Отключён/)
  await expect(source.locator('.media-folder-browser')).toHaveCount(0)
  await source.getByRole('button', {name: /^(Reconnect|Подключить заново)$/}).click()
  await editor.getByLabel(/^(Password|Пароль)$/, {exact: true}).fill('restored')
  await editor.getByRole('button', {name: /^(Check and save|Проверить и сохранить)$/}).click()
  await expect(source.locator('.source-health')).toHaveCount(0)
  expect(saved).toHaveLength(2)
  await expect(source.locator('.nas-sources__connection-select')).toContainText(connection.name)
})

test('remembers import and connection tabs across reopening, reloads and settings', async ({page}) => {
  await page.route('**/api/drive/folders/*', route => route.fulfill({json: {folderId: 'root', files: []}}))
  const dialog = page.locator('.media-adding-dialog')
  const sourcesTab = dialog.getByRole('tab', {name: /^(Sources|Источники)$/})
  const nasTab = dialog.getByRole('tab', {name: 'NAS / SFTP / FTP / WebDAV', exact: true})
  const linksTab = dialog.getByRole('tab', {name: /^(Links|Ссылки)$/})
  const open = async () => {
    await waitForAppShell(page)
    await dismissOnboardingIfVisible(page)
    await page.getByRole('button', {name: /^(Add media|Добавить медиа)$/}).first().click()
    await expect(dialog).toBeVisible()
  }
  const close = async () => {
    await dialog.locator('.dialog-header__close').first().click()
    await expect(dialog).toBeHidden()
  }
  await page.goto('/media?mediaTypeId=1')
  await open()
  await sourcesTab.click()
  await nasTab.click()
  await close()
  await open()
  await expect(sourcesTab).toHaveAttribute('aria-selected', 'true')
  await expect(nasTab).toHaveAttribute('aria-selected', 'true')
  await page.reload()
  await open()
  await expect(sourcesTab).toHaveAttribute('aria-selected', 'true')
  await expect(nasTab).toHaveAttribute('aria-selected', 'true')
  await linksTab.click()
  await close()
  await open()
  await expect(linksTab).toHaveAttribute('aria-selected', 'true')
  await page.reload()
  await open()
  await expect(linksTab).toHaveAttribute('aria-selected', 'true')
  await close()
  await page.goto('/settings?tab=connections')
  await expect(page.getByRole('tab', {name: 'NAS / SFTP / FTP / WebDAV', exact: true})).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', {name: /^(Cloud|Облако)$/}).click()
  await page.goto('/media?mediaTypeId=1')
  await open()
  await sourcesTab.click()
  await expect(dialog.getByRole('tab', {name: /^(Cloud|Облако)$/})).toHaveAttribute('aria-selected', 'true')
})
