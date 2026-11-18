import {test, expect} from '@playwright/test'
import {disableFeatureHints, dismissOnboardingIfVisible, waitForAppShell} from './helpers'
import type {CatalogRoot, SourceJob} from '../shared/sourceCatalog'

test('manually reconciles, cancels safely, persists a schedule and edits the offline limit', async ({page}) => {
  await disableFeatureHints(page)
  await page.route('**/api/drive/status*', route => route.fulfill({json: {configured: true, authenticated: true, mock: true}}))
  await page.route('**/api/drive/folders/*', route => route.fulfill({json: {folderId: 'root', files: []}}))
  let roots: CatalogRoot[] = []
  let job: SourceJob | undefined
  let limitBytes = 5 * 1024 ** 3
  let complete = false
  await page.route('**/api/source-catalog/**', async route => {
    const request = route.request()
    const url = new URL(request.url()).pathname
    if (url.endsWith('/roots') && request.method() === 'POST') {
      const input = request.postDataJSON()
      roots = [{id: '11111111-1111-4111-8111-111111111111', lastCompletedAt: roots[0]?.lastCompletedAt || null,
        lastResult: roots[0]?.lastResult || null, lastError: null, nextRunAt: input.intervalMinutes ? Date.now() + 86400_000 : null, ...input}]
      return route.fulfill({json: roots[0]})
    }
    if (url.endsWith('/roots')) return route.fulfill({json: roots})
    if (url.endsWith('/cache')) {
      if (request.method() === 'PUT') limitBytes = request.postDataJSON().limitBytes
      return route.fulfill({json: {usedBytes: 0, limitBytes}})
    }
    if (url.endsWith('/refresh')) {
      job = {id: '22222222-2222-4222-8222-222222222222', kind: 'catalog', targetId: roots[0].id, state: 'running', processed: 2}
      return route.fulfill({status: 202, json: job})
    }
    if (url.endsWith('/cancel')) { job!.state = 'cancelled'; return route.fulfill({json: {ok: true}}) }
    if (url.endsWith('/jobs')) return route.fulfill({json: job ? [job] : []})
    if (complete && job?.state === 'running') {
      job.state = 'completed'; job.result = {new: 1, changed: 1, missing: 1, scanned: 3, truncated: false, changes: [
        {kind: 'new', name: 'New film.mp4', resourceKey: 'new', mediaId: 1},
        {kind: 'changed', name: 'Changed film.mp4', resourceKey: 'changed', mediaId: 2},
        {kind: 'missing', name: 'Missing film.mp4', resourceKey: 'missing', mediaId: 3},
      ]}
      roots[0].lastResult = job.result; roots[0].lastCompletedAt = new Date().toISOString()
    }
    return route.fulfill({json: job})
  })
  await page.goto('/settings?tab=connections')
  await waitForAppShell(page); await dismissOnboardingIfVisible(page)
  const source = page.locator('#settings-google-drive')
  await source.getByRole('button', {name: /Catalog updates and offline storage|Обновление каталога и офлайн-копии/}).click()
  const controls = page.locator('.catalog-controls__body')
  const manual = controls.getByRole('button', {name: /Reconcile this folder|Сверить эту папку/})
  await manual.click()
  await expect(controls.getByRole('button', {name: /^(Cancel|Отмена)$/})).toBeVisible()
  complete = true
  await expect(controls).toContainText(/New: 1.*Changed: 1.*Missing: 1|Новых: 1.*Изменённых: 1.*Отсутствующих: 1/)
  await controls.locator('summary').click()
  await expect(controls).toContainText('New film.mp4')
  complete = false
  await manual.click()
  await controls.getByRole('button', {name: /^(Cancel|Отмена)$/}).click()
  await expect(controls).toContainText(/Cancelled.*Catalog changes were not applied|Отменено.*Изменения каталога не применены/)
  await controls.getByRole('combobox', {name: /Update schedule|Расписание обновления/}).press('ArrowDown')
  await page.getByRole('option', {name: /Every day|Каждый день/}).click()
  await controls.getByRole('button', {name: /^(Save|Сохранить)$/}).first().click()
  await expect.poll(() => roots[0].intervalMinutes).toBe(1440)
  await controls.getByRole('spinbutton').fill('2')
  await controls.getByRole('button', {name: /^(Save|Сохранить)$/}).last().click()
  await expect.poll(() => limitBytes).toBe(2 * 1024 ** 3)
  await page.getByRole('button', {name: /^(Close|Закрыть)$/}).click()
  await page.setViewportSize({width: 390, height: 844})
  const width = await source.evaluate(el => ({actual: el.clientWidth, scroll: el.scrollWidth}))
  await source.screenshot({animations: 'disabled', path: test.info().outputPath('catalog-mobile.png')})
  expect(width.scroll).toBeLessThanOrEqual(width.actual)
})
