import {test, expect} from '@playwright/test'
import {disableFeatureHints, dismissOnboardingIfVisible, waitForAppShell} from './helpers'

const bundle = {
  format: 'mediachips.metadata', version: 1, exportedAt: '2026-10-17T00:00:00Z',
  media: [{id: 7, path: '/portable/movie.mp4', name: 'Portable movie', rating: 4.5, favorite: true}],
  fields: [{id: 2, name: 'Seen', type: 'boolean'}], mediaTypes: [], tags: [], marks: [],
  mediaTags: [], tagTags: [], mediaValues: [{mediaId: 7, metaId: 2, value: false, rawValue: '0'}],
  tagValues: [], fieldAssignments: [], fieldPins: [],
}

test('reviews conflicts, requires decisions and refreshes a stale import preview', async ({page}) => {
  await disableFeatureHints(page)
  let previews = 0, imports = 0
  let payload: unknown
  await page.route('**/api/metadata-transfer/**', async route => {
    if (route.request().url().endsWith('/preview')) {
      previews++
      return route.fulfill({json: {token: String(previews).repeat(64), counts: {media: 1, fields: 1, tags: 0, marks: 0}, conflicts: [{
        key: 'media:7', entity: 'media', name: 'Portable movie', blocked: false,
        current: {rating: 2, favorite: false}, incoming: {rating: 4.5, favorite: true},
      }]}})
    }
    imports++; payload = route.request().postDataJSON()
    if (imports === 1) return route.fulfill({status: 409, json: {message: 'Library changed. Preview the import again.'}})
    return route.fulfill({json: {counts: {media: 1, fields: 1, tags: 0, marks: 0}, conflicts: [], token: '2'.repeat(64)}})
  })
  await page.goto('/settings?tab=files'); await waitForAppShell(page); await dismissOnboardingIfVisible(page)
  await page.locator('#settings-metadata-transfer').getByRole('button').click()
  const dialog = page.getByRole('dialog', {name: /Import and export metadata|Импорт и экспорт метаданных/})
  await expect(dialog.getByRole('button', {name: /^(Close|Закрыть)$/})).toBeVisible()
  await dialog.locator('input[type=file]').setInputFiles({name: 'transfer.mediachips.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bundle))})
  await expect(dialog).toContainText('Portable movie')
  const apply = dialog.getByRole('button', {name: /Import reviewed metadata|Импортировать проверенные метаданные/})
  await expect(apply).toBeDisabled()
  expect(imports).toBe(0)
  await dialog.getByRole('button', {name: /Portable movie/}).click()
  await expect(dialog).toContainText('4.5')
  await page.setViewportSize({width: 390, height: 844})
  await dialog.screenshot({animations: 'disabled', path: test.info().outputPath('metadata-conflicts-mobile.png')})
  await dialog.getByRole('button', {name: /Use all incoming data|Принять все входящие данные/}).click()
  await apply.click()
  await expect(dialog).toContainText('Library changed')
  await dialog.getByRole('button', {name: /Preview conflicts again|Повторить просмотр конфликтов/}).click()
  await expect(apply).toBeDisabled()
  await dialog.getByRole('button', {name: /Keep all current data|Сохранить все текущие данные/}).click()
  await apply.click()
  await expect(dialog).toContainText(/Metadata imported|Метаданные импортированы/)
  expect(imports).toBe(2)
  expect(payload).toMatchObject({bundle, token: '2'.repeat(64), resolutions: {'media:7': 'keep'}})
})

test('blocks incompatible field types before import', async ({page}) => {
  await disableFeatureHints(page)
  let imports = 0
  await page.route('**/api/metadata-transfer/**', route => {
    if (route.request().url().endsWith('/import')) imports++
    return route.fulfill({json: {token: 'a'.repeat(64), counts: {media: 1, fields: 1, tags: 0, marks: 0}, conflicts: [{
      key: 'fields:2', entity: 'fields', name: 'Seen', blocked: true, current: {type: 'string'}, incoming: {type: 'boolean'},
    }]}})
  })
  await page.goto('/settings?tab=files'); await waitForAppShell(page); await dismissOnboardingIfVisible(page)
  await page.locator('#settings-metadata-transfer').getByRole('button').click()
  const dialog = page.getByRole('dialog', {name: /Import and export metadata|Импорт и экспорт метаданных/})
  await expect(dialog.getByRole('button', {name: /^(Close|Закрыть)$/})).toBeVisible()
  await dialog.locator('input[type=file]').setInputFiles({name: 'transfer.mediachips.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bundle))})
  await dialog.getByRole('button', {name: /Seen/}).click()
  await expect(dialog).toContainText(/incompatible|несовместимы/i)
  await dialog.getByRole('button', {name: /Use all incoming data|Принять все входящие данные/}).click()
  await expect(dialog.getByRole('button', {name: /Import reviewed metadata|Импортировать проверенные метаданные/})).toBeDisabled()
  expect(imports).toBe(0)
})
