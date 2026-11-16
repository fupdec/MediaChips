import {test, expect, type Page} from '@playwright/test'
import {disableFeatureHints, dismissOnboardingIfVisible, waitForAppShell, expectNoHorizontalOverflow} from './helpers'

const connection = {id: '44f4a4b9-8504-42a5-a530-5b48f61c6539', name: 'Test SFTP', protocol: 'sftp',
  host: 'test.invalid', port: 22, username: 'reader', root: '/video', hasCredentials: true}

async function openAdding(page: Page) {
  await disableFeatureHints(page)
  await page.addInitScript(() => {
    localStorage.setItem('mediachips.media-adding.source', 'local')
    localStorage.setItem('mediachips.sources.provider', 'drive')
  })
  await page.route('**/api/browse/places', route => route.fulfill({json: {container: false, places: [{id: 'home', name: 'Test files', path: '/test', icon: 'mdi-folder'}]}}))
  await page.route('**/api/browse/listDirectory', route => route.fulfill({json: {currentPath: '/test', rootPath: '/test', parentPath: null, platform: 'linux', truncated: false, entries: []}}))
  await page.route('**/api/Task/parsePathTags', route => route.fulfill({json: []}))
  await page.route('**/api/Media/get-stats', route => route.fulfill({json: {total: 0, filesize: 0}}))
  await page.route('**/api/nas/connections', route => route.fulfill({json: [connection]}))
  await page.route('**/api/nas/connections/*/files*', route => route.fulfill({json: {
    path: '', truncated: false, entries: [{name: 'movie.mp4', path: 'movie.mp4', isDirectory: false, size: 100, modifiedAt: 1000, mediaId: null}],
  }}))
  // A fresh empty library can redirect Home while the first dialog is opening.
  await page.goto('/media?mediaTypeId=1')
  await waitForAppShell(page)
  await dismissOnboardingIfVisible(page)
  await page.getByRole('button', {name: /^(Add media|Добавить медиа)$/}).first().click()
  const dialog = page.locator('.media-adding-dialog')
  await expect(dialog).toBeVisible()
  return dialog
}

async function editLocalPaths(page: Page, dialog: ReturnType<Page['locator']>) {
  await dialog.locator('.media-adding-dialog__local .media-folder-browser__selection-bar')
    .getByRole('button', {name: /^(View \/ edit selected paths|Посмотреть \/ изменить выбранные пути)$/}).click()
  const editor = page.locator('.selected-paths-dialog')
  await expect(editor).toBeVisible()
  return editor
}

test('one add action follows the source and preserves local paths and link drafts', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 1000})
  const dialog = await openAdding(page)
  const add = dialog.locator('.dialog-header').first().getByRole('button', {name: /^(Add|Добавить)$/})
  await expect(add).toBeDisabled()
  await expect(dialog.locator('.media-adding-dialog__local textarea')).toHaveCount(0)
  const editor = await editLocalPaths(page, dialog)
  const paths = editor.locator('textarea')
  await expect(paths).toBeFocused()
  await paths.fill('/test/movie.mp4')
  await expect(add).toBeDisabled()
  await editor.locator('.dialog-header__close').first().click()
  await expect(editor).toBeHidden()
  await editLocalPaths(page, dialog)
  await expect(paths).toHaveValue('')
  await paths.fill('/test/movie.mp4')
  await editor.getByRole('button', {name: /^(Save|Сохранить)$/}).click()
  await expect(editor).toBeHidden()
  await expect(dialog).toBeVisible()
  await expect(add).toBeEnabled()
  await dialog.screenshot({path: test.info().outputPath('media-adding-files-desktop.png')})
  await dialog.getByRole('tab', {name: /^(Links|Ссылки)$/}).click()
  await expect(paths).toBeHidden()
  await expect(add).toBeDisabled()
  const link = dialog.locator('.web-video-import input[type="text"]')
  await link.fill('not a link')
  await expect(add).toBeDisabled()
  await link.fill('https://xhamster.com/videos/example-video-xhAb12')
  await expect(add).toBeEnabled()
  await dialog.getByRole('tab', {name: /^(Sources|Источники)$/}).click()
  await dialog.getByRole('radio', {name: 'Network', exact: true}).click()
  await expect(add).toBeDisabled()
  await dialog.locator('.nas-sources .v-list-item').filter({hasText: 'movie.mp4'}).getByRole('checkbox').check()
  await expect(add).toBeEnabled()
  await dialog.getByRole('tab', {name: /^(Files|Файлы)$/}).click()
  await editLocalPaths(page, dialog)
  await expect(paths).toHaveValue('/test/movie.mp4')
  await editor.locator('.dialog-header__close').first().click()
  await dialog.getByRole('tab', {name: /^(Links|Ссылки)$/}).click()
  await expect(link).toHaveValue('https://xhamster.com/videos/example-video-xhAb12')
  await expect(dialog.getByRole('checkbox', {name: /Parse tags|Парсить теги/})).toBeVisible()
  await expect(dialog.getByRole('button', {name: /^(Import settings|Настройки импорта)$/})).toBeHidden()
  await dialog.screenshot({path: test.info().outputPath('media-adding-links-desktop.png')})
  await page.setViewportSize({width: 390, height: 844})
  await expect(add).toBeVisible()
  expect((await dialog.locator('.media-adding-dialog__tabs').boundingBox())!.height).toBeLessThanOrEqual(50)
  const dimensions = await dialog.evaluate(el => ({width: el.clientWidth, scrollWidth: el.scrollWidth}))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width)
  await dialog.screenshot({path: test.info().outputPath('media-adding-links-mobile.png')})
})

test('links use the common process window with progress and results', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 1000})
  const imported: string[] = []
  await page.route('**/api/web-video/import', async route => {
    imported.push(route.request().postDataJSON().url)
    await new Promise(resolve => setTimeout(resolve, 700))
    await route.fulfill({json: {id: 1, title: 'Test video', created: true}})
  })
  const dialog = await openAdding(page)
  await dialog.getByRole('tab', {name: /^(Links|Ссылки)$/}).click()
  const link = dialog.locator('.web-video-import input[type="text"]')
  await link.fill('https://xhamster.com/videos/example-video-xhAb12')
  await dialog.locator('.dialog-header').first().getByRole('button', {name: /^(Add|Добавить)$/}).click()
  const process = page.locator('.media-adding-process')
  await expect(dialog).toBeHidden()
  await expect(process).toBeVisible()
  await expect(process.locator('.process-percents')).toHaveText('100 %')
  expect(imported).toEqual(['https://xhamster.com/videos/example-video-xhAb12'])
  await expect(process.getByRole('tab', {name: /^(Added|Добавлено)/}).locator('.v-badge__badge')).toHaveText('1')
  await expect(link).toHaveValue('')
})

test('SFTP uses the same process window and stop action as local files', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 1000})
  const imported: string[][] = []
  await page.route('**/api/nas/import-batch', async route => {
    const paths = route.request().postDataJSON().paths as string[]
    imported.push(paths)
    await new Promise(resolve => setTimeout(resolve, 700))
    await route.fulfill({json: {results: paths.map(path => ({path, ok: true, id: 1, title: path, created: true}))}})
  })
  const dialog = await openAdding(page)
  await dialog.getByRole('tab', {name: /^(Sources|Источники)$/}).click()
  await dialog.getByRole('radio', {name: 'Network', exact: true}).click()
  await dialog.locator('.nas-sources .v-list-item').filter({hasText: 'movie.mp4'}).getByRole('checkbox').check()
  const header = dialog.locator('.dialog-header').first()
  await header.getByRole('button', {name: /^(Add|Добавить)$/}).click()
  const process = page.locator('.media-adding-process')
  await expect(dialog).toBeHidden()
  await expect(process).toBeVisible()
  await expect(process.getByRole('button', {name: /^(Stop|Остановить)$/})).toBeVisible()
  await expect(process.locator('.process-percents')).toHaveText('100 %')
  expect(imported).toEqual([['movie.mp4']])
  await expect(process.getByRole('button', {name: /^(Stop|Остановить)$/})).toHaveCount(0)
  await process.screenshot({path: test.info().outputPath('media-adding-sftp-process-desktop.png')})
})

test('shared add starts local import with only the selected media type', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 1000})
  const imports: Array<{roots: string[]; type: {id: number}}> = []
  await page.route('**/api/Task/addMediaBulk', async route => {
    imports.push(route.request().postDataJSON())
    await route.fulfill({json: {scanned: 0, inserted: 0, skipped: 0, errors: []}})
  })
  const dialog = await openAdding(page)
  const typesButton = dialog.locator('.media-adding-types:visible')
  await typesButton.click()
  const types = page.locator('.media-adding-types__menu:visible')
  const video = types.getByRole('checkbox', {name: /^(Videos|Видео)$/})
  // locator.all() does not wait: let the menu render before collecting the other types.
  await expect(video).toBeVisible()
  for (const other of await types.getByRole('checkbox', {name: /^(?!(?:Videos|Видео)$).+/}).all()) {
    await other.uncheck()
  }
  await expect(video).toBeChecked()
  await expect(video).toBeDisabled()
  await page.keyboard.press('Escape')
  const editor = await editLocalPaths(page, dialog)
  await editor.locator('textarea').fill('/test/media')
  await editor.getByRole('button', {name: /^(Save|Сохранить)$/}).click()
  await dialog.getByRole('button', {name: /^(Import settings|Настройки импорта)$/}).click()
  const settings = page.locator('.v-overlay--active .v-card:not(.media-adding-dialog)').filter({hasText: /Import settings|Настройки импорта/})
  await settings.getByRole('checkbox', {name: /^(Fast import|Быстрый импорт)/}).check()
  await settings.locator('.dialog-header__close').first().click()
  await expect(settings).toBeHidden()
  await dialog.locator('.dialog-header').first().getByRole('button', {name: /^(Add|Добавить)$/}).click()
  await expect(dialog).toBeHidden()
  await expect.poll(() => imports.length).toBe(1)
  await expect(page.locator('.process-dialog-body')).toBeVisible()
  expect(imports[0].roots).toEqual(['/test/media'])
  await expect.poll(() => page.locator('.process-percents').textContent()).toBe('100 %')
  expect(imports).toHaveLength(1)
})


test('shares media types and import settings across local, Drive, NAS and links', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 1000})
  await page.route('**/api/drive/status*', route => route.fulfill({json: {configured: true, authenticated: true, mock: false}}))
  await page.route('**/api/drive/folders/*', route => route.fulfill({json: {files: [
    {id: 'movie-id', name: 'movie.mp4', isFolder: false, size: 100},
    {id: 'image-id', name: 'photo.jpg', isFolder: false, size: 100},
  ]}}))
  const dialog = await openAdding(page)
  const settingsName = /^(Import settings|Настройки импорта)$/
  const parseTagsName = /Parse tags|Парсить теги/
  // Import settings open in their own dialog (an overlay outside the adding dialog).
  const openSettings = async () => {
    await dialog.getByRole('button', {name: settingsName}).click()
    const settings = page.locator('.v-overlay--active .v-card:not(.media-adding-dialog)').filter({has: page.locator('.dialog-header', {hasText: /Import settings|Настройки импорта/})})
    await expect(settings).toBeVisible()
    return settings
  }
  const closeSettings = async (settings: ReturnType<Page['locator']>) => {
    await settings.locator('.dialog-header__close').first().click()
    await expect(settings).toBeHidden()
  }
  await dialog.locator('.media-adding-types:visible').click()
  const types = page.locator('.media-adding-types__menu:visible')
  await types.getByRole('checkbox', {name: /^(Images|Изображения)$/}).uncheck()
  await expect(types.getByRole('checkbox', {name: /^(Videos|Видео)$/})).toBeChecked()
  await page.keyboard.press('Escape')
  await expect(types).toBeHidden()

  let settings = await openSettings()
  await settings.getByRole('checkbox', {name: parseTagsName}).uncheck()
  await closeSettings(settings)

  await dialog.getByRole('tab', {name: /^(Sources|Источники)$/}).click()
  const drive = dialog.locator('.google-drive-source .media-folder-browser')
  await expect(drive.locator('.v-list-item').filter({hasText: 'movie.mp4'}).getByRole('checkbox')).toBeEnabled()
  await expect(drive.locator('.v-list-item').filter({hasText: 'photo.jpg'}).getByRole('checkbox')).toBeDisabled()
  settings = await openSettings()
  await expect(settings.getByRole('checkbox', {name: parseTagsName})).not.toBeChecked()
  await closeSettings(settings)
  await dialog.screenshot({animations: 'disabled', path: test.info().outputPath('unified-import-drive-desktop.png')})

  await dialog.getByRole('radio', {name: 'Network', exact: true}).click()
  await expect(dialog.locator('.nas-sources .media-folder-browser')).toBeVisible()
  settings = await openSettings()
  await expect(settings.getByRole('checkbox', {name: parseTagsName})).not.toBeChecked()
  await closeSettings(settings)
  await page.setViewportSize({width: 390, height: 844})
  const dimensions = await dialog.evaluate(el => ({width: el.clientWidth, scrollWidth: el.scrollWidth}))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width)
  await dialog.screenshot({animations: 'disabled', path: test.info().outputPath('unified-import-nas-mobile.png')})

  await dialog.getByRole('tab', {name: /^(Links|Ссылки)$/}).click()
  await expect(dialog.locator('.web-video-import').getByRole('checkbox', {name: parseTagsName})).not.toBeChecked()

  await dialog.getByRole('tab', {name: /^(Files|Файлы)$/}).click()
  await dialog.locator('.media-adding-types:visible').click()
  await expect(page.locator('.media-adding-types__menu:visible').getByRole('checkbox', {name: /^(Images|Изображения)$/})).not.toBeChecked()
})


test('hiding a network process keeps it running; Stop finishes the batch and Retry imports only the rest', async ({page}) => {
  const dialog = await openAdding(page)
  await page.route('**/api/nas/connections/*/files*', route => route.fulfill({json: {path: '', entries:
    Array.from({length: 12}, (_, index) => ({name: `clip-${index}.mp4`, path: `clip-${index}.mp4`, isDirectory: false, size: 100})),
    truncated: false}}))
  const imported: string[][] = []
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/nas/import-batch', async route => {
    const paths = route.request().postDataJSON().paths as string[]
    imported.push(paths)
    if (imported.length === 1) await pending
    await route.fulfill({json: {results: paths.map(path => ({path, ok: true, id: 100 + Number(path.match(/\d+/)![0]), title: path, created: true}))}})
  })
  await dialog.getByRole('tab', {name: /^(Sources|Источники)$/}).click()
  await dialog.getByRole('radio', {name: 'Network', exact: true}).click()
  await dialog.locator('.nas-sources .media-folder-browser__selection-bar').getByRole('button', {name: /^(Select all|Выбрать все)$/}).click()
  await dialog.locator('.dialog-header').first().getByRole('button', {name: /^(Add|Добавить)$/}).click()
  const process = page.locator('.media-adding-process')
  await expect.poll(() => imported.length).toBe(1)
  await expect(process).toBeVisible()
  await process.locator('.dialog-header__close').click()
  await expect(process).toHaveCount(0)
  await page.getByRole('button', {name: /^(Add media|Добавить медиа)$/}).first().click()
  await expect(process).toBeVisible()
  await expect(dialog).toBeHidden()
  await process.getByRole('button', {name: /^(Stop|Остановить)$/}).click()
  await expect(process).toContainText(/Stopping after|Остановка после/)
  release()
  const retry = process.getByRole('button', {name: /Retry remaining|Повторить оставшиеся/})
  await expect(retry).toBeVisible()
  await expect(process).toContainText(/Adding files stopped|Добавление файлов остановлено/)
  await expect(process.locator('.process-percents')).not.toHaveText('100 %')
  expect(imported).toHaveLength(1)
  expect(imported[0]).toHaveLength(10)
  await page.setViewportSize({width: 390, height: 844})
  await expectNoHorizontalOverflow(process)
  await expect(page.locator('.notifications-pool .task-summary')).toHaveCount(0)
  await expect(page.locator('.notifications-pool .notification')).toHaveCount(0)
  await process.screenshot({path: test.info().outputPath('network-process-stopped-mobile.png')})
  await retry.click()
  await expect(process.locator('.process-percents')).toHaveText('100 %')
  await expect(retry).toHaveCount(0)
  expect(imported).toHaveLength(2)
  expect(imported[1]).toHaveLength(2)
  expect(new Set(imported.flat()).size).toBe(12)
})
