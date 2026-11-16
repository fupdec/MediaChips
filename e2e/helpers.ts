import fs from 'fs'
import os from 'os'
import path from 'path'
import {expect, type APIRequestContext, type Page} from '@playwright/test'
import {FEATURE_HINTS} from '../src/services/featureHints'

/** Keep unrelated delayed coachmarks from covering an import dialog. */
export async function disableFeatureHints(page: Page) {
  await page.route(/\/(?:config\.json|api\/config)(?:\?|$)/, async route => {
    const response = await route.fetch()
    const config = await response.json()
    await route.fulfill({response, json: {...config, seenFeatureHints: FEATURE_HINTS.map(hint => hint.id).join(',')}})
  })
}

const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9])

export async function waitForBlockingOverlaysToClose(page: Page) {
  await expect(page.locator('.v-overlay--active')).toHaveCount(0, {timeout: 15_000})
}

export async function dismissOnboardingIfVisible(page: Page) {
  const skipButton = page.getByRole('button', {name: /^(skip|omitir|пропустить|跳过)$/i})
  const deadline = Date.now() + 20_000

  while (Date.now() < deadline) {
    if (await skipButton.isVisible().catch(() => false)) {
      await skipButton.click()
      await expect(skipButton).toBeHidden({timeout: 15_000})
      await waitForBlockingOverlaysToClose(page)
      return
    }

    const activeOverlays = await page.locator('.v-overlay--active').count()
    if (activeOverlays === 0) {
      await page.waitForTimeout(500)
      if (
        !(await skipButton.isVisible().catch(() => false))
        && await page.locator('.v-overlay--active').count() === 0
      ) {
        return
      }
      continue
    }

    await page.waitForTimeout(250)
  }

  await waitForBlockingOverlaysToClose(page)
}

export async function waitForAppShell(page: Page) {
  await expect(page.locator('#app')).toBeVisible({timeout: 30_000})
  await expect(page.locator('.v-application')).toBeVisible({timeout: 30_000})
}

export async function openSettingsTab(page: Page, tabId: string) {
  await page.goto('/settings')
  await waitForAppShell(page)
  await dismissOnboardingIfVisible(page)
  await page.locator(`#${tabId}`).click()
}

export type MediaTypeRow = {
  id: number
  type?: string | null
  name?: string | null
  extensions?: string | null
}

export async function getImageMediaType(request: APIRequestContext): Promise<MediaTypeRow> {
  const response = await request.get('/api/MediaType')
  expect(response.ok()).toBeTruthy()
  const types = await response.json() as MediaTypeRow[]
  const image = types.find((row) => String(row.type || '').toLowerCase() === 'image')
  expect(image?.id).toBeTruthy()
  return image!
}

export function writeTinyJpegDir(count: number, prefix = 'mc-e2e-import-'): {dir: string; cleanup: () => void} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  for (let i = 0; i < count; i += 1) {
    fs.writeFileSync(
      path.join(dir, `smoke-${String(i).padStart(3, '0')}.jpg`),
      TINY_JPEG,
    )
  }
  return {
    dir,
    cleanup: () => fs.rmSync(dir, {recursive: true, force: true}),
  }
}

export async function bulkImportRoots(
  request: APIRequestContext,
  options: {type: number | MediaTypeRow; roots: string[]},
) {
  const type = typeof options.type === 'number'
    ? options.type
    : {id: options.type.id, type: options.type.type, extensions: options.type.extensions}
  const response = await request.post('/api/Task/addMediaBulk', {
    data: {
      mode: 'lite',
      type,
      roots: options.roots,
    },
    timeout: 120_000,
  })
  expect(response.ok()).toBeTruthy()
  return response.json() as Promise<{
    scanned: number
    inserted: number
    skipped: number
    errors: string[]
  }>
}

export async function listMediaItems(
  request: APIRequestContext,
  body: {mediaTypeId: number; page?: number; limit?: number; skipTotals?: boolean},
) {
  const response = await request.post('/api/Media/items', {
    data: {
      mediaTypeId: body.mediaTypeId,
      page: body.page ?? 1,
      limit: body.limit ?? 60,
      skipTotals: body.skipTotals ?? true,
      sortBy: 'id',
      direction: 'desc',
    },
  })
  expect(response.ok()).toBeTruthy()
  return response.json() as Promise<{
    results?: unknown[]
    items?: unknown[]
    total?: number
    [key: string]: unknown
  }>
}

export async function createWatchedFolder(
  request: APIRequestContext,
  options: {path: string; types: number[]; name?: string},
) {
  const response = await request.post('/api/WatchedFolder', {
    data: {
      folder: {
        path: options.path,
        name: options.name ?? 'e2e-watched',
        watch: true,
      },
      types: options.types,
    },
  })
  expect(response.status()).toBe(201)
}

export async function assessWatchedFolder(request: APIRequestContext, folderPath: string) {
  const response = await request.post('/api/WatchedFolder/assess', {
    data: {path: folderPath},
  })
  expect(response.ok()).toBeTruthy()
  return response.json() as Promise<{
    path: string
    fileCount: number
    grade?: string
    [key: string]: unknown
  }>
}

/** Fails with the elements that stick out past the container's right edge, so a layout overflow names its cause. */
export async function expectNoHorizontalOverflow(locator: ReturnType<Page['locator']>) {
  // Re-check until layout settles: right after a viewport change the shell (v-main padding, drawers) is still animating.
  await expect(async () => {
    await checkHorizontalOverflow(locator)
  }).toPass({timeout: 5_000})
}

async function checkHorizontalOverflow(locator: ReturnType<Page['locator']>) {
  const report = await locator.evaluate(root => {
    const box = root.getBoundingClientRect()
    const describe = (el: Element) => {
      const parts: string[] = []
      for (let node: Element | null = el; node && node !== root && parts.length < 4; node = node.parentElement) {
        const cls = [...node.classList].filter(name => !name.startsWith('v-theme')).slice(0, 2).join('.')
        parts.unshift(node.tagName.toLowerCase() + (cls ? '.' + cls : ''))
      }
      return parts.join(' > ')
    }
    const offenders = [...root.querySelectorAll('*')]
      .map(el => ({el, right: el.getBoundingClientRect().right, width: el.getBoundingClientRect().width}))
      .filter(item => item.width > 0 && item.right > box.right + 1)
      // Keep the outermost offenders: a child of an overflowing element is usually not the cause.
      .filter((item, _, all) => !all.some(other => other.el !== item.el && other.el.contains(item.el)))
      .slice(0, 8)
      .map(item => `${describe(item.el)} (+${Math.round(item.right - box.right)}px, width ${Math.round(item.width)})`)
    return {width: root.clientWidth, scrollWidth: root.scrollWidth, offenders}
  })
  expect(report.scrollWidth, `Horizontal overflow:\n${report.offenders.join('\n')}`).toBeLessThanOrEqual(report.width)
}
