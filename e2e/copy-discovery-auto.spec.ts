import fs from 'fs'
import os from 'os'
import path from 'path'
import {test, expect} from '@playwright/test'
import {disableFeatureHints, dismissOnboardingIfVisible, waitForAppShell, getImageMediaType} from './helpers'
import type {CopyDiscoveryJob} from '../shared/copyDiscovery'

test('persists automatic trigger switches and identifies why a job started', async ({page}) => {
  await disableFeatureHints(page)
  const values: Record<string, string> = {copyDiscoveryOnImport: '1', copyDiscoveryOnReconnect: '1', copyDiscoveryOnFolderUpdate: '1'}
  const writes: string[] = []
  await page.route('**/api/Setting', async route => {
    const response = await route.fetch(), rows = await response.json() as Array<{option: string; value: string}>
    await route.fulfill({response, json: [...rows.filter(row => !(row.option in values)), ...Object.entries(values).map(([option, value]) => ({option, value}))]})
  })
  await page.route('**/api/Setting/copyDiscoveryOn*', route => {
    const option = new URL(route.request().url()).pathname.split('/').pop()!
    if (route.request().method() === 'PUT') {
      values[option] = String(route.request().postDataJSON().value); writes.push(option)
      return route.fulfill({json: [1]})
    }
    return route.fulfill({json: {option, value: values[option]}})
  })
  await page.route('**/api/copy-discovery/jobs', route => route.fulfill({json: [{
    id: '11111111-1111-4111-8111-111111111111', state: 'completed', method: 'oshash', triggers: ['import'],
    roots: [{key: '/Archive'}], mediaId: null, createdAt: '2026-10-19', updatedAt: '2026-10-19', error: null,
    counts: {}, total: 0, items: [], truncated: false,
  }]}))
  await page.goto('/settings?tab=database&section=find_duplicates')
  await waitForAppShell(page); await dismissOnboardingIfVisible(page)
  for (const name of ['copy-auto-reconnect', 'copy-auto-import', 'copy-auto-folders']) await expect(page.getByTestId(name).locator('input[type="checkbox"]')).toBeChecked()
  await page.getByTestId('copy-auto-import').locator('input[type="checkbox"]').press('Space')
  await expect.poll(() => writes).toEqual(['copyDiscoveryOnImport'])
  await page.reload(); await waitForAppShell(page)
  await expect(page.getByTestId('copy-auto-import').locator('input[type="checkbox"]')).not.toBeChecked()
  await expect(page.getByTestId('copy-auto-reconnect').locator('input[type="checkbox"]')).toBeChecked()
  await page.getByTestId('copy-discovery').locator('.copy-discovery__group > summary').click()
  await expect(page.getByTestId('copy-discovery').getByText(/^(After import|После импорта)$/)).toBeVisible()
})

test('a real bulk import schedules discovery and attaches a copy in a previously selected folder', async ({request}) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-auto-e2e-'))
  const archive = path.join(directory, 'archive'); fs.mkdirSync(archive)
  const original = path.join(directory, 'original.jpg'), copy = path.join(archive, 'renamed.jpg')
  fs.writeFileSync(original, Buffer.from([0xff, 0xd8, 0xff, 0xd9])); fs.copyFileSync(original, copy)
  const readSetting = async (option: string) => {
    const response = await request.get('/api/Setting/' + option)
    return (await response.json())?.value || '1'
  }
  const priorImport = await readSetting('copyDiscoveryOnImport'), priorReconnect = await readSetting('copyDiscoveryOnReconnect')
  try {
    await request.put('/api/Setting/copyDiscoveryOnImport', {data: {value: '1'}})
    await request.put('/api/Setting/copyDiscoveryOnReconnect', {data: {value: '0'}})
    const manual = await request.post('/api/copy-discovery/jobs', {data: {roots: [{key: archive}]}})
    expect(manual.status()).toBe(202)
    const initial: CopyDiscoveryJob = await manual.json()
    await expect.poll(async () => (await (await request.get('/api/copy-discovery/jobs/' + initial.id)).json()).state, {timeout: 15_000}).toBe('completed')
    const type = await getImageMediaType(request)
    const imported = await request.post('/api/Task/addMediaBulk', {data: {mode: 'lite', type: {id: type.id, type: type.type, extensions: type.extensions}, files: [original]}})
    expect(imported.ok()).toBeTruthy()
    const result = await imported.json(), mediaId = result.added.find((row: {path: string}) => row.path === original)?.mediaId
    expect(mediaId).toBeTruthy()
    await expect.poll(async () => {
      const jobs = await (await request.get('/api/copy-discovery/jobs')).json() as CopyDiscoveryJob[]
      return jobs.some(job => job.triggers?.includes('import') && job.state === 'completed' && job.counts.attached === 1 && job.roots.some(root => root.key === archive))
    }, {timeout: 20_000}).toBe(true)
    const copies = await (await request.get(`/api/Media/${mediaId}/copies`)).json()
    expect(copies.copies.map((row: {path: string}) => row.path).sort()).toEqual([original, copy].sort())
    expect(fs.readFileSync(original).equals(fs.readFileSync(copy))).toBe(true)
  } finally {
    await request.put('/api/Setting/copyDiscoveryOnImport', {data: {value: priorImport}})
    await request.put('/api/Setting/copyDiscoveryOnReconnect', {data: {value: priorReconnect}})
    fs.rmSync(directory, {recursive: true, force: true})
  }
})
