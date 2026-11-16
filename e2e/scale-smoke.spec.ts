import {test, expect} from '@playwright/test'
import {
  assessWatchedFolder,
  bulkImportRoots,
  createWatchedFolder,
  dismissOnboardingIfVisible,
  getImageMediaType,
  listMediaItems,
  waitForAppShell,
  writeTinyJpegDir,
} from './helpers'

test.describe('A5 scale smoke: import + scroll + watcher', () => {
  test('bulk import, paginated list, watched-folder assess/create, UI scroll', async ({
    request,
    page,
  }) => {
    const imageType = await getImageMediaType(request)
    const {dir, cleanup} = writeTinyJpegDir(40)

    try {
      const imported = await bulkImportRoots(request, {
        type: imageType,
        roots: [dir],
      })
      expect(imported.inserted).toBe(40)
      expect(imported.errors).toEqual([])

      const page1 = await listMediaItems(request, {
        mediaTypeId: imageType.id,
        page: 1,
        limit: 25,
      })
      const page1Items = page1.results ?? page1.items ?? []
      expect(page1Items.length).toBeGreaterThan(0)
      expect(page1Items.length).toBeLessThanOrEqual(25)

      const page2 = await listMediaItems(request, {
        mediaTypeId: imageType.id,
        page: 2,
        limit: 25,
      })
      const page2Items = page2.results ?? page2.items ?? []
      expect(page2Items.length).toBeGreaterThan(0)

      const assess = await assessWatchedFolder(request, dir)
      expect(assess.path).toBeTruthy()
      expect(Number(assess.fileCount)).toBeGreaterThanOrEqual(40)

      await createWatchedFolder(request, {
        path: dir,
        types: [imageType.id],
        name: 'e2e-scale-smoke',
      })

      await page.goto('/media')
      await waitForAppShell(page)
      await dismissOnboardingIfVisible(page)

      const layout = page.locator('.layout-items, .items-page, .v-main').first()
      await expect(layout).toBeVisible({timeout: 30_000})

      await page.mouse.wheel(0, 2400)
      await page.waitForTimeout(400)
      await page.mouse.wheel(0, 2400)
      await expect(layout).toBeVisible()
    } finally {
      cleanup()
    }
  })
})
