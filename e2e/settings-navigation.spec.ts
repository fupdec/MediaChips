import {test, expect, type Page} from '@playwright/test'
import {disableFeatureHints, dismissOnboardingIfVisible, waitForAppShell} from './helpers'

async function open(page: Page, url: string, locale = 'en') {
  await disableFeatureHints(page)
  await page.route('**/api/Setting', async route => {
    const response = await route.fetch()
    const rows = await response.json() as Array<{option:string;value:string}>
    await route.fulfill({response,json:[...rows.filter(row=>row.option !== 'locale'),{option:'locale',value:locale}]})
  })
  await page.addInitScript(locale => sessionStorage.setItem('mediachips.locale',locale),locale)
  await page.goto(url)
  await waitForAppShell(page)
  await dismissOnboardingIfVisible(page)
  await expect(page.locator('#settings-search')).toBeVisible({timeout:30_000})
}

test('ten core sections, legacy links, and directly available tagging tools', async ({page}) => {
  test.setTimeout(120_000)
  const errors:string[]=[]
  page.on('pageerror',error=>errors.push(error.message))
  await open(page,'/settings?tab=general&section=video_player')
  await expect(page.locator('.settings-nav .v-list-item')).toHaveCount(10)
  await expect(page.locator('#settings-doc-tab-viewing')).toHaveClass(/v-list-item--active/, {timeout: 30_000})
  await expect(page.locator('#settings-video-player')).toBeVisible()
  await page.locator('#settings-doc-tab-library').click()
  await expect(page).toHaveURL(/tab=library/)
  await expect(page.locator('#settings-meta-assignment')).toBeAttached()
  await expect(page.locator('#settings-quick-tags')).toBeAttached()
  await expect(page.locator('#settings-library-advanced')).toHaveCount(0)
  await page.goto('/settings?tab=database&section=find_duplicates')
  await waitForAppShell(page)
  await expect(page.locator('#settings-doc-tab-maintenance')).toHaveClass(/v-list-item--active/, {timeout: 30_000})
  await expect(page.locator('#settings-find-duplicates')).toBeVisible({timeout:30_000})
  await expect.poll(()=>page.locator('#settings-find-duplicates').evaluate(el=>{
    const container=el.closest('.settings-page-layout__content')!
    return Math.abs(el.getBoundingClientRect().top-container.getBoundingClientRect().top)
  })).toBeLessThan(90)
  await page.goto('/settings?tab=files&section=folder_tags')
  await waitForAppShell(page)
  await expect(page.locator('#settings-doc-tab-library')).toHaveClass(/v-list-item--active/, {timeout: 30_000})
  await expect(page.locator('#settings-folder-tags')).toBeVisible({timeout:30_000})
  await page.goto('/settings?tab=database&section=backups')
  await waitForAppShell(page)
  await expect(page.locator('#settings-doc-tab-database')).toHaveClass(/v-list-item--active/, {timeout: 30_000})
  const backups = page.locator('.databases-card--active .databases-card__backups')
  await expect(backups).toBeVisible({timeout:30_000})
  await expect(backups).not.toHaveAttribute('tabindex', '-1')
  await backups.click()
  await expect(page.locator('.backups-dialog')).toBeVisible()
  expect(errors).toEqual([])
})

test('maintenance keeps preparation tools together and supports legacy links', async ({page}) => {
  await open(page, '/settings?tab=maintenance&section=generate_video_images')
  await expect(page.locator('#settings-doc-tab-maintenance')).toHaveClass(/v-list-item--active/)
  await expect(page.locator('#settings-generate-video-images')).toBeVisible()
  for (const id of ['settings-clip-embedding-backfill', 'settings-tag-image-ai-upscale']) {
    await expect(page.locator(`#${id}`)).toBeAttached()
  }
  await expect(page.locator('#settings-find-missing-media')).toHaveCount(0)
  await expect(page.locator('#settings-detect-faces')).toHaveCount(0)
  await page.goto('/settings?tab=maintenance&section=fingerprint_backfill')
  await expect(page.locator('#maintenance-view-duplicates')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#settings-fingerprint-backfill')).toBeVisible()
  await expect(page.getByTestId('remote-oshash-background')).toBeVisible()
  await page.goto('/settings?tab=maintenance&section=visual_hash_backfill')
  await expect(page.locator('#maintenance-view-duplicates')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#settings-visual-hash-backfill')).toBeVisible()
  await expect(page.locator('#settings-fingerprint-backfill')).toBeVisible()
  await page.locator('#settings-search').fill('Full SHA-256 verification of copies')
  await page.locator('.settings-search__results').getByText('Search and automation settings', {exact: true}).click()
  await expect(page.getByTestId('copy-sha256-setting')).toBeVisible()
  await page.goto('/settings?tab=maintenance&section=bulk_paths')
  await expect(page.locator('#settings-doc-tab-maintenance')).toHaveClass(/v-list-item--active/)
  await expect(page.locator('#maintenance-view-missing')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#settings-bulk-paths')).toBeVisible()
  await page.goto('/settings?tab=maintenance&section=detect_faces')
  await expect(page.locator('#settings-doc-tab-maintenance')).toHaveClass(/v-list-item--active/)
  await expect(page.locator('#maintenance-view-faces')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#settings-detect-faces')).toBeVisible()
  await expect(page.locator('#settings-clip-embedding-backfill')).toHaveCount(0)
  await page.goto('/settings?tab=maintenance&section=parse_library_tags')
  await expect(page.locator('#settings-doc-tab-library')).toHaveClass(/v-list-item--active/)
  await expect(page.locator('#settings-parse-library-tags')).toBeVisible()
  await page.goto('/settings?tab=maintenance&section=clear_generated')
  await expect(page.locator('#settings-doc-tab-maintenance')).toHaveClass(/v-list-item--active/)
  await expect(page.locator('#maintenance-view-tools')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#settings-clear-generated-images')).toBeVisible()
})

test('maintenance opens without a filesystem check and searches only the requested folders', async ({page}) => {
  const healthRequests: string[] = []
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname
    if (/\/(?:missingMediaStatus|health)$/i.test(pathname)) healthRequests.push(pathname)
    await route.fallback()
  })
  let search: unknown
  await page.route('**/api/Task/streamFindMissingMedia', route => {
    search = route.request().postDataJSON()
    return route.fulfill({
      contentType: 'application/x-ndjson',
      body: JSON.stringify({type: 'complete', scanned: 0, matched: 0, missing: 0, matches: []}) + '\n',
    })
  })
  await open(page, '/settings?tab=maintenance')
  const overview = page.getByRole('tabpanel', {name: 'Overview'})
  await expect(overview.getByRole('heading').first()).toHaveText('Library preparation and diagnostics')
  await expect(overview.getByRole('button', {name: 'Run library health check'})).toBeVisible()
  await overview.getByRole('button', {name: 'Find duplicates'}).click()
  await expect(page.getByRole('tab', {name: 'Duplicates'})).toBeFocused()
  await page.getByRole('tab', {name: 'Overview'}).click()
  await overview.getByRole('button', {name: 'Open tools'}).click()
  await expect(page.getByRole('tab', {name: 'Previews & indexes'})).toBeFocused()
  await page.getByRole('tab', {name: 'Overview'}).click()
  await page.getByRole('button', {name: 'Restore file paths'}).click()
  const start = page.locator('#settings-find-missing-media').getByRole('button', {name: /Start search/i})
  await expect(start).toBeDisabled()
  await page.getByLabel('Previous folder path').fill('/Volumes/Previous/Video')
  await page.getByLabel('Folders to search for the files').fill('/Volumes/Archive/Video')
  await start.click()
  await expect.poll(() => search).toEqual({
    originalFolder: '/Volumes/Previous/Video',
    folders: ['/Volumes/Archive/Video'],
  })
  await expect(page.getByText('Missing in the previous folder: 0 · Files scanned: 0 · Matches: 0')).toBeVisible()
  expect(healthRequests).toEqual([])
})

test('missing file review keeps manual choices separate from bulk confirmation', async ({page}) => {
  const directPath = '/archive/direct.mp4'
  const chosenPath = '/archive/first/manual.mp4'
  const otherPath = '/archive/second/manual.mp4'
  const matches = [
    {id: 1, oldPath: '/previous/direct.mp4', newPath: directPath, confidence: 'oshash'},
    {id: 2, oldPath: '/previous/manual.mp4', newPath: '', confidence: 'size', ambiguous: true, candidatePaths: [chosenPath, otherPath]},
  ]
  await page.route('**/api/Task/streamFindMissingMedia', route => route.fulfill({
    contentType: 'application/x-ndjson',
    body: JSON.stringify({type: 'complete', scanned: 3, matched: 2, missing: 2, matches}) + '\n',
  }))
  let relink: unknown
  await page.route('**/api/Task/relinkMissingMedia', route => {
    relink = route.request().postDataJSON()
    return route.fulfill({json: {updated: 1}})
  })

  await open(page, '/settings?tab=maintenance&section=find_missing')
  const tool = page.locator('#settings-find-missing-media')
  await tool.getByLabel('Previous folder path').fill('/previous')
  await tool.getByLabel('Folders to search for the files').fill('/archive')
  await tool.getByRole('button', {name: 'Start search'}).click()
  const review = tool.getByRole('region', {name: 'Review matches'})
  await expect(review.getByRole('button', {name: 'Update paths (0)'})).toBeDisabled()

  const manual = review.getByRole('checkbox', {name: matches[1].oldPath})
  await expect(manual).toBeDisabled()
  await review.getByRole('combobox', {name: 'Multiple matches: select the original file', exact: true}).press('ArrowDown')
  await page.getByRole('option', {name: chosenPath, exact: true}).click()
  await manual.check()

  const bulk = review.getByRole('checkbox', {name: /I verified the matches/})
  await bulk.check()
  await expect(review.getByText('Selected: 2 of 2')).toBeVisible()
  await bulk.uncheck()
  await expect(manual).toBeChecked()
  await review.getByRole('button', {name: 'Update paths (1)'}).click()
  await expect.poll(() => relink).toMatchObject({
    matches: [{id: 2, newPath: chosenPath, confirmedOriginal: true}],
  })
  await expect(review.getByText('Selected: 0 of 1')).toBeVisible()
})

test('runs a preparation step directly from its collapsed header', async ({page}) => {
  let ranStep = false
  await page.route('**/api/home/health', route => route.fulfill({json: {
    score: ranStep ? 100 : 85,
    fingerprint: {total: 1, pending: ranStep ? 0 : 1, hashed: ranStep ? 1 : 0},
  }}))
  await page.route('**/api/Task/streamFingerprintBackfill?*', route => {
    ranStep = true
    return route.fulfill({contentType: 'application/x-ndjson', body: '{"type":"complete"}\n'})
  })
  await open(page, '/settings?tab=maintenance')
  await page.getByRole('button', {name: 'Run library health check'}).click()
  const step = page.locator('#library-setup-phase-reliability')
  const toggle = step.locator('button[aria-expanded]')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  const run = step.getByRole('button', {name: 'Run this step'})
  await expect(run).toBeVisible()
  await run.click()
  await expect.poll(() => ranStep).toBe(true)
  await expect(run).toHaveCount(0)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
})

test('search finds translated nested controls, supports keyboard navigation and empty results', async ({page}) => {
  await open(page,'/settings','ru')
  const search=page.locator('#settings-search')
  await search.fill('разрешение конвертации')
  await expect(page.locator('.settings-search__results')).toContainText('Просмотр')
  await expect(page.locator('.settings-search__results mark').first()).toBeVisible()
  const dropdown = await page.locator('.settings-search__results').boundingBox()
  const nav = await page.locator('.settings-nav').boundingBox()
  expect(dropdown!.y).toBeLessThan(nav!.y + 20)
  expect(dropdown!.y + dropdown!.height).toBeGreaterThan(nav!.y)
  await page.screenshot({path: '/tmp/mediachips-settings-search.png'})
  await search.press('Enter')
  await expect(page).toHaveURL(/section=video_player/)
  await expect(page.locator('#settings-video-player')).toContainText('Максимальное разрешение конвертации')
  await expect(page.locator('#settings-video-player')).not.toContainText('Conversion quality')
  const quality=page.locator('#settings-video-player').getByRole('combobox',{name:'Качество конвертации',exact:true})
  await quality.press('ArrowDown')
  await expect(page.getByRole('option',{name:'Сбалансированное — рекомендуется',exact:true})).toBeVisible()
  await page.keyboard.press('Escape')
  await page.screenshot({path: '/tmp/mediachips-settings-viewing.png'})
  await search.fill('zzzz-no-setting')
  await expect(page.locator('.settings-search__results')).toContainText('Ничего не найдено')
  // Escape closes the results but keeps the typed query.
  await search.press('Escape')
  await expect(page.locator('.settings-search__results')).toBeHidden()
  await expect(search).toHaveValue('zzzz-no-setting')
})

test('NAS deep link selects NAS regardless of the remembered cloud provider', async ({page}) => {
  test.setTimeout(120_000)
  await open(page,'/settings?tab=connections&section=nas')
  await expect(page.locator('#settings-nas')).toBeVisible({timeout:30_000})
  await expect(page.locator('.sources-panel').getByRole('radio',{name:/^(Network|Сеть)$/})).toHaveAttribute('aria-checked','true')
  await page.locator('#settings-search').fill('Google Drive')
  await expect(page.locator('#settings-search')).toHaveValue('Google Drive')
  await expect(page.locator('.settings-search__results')).toBeVisible()
  await page.screenshot({path:'/tmp/mediachips-settings-drive-search.png'})
  await page.locator('.settings-search__results').getByRole('option',{name:/^[^·]+· Google Drive$/}).click()
  await expect(page).toHaveURL(/section=google_drive/)
  await expect(page.locator('#settings-google-drive')).toBeVisible({timeout:30_000})
  await expect(page.locator('.sources-panel').getByRole('radio',{name:/^(Cloud|Облако)$/})).toHaveAttribute('aria-checked','true')
  await page.screenshot({path: '/tmp/mediachips-settings-sources.png'})
})
