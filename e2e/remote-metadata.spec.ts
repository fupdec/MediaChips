import {test, expect} from '@playwright/test'
import {disableFeatureHints, dismissOnboardingIfVisible, waitForAppShell} from './helpers'

test('edits remote library metadata while the original is offline', async ({page}) => {
  await disableFeatureHints(page)
  const medium = {id: 987654, name: 'Offline NAS movie', basename: 'movie.mp4',
    path: 'nas://11111111-1111-4111-8111-111111111111/movie.mp4', mediaTypeId: 1,
    sourceTokens: '["nas","connection:11111111-1111-4111-8111-111111111111"]',
    sourceNames: 'Studio NAS', availability: 'unavailable', tags: [], values: [], rating: 0, favorite: false}
  const writes: Array<Record<string, unknown>> = []
  await page.route(/\/api\/media\/items$/i, route => route.fulfill({json: {items: [medium], total: 1, totalFiltered: 1, page: 1, pages: 1, limit: 25}}))
  await page.route(new RegExp(`/api/media/${medium.id}$`, 'i'), route => {
    if (route.request().method() === 'PUT') {
      const update = route.request().postDataJSON()
      writes.push(update)
      Object.assign(medium, update)
      return route.fulfill({json: [1]})
    }
    return route.fulfill({json: medium})
  })
  await page.route('**/api/TagsInMedia**', route => route.fulfill({json: []}))
  await page.route('**/api/ValuesInMedia**', route => route.fulfill({json: []}))
  await page.route('**/api/nas/**', route => route.fulfill({status: 409, json: {code: 'auth_required', message: 'Source disconnected'}}))
  await page.route('**/api/check-files', route => route.fulfill({json: {results: {[medium.path]: false}}}))
  await page.goto('/media?mediaTypeId=1')
  await waitForAppShell(page)
  await dismissOnboardingIfVisible(page)
  await page.locator(`[data-item-id="${medium.id}"] .description`).dblclick()
  const editor = page.locator('.edit-dialog-card')
  await editor.getByRole('button', {name: /File copies|Копии файла/}).click()
  await expect(editor.locator('.media-catalog-source-info')).toContainText('Studio NAS')
  await expect(editor.locator('.media-catalog-source-info')).toContainText(/Unavailable|Недоступен/)
  await editor.locator('textarea:not([readonly])').last().fill('Edited while offline')
  await editor.getByRole('button', {name: /^(Save|Сохранить)$/}).click()
  await expect.poll(() => writes.some(write => write.bookmark === 'Edited while offline')).toBe(true)
  await expect(editor).toBeHidden()
  await page.locator(`[data-item-id="${medium.id}"] .description`).dblclick()
  await expect(editor.locator('textarea:not([readonly])').last()).toHaveValue('Edited while offline')
})

test('offers catalog source and availability filters with readable labels while disconnected', async ({page}) => {
  await disableFeatureHints(page)
  const connection = 'connection:11111111-1111-4111-8111-111111111111'
  const filters = [
    {id: 90001, param: 'source', type: 'array', cond: 'in', val: [connection], active: true, lock: false, note: null},
    {id: 90002, param: 'availability', type: 'array', cond: 'in', val: ['unavailable'], active: true, lock: false, note: null},
  ]
  const queries: Array<{filters?: Array<{param: string; val: string[]}>}> = []
  await page.route('**/api/SavedFilter/findOrCreateHydrated', route => route.fulfill({json: [{id: 90000, filters}, false]}))
  await page.route('**/api/Media/catalogSources', route => route.fulfill({json: [{value: connection, name: 'Studio NAS'}]}))
  await page.route(/\/api\/media\/items$/i, route => {
    queries.push(route.request().postDataJSON())
    return route.fulfill({json: {items: [], total: 0, totalFiltered: 0, page: 1, pages: 1}})
  })
  await page.route(/\/api\/(?:SavedFilter|FilterRow)\/\d+$/i, route => route.fulfill({json: route.request().postDataJSON() || {}}))
  await page.route('**/api/FilterRow', route => {
    const payload = route.request().postDataJSON().filter
    const stored = filters.find(row => row.param === payload.param)!
    Object.assign(stored, payload)
    return route.fulfill({json: stored})
  })
  await page.goto('/media?mediaTypeId=1')
  await waitForAppShell(page)
  await dismissOnboardingIfVisible(page)
  await page.getByRole('radio', {name: /^(Edit|Редактирование)$/}).click()
  const source = page.getByRole('combobox', {name: /^(Source|Источник)$/})
  await source.click()
  await expect(page.getByRole('option', {name: 'Studio NAS', exact: true})).toBeVisible()
  await page.getByRole('option', {name: /^(Local files|Локальные файлы)$/}).click()
  await source.press('Escape')
  const availability = page.getByRole('combobox', {name: /^(Availability|Доступность)$/})
  await expect(availability).toBeVisible()
  await expect(page.getByText(/Last recorded status|Последнее сохранённое состояние/)).toBeVisible()
  await page.getByRole('button', {name: /^(Apply|Применить)$/}).click()
  await expect.poll(() => queries.flatMap(query => query.filters || []).filter(row => row.param === 'source').map(row => row.val))
    .toContainEqual(expect.arrayContaining(['local', connection]))
})
