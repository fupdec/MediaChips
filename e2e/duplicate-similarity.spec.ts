import {test, expect, type Page} from '@playwright/test'
import {disableFeatureHints, dismissOnboardingIfVisible, waitForAppShell} from './helpers'
import {defaultDuplicatePolicy, groupSimilarityItems} from '../shared/duplicateSimilarity'
async function settings(page: Page, autoMerge = false) {
  let value = JSON.stringify({...defaultDuplicatePolicy(), autoMerge})
  await disableFeatureHints(page)
  await page.route('**/api/Setting', async route => {
    const response = await route.fetch()
    const rows = await response.json() as Array<{option: string; value: string}>
    await route.fulfill({response, json: [...rows.filter(row => row.option !== 'duplicateSimilarityPolicy'), {option: 'duplicateSimilarityPolicy', value}]})
  })
  await page.route('**/api/Setting/duplicateSimilarityPolicy', route => {
    if (route.request().method() === 'PUT') value = String(route.request().postDataJSON().value)
    return route.fulfill({json: {option: 'duplicateSimilarityPolicy', value}})
  })
  await page.goto('/settings?tab=database&section=find_duplicates')
  await waitForAppShell(page)
  await dismissOnboardingIfVisible(page)
  return () => JSON.parse(value)
}
test('persists concise similarity settings and disables automatic deletion', async ({page}) => {
  const read = await settings(page)
  const card = page.locator('.similarity-settings')
  await card.getByRole('combobox', {name: /Primary file|Основной файл/}).press('ArrowDown')
  await page.getByRole('option', {name: /Largest file|Самый большой/, exact: true}).click()
  const preview = card.locator('.similarity-preview')
  const results = preview.getByRole('listitem')
  await expect(results).toHaveCount(5)
  const pathResult = results.filter({hasText: /Path|Путь/})
  await expect(pathResult).toBeVisible()
  await expect(pathResult).toContainText(/No match|Не совпало/)
  await card.getByText(/^(Same file|Один и тот же файл)$/).click()
  await expect(pathResult).toContainText(/Matched|^.*Совпало/)
  await card.getByRole('combobox', {name: /Other files|Остальные файлы/}).press('ArrowDown')
  await page.getByRole('option', {name: /Delete other files|Удалить остальные/, exact: true}).click()
  await expect(card.getByRole('checkbox', {name: /Merge when starting a search|Объединять при запуске поиска/})).toBeDisabled()
  // Settings autosave shortly after the last change.
  await expect.poll(() => read().priority).toBe('largest')
  await expect.poll(() => read().files).toBe('delete')
  await page.reload()
  await waitForAppShell(page)
  await expect(card.locator('.v-select').first()).toContainText(/Largest file|Самый большой/)
  await card.scrollIntoViewIfNeeded()
  await card.screenshot({path: '/tmp/mediachips-similarity-settings.png'})
})
for (const automatic of [false, true]) {
  test(`merges with ${automatic ? 'automatic file retention' : 'a manual primary and confirmed deletion'}`, async ({page}) => {
    let merged = false
    const writes: Array<Record<string, unknown>> = []
    const items = [1, 2].map(id => ({id: 987650 + id, path: `/movies/${id}.mp4`, basename: `${id}.mp4`, name: `Movie ${id}`, mediaTypeId: 1, filesize: 200000, oshash: '1234567890abcdef', tags: [], values: [], rating: 0, favorite: false}))
    const groups = groupSimilarityItems(items, defaultDuplicatePolicy())
    await page.route('**/api/Media/duplicateGroups', route => route.fulfill({json: {groups: merged ? [] : groups}}))
    await page.route('**/api/Media/basics', route => route.fulfill({json: {items, total: 2, totalFiltered: 2}}))
    await page.route('**/api/Media/merge', route => {
      const body = route.request().postDataJSON(); writes.push(body); merged = true
      return route.fulfill({json: {survivor: items.find(item => item.id === body.survivorId), deletedIds: body.sourceIds, migrated: {}}})
    })
    await settings(page, automatic)
    await page.locator('#settings-find-duplicates').getByRole('button', {name: /Open duplicate review|Открыть.*дубликат|Review duplicates|Открыть просмотр/i}).click()
    if (!automatic) {
      const dialog = page.locator('.dup-review-root')
      await expect(dialog.locator('.dup-review-card')).toHaveCount(2)
      await dialog.locator('.dup-review-card').nth(1).click()
      await expect(dialog.locator('.dup-review-card').nth(1)).toHaveClass(/survivor/)
      await dialog.getByRole('combobox', {name: /Other files|Остальные файлы/}).press('ArrowDown')
      await page.getByRole('option', {name: /Delete other files|Удалить остальные/, exact: true}).click()
      await expect(page.getByRole('option', {name: /Delete other files|Удалить остальные/, exact: true})).toBeHidden()
      await page.screenshot({path: '/tmp/mediachips-similarity-review.png', fullPage: true})
      await dialog.getByRole('button', {name: /^(Merge|Объединить)$/}).click()
      await expect(page.locator('.confirm-dialog')).toContainText(/cannot be undone|нельзя отменить/)
      expect(writes).toEqual([])
      await page.locator('.confirm-dialog').getByRole('button', {name: /^(Confirm|Подтвердить|Yes|Да|Delete|Удалить)$/}).click()
    }
    await expect.poll(() => writes.length).toBe(1)
    expect(writes[0]).toMatchObject({similarity: true, survivorId: items[automatic ? 0 : 1].id,
      deleteSourceIds: automatic ? [] : [items[0].id], confirmFileDeletion: !automatic})
  })
}
