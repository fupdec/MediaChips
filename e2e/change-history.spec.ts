import {test, expect} from '@playwright/test'
import {disableFeatureHints, dismissOnboardingIfVisible, waitForAppShell} from './helpers'

test('reviews a bulk operation, handles conflict and restores a single field', async ({page}) => {
  await disableFeatureHints(page)
  let restored = false
  const payloads: unknown[] = []
  await page.route('**/api/change-history**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/restore')) {
      const payload = route.request().postDataJSON()
      payloads.push(payload)
      if (payload.fieldId === undefined) return route.fulfill({status: 409, json: {message: 'Field changed'}})
      restored = true
      return route.fulfill({json: {restored: 1}})
    }
    if (url.pathname.endsWith('/bulk-test')) return route.fulfill({json: {hasMore: false, items: [
      {id: 101, entityType: 'media', entityId: 7, entityName: 'Expedition', field: 'rating', fieldLabel: 'rating', before: 2, after: 5, restoredAt: restored ? '2026-10-17T10:05:00Z' : null},
      {id: 102, entityType: 'media', entityId: 8, entityName: 'Coast', field: 'value:2', fieldLabel: 'Mood', before: {value: ''}, after: {value: 'Calm'}, restoredAt: null},
    ]}})
    return route.fulfill({json: {hasMore: false, items: [
      {id: 'bulk-test', source: 'POST /api/bulk-meta/apply', occurredAt: '2026-10-17T10:00:00Z', fields: 605, items: 605, remaining: restored ? 604 : 605},
    ]}})
  })
  await page.goto('/settings?tab=database')
  await waitForAppShell(page)
  await dismissOnboardingIfVisible(page)
  await page.locator('#settings-change-history').getByRole('button').click()
  const dialog = page.getByRole('dialog', {name: /Change history and undo|История изменений и отмена/})
  await expect(dialog).toContainText('Expedition')
  await expect(dialog).toContainText('605')
  await expect(dialog).toContainText(/Bulk editing|Массовое редактирование/)
  await dialog.screenshot({animations: 'disabled', path: test.info().outputPath('change-history-before-restore.png')})
  await dialog.getByRole('button', {name: /Undo operation|Отменить операцию/}).click()
  await expect(dialog.getByRole('alert')).toContainText(/Restoration stopped|Восстановление остановлено/)
  const field = dialog.locator('.history-field').filter({hasText: 'Expedition'})
  await field.getByRole('button', {name: /Restore field|Восстановить поле/}).click()
  await expect(dialog.getByRole('status')).toContainText(/Fields restored: 1|Восстановлено полей: 1/)
  await expect(field.getByRole('button', {name: /Restored|Восстановлено/})).toBeDisabled()
  expect(payloads).toEqual([{}, {fieldId: 101}])
  await dialog.screenshot({animations: 'disabled', path: test.info().outputPath('change-history-desktop.png')})
  await page.setViewportSize({width: 390, height: 844})
  await dialog.screenshot({animations: 'disabled', path: test.info().outputPath('change-history-mobile.png')})
  await field.scrollIntoViewIfNeeded()
  await dialog.screenshot({animations: 'disabled', path: test.info().outputPath('change-history-mobile-values.png')})
  const overflow = await dialog.evaluate(el => el.scrollWidth > el.clientWidth)
  expect(overflow).toBe(false)
})

test('opens history from the global toolbar and shows the empty state', async ({page}) => {
  await disableFeatureHints(page)
  await page.route('**/api/Setting', async route => {
    const response = await route.fetch()
    const rows = await response.json() as Array<{option: string; value: string}>
    await route.fulfill({response, json: [...rows.filter(row => row.option !== 'showHistoryInAppBar'), {option: 'showHistoryInAppBar', value: '1'}]})
  })
  await page.route('**/api/change-history**', route => route.fulfill({json: {items: [], hasMore: false}}))
  await page.goto('/settings?tab=general')
  await waitForAppShell(page)
  await dismissOnboardingIfVisible(page)
  await page.getByRole('button', {name: /Change history and undo|История изменений и отмена/}).click()
  const dialog = page.getByRole('dialog', {name: /Change history and undo|История изменений и отмена/})
  await expect(dialog).toContainText(/No recorded changes|Записанных изменений пока нет/)
  await expect(dialog.getByRole('button', {name: /Undo operation|Отменить операцию/})).toHaveCount(0)
})
