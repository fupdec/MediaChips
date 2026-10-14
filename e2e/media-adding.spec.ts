import {test, expect, type Page} from '@playwright/test'
import {disableFeatureHints, dismissOnboardingIfVisible, waitForAppShell} from './helpers'

const connection = {id: '44f4a4b9-8504-42a5-a530-5b48f61c6539', name: 'Test SFTP', protocol: 'sftp',
  host: 'test.invalid', port: 22, username: 'reader', root: '/video', hasCredentials: true}

async function openAdding(page: Page) {
  await disableFeatureHints(page)
  await page.route('**/api/browse/places', route => route.fulfill({json: {container: false, places: [{id: 'home', name: 'Test files', path: '/test', icon: 'mdi-folder'}]}}))
  await page.route('**/api/browse/listDirectory', route => route.fulfill({json: {currentPath: '/test', rootPath: '/test', parentPath: null, platform: 'linux', truncated: false, entries: []}}))
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
  await editor.getByRole('button', {name: /^(Cancel|Отмена)$/}).click()
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
  const link = dialog.locator('.web-video-import input')
  await link.fill('https://invalid.example/video')
  await expect(add).toBeDisabled()
  await link.fill('https://xhamster.com/videos/example-video-xhAb12')
  await expect(add).toBeEnabled()
  await dialog.getByRole('tab', {name: 'SFTP / NAS'}).click()
  await expect(add).toBeDisabled()
  await dialog.locator('.nas-sources .v-list-item').filter({hasText: 'movie.mp4'}).getByRole('checkbox').check()
  await expect(add).toBeEnabled()
  await dialog.getByRole('tab', {name: /^(Files|Файлы)$/}).click()
  await editLocalPaths(page, dialog)
  await expect(paths).toHaveValue('/test/movie.mp4')
  await editor.getByRole('button', {name: /^(Cancel|Отмена)$/}).click()
  await dialog.getByRole('tab', {name: /^(Links|Ссылки)$/}).click()
  await expect(link).toHaveValue('https://xhamster.com/videos/example-video-xhAb12')
  await dialog.screenshot({path: test.info().outputPath('media-adding-links-desktop.png')})
  await page.setViewportSize({width: 390, height: 844})
  await expect(add).toBeVisible()
  expect((await dialog.locator('.media-adding-dialog__tabs').boundingBox())!.height).toBeLessThanOrEqual(50)
  const dimensions = await dialog.evaluate(el => ({width: el.clientWidth, scrollWidth: el.scrollWidth}))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width)
  await dialog.screenshot({path: test.info().outputPath('media-adding-links-mobile.png')})
})

test('shared add imports only the active link and blocks source changes while working', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 1000})
  const imported: string[] = []
  await page.route('**/api/web-video/import', async route => {
    imported.push(route.request().postDataJSON().url)
    await new Promise(resolve => setTimeout(resolve, 700))
    await route.fulfill({json: {id: 1, title: 'Test video', created: true}})
  })
  const dialog = await openAdding(page)
  await dialog.getByRole('tab', {name: /^(Links|Ссылки)$/}).click()
  const link = dialog.locator('.web-video-import input')
  await link.fill('https://xhamster.com/videos/example-video-xhAb12')
  await dialog.locator('.dialog-header').first().getByRole('button', {name: /^(Add|Добавить)$/}).click()
  await expect(dialog.getByRole('tab', {name: 'SFTP / NAS'})).toBeDisabled()
  await expect(link).toHaveValue('')
  expect(imported).toEqual(['https://xhamster.com/videos/example-video-xhAb12'])
  await expect(dialog.locator('.web-video-import__notice')).toContainText('Test video')
  await expect(dialog.getByRole('tab', {name: 'SFTP / NAS'})).toBeEnabled()
})

test('shared add imports SFTP selection and shows stop in the same header', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 1000})
  const imported: string[][] = []
  await page.route('**/api/nas/import-batch', async route => {
    const paths = route.request().postDataJSON().paths as string[]
    imported.push(paths)
    await new Promise(resolve => setTimeout(resolve, 700))
    await route.fulfill({json: {results: paths.map(path => ({path, ok: true, id: 1, title: path, created: true}))}})
  })
  const dialog = await openAdding(page)
  await dialog.getByRole('tab', {name: 'SFTP / NAS'}).click()
  await dialog.locator('.nas-sources .v-list-item').filter({hasText: 'movie.mp4'}).getByRole('checkbox').check()
  const header = dialog.locator('.dialog-header').first()
  await header.getByRole('button', {name: /^(Add|Добавить)$/}).click()
  await expect(header.getByRole('button', {name: /^(Stop|Остановить)$/})).toBeVisible()
  await expect(dialog.getByRole('tab', {name: /^(Files|Файлы)$/})).toBeDisabled()
  await expect(header.getByRole('button', {name: /^(Add|Добавить)$/})).toBeVisible()
  expect(imported).toEqual([['movie.mp4']])
  await expect(header.getByRole('button', {name: /^(Add|Добавить)$/})).toBeDisabled()
  await dialog.screenshot({path: test.info().outputPath('media-adding-sftp-desktop.png')})
})

test('shared add starts local import with only the selected media type', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 1000})
  const imports: Array<{roots: string[]; type: {id: number}}> = []
  await page.route('**/api/Task/addMediaBulk', async route => {
    imports.push(route.request().postDataJSON())
    await route.fulfill({json: {scanned: 0, inserted: 0, skipped: 0, errors: []}})
  })
  const dialog = await openAdding(page)
  await expect(dialog.locator('.media-adding-types .v-chip')).not.toHaveCount(0)
  await dialog.locator('.media-adding-types .v-chip').first().click()
  const editor = await editLocalPaths(page, dialog)
  await editor.locator('textarea').fill('/test/media')
  await editor.getByRole('button', {name: /^(Save|Сохранить)$/}).click()
  await dialog.getByRole('button', {name: /^(Import settings|Настройки импорта)$/}).click()
  await dialog.getByRole('checkbox', {name: /^(Fast import|Быстрый импорт)/}).check()
  await dialog.locator('.dialog-header').first().getByRole('button', {name: /^(Add|Добавить)$/}).click()
  await expect(dialog).toBeHidden()
  await expect.poll(() => imports.length).toBe(1)
  await expect(page.locator('.process-dialog-body')).toBeVisible()
  expect(imports[0].roots).toEqual(['/test/media'])
  await expect.poll(() => page.locator('.process-percents').textContent()).toBe('100 %')
  expect(imports).toHaveLength(1)
})
