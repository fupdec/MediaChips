import {test, expect} from '@playwright/test'
import {openSettingsTab} from './helpers'
import type {OriginalJob, OriginalOperation} from '../shared/originalOperations'
const connectionId = '44f4a4b9-8504-42a5-a530-5b48f61c6539'
test('shows conflicts and recovery, streams uploads, and restores job history after closing the dialog', async ({page}) => {
  const jobs: OriginalJob[] = []
  let attempts = 0, uploaded = ''
  await page.route('**/api/nas/**', route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/connections')) return route.fulfill({json: [{id: connectionId, name: 'Test NAS', protocol: 'webdav', host: 'test.invalid', port: 443, username: 'reader', root: '/video', hasCredentials: true, hasPassword: true, hasPrivateKey: false}]})
    return route.fulfill({json: {path: '', entries: [], truncated: false}})
  })
  await page.route('**/api/source-catalog/**', route => route.fulfill({json: route.request().url().endsWith('/cache') ? {usedBytes: 0, limitBytes: 1024 ** 3} : []}))
  await page.route('**/api/original-operations/**', async route => {
    const request = route.request(), url = new URL(request.url()).pathname
    if (url.endsWith('/jobs') && request.method() === 'POST') {
      const items = request.postDataJSON().items as OriginalOperation[]
      const job: OriginalJob = {id: '00000000-0000-4000-8000-' + String(jobs.length + 1).padStart(12, '0'), createdAt: new Date().toISOString(), state: items[0].kind === 'upload' ? 'awaiting_upload' : 'running',
        items: items.map((item, index) => ({...item, id: `00000000-0000-4000-8001-${String(index + 1).padStart(12, '0')}`, state: 'pending', phase: 'pending', bytes: 0, total: item.uploadSize || 0}))}
      jobs.push(job); return route.fulfill({status: 202, json: job})
    }
    if (url.endsWith('/retry')) {
      attempts++; expect(request.postDataJSON().conflict).toBe('keep-both')
      const job = jobs[0]; job.state = 'queued'; job.items[0].state = 'pending'; delete job.items[0].error
      return route.fulfill({status: 202, json: job})
    }
    if (request.method() === 'PUT') {
      uploaded = request.postDataBuffer()!.toString()
      const job = jobs[jobs.length - 1]; job.state = 'queued'; job.items[0].readyUpload = true
      return route.fulfill({status: 202, json: job})
    }
    if (url.endsWith('/jobs')) {
      for (const job of jobs) {
        if (job.state === 'running') { job.state = 'failed'; job.items[0].state = 'failed'; job.items[0].error = 'conflict' }
        else if (job.state === 'queued') { job.state = 'completed'; job.items[0].state = 'completed'; job.items[0].bytes = job.items[0].total }
      }
      return route.fulfill({json: jobs})
    }
    return route.fulfill({json: jobs[0]})
  })
  await openSettingsTab(page, 'settings-doc-tab-connections')
  await page.getByRole('tab', {name: 'NAS / SFTP / FTP / WebDAV', exact: true}).click()
  await page.locator('#settings-nas').getByRole('button', {name: /Manage originals|Управление оригиналами/}).click()
  const dialog = page.getByRole('dialog', {name: /Manage originals|Управление оригиналами/})
  await dialog.getByRole('textbox', {name: /Destination folder|Папка назначения/}).fill('new-folder')
  await dialog.getByRole('button', {name: /^(Create folder|Создать папку)$/}).click()
  await expect(dialog).toContainText(/Destination already exists|Файл или папка уже существует/)
  await dialog.locator('.v-select').nth(1).click()
  await page.getByRole('option', {name: /Keep both|Сохранить оба/}).click()
  await dialog.getByRole('button', {name: /Retry unfinished items|Повторить незавершённое/}).click()
  await expect.poll(() => attempts).toBe(1)
  await expect(dialog).toContainText(/Completed · 1|Завершено · 1/)
  await dialog.locator('.v-select').first().click()
  await page.getByRole('option', {name: /^(Upload files|Загрузить файлы)$/}).click()
  await dialog.locator('input[type=file]').setInputFiles({name: 'new.mp4', mimeType: 'video/mp4', buffer: Buffer.from('upload')})
  await dialog.getByRole('button', {name: /^(Upload files|Загрузить файлы)$/}).click()
  await expect.poll(() => uploaded).toBe('upload')
  await expect.poll(() => jobs[1]?.state).toBe('completed')
  expect(jobs[1].items[0].target).toEqual({connectionId, key: 'new.mp4'})
  await page.setViewportSize({width: 390, height: 844})
  await dialog.screenshot({animations: 'disabled', path: test.info().outputPath('originals-mobile.png')})
  await dialog.getByRole('button', {name: /^(Close|Закрыть)$/}).click()
  await expect(dialog).toBeHidden()
  await page.locator('#settings-nas').getByRole('button', {name: /Manage originals|Управление оригиналами/}).click()
  await expect(dialog).toContainText('new.mp4')
})
