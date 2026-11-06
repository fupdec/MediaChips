import {test, expect} from '@playwright/test'
import {disableFeatureHints, dismissOnboardingIfVisible, waitForAppShell} from './helpers'

test('opens backups for a database and switches the list without activating it', async ({page, request}) => {
  const config = await (await request.get('/api/config')).json()
  const active = config.databases.find((entry: {active: boolean}) => entry.active)
  const other = {id: 'backups-e2e-other', name: 'Backup test library', active: false, createdAt: Date.now()}
  expect((await request.post('/api/update-config', {data: {databases: [...config.databases, other]}})).ok()).toBeTruthy()
  try {
    await disableFeatureHints(page)
    await page.addInitScript(() => sessionStorage.setItem('mediachips.locale', 'en'))
    await page.route('**/api/Setting', async route => {
      const response = await route.fetch()
      const rows = await response.json()
      await route.fulfill({response, json: [...rows.filter((row: {option: string}) => row.option !== 'locale'), {option: 'locale', value: 'en'}]})
    })
    await page.route('**/api/TasksBackups/getBackups?*', route => {
      const id = new URL(route.request().url()).searchParams.get('databaseId')
      return route.fulfill({json: [{date: id === other.id ? 'other-backup' : 'active-backup', size: '1.00'}]})
    })
    await page.goto('/settings?tab=database')
    await waitForAppShell(page)
    await dismissOnboardingIfVisible(page)
    const row = page.locator('.databases-card').filter({hasText: other.name})
    await row.getByRole('button', {name: /^Backups/}).click()
    const dialog = page.locator('.backups-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(other.name)
    await expect(dialog.locator('.backups-card')).toContainText('other:backup')
    await dialog.locator('.backups-card').click()
    await dialog.getByRole('combobox').click()
    await page.getByRole('option', {name: active.name, exact: true}).click()
    await expect(dialog.locator('.backups-card')).toContainText('active:backup')
    await expect(dialog.locator('.backups-card--selected')).toHaveCount(0)
    expect((await (await request.get('/api/config')).json()).databases.find((entry: {active: boolean}) => entry.active).id).toBe(active.id)
  } finally {
    await request.post('/api/update-config', {data: {databases: config.databases}})
  }
})
