import {test, expect} from '@playwright/test'
import {disableFeatureHints, dismissOnboardingIfVisible, waitForAppShell} from './helpers'

test('manages verified copies and explains why alternate edits cannot be attached', async ({page}) => {
  await disableFeatureHints(page)
  const medium = {id: 987655, name: 'A movie with copies', basename: 'movie.mp4',
    path: 'nas://11111111-1111-4111-8111-111111111111/movie.mp4', mediaTypeId: 1, hasCopies: 1,
    sourceTokens: '["nas","gdrive","local"]', availability: 'available', tags: [], values: [], rating: 0, favorite: false}
  const copies = [
    {id: 'nas-copy', provider: 'nas', path: medium.path, availability: 'unavailable', verified: true, verifiedAt: '2026-10-17'},
    {id: 'drive-copy', provider: 'gdrive', path: 'gdrive://backup', availability: 'available', verified: true, verifiedAt: '2026-10-17'},
    {id: 'local-copy', provider: 'local', path: '/Volumes/Movies/local.mp4', availability: 'available', verified: true, verifiedAt: '2026-10-17'},
  ]
  let preferredId: string | null = null
  const writes: string[] = []
  await page.route(/\/api\/media\/items$/i, route => route.fulfill({json: {items: [medium], total: 1, totalFiltered: 1, page: 1, pages: 1, limit: 25}}))
  await page.route(new RegExp(`/api/media/${medium.id}$`, 'i'), route => route.fulfill({json: medium}))
  await page.route('**/api/TagsInMedia**', route => route.fulfill({json: []}))
  await page.route('**/api/ValuesInMedia**', route => route.fulfill({json: []}))
  await page.route(new RegExp(`/api/Media/${medium.id}/copies(?:/.*)?$`), route => {
    const request = route.request()
    if (request.method() === 'PUT') {
      preferredId = request.postDataJSON().copyId
      writes.push(preferredId || 'automatic')
    }
    if (request.method() === 'POST') return route.fulfill({status: 409, json: {code: 'copy_content_mismatch'}})
    if (request.method() === 'DELETE') {
      copies.splice(copies.findIndex(copy => request.url().endsWith(copy.id)), 1)
    }
    return route.fulfill({json: {copies, preferredId}})
  })
  await page.goto('/media?mediaTypeId=1')
  await waitForAppShell(page)
  await dismissOnboardingIfVisible(page)
  await page.locator(`[data-item-id="${medium.id}"] .description`).dblclick()
  const editor = page.locator('.edit-dialog-card')
  await editor.getByRole('button', {name: /^(File copies|Копии файла)$/}).click()
  await expect(editor.getByText('/Volumes/Movies/local.mp4', {exact: true})).toBeVisible()
  await expect(editor.getByText('gdrive://backup', {exact: true})).toBeVisible()
  const preferred = editor.getByRole('combobox', {name: /^(Preferred source|Предпочтительный источник)$/})
  await preferred.press('ArrowDown')
  await page.getByRole('option', {name: '/Volumes/Movies/local.mp4', exact: true}).click()
  await expect.poll(() => writes).toContain('local-copy')
  await preferred.press('ArrowDown')
  await page.getByRole('option', {name: /Automatic|Автоматически/}).click()
  await expect.poll(() => writes).toContain('automatic')
  await editor.getByRole('textbox', {name: /Path to an existing local copy|Путь к существующей локальной копии/}).fill('/Volumes/Movies/directors-cut.mp4')
  await editor.getByRole('button', {name: /Verify and add copy|Проверить и добавить копию/}).click()
  await expect(editor.locator('.media-copies__error')).toContainText(/contents differ|Содержимое различается/)
  await expect(editor.getByText('gdrive://backup', {exact: true})).toBeVisible()
})

test('keeps full SHA-256 comparison optional and persists the library setting', async ({page}) => {
  await disableFeatureHints(page)
  let value = '0'
  const writes: string[] = []
  await page.route('**/api/Setting', async route => {
    const response = await route.fetch()
    const rows = await response.json() as Array<{option: string; value: string}>
    await route.fulfill({response, json: [...rows.filter(row => row.option !== 'copyVerificationSha256'), {option: 'copyVerificationSha256', value}]})
  })
  await page.route('**/api/Setting/copyVerificationSha256', route => {
    if (route.request().method() === 'PUT') {
      value = String(route.request().postDataJSON().value)
      writes.push(value)
      return route.fulfill({json: [1]})
    }
    return route.fulfill({json: {option: 'copyVerificationSha256', value}})
  })
  await page.goto('/settings?tab=database&section=find_duplicates')
  await waitForAppShell(page)
  await dismissOnboardingIfVisible(page)
  const setting = page.getByTestId('copy-sha256-setting')
  const toggle = setting.locator('input[type="checkbox"]')
  await expect(toggle).not.toBeChecked()
  await expect(setting).toContainText(/first and last 64|первые и последние 64/)
  await toggle.press('Space')
  await expect.poll(() => writes).toEqual(['1'])
  await page.reload()
  await waitForAppShell(page)
  await expect(toggle).toBeChecked()
  await toggle.press('Space')
  await expect.poll(() => writes).toEqual(['1', '0'])
  await expect(toggle).not.toBeChecked()
})
