import {test, expect} from '@playwright/test'
import {disableFeatureHints, dismissOnboardingIfVisible, waitForAppShell} from './helpers'

const connection = {id: '44f4a4b9-8504-42a5-a530-5b48f61c6539', name: 'Batch NAS', protocol: 'sftp',
  host: 'test.invalid', port: 22, username: 'reader', root: '/media', hasCredentials: true, hasPassword: true, hasPrivateKey: false}

for (const provider of ['drive', 'nas'] as const) {
  test(`${provider}: recursive selection, readable exclusions and tags, failed-file retry and repeat import`, async ({page}) => {
    await disableFeatureHints(page)
    const imported = new Set(['drama/old'])
    const attempts: string[] = []
    const parsed: string[] = []
    const listed: string[] = []
    let fail = true
    const directories: Record<string, Array<{id: string; name: string; folder?: boolean}>> = {
      root: [{id: 'drama', name: 'Drama', folder: true}],
      drama: [
        {id: 'drama/first', name: 'First.mp4'}, {id: 'drama/bad', name: 'Bad.mp4'},
        {id: 'drama/last', name: 'Last.mp4'}, {id: 'drama/old', name: 'Old.mp4'},
        {id: 'drama/trailer', name: 'trailer.mp4'}, {id: 'drama/skip', name: 'Exclude', folder: true},
        {id: 'drama/sub', name: 'Sub', folder: true},
      ],
      'drama/sub': [{id: 'drama/sub/deep', name: 'Deep.mp4'}],
    }
    const nasPath = (id: string) => id.split('/').map((_, index, parts) => {
      const key = parts.slice(0, index + 1).join('/')
      return Object.values(directories).flat().find(file => file.id === key)!.name
    }).join('/')
    const driveId = (id: string) => id.replaceAll('/', '-')
    const originalId = (id: string) => Object.values(directories).flat().find(file => driveId(file.id) === id)!.id
    await page.route('**/api/Task/parsePathTags', route => {
      parsed.push(...route.request().postDataJSON().paths.map((file: {path: string}) => file.path))
      return route.fulfill({json: []})
    })
    await page.route('**/api/drive/status*', route => route.fulfill({json: {authenticated: provider === 'drive', configured: true, mock: false}}))
    await page.route('**/api/nas/connections', route => route.fulfill({json: [connection]}))
    await page.route('**/api/drive/folders/*', route => {
      const folder = new URL(route.request().url()).pathname.split('/').pop()!
      const key = folder === 'root' ? 'root' : originalId(folder)
      listed.push(key)
      return route.fulfill({json: {files: (directories[key] || []).map(file => ({
        id: driveId(file.id), name: file.name, isFolder: !!file.folder, size: 100,
        mediaId: imported.has(file.id) ? 100 : null,
      }))}})
    })
    await page.route('**/api/nas/connections/*/files*', route => {
      const relative = new URL(route.request().url()).searchParams.get('path') || ''
      const key = relative ? Object.keys(directories).find(id => id !== 'root' && nasPath(id) === relative)! : 'root'
      listed.push(key)
      return route.fulfill({json: {path: relative, truncated: false, entries: (directories[key] || []).map(file => ({
        path: nasPath(file.id), name: file.name, isDirectory: !!file.folder, size: 100, mediaId: imported.has(file.id) ? 100 : null,
      }))}})
    })
    await page.route('**/api/drive/import', route => {
      const id = originalId(route.request().postDataJSON().fileId)
      attempts.push(id)
      if (fail && id === 'drama/bad') return route.fulfill({status: 403, json: {code: 'permission_denied', message: 'Unavailable'}})
      const created = !imported.has(id); imported.add(id)
      return route.fulfill({json: {id: 101, title: nasPath(id).split('/').pop(), created}})
    })
    await page.route('**/api/nas/import-batch', route => {
      const results = (route.request().postDataJSON().paths as string[]).map(path => {
        const id = Object.values(directories).flat().find(file => nasPath(file.id) === path)!.id
        attempts.push(id)
        if (fail && id === 'drama/bad') return {path, ok: false, code: 'permission_denied', message: 'Unavailable'}
        const created = !imported.has(id); imported.add(id)
        return {path, ok: true, id: 101, title: path.split('/').pop(), created}
      })
      return route.fulfill({json: {results}})
    })
    await page.goto('/media?mediaTypeId=1')
    await waitForAppShell(page)
    await dismissOnboardingIfVisible(page)
    await page.getByRole('button', {name: /^(Add media|Добавить медиа)$/}).first().click()
    const dialog = page.locator('.media-adding-dialog')
    await dialog.getByRole('tab', {name: /^(Sources|Источники)$/}).click()
    if (provider === 'nas') await dialog.getByRole('tab', {name: 'NAS / SFTP / FTP / WebDAV', exact: true}).click()
    const source = dialog.locator(provider === 'drive' ? '.google-drive-source' : '.nas-sources')
    await dialog.getByRole('button', {name: /^(Import settings|Настройки импорта)$/}).click()
    await dialog.getByRole('checkbox', {name: /^(Exclude specific paths|Исключить определенные пути)$/}).check()
    await dialog.getByRole('textbox', {name: /Excluded paths to files or folders|Исключенные пути к файлам или папкам/}).fill('Exclude\ntrailer')
    const selectFolder = () => source.locator('.v-list-item').filter({hasText: 'Drama'}).getByRole('checkbox').check()
    await selectFolder()
    const add = dialog.locator('.dialog-header').first().getByRole('button', {name: /^(Add|Добавить)$/})
    await add.click()
    const process = page.locator('.media-adding-process')
    await expect(dialog).toBeHidden()
    const retry = process.getByRole('button', {name: /Retry remaining|Повторить оставшиеся/})
    await expect(retry).toBeVisible()
    expect(new Set(attempts)).toEqual(new Set(['drama/first', 'drama/bad', 'drama/last', 'drama/sub/deep']))
    expect(listed).not.toContain('drama/skip')
    expect(parsed.some(path => path.endsWith('/Drama/Sub/Deep.mp4'))).toBe(true)
    expect(parsed.every(path => !path.includes('gdrive://') && !path.includes('drama-'))).toBe(true)
    await expect(source.locator('.media-folder-browser__selected-count')).toHaveText(/:\s*1$/)
    fail = false
    await retry.click()
    await expect(source.locator('.media-folder-browser__selected-count')).toHaveText(/:\s*0$/)
    expect(attempts.at(-1)).toBe('drama/bad')
    expect(attempts).toHaveLength(5)
    await expect(retry).toHaveCount(0)
    await expect(process).toContainText(/Adding files is complete!|Добавление файлов завершено!/)
    await process.locator('.dialog-header__close').click()
    await page.getByRole('button', {name: /^(Add media|Добавить медиа)$/}).first().click()
    await expect(dialog).toBeVisible()
    await selectFolder()
    await add.click()
    await expect(source.locator('.media-folder-browser__selected-count')).toHaveText(/:\s*0$/)
    expect(attempts).toHaveLength(5)
    await expect(process.locator('.remote-process-counts')).toContainText(/Existing \(5\)|Существующие \(5\)|Уже есть \(5\)/)
    await page.setViewportSize({width: 390, height: 844})
    const dimensions = await process.evaluate(element => ({width: element.clientWidth, scrollWidth: element.scrollWidth}))
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width)
    await process.screenshot({animations: 'disabled', path: test.info().outputPath(`${provider}-batch-mobile.png`)})
  })
}
