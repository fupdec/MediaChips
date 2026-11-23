import {test, expect, type Locator, type Page} from '@playwright/test'
import {disableFeatureHints, dismissOnboardingIfVisible, waitForAppShell} from './helpers'
import type {OriginalJob, OriginalOperation} from '../shared/originalOperations'

const connectionId = '22222222-2222-4222-8222-222222222222'

/**
 * Vuetify selects ignore a key press that lands while the dialog is re-rendering (for example right
 * after a job is submitted and the copies reload). Press only while the option list is closed and retry
 * until it is open, instead of pressing once and waiting out the whole test timeout.
 */
async function chooseOption(page: Page, combobox: Locator, option: Locator) {
  await expect(async () => {
    if (!await option.isVisible()) await combobox.press('ArrowDown')
    await expect(option).toBeVisible({timeout: 2_000})
  }).toPass({timeout: 20_000})
  await option.click()
}
test('transfers to another source with a safe default and explicit source removal mode', async ({page}) => {
  await disableFeatureHints(page)
  const medium = {id: 987659, name: 'Archive movie', basename: 'movie.mp4',
    path: `nas://${connectionId}/movie.mp4`, mediaTypeId: 1, tags: [], values: [], rating: 5, favorite: true}
  const jobs: OriginalJob[] = []
  const submissions: OriginalOperation[][] = []
  let copiesRequests = 0
  await page.route(/\/api\/media\/items$/i, route => route.fulfill({json: {items: [medium], total: 1, totalFiltered: 1, page: 1, pages: 1, limit: 25}}))
  await page.route(new RegExp(`/api/media/${medium.id}$`, 'i'), route => route.fulfill({json: medium}))
  await page.route('**/api/TagsInMedia**', route => route.fulfill({json: []}))
  await page.route('**/api/ValuesInMedia**', route => route.fulfill({json: []}))
  await page.route(new RegExp(`/api/media/${medium.id}/copies$`, 'i'), route => {
    copiesRequests++
    return route.fulfill({json: {preferredId: null, copies: [
      {id: 'original', path: medium.path, provider: 'nas', availability: 'available', verified: false, verifiedAt: null},
      ...(submissions.length ? [{id: 'cloud', path: 'gdrive://transfer-backup', provider: 'gdrive', availability: 'available', verified: true, verificationMethod: 'sha256', verifiedAt: '2026-10-18'}] : []),
    ]}})
  })
  await page.route('**/api/original-operations/**', route => {
    const request = route.request(), url = new URL(request.url()).pathname
    if (url.endsWith('/destinations')) return route.fulfill({json: [
      {id: 'local', provider: 'local', name: '', writable: true},
      {id: 'google-drive', provider: 'gdrive', name: '', writable: true},
    ]})
    if (url.includes('/media/')) return route.fulfill({json: {
      provider: 'nas', source: {connectionId, key: 'movie.mp4'}, path: medium.path, name: 'movie.mp4', writable: true,
    }})
    if (request.method() === 'POST') {
      const items = request.postDataJSON().items as OriginalOperation[]
      submissions.push(items)
      const job: OriginalJob = {id: `00000000-0000-4000-8000-${String(jobs.length + 1).padStart(12, '0')}`, state: 'queued', createdAt: new Date().toISOString(),
        items: items.map(item => ({...item, id: '00000000-0000-4000-8001-000000000001', state: 'pending', phase: 'pending', bytes: 0, total: 1234}))}
      jobs.push(job)
      return route.fulfill({status: 202, json: job})
    }
    for (const job of jobs) {
      job.state = 'completed'
      for (const item of job.items) { item.state = 'completed'; item.phase = 'linked'; item.bytes = item.total }
    }
    return route.fulfill({json: jobs})
  })
  await page.goto('/media?mediaTypeId=1')
  await waitForAppShell(page); await dismissOnboardingIfVisible(page)
  await page.locator(`[data-item-id="${medium.id}"] .description`).dblclick()
  await page.locator('.edit-dialog-card').getByRole('button', {name: /Manage originals|Управление оригиналами/}).click()
  const dialog = page.getByRole('dialog', {name: /Manage originals|Управление оригиналами/})
  await dialog.getByRole('button', {name: /^(Choose: Transfer between sources|Выбрать: Между источниками)$/}).click()
  const target = dialog.getByRole('combobox', {name: /Destination source|Источник назначения/})
  await chooseOption(page, target, page.getByRole('option', {name: 'Google Drive', exact: true}))
  const submit = dialog.getByRole('button', {name: /^(Transfer between sources|Между источниками)$/})
  await expect(dialog.getByRole('textbox', {name: /Destination folder|Папка назначения/})).toHaveValue('root')
  await expect(dialog.getByRole('checkbox')).toHaveCount(0)
  await submit.click()
  await expect.poll(() => submissions.length).toBe(1)
  await expect.poll(() => copiesRequests).toBeGreaterThan(0)
  expect(submissions[0]).toEqual([{kind: 'transfer', mediaId: medium.id, target: {connectionId: 'google-drive', key: 'root', name: 'movie.mp4'}, conflict: 'fail', removeSource: false}])
  const mode = dialog.getByRole('combobox', {name: /After copying|После копирования/})
  await expect(mode).toBeEnabled()
  await chooseOption(page, mode, page.getByRole('option', {name: /Delete the source after verification|Удалить исходник после проверки/}))
  await expect(submit).toBeDisabled()
  await dialog.getByRole('checkbox').check()
  await expect(submit).toBeEnabled()
  await submit.click()
  await expect.poll(() => submissions.length).toBe(2)
  expect(submissions[1][0]).toMatchObject({removeSource: true, confirmDelete: true})
  await dialog.screenshot({animations: 'disabled', path: test.info().outputPath('source-transfer-desktop.png')})
  await page.setViewportSize({width: 390, height: 844})
  expect(await dialog.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false)
  const bounds = await dialog.locator('.originals-form').boundingBox()
  const viewport = page.viewportSize()!
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width - 20)
  await dialog.screenshot({animations: 'disabled', path: test.info().outputPath('source-transfer-mobile.png')})
  await page.setViewportSize({width: 1280, height: 720})
  await dialog.getByRole('button', {name: /^(Close|Закрыть)$/}).click()
  const editor = page.locator('.edit-dialog-card')
  await editor.getByRole('button', {name: /^(File copies|Копии файла)$/}).click()
  await expect(editor.getByText('gdrive://transfer-backup', {exact: true})).toBeVisible()
})
