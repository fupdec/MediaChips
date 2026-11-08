import {test, expect} from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'
import {disableFeatureHints, dismissOnboardingIfVisible, waitForAppShell} from './helpers'

for (const source of ['local', 'drive', 'nas'] as const) {
  test(`${source}: plays new and indexed files without library reads or writes`, async ({page}) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-file-preview-'))
    try {
      const fixture = path.join(directory, 'preview.mp4')
      execFileSync(ffmpegPath!, ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64:d=2',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', fixture], {stdio: 'ignore'})
      const bytes = fs.readFileSync(fixture)
      let wmvBytes = Buffer.from('invalid video')
      if (source === 'drive') {
        const wmv = path.join(directory, 'legacy.wmv')
        execFileSync(ffmpegPath!, ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64:d=2', '-c:v', 'wmv2', '-f', 'asf', wmv], {stdio: 'ignore'})
        wmvBytes = fs.readFileSync(wmv)
      }
      await disableFeatureHints(page)
      await page.route('**/api/browse/places', route => route.fulfill({json: {container: false,
        places: [{id: 'home', name: 'Preview files', path: '/preview', icon: 'mdi-folder'}]}}))
      await page.route('**/api/browse/listDirectory', route => route.fulfill({json: {
        currentPath: '/preview', rootPath: '/preview', parentPath: null, platform: 'linux', truncated: false,
        entries: ['new.mp4', 'old.mp4', 'bad.mp4', 'photo.png'].map((name, index) => ({name, path: `/preview/${name}`, isDirectory: false,
          size: bytes.length, mtimeMs: 1000, extension: name.split('.').pop(), inLibrary: index === 1, addable: index !== 1, mediaId: index === 1 ? 123 : null})),
      }}))
      await page.route('**/api/check-files', route => route.fulfill({json: {
        results: Object.fromEntries(route.request().postDataJSON().paths.map((file: string) => [file, true])),
      }}))
      await page.route('**/api/drive/status*', route => route.fulfill({json: {configured: true, authenticated: true,
        mock: false, hasClientId: true, clientId: 'test', redirectUri: 'http://localhost:12321/api/drive/oauth/callback'}}))
      await page.route('**/api/drive/folders/*', route => route.fulfill({json: {folderId: 'root', mock: false,
        files: ['new.mp4', 'old.mp4', 'legacy.WMV', 'photo.png'].map((name, index) => ({id: name.slice(0, -4), name,
          mimeType: name.endsWith('.png') ? 'image/png' : name.endsWith('.WMV') ? 'video/x-ms-wmv' : 'video/mp4',
          size: bytes.length, isFolder: false, mediaId: index === 1 ? 123 : null})),
      }}))
      const connectionId = '44f4a4b9-8504-42a5-a530-5b48f61c6539'
      await page.route('**/api/nas/connections', route => route.fulfill({json: [{id: connectionId, name: 'Preview SFTP',
        protocol: 'sftp', host: 'test.invalid', port: 22, username: 'reader', root: '/preview', hasCredentials: true}]}))
      await page.route('**/api/nas/connections/*/files*', route => route.fulfill({json: {path: '', truncated: false,
        entries: ['new.mp4', 'old.mp4', 'bad.mp4'].map((name, index) => ({name, path: name, isDirectory: false,
          size: bytes.length, modifiedAt: 1000, mediaId: index === 1 ? 123 : null})),
      }}))
      await page.route('**/api/nas/connections/*/playable*', route => route.fulfill({json: {
        url: `/api/nas/connections/${connectionId}/stream?path=${new URL(route.request().url()).searchParams.get('path')}`,
        kind: 'mp4', title: 'Preview', qualities: [], quality: null, adaptive: false,
      }}))
      const streams: string[] = []
      await page.route(source === 'local' ? '**/api/get-file*' : source === 'drive' ? '**/api/drive/files/*/stream*' : '**/api/nas/connections/*/stream*', route => {
        streams.push(route.request().url())
        if (source === 'drive' && route.request().url().includes('/legacy/stream')) return route.fulfill({contentType: 'video/x-ms-wmv', body: wmvBytes})
        if (route.request().url().includes('photo')) return route.fulfill({contentType: 'image/png',
          body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6S0AAAAAASUVORK5CYII=', 'base64')})
        return route.fulfill({status: 200, contentType: 'video/mp4', headers: {'Accept-Ranges': 'bytes'},
          body: route.request().url().includes('bad') ? Buffer.from('invalid video') : bytes})
      })
      await page.goto('/media?mediaTypeId=1')
      await waitForAppShell(page)
      await dismissOnboardingIfVisible(page)
      await page.getByRole('button', {name: /^(Add media|Добавить медиа)$/}).first().click()
      const dialog = page.locator('.media-adding-dialog')
      if (source !== 'local') await dialog.getByRole('tab', {name: /^(Sources|Источники)$/}).click()
      if (source === 'nas') await dialog.getByRole('tab', {name: 'Network', exact: true}).click()
      const browser = dialog.locator(source === 'drive' ? '.google-drive-source' : source === 'nas' ? '.nas-sources' : '.media-adding-dialog__local')
      const libraryRequests: string[] = []
      page.on('request', request => {
        const url = new URL(request.url())
        if (/\/api\/(?:drive\/(?:import|media\/)|nas\/(?:import|media\/)|Mark|VideoMetadata|video\/0)/i.test(url.pathname)
          || (url.pathname.startsWith('/api/Media/') && ['PUT', 'PATCH', 'DELETE'].includes(request.method()))
          || /\/api\/(?:Media\/add|Task\/addMedia)/i.test(url.pathname)) {
          libraryRequests.push(url.pathname)
        }
      })
      for (const name of ['new.mp4', 'old.mp4']) {
        const row = browser.locator('.v-list-item').filter({hasText: name})
        await row.getByRole('button', {name: /^(Preview without adding to library|Просмотреть без добавления в библиотеку)$/}).click()
        const player = page.locator('#player')
        const video = player.locator('video[data-player-bound]')
        await expect(player).toBeVisible()
        await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).duration)).toBe(2)
        await expect(player.locator('.btn-edit-video, .mark-buttons')).toHaveCount(0)
        await video.evaluate(element => { (element as HTMLVideoElement).currentTime = 0.5 })
        await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThanOrEqual(0.5)
        await player.locator('.player-close-btn').click()
        await expect(player).toBeHidden()
      }
      expect(streams.some(url => source === 'drive' ? url.includes('/files/new/stream') : url.includes('new.mp4'))).toBe(true)
      expect(streams.some(url => source === 'drive' ? url.includes('/files/old/stream') : url.includes('old.mp4'))).toBe(true)
      // Decode failure must not fall back to a library/transcode endpoint for ID 0.
      const brokenRow = browser.locator('.v-list-item').filter({hasText: source === 'drive' ? 'legacy.WMV' : 'bad.mp4'})
      await expect(brokenRow.getByRole('checkbox')).toBeEnabled()
      await brokenRow
        .getByRole('button', {name: /^(Preview without adding to library|Просмотреть без добавления в библиотеку)$/}).click()
      await expect.poll(() => page.locator('#player video[data-player-bound]').evaluate(element => (element as HTMLVideoElement).error?.code)).toBeGreaterThan(0)
      if (source === 'nas') {
        await expect(page.locator('#player .video-error')).toBeVisible()
        const action = page.locator('#player a[download]')
        await expect(action).toHaveAttribute('href', /download=1/)
        const download = page.waitForEvent('download')
        await action.click()
        expect((await download).suggestedFilename()).toBeTruthy()
      }
      if (source === 'drive') {
        await expect(page.locator('#player .video-error')).toBeVisible({timeout: 15_000})
        await page.context().route('https://drive.google.com/file/d/legacy/view', route => route.fulfill({contentType: 'text/html', body: '<p>Google Drive player</p>'}))
        const popup = page.waitForEvent('popup')
        await page.locator('#player').getByRole('button', {name: /^(Open in Google Drive|Открыть в Google Drive)$/}).click()
        const drivePage = await popup
        await expect(drivePage).toHaveURL('https://drive.google.com/file/d/legacy/view')
        await drivePage.close()
      }
      await page.locator('#player .player-close-btn').click()
      await expect(page.locator('#player')).toBeHidden()
      if (source !== 'nas') {
        await browser.locator('.v-list-item').filter({hasText: 'photo.png'})
          .getByRole('button', {name: /^(Preview without adding to library|Просмотреть без добавления в библиотеку)$/}).click()
        const viewer = page.locator('.image-viewer')
        await expect(viewer).toBeVisible()
        await expect(viewer.locator('.image-viewer__name')).toHaveText('photo.png')
        await expect.poll(() => viewer.locator('.image-viewer__stage img').first().evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(1)
        await viewer.getByRole('button', {name: /^(Close viewer|Закрыть просмотр)$/}).click()
        await expect(viewer).toBeHidden()
      }
      expect(libraryRequests).toEqual([])
      await expect(browser.locator('.v-list-item').filter({hasText: 'new.mp4'}).getByRole('checkbox')).toBeEnabled()
      await expect(dialog.locator('.dialog-header').first().getByRole('button', {name: /^(Add|Добавить)$/})).toBeDisabled()
    } finally { fs.rmSync(directory, {recursive: true, force: true}) }
  })
}

// A real HTTP producer deliberately withholds the second half of the file.
// route.fulfill alone cannot establish that decoding started before EOF.
test('NAS: starts before the download completes, seeks and cancels reading on close', async ({page}) => {
  const {createServer} = await import('node:http')
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-progressive-preview-'))
  const fixture = path.join(directory, 'stream.mp4')
  execFileSync(ffmpegPath!, ['-y', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=25:d=12',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '25', '-movflags', '+faststart', fixture], {stdio: 'ignore'})
  const bytes = fs.readFileSync(fixture)
  let opened = 0
  let closed = 0
  let completed = 0
  const server = createServer((req, res) => {
    opened++
    const start = Number(req.headers.range?.match(/^bytes=(\d+)-/)?.[1] || 0)
    res.writeHead(req.headers.range ? 206 : 200, {'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes',
      'Content-Length': bytes.length - start, 'Access-Control-Allow-Origin': '*',
      ...(req.headers.range ? {'Content-Range': `bytes ${start}-${bytes.length - 1}/${bytes.length}`} : {})})
    res.once('close', () => {closed++})
    res.once('finish', () => {completed++})
    // Enough complete GOPs to play and seek within the first few seconds.
    res.write(bytes.subarray(start, Math.min(bytes.length, start + Math.floor(bytes.length / 2))))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const origin = `http://127.0.0.1:${(server.address() as {port: number}).port}`
    const id = '44f4a4b9-8504-42a5-a530-5b48f61c6539'
    await disableFeatureHints(page)
    await page.route('**/api/nas/connections', route => route.fulfill({json: [{id, name: 'Streaming SFTP',
      protocol: 'sftp', host: 'test.invalid', port: 22, username: 'reader', root: '/preview', hasCredentials: true}]}))
    await page.route('**/api/nas/connections/*/files*', route => route.fulfill({json: {path: '', truncated: false,
      entries: [{name: 'stream.mp4', path: 'stream.mp4', isDirectory: false, size: bytes.length, modifiedAt: 1000} ]}}))
    await page.route('**/api/nas/connections/*/playable*', route => route.fulfill({json: {
      url: `${origin}/stream.mp4`, kind: 'mp4', title: 'Progressive preview', qualities: [], quality: null, adaptive: false,
    }}))
    await page.goto('/media?mediaTypeId=1')
    await waitForAppShell(page)
    await dismissOnboardingIfVisible(page)
    await page.getByRole('button', {name: /^(Add media|Добавить медиа)$/}).first().click()
    const dialog = page.locator('.media-adding-dialog')
    await dialog.getByRole('tab', {name: /^(Sources|Источники)$/}).click()
    await dialog.getByRole('tab', {name: 'Network', exact: true}).click()
    await dialog.locator('.nas-sources .v-list-item').filter({hasText: 'stream.mp4'})
      .getByRole('button', {name: /^(Preview without adding to library|Просмотреть без добавления в библиотеку)$/}).click()
    const video = page.locator('#player video[data-player-bound]')
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(0.2)
    expect(completed).toBe(0)
    await video.evaluate(element => {(element as HTMLVideoElement).currentTime = 2})
    await expect.poll(() => video.evaluate(element => !(element as HTMLVideoElement).seeking
      && (element as HTMLVideoElement).currentTime >= 2)).toBe(true)
    await page.locator('#player .player-close-btn').click()
    await expect(page.locator('#player')).toBeHidden()
    await expect.poll(() => closed).toBe(opened)
    expect(completed).toBe(0)
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    fs.rmSync(directory, {recursive: true, force: true})
  }
})
