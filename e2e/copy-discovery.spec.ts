import {test, expect} from '@playwright/test'
import {disableFeatureHints, dismissOnboardingIfVisible, waitForAppShell} from './helpers'
import type {CopyDiscoveryJob} from '../shared/copyDiscovery'

test('starts a persistent background scan, restores its results and undoes a link', async ({page}) => {
  await disableFeatureHints(page)
  const requests: unknown[] = []
  let job: CopyDiscoveryJob | undefined
  const id = '11111111-1111-4111-8111-111111111111'
  const itemId = '22222222-2222-4222-8222-222222222222'
  await page.route('**/api/copy-discovery/jobs**', route => {
    const request = route.request(), url = new URL(request.url())
    if (request.method() === 'POST' && url.pathname.endsWith('/jobs')) {
      requests.push(request.postDataJSON())
      job = {id, state: 'verifying', method: 'oshash', roots: [{key: '/Volumes/Archive'}], mediaId: null,
        createdAt: '2026-10-18', updatedAt: '2026-10-18', error: null, total: 1,
        counts: {checking: 1}, truncated: false,
        items: [{id: itemId, path: '/Volumes/Archive/renamed.mp4', name: 'renamed.mp4', size: 500000, version: 'v1',
          state: 'checking', candidateIds: [42], mediaId: null, copyId: null, error: null}]}
      return route.fulfill({status: 202, json: job})
    }
    if (request.method() === 'POST' && url.pathname.endsWith('/undo')) {
      job!.counts = {dismissed: 1}; job!.items[0].state = 'dismissed'
      return route.fulfill({json: job})
    }
    return route.fulfill({json: job ? [job] : []})
  })
  await page.goto('/settings?tab=database&section=find_duplicates')
  await waitForAppShell(page); await dismissOnboardingIfVisible(page)
  const panel = page.getByTestId('copy-discovery')
  await panel.getByRole('textbox', {name: /Folders or files to check|Папки или файлы для проверки/}).fill('/Volumes/Archive')
  await panel.getByRole('button', {name: /Find copies in the background|Найти копии в фоне/}).click()
  await expect.poll(() => requests).toEqual([{roots: [{key: '/Volumes/Archive'}]}])
  await expect(panel.getByRole('button', {name: /^(Stop|Остановить)$/})).toBeVisible()
  job!.state = 'completed'; job!.counts = {attached: 1}
  Object.assign(job!.items[0], {state: 'attached', mediaId: 42, copyId: 'saved-copy'})
  await page.reload()
  await waitForAppShell(page)
  // Settings show only the summary: totals, check history and no per-file results.
  const summary = panel.getByTestId('copy-discovery-summary')
  await expect(summary.locator('.copy-discovery__stat').filter({hasText: /^\s*1\s*(Attached|Привязано)/})).toBeVisible()
  await panel.locator('.copy-discovery__history-toggle').click()
  const history = panel.getByRole('region', {name: /(Check history|История проверок) \(1\)/})
  await expect(history.getByText('/Volumes/Archive', {exact: true})).toBeVisible()
  await expect(history).toContainText(/1 attached|1 привязано/)
  await expect(panel.getByText('/Volumes/Archive/renamed.mp4', {exact: true})).toHaveCount(0)
  await expect(panel.getByRole('button', {name: /Unlink and ignore this match|Отвязать и больше не предлагать/})).toHaveCount(0)
  await page.screenshot({path: '/tmp/mc-copy-discovery-panel.png', fullPage: true})
})

test('summarizes an ambiguous result without per-file choices in settings', async ({page}) => {
  await disableFeatureHints(page)
  const job: CopyDiscoveryJob = {id: '11111111-1111-4111-8111-111111111111', state: 'completed', method: 'oshash',
    roots: [{key: '/Volumes/Archive'}], mediaId: null, createdAt: '2026-10-18', updatedAt: '2026-10-18', error: null,
    counts: {ambiguous: 1}, total: 1, truncated: false,
    items: [{id: '22222222-2222-4222-8222-222222222222', path: '/Volumes/Archive/movie.mp4', name: 'movie.mp4',
      size: 500000, version: 'v1', state: 'ambiguous', candidateIds: [41, 42], mediaId: null, copyId: null, error: null,
      candidates: [{id: 41, name: 'Original movie', path: '/Movies/original.mp4'}, {id: 42, name: 'Archive movie', path: '/Archive/movie.mp4'}]}]}
  await page.route('**/api/copy-discovery/jobs**', route => route.fulfill({json: [job]}))
  await page.goto('/settings?tab=database&section=find_duplicates')
  await waitForAppShell(page); await dismissOnboardingIfVisible(page)
  const panel = page.getByTestId('copy-discovery')
  const summary = panel.getByTestId('copy-discovery-summary')
  await expect(summary.locator('.copy-discovery__stat').filter({hasText: /^\s*1\s*(Need review|Требуют выбора)/})).toBeVisible()
  await panel.locator('.copy-discovery__history-toggle').click()
  await expect(panel.getByRole('region', {name: /(Check history|История проверок) \(1\)/})).toContainText(/1 need review|1 требуют выбора/)
  await expect(panel.getByRole('button', {name: /Link to Archive movie|Привязать к «Archive movie»/})).toHaveCount(0)
})
