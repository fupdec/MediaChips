import {test, expect, type Page} from '@playwright/test'
import {openSettingsTab} from './helpers'
import type {NasEntry} from '../shared/nas'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'

const connection = {id: '44f4a4b9-8504-42a5-a530-5b48f61c6539', name: 'Browser test NAS', protocol: 'sftp',
  host: 'test.invalid', port: 22, username: 'reader', root: '/video', hasCredentials: true, hasPassword: true, hasPrivateKey: false}
const file = (path: string, size = 100): NasEntry => ({name: path.split('/').pop()!, path, isDirectory: false, size, modifiedAt: 1000})
const folder = (path: string): NasEntry => ({...file(path), isDirectory: true})

async function setup(page: Page, directories: Record<string, NasEntry[]>, delayBatch = false, availableConnections = [connection]) {
  await page.route('**/api/Task/parsePathTags', route => route.fulfill({json: []}))
  const imported = new Set(['old.mp4'])
  const batches: string[][] = []
  await page.route('**/api/nas/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/connections')) return route.fulfill({json: availableConnections})
    if (url.pathname.endsWith('/files')) {
      const path = url.searchParams.get('path') || ''
      return route.fulfill({json: {path, truncated: false, entries: (directories[path] || []).map(entry => ({
        ...entry, mediaId: imported.has(entry.path) ? 1 : null,
      }))}})
    }
    if (url.pathname.endsWith('/import-batch')) {
      const paths = route.request().postDataJSON().paths as string[]
      batches.push(paths)
      if (delayBatch) await new Promise(resolve => setTimeout(resolve, 500))
      paths.forEach(path => imported.add(path))
      return route.fulfill({json: {results: paths.map(path => ({path, ok: true, id: 1, title: path, created: true}))}})
    }
    throw new Error(`Unexpected NAS request: ${url.pathname}`)
  })
  await page.route('**/api/Media/get-stats', route => route.fulfill({json: {total: 0, filesize: 0}}))
  await openSettingsTab(page, 'settings-doc-tab-connections')
  await page.getByRole('tab', {name: 'NAS / SFTP / FTP / WebDAV', exact: true}).click()
  const browser = page.locator('#settings-nas .media-folder-browser')
  await expect(browser.locator('.media-folder-browser__header')).toBeVisible()
  return {browser, batches}
}

test('editing NAS credentials shows saved status, preserves an untouched password and reveals a replacement', async ({page}) => {
  await setup(page, {'': [file('video.mp4')]})
  const updates: Record<string, unknown>[] = []
  await page.route(`**/api/nas/connections/${connection.id}`, async route => {
    updates.push(route.request().postDataJSON())
    return route.fulfill({json: {...connection, name: updates.at(-1)!.name}})
  })
  const editor = page.locator('.nas-source-editor')
  const password = editor.getByLabel(/^(Password|Пароль)$/, {exact: true})
  const openEditor = () => page.getByRole('button', {name: /^(Credentials|Учётные данные)$/}).click()
  const save = () => editor.locator('.dialog-header').getByRole('button', {name: /^(Check and save|Проверить и сохранить)$/}).click()
  await openEditor()
  await expect(editor.getByText(/^(Password saved\.|Пароль сохранён\.)/)).toBeVisible()
  await expect(password).toHaveValue('')
  await expect(editor.getByRole('button', {name: /^(Show entered password|Показать введённый пароль)$/})).toBeDisabled()
  await editor.getByLabel(/^(Name|Название)$/, {exact: true}).fill('Renamed NAS')
  await save()
  await expect(editor).toBeHidden()
  expect(updates[0]).toMatchObject({name: 'Renamed NAS'})
  for (const field of ['password', 'privateKey', 'passphrase', 'hasPassword', 'hasPrivateKey']) expect(updates[0]).not.toHaveProperty(field)

  await openEditor()
  await password.fill('replacement-secret')
  await expect(password).toHaveAttribute('type', 'password')
  await editor.getByRole('button', {name: /^(Show entered password|Показать введённый пароль)$/}).click()
  await expect(password).toHaveAttribute('type', 'text')
  await expect(password).toHaveValue('replacement-secret')
  await editor.getByRole('button', {name: /^(Hide entered password|Скрыть введённый пароль)$/}).click()
  await expect(password).toHaveAttribute('type', 'password')
  await password.fill('')
  await save()
  await expect(editor).toBeHidden()
  expect(updates[1]).not.toHaveProperty('password')

  await openEditor()
  await password.fill('replacement-secret')
  await save()
  await expect(editor).toBeHidden()
  expect(updates[2]).toMatchObject({password: 'replacement-secret'})
  await openEditor()
  await expect(password).toHaveValue('')
  await expect(password).toHaveAttribute('type', 'password')
})

test('remembers the last NAS connection and each connection folder after reopening', async ({page}) => {
  const secondConnection = {...connection, id: 'e3974abd-f411-44f6-a522-2b2a2a917fe9', name: 'Second NAS'}
  const {browser} = await setup(page, {'': [folder('Кино'), folder('Сериалы')],
    'Кино': [file('Кино/movie.mp4')], 'Сериалы': [file('Сериалы/episode.mp4')]}, false, [connection, secondConnection])
  await browser.locator('.v-list-item').filter({hasText: 'Кино'}).click()
  await expect(browser.getByText('movie.mp4', {exact: true})).toBeVisible()
  const select = page.locator('.nas-sources__connection-select')
  await select.click()
  await page.getByRole('option', {name: 'Second NAS', exact: true}).click()
  await browser.locator('.v-list-item').filter({hasText: 'Сериалы'}).click()
  await expect(browser.getByText('episode.mp4', {exact: true})).toBeVisible()

  await page.reload()
  await openSettingsTab(page, 'settings-doc-tab-connections')
  await page.getByRole('tab', {name: 'NAS / SFTP / FTP / WebDAV', exact: true}).click()
  await expect(select).toContainText('Second NAS')
  await expect(browser.getByText('episode.mp4', {exact: true})).toBeVisible()
  await select.click()
  await page.getByRole('option', {name: 'Browser test NAS', exact: true}).click()
  await expect(browser.getByText('movie.mp4', {exact: true})).toBeVisible()
  await expect(page.locator('.v-menu .v-overlay__content')).toBeHidden()
  await select.locator('input').blur()
  await page.locator('.nas-sources').screenshot({path: test.info().outputPath('sftp-block-desktop.png')})

  await page.getByRole('button', {name: /^(Credentials|Учётные данные)$/}).click()
  await expect(page.locator('.nas-source-editor')).toBeVisible()
  await page.locator('.nas-source-editor').screenshot({path: test.info().outputPath('sftp-editor-desktop.png')})
  await page.setViewportSize({width: 390, height: 844})
  await page.locator('.nas-source-editor').screenshot({path: test.info().outputPath('sftp-editor-mobile.png')})
  await page.getByRole('button', {name: /^(Cancel|Отмена)$/}).click()
  await expect(page.locator('.nas-source-editor')).toBeHidden()
  const block = page.locator('.nas-sources')
  const dimensions = await block.evaluate(element => ({width: element.clientWidth, scrollWidth: element.scrollWidth}))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width)
  await block.screenshot({path: test.info().outputPath('sftp-block-mobile.png')})
})

test('SFTP uses the local browser navigation, sorting, filters and persistent selection', async ({page}) => {
  const {browser} = await setup(page, {'': [folder('Кино'), file('clip2.mp4', 100), file('clip10.mp4', 300),
    file('old.mp4'), file('notes.txt'), file('.hidden.mp4')], 'Кино': [file('Кино/sub.mp4')]})
  const rows = browser.locator('.media-folder-browser__list .v-list-item')
  await expect(rows).toHaveCount(5)
  await expect(rows.filter({hasText: 'old.mp4'}).getByRole('checkbox')).toBeDisabled()
  await expect(rows.filter({hasText: 'notes.txt'}).getByRole('checkbox')).toBeDisabled()
  await rows.filter({hasText: 'clip2.mp4'}).getByRole('checkbox').check()
  await rows.filter({hasText: 'Кино'}).click()
  await expect(rows.filter({hasText: 'sub.mp4'})).toBeVisible()
  await rows.filter({hasText: 'sub.mp4'}).getByRole('checkbox').check()
  const nav = browser.locator('.media-folder-browser__nav-cluster button')
  await nav.nth(0).click()
  await expect(rows.filter({hasText: 'clip2.mp4'}).getByRole('checkbox')).toBeChecked()
  await expect(browser.locator('.media-folder-browser__selected-count')).toContainText('2')
  await nav.nth(1).click()
  await expect(rows.filter({hasText: 'sub.mp4'}).getByRole('checkbox')).toBeChecked()
  await nav.nth(2).click()
  await expect(rows).toHaveCount(5)
  await browser.locator('.media-folder-browser__header button').nth(1).click()
  await expect(browser.locator('.media-folder-browser__col--name.text-truncate').nth(1)).toHaveText('clip10.mp4')
  await browser.locator('button').filter({has: page.locator('.mdi-eye-outline')}).click()
  const menu = page.locator('.media-folder-browser__view-menu')
  await menu.getByText(/^(Show hidden files|Показать скрытые файлы)$/).click()
  await expect(rows.filter({hasText: '.hidden.mp4'})).toBeVisible()
  await menu.getByText(/^(Hide already in library|Скрыть уже в библиотеке)$/).click()
  await expect(rows.filter({hasText: 'old.mp4'})).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await browser.screenshot({path: test.info().outputPath('sftp-browser.png')})
})

test('selecting an SFTP folder imports nested videos once and updates library badges', async ({page}) => {
  const {browser, batches} = await setup(page, {'': [folder('Кино'), file('root.mp4')],
    'Кино': [folder('Кино/sub'), file('Кино/1.mp4')], 'Кино/sub': [file('Кино/sub/2.mp4')]})
  await browser.locator('.v-list-item').filter({hasText: 'Кино'}).getByRole('checkbox').check()
  await page.getByRole('button', {name: /^(Add selected|Добавить выбранные)$/}).click()
  await expect.poll(() => batches.flat()).toEqual(['Кино/1.mp4', 'Кино/sub/2.mp4'])
  await expect(page.locator('.remote-import-progress .v-progress-linear')).toBeHidden()
  await expect(browser.locator('.media-folder-browser__selected-count')).toHaveText(/:\s*0$/)
  await browser.locator('.v-list-item').filter({hasText: 'Кино'}).click()
  await expect(browser.locator('.v-list-item').filter({hasText: '1.mp4'}).getByRole('checkbox')).toBeDisabled()
})

test('Stop finishes the active SFTP batch and retains unprocessed selections', async ({page}) => {
  const {browser, batches} = await setup(page, {'': Array.from({length: 13}, (_, i) => file(`clip${i}.mp4`))}, true)
  await page.getByRole('button', {name: /^(Select all|Выбрать все)$/}).click()
  await page.getByRole('button', {name: /^(Add selected|Добавить выбранные)$/}).click()
  await expect.poll(() => batches.length).toBe(1)
  await page.getByRole('button', {name: /^(Stop|Остановить)$/}).click()
  await expect(page.locator('.remote-import-progress .v-progress-linear')).toBeHidden()
  expect(batches).toHaveLength(1)
  await expect(browser.locator('.media-folder-browser__selected-count')).toHaveText(/:\s*3$/)
  await page.getByRole('button', {name: /^(Add selected|Добавить выбранные)$/}).click()
  await expect.poll(() => batches.flat().length).toBe(13)
  await expect(browser.locator('.media-folder-browser__selected-count')).toHaveText(/:\s*0$/)
})

test('bottom selection bar selects visible entries, edits paths across folders and clears everything', async ({page}) => {
  const {browser} = await setup(page, {'': [folder('Кино'), file('clip.mp4'), file('old.mp4'), file('notes.txt'), file('.hidden.mp4')],
    'Кино': [file('Кино/sub.mp4')]})
  const bar = browser.locator('.media-folder-browser__selection-bar')
  const rows = browser.locator('.media-folder-browser__list .v-list-item')
  const edit = bar.getByRole('button', {name: /^(View \/ edit selected paths|Посмотреть \/ изменить выбранные пути)$/})
  const clear = bar.getByRole('button', {name: /^(Clear selection|Сбросить выбор)$/})
  const selectAll = bar.getByRole('button', {name: /^(Select all|Выбрать все)$/})
  const selectionDialog = page.locator('.selected-paths-dialog')
  const editor = selectionDialog.locator('textarea')
  const save = selectionDialog.getByRole('button', {name: /^(Save|Сохранить)$/})
  const cancel = selectionDialog.getByRole('button', {name: /^(Cancel|Отмена)$/})
  await expect(clear).toBeDisabled()
  await expect(editor).toBeHidden()
  await rows.filter({hasText: 'Кино'}).click()
  await rows.filter({hasText: 'sub.mp4'}).getByRole('checkbox').check()
  await browser.locator('.media-folder-browser__nav-cluster button').nth(0).click()
  await selectAll.click()
  await expect(bar).toContainText('3')
  await expect(selectAll).toBeDisabled()
  await expect(rows.filter({hasText: 'old.mp4'}).getByRole('checkbox')).not.toBeChecked()
  await expect(rows.filter({hasText: 'notes.txt'}).getByRole('checkbox')).not.toBeChecked()
  const listBounds = (await browser.locator('.media-folder-browser__list').boundingBox())!
  expect((await bar.boundingBox())!.y).toBeGreaterThanOrEqual(listBounds.y + listBounds.height)
  await edit.click()
  await expect(selectionDialog).toBeVisible()
  await expect(editor).toBeFocused()
  await expect(editor).toHaveValue('/video/clip.mp4\n/video/Кино\n/video/Кино/sub.mp4')
  await editor.fill('')
  await expect(bar).toContainText('3')
  await cancel.click()
  await expect(selectionDialog).toBeHidden()
  await edit.click()
  await expect(editor).toHaveValue('/video/clip.mp4\n/video/Кино\n/video/Кино/sub.mp4')
  await editor.fill('/video/Кино/sub.mp4\n/video/clip.mp4\n/video/clip.mp4\n')
  await expect(bar).toContainText('3')
  await expect(editor).toHaveValue('/video/Кино/sub.mp4\n/video/clip.mp4\n/video/clip.mp4\n')
  await save.click()
  await expect(selectionDialog).toBeHidden()
  await expect(bar).toContainText('2')
  await expect(rows.filter({hasText: 'Кино'}).getByRole('checkbox')).not.toBeChecked()
  await expect(rows.filter({hasText: 'clip.mp4'}).getByRole('checkbox')).toBeChecked()
  await edit.click()
  await expect(editor).toHaveValue('/video/clip.mp4\n/video/Кино/sub.mp4')
  await page.keyboard.press('Escape')
  await expect(editor).toBeHidden()
  await clear.click()
  await expect(bar).toContainText('0')
  await rows.filter({hasText: 'Кино'}).click()
  await expect(rows.filter({hasText: 'sub.mp4'}).getByRole('checkbox')).not.toBeChecked()
  await edit.click()
  await expect(editor).toHaveValue('')
  await page.setViewportSize({width: 390, height: 844})
  const dimensions = await selectionDialog.evaluate(element => ({width: element.clientWidth, scrollWidth: element.scrollWidth}))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width)
  await selectionDialog.screenshot({path: test.info().outputPath('selected-paths-dialog-mobile.png')})
  await save.click()
  await expect(selectionDialog).toBeHidden()
  await browser.screenshot({path: test.info().outputPath('selection-bar-mobile.png')})
})

test('the shared SFTP browser fits a phone screen and cannot navigate above its root', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844})
  const {browser} = await setup(page, {'': [folder('Кино'), file('long-video-name.mp4')], 'Кино': [file('Кино/1.mp4')]})
  const nav = browser.locator('.media-folder-browser__nav-cluster button')
  await expect(nav.nth(2)).toBeDisabled()
  await browser.locator('.v-list-item').filter({hasText: 'Кино'}).click()
  await expect(browser.locator('.v-list-item').filter({hasText: '1.mp4'})).toBeVisible()
  await browser.locator('.media-folder-browser__path-seg').first().click()
  await expect(nav.nth(2)).toBeDisabled()
  const dimensions = await browser.evaluate(element => ({width: element.clientWidth, scrollWidth: element.scrollWidth}))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width)
  await browser.screenshot({path: test.info().outputPath('sftp-browser-mobile.png')})
})

test('plays new and imported remote files without importing or writing library data', async ({page}) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-nas-preview-'))
  try {
    const fixture = path.join(directory, 'preview.mp4')
    execFileSync(ffmpegPath!, ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64:d=2',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', fixture], {stdio: 'ignore'})
    const bytes = fs.readFileSync(fixture)
    const {browser, batches} = await setup(page, {'': [file('new.mp4'), file('old.mp4')]})
    const prepared: string[] = []
    const writes: string[] = []
    page.on('request', request => {
      const url = new URL(request.url())
      if (url.pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())
        && /\/(nas\/import|Media|Mark|VideoMetadata|video\/0)/i.test(url.pathname)) writes.push(url.pathname)
    })
    await page.route('**/api/nas/connections/*/playable*', route => {
      prepared.push(new URL(route.request().url()).searchParams.get('path')!)
      return route.fulfill({json: {url: `/api/nas/connections/${connection.id}/stream?session=preview`,
        kind: 'mp4', title: 'Preview', qualities: [], quality: null, adaptive: false}})
    })
    await page.route('**/api/nas/connections/*/stream*', route => route.fulfill({
      status: 200, contentType: 'video/mp4', headers: {'Accept-Ranges': 'bytes'}, body: bytes,
    }))
    for (const name of ['new.mp4', 'old.mp4']) {
      const row = browser.locator('.v-list-item').filter({hasText: name})
      await row.getByRole('button', {name: /^(Preview without adding to library|Просмотреть без добавления в библиотеку)$/}).click()
      const player = page.locator('#player')
      const video = player.locator('video')
      await expect(player).toBeVisible()
      await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).duration)).toBe(2)
      await expect(player.locator('.btn-edit-video, .mark-buttons')).toHaveCount(0)
      await video.evaluate(element => { (element as HTMLVideoElement).currentTime = 0.5 })
      await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThanOrEqual(0.5)
      await player.locator('.player-close-btn').click()
      await expect(player).toBeHidden()
    }
    expect(prepared).toEqual(['new.mp4', 'old.mp4'])
    expect(batches).toHaveLength(0)
    expect(writes).toEqual([])
    await expect(browser.locator('.v-list-item').filter({hasText: 'new.mp4'}).getByRole('checkbox')).toBeEnabled()
  } finally { fs.rmSync(directory, {recursive: true, force: true}) }
})
