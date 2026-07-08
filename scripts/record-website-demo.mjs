#!/usr/bin/env node
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdir, unlink } from 'node:fs/promises'
import { join, dirname } from 'node:path'

const BASE_URL = process.env.APP_URL || 'http://localhost:3000'
const OUT_DIR = process.env.OUT_DIR || '/Users/vit/Desktop/work/mediachips-website/public/videos/demos'
const TMP_DIR = process.env.TMP_DIR || join(dirname(OUT_DIR), '.demo-videos-tmp')

const VIEWPORT = { width: 1440, height: 900 }
const ONLY = process.argv.slice(2).map((name) => name.replace(/\.mp4$/, ''))

async function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.round(ms * 1.4)))
}

async function dismissOnboarding(page) {
  const skip = page.getByRole('button', { name: /^(skip|omitir|пропустить|跳过)$/i })
  for (let i = 0; i < 40; i++) {
    if (await skip.isVisible().catch(() => false)) {
      await skip.click()
      await pause(800)
    }
    if ((await page.locator('.v-overlay--active').count()) === 0) break
    await pause(300)
  }
}

async function closeOverlays(page, times = 4) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press('Escape')
    await pause(250)
  }
}

async function setSetting(page, option, value) {
  await page.request.put(`${BASE_URL}/api/Setting/${option}`, { data: { value } })
}

async function prepareApp(page, settings = {}) {
  const defaults = {
    sfwMode: '0',
    onboardingCompleted: '1',
    locale: 'en',
    open_player_in_separate_window: '0',
    isPlayVideoInSystemPlayer: '0',
    videoPreviewStatic: 'grid',
    videoPreviewHover: 'timeline',
    big_video_preview: '0',
    play_sound_on_video_preview: '0',
  }

  for (const [option, value] of Object.entries({ ...defaults, ...settings })) {
    await setSetting(page, option, value)
  }

  await page.goto(BASE_URL)
  await page.locator('#app').waitFor({ state: 'visible', timeout: 60_000 })
  await page.locator('.v-application').waitFor({ state: 'visible', timeout: 60_000 })
  await dismissOnboarding(page)
  await page.reload({ waitUntil: 'networkidle' })
  await dismissOnboarding(page)
}

async function waitForMediaGrid(page, mediaTypeId = 1, { requireItems = true } = {}) {
  await page.goto(`${BASE_URL}/media?mediaTypeId=${mediaTypeId}`)
  await page.locator('.v-application').waitFor({ state: 'visible', timeout: 60_000 })
  await dismissOnboarding(page)
  if (requireItems) {
    await page.locator('.item').first().waitFor({ state: 'visible', timeout: 90_000 })
  } else {
    await page.locator('.v-main').waitFor({ state: 'visible', timeout: 60_000 })
    await pause(2500)
  }
  await pause(1500)
}

async function moveMouse(page, x, y) {
  await page.mouse.move(x, y)
  await pause(50)
}

async function scrubElement(page, locator, steps = 10, pauseMs = 200) {
  const box = await locator.boundingBox()
  if (!box) return
  const y = box.y + box.height * 0.45
  for (let i = 0; i <= steps; i++) {
    const x = box.x + 12 + ((box.width - 24) * i) / steps
    await moveMouse(page, x, y)
    await pause(pauseMs)
  }
}

async function scrollMain(page, deltaY, steps = 12) {
  const main = page.locator('.v-main').first()
  const box = await main.boundingBox()
  if (!box) return
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await moveMouse(page, x, y)
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, deltaY / steps)
    await pause(140)
  }
}

async function openAppearanceToolbar(page) {
  await page.evaluate(() => {
    const pinia = document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    const toolbar = pinia?._s?.get('useToolbarStore')
    if (toolbar) toolbar.appearance.show = true
  })

  const panel = page.locator('.toolbar-section-title').first()
  if (!(await panel.isVisible().catch(() => false))) {
    const fab = page.locator('.speed-dial-container .v-btn').filter({ has: page.locator('.mdi-flash, .mdi-chevron-up') }).first()
    if (await fab.isVisible().catch(() => false)) {
      await fab.hover()
      await pause(500)
      await page.locator('.speed-dial-container .mdi-tune').first().click()
    }
  }

  await panel.waitFor({ state: 'visible', timeout: 15_000 })
  await pause(800)
}

async function openFilters(page) {
  const filterBtn = page.locator('.v-app-bar').getByRole('button', { name: /filter/i }).first()
  if (await filterBtn.isVisible().catch(() => false)) {
    await filterBtn.click()
  } else {
    await page.locator('.v-app-bar button').filter({ has: page.locator('[class*="filter"]') }).first().click()
  }
  await page.locator('.filters-drawer').waitFor({ state: 'visible', timeout: 15_000 })
  await pause(800)
}

async function openPlayerAt(page, index = 0) {
  const opened = await page.evaluate(async (itemIndex) => {
    const pinia = document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
    const itemsStore = pinia?._s?.get('items')
    const video = itemsStore?.itemsOnPage?.[itemIndex]
    if (!video) return false
    return itemsStore.playVideo({ video, videos: itemsStore.itemsOnPage, trustPath: true })
  }, index)
  if (!opened) throw new Error(`Could not open player for item #${index}`)
  await page.locator('.v-overlay--active .dialog-player').waitFor({ state: 'visible', timeout: 30_000 })
  await pause(2000)
}

async function openGlobalSearch(page) {
  await page.keyboard.press('/')
  await page.locator('.global-search').waitFor({ state: 'visible', timeout: 10_000 })
  await pause(600)
}

async function recordHome(page) {
  await page.goto(BASE_URL)
  await page.locator('.v-application').waitFor({ state: 'visible', timeout: 60_000 })
  await pause(2500)
  await scrollMain(page, 320, 10)
  await pause(2000)
  await scrollMain(page, 320, 10)
  await pause(2000)
  await scrollMain(page, -280, 8)
  await pause(1500)
}

async function recordBrowseVideos(page) {
  await waitForMediaGrid(page, 1)
  await pause(2000)
  await scrollMain(page, 300, 10)
  await pause(1500)

  await openAppearanceToolbar(page)
  await page.locator('.v-chip-group').getByText('XXL', { exact: true }).click()
  await pause(2000)
  await page.locator('.v-chip-group').getByText('M', { exact: true }).first().click()
  await pause(1500)
  await page.locator('.v-chip').filter({ has: page.locator('.mdi-view-sequential') }).first().click()
  await pause(2500)
  await page.locator('.v-chip').filter({ has: page.locator('.mdi-view-module') }).first().click()
  await pause(2000)
  await closeOverlays(page)
  await scrollMain(page, 260, 8)
  await pause(1500)
}

async function recordBrowseImages(page) {
  await waitForMediaGrid(page, 2, { requireItems: false })
  await pause(2000)
  await openAppearanceToolbar(page).catch(() => {})
  const masonry = page.locator('.v-chip').filter({ has: page.locator('.mdi-view-dashboard') }).first()
  if (await masonry.isVisible().catch(() => false)) {
    await masonry.click()
    await pause(2500)
  }
  await closeOverlays(page)
  await waitForMediaGrid(page, 1)
  await pause(2000)
  await scrollMain(page, 280, 10)
  await pause(2000)
}

async function recordBrowseAudio(page) {
  await waitForMediaGrid(page, 3, { requireItems: false })
  await pause(2500)
  await openFilters(page).catch(() => {})
  await pause(2000)
  await closeOverlays(page, 3)
  await waitForMediaGrid(page, 1)
  const item = page.locator('.item').first()
  await item.hover()
  await pause(2500)
  await scrollMain(page, 220, 8)
  await pause(1500)
}

async function recordBrowseText(page) {
  await waitForMediaGrid(page, 4, { requireItems: false })
  await pause(2500)
  await openAppearanceToolbar(page).catch(() => {})
  await pause(2000)
  await closeOverlays(page)
  await waitForMediaGrid(page, 1)
  await scrollMain(page, 260, 10)
  await pause(2000)
}

async function recordPreviewGrid(page) {
  await setSetting(page, 'videoPreviewStatic', 'grid')
  await setSetting(page, 'videoPreviewHover', 'timeline')
  await waitForMediaGrid(page, 1)
  await pause(1500)

  for (const index of [0, 1, 2, 3]) {
    const item = page.locator('.item').nth(index)
    await item.hover()
    await pause(1200)
    await scrubElement(page, item, 8, 220)
    await pause(800)
  }
  await pause(1500)
}

async function recordPreviewTimeline(page) {
  await setSetting(page, 'videoPreviewStatic', 'thumb')
  await setSetting(page, 'videoPreviewHover', 'timeline')
  await page.reload({ waitUntil: 'networkidle' })
  await waitForMediaGrid(page, 1)

  for (const index of [0, 2, 4, 1]) {
    const item = page.locator('.item').nth(index)
    await item.hover()
    await scrubElement(page, item, 14, 180)
    await pause(700)
  }
  await pause(1500)
}

async function recordPreviewInline(page) {
  await setSetting(page, 'videoPreviewHover', 'video')
  await setSetting(page, 'delayVideoPreview', '200')
  await page.reload({ waitUntil: 'networkidle' })
  await waitForMediaGrid(page, 1)

  for (const index of [0, 1, 2]) {
    const item = page.locator('.item').nth(index)
    await item.hover()
    await pause(3500)
    await moveMouse(page, 100, 100)
    await pause(800)
  }
  await pause(1500)
}

async function recordPreviewBig(page) {
  await setSetting(page, 'videoPreviewHover', 'video')
  await setSetting(page, 'big_video_preview', '1')
  await setSetting(page, 'delayVideoPreview', '300')
  await setSetting(page, 'big_video_preview_delay', '400')
  await page.reload({ waitUntil: 'networkidle' })
  await waitForMediaGrid(page, 1)

  for (const index of [0, 1]) {
    const item = page.locator('.item').nth(index)
    await item.hover()
    await pause(4500)
    await scrubElement(page, page.locator('.item.big-preview, .item').nth(index), 10, 200)
    await pause(2000)
    await moveMouse(page, 120, 120)
    await pause(1000)
  }
  await pause(1500)
}

async function recordPlayer(page) {
  await waitForMediaGrid(page, 1)
  await openPlayerAt(page, 0)
  const player = page.locator('.v-overlay--active .dialog-player')

  await player.locator('.mdi-play').first().click().catch(() => {})
  await pause(3000)

  const timeline = player.locator('.timeline-slider .v-slider').first()
  if (await timeline.isVisible().catch(() => false)) {
    await scrubElement(page, timeline, 16, 160)
    await pause(1500)
    await scrubElement(page, timeline, 12, 160)
    await pause(1500)
  }

  await player.locator('.playlist-buttons').click()
  await pause(2500)
  await player.locator('.mark-buttons .v-btn').first().click()
  await pause(2500)

  await player.locator('.speed .v-btn').first().click()
  await pause(600)
  await page.locator('.v-overlay--active .v-list-item').filter({ hasText: /^1\.5$|^1,5$/ }).first().click().catch(async () => {
    await page.locator('.v-list-item').filter({ hasText: '1.5' }).first().click()
  })
  await pause(2500)

  await player.locator('.mdi-fullscreen').first().click().catch(() => {})
  await pause(2000)
  await page.keyboard.press('Escape')
  await pause(1000)
  await closeOverlays(page, 2)
  await pause(1500)
}

async function recordFilters(page) {
  await waitForMediaGrid(page, 1)
  await openFilters(page)
  await pause(2000)

  await page.locator('.filters-drawer .v-autocomplete').first().click()
  await pause(1500)
  await page.keyboard.press('Escape')
  await pause(500)

  const addBtn = page.locator('.filters-drawer button').filter({ has: page.locator('.mdi-plus') }).first()
  if (await addBtn.isVisible().catch(() => false)) {
    await addBtn.click()
    await pause(1200)
  }

  await page.getByRole('button', { name: /^save$/i }).click()
  await pause(2000)
  await closeOverlays(page, 1)

  await page.getByRole('button', { name: /^load$/i }).click()
  await pause(2500)
  await closeOverlays(page, 1)

  await closeOverlays(page, 2)
  await page.locator('.v-main .v-select, .v-main .v-autocomplete').first().click()
  await pause(2000)
  await page.keyboard.press('Escape')
  await pause(1500)
}

async function recordChipsTags(page) {
  await page.goto(`${BASE_URL}/meta?metaId=3`)
  await page.locator('.item').first().waitFor({ state: 'visible', timeout: 90_000 })
  await pause(2000)
  await scrollMain(page, 280, 10)
  await pause(2000)

  for (const index of [0, 1, 2]) {
    await page.locator('.item').nth(index).hover()
    await pause(1200)
  }

  const tagItem = page.locator('.item').first()
  await tagItem.click({ button: 'right' })
  await pause(600)
  await page.locator('.v-overlay--active .v-list-item').filter({ hasText: /edit/i }).first().click()
  await page.getByText(/^Editing$/).waitFor({ state: 'visible', timeout: 15_000 })
  await pause(3000)
  await closeOverlays(page, 2)

  await page.locator('.side-bar a[href*="metaId"], .v-navigation-drawer a[href*="metaId"]').first().click().catch(() => {})
  await pause(2000)
  await scrollMain(page, -200, 6)
  await pause(1500)
}

async function recordChipsMeta(page) {
  await page.goto(`${BASE_URL}/settings?tab=library`)
  await page.locator('#settings-doc-tab-library').click()
  await pause(2000)

  const chip = page.locator('.meta-group .v-chip').first()
  await chip.waitFor({ state: 'visible', timeout: 30_000 })
  await chip.click()
  await page.locator('.v-overlay--scroll-blocked .v-card, .v-overlay--active .v-card').first()
    .waitFor({ state: 'visible', timeout: 15_000 })
  await pause(3500)
  await closeOverlays(page, 2)

  await waitForMediaGrid(page, 1)
  for (const index of [0, 1, 2, 3]) {
    await page.locator('.item').nth(index).hover()
    await pause(1000)
  }
  await pause(1500)
}

async function recordEditMedia(page) {
  await waitForMediaGrid(page, 1)
  await page.locator('.item .description').first().click()
  await page.locator('.v-overlay--active .v-card, .v-overlay--scroll-blocked .v-card').first()
    .waitFor({ state: 'visible', timeout: 15_000 })
  await pause(3000)
  await scrollMain(page, 200, 6)
  await pause(2000)
  await scrollMain(page, 200, 6)
  await pause(2000)
  await closeOverlays(page, 2)
  await pause(1500)
}

async function recordPlaylists(page) {
  await page.goto(`${BASE_URL}/playlists`)
  await page.locator('.playlists-page-title, .text-md-h2').first().waitFor({ state: 'visible', timeout: 60_000 })
  await pause(2500)
  await scrollMain(page, 300, 10)
  await pause(2000)
  await scrollMain(page, 300, 10)
  await pause(2000)
  await scrollMain(page, -260, 8)
  await pause(1500)
}

async function recordMarkers(page) {
  await page.goto(`${BASE_URL}/markers`)
  await page.locator('.text-md-h2').first().waitFor({ state: 'visible', timeout: 60_000 })
  await pause(2500)
  await scrollMain(page, 280, 10)
  await pause(2000)

  const search = page.locator('.markers-toolbar__search input').first()
  if (await search.isVisible().catch(() => false)) {
    await search.fill('a')
    await pause(2000)
    await search.fill('')
    await pause(1500)
  }

  await page.locator('.markers-toolbar__sort').click()
  await pause(2000)
  await page.keyboard.press('Escape')
  await pause(1500)
}

async function recordSearch(page) {
  await waitForMediaGrid(page, 1)
  await openGlobalSearch(page)
  await page.locator('.global-search input').first().fill('the')
  await pause(2500)
  await page.locator('.global-search input').first().fill('big')
  await pause(2500)
  await page.locator('.global-search__results .global-search__item, .global-search__results [role="listitem"]').first()
    .hover().catch(() => {})
  await pause(2000)
  await closeOverlays(page, 2)
  await pause(1500)
}

async function recordSettings(page) {
  const tabs = [
    'settings-doc-tab-general',
    'settings-doc-tab-appearance',
    'settings-doc-tab-library',
    'settings-doc-tab-files',
    'settings-doc-tab-database',
  ]

  await page.goto(`${BASE_URL}/settings?tab=general`)
  await page.locator('#settings-doc-tab-general').waitFor({ state: 'visible', timeout: 60_000 })
  await pause(2000)

  for (const tabId of tabs) {
    await page.locator(`#${tabId}`).click()
    await pause(2500)
    await scrollMain(page, 260, 8)
    await pause(2000)
    await scrollMain(page, -180, 6)
    await pause(1200)
  }
  await pause(1500)
}

async function recordAutomation(page) {
  await page.goto(`${BASE_URL}/settings?tab=files`)
  await page.locator('#settings-doc-tab-files').click()
  await pause(2500)
  await scrollMain(page, 320, 10)
  await pause(2500)
  await scrollMain(page, 320, 10)
  await pause(2000)

  await waitForMediaGrid(page, 1)
  const item = page.locator('.item').first()
  await item.click({ button: 'right' })
  await pause(700)
  await page.locator('.v-overlay--active .v-list-item').filter({ hasText: /parse tags/i }).first().hover().catch(() => {})
  await pause(2000)
  await closeOverlays(page, 2)
  await pause(1500)
}

const DEMOS = [
  { name: '01-home', run: recordHome },
  { name: '02-browse-videos', run: recordBrowseVideos },
  { name: '03-browse-images', run: recordBrowseImages },
  { name: '04-browse-audio', run: recordBrowseAudio },
  { name: '05-browse-text', run: recordBrowseText },
  { name: '06-preview-grid', run: recordPreviewGrid },
  { name: '07-preview-timeline', run: recordPreviewTimeline },
  { name: '08-preview-inline', run: recordPreviewInline },
  { name: '09-preview-big', run: recordPreviewBig },
  { name: '10-player', run: recordPlayer },
  { name: '11-filters', run: recordFilters },
  { name: '12-chips-tags', run: recordChipsTags },
  { name: '13-chips-meta', run: recordChipsMeta },
  { name: '14-edit-media', run: recordEditMedia },
  { name: '15-playlists', run: recordPlaylists },
  { name: '16-markers', run: recordMarkers },
  { name: '17-search', run: recordSearch },
  { name: '18-settings', run: recordSettings },
  { name: '19-automation', run: recordAutomation },
]

function convertToMp4(webmPath, mp4Path, { crf = 22, maxRate = '6M' } = {}) {
  execFileSync('ffmpeg', [
    '-y',
    '-i', webmPath,
    '-an',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', String(crf),
    '-maxrate', maxRate,
    '-bufsize', '12M',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    mp4Path,
  ], { stdio: 'pipe' })
}

async function recordDemo({ name, run }) {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    recordVideo: { dir: TMP_DIR, size: VIEWPORT },
  })
  const page = await context.newPage()

  try {
    console.log(`Recording ${name}…`)
    await prepareApp(page)
    await run(page)
    await pause(1200)
  } finally {
    const webmPath = await page.video().path()
    await page.close()
    await context.close()
    await browser.close()

    const mp4Path = join(OUT_DIR, `${name}.mp4`)
    convertToMp4(webmPath, mp4Path)
    await unlink(webmPath).catch(() => {})

    const duration = execFileSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      mp4Path,
    ], { encoding: 'utf8' }).trim()

    console.log(`✓ ${mp4Path} (${Number(duration).toFixed(1)}s)`)
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  await mkdir(TMP_DIR, { recursive: true })

  const selected = ONLY.length
    ? DEMOS.filter((demo) => ONLY.some((name) => demo.name.includes(name)))
    : DEMOS

  if (!selected.length) {
    console.error('No demos matched:', ONLY.join(', '))
    process.exit(1)
  }

  console.log(`Output: ${OUT_DIR}`)
  console.log(`Clips: ${selected.map((demo) => demo.name).join(', ')}\n`)

  for (const demo of selected) {
    try {
      await recordDemo(demo)
    } catch (error) {
      console.error(`✗ ${demo.name}:`, error.message || error)
    }
  }

  console.log(`\nDone — ${selected.length} clips saved to ${OUT_DIR}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
