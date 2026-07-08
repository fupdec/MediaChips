#!/usr/bin/env node
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'

const BASE_URL = process.env.APP_URL || 'http://localhost:3000'
const OUT_DIR = process.env.OUT_DIR || '/Users/vit/Desktop/work/mediachips-website/public/images'
const TMP_DIR = process.env.TMP_DIR || join(dirname(OUT_DIR), '.screenshots-tmp')

const VIEWPORT = { width: 1440, height: 900 }

async function saveJpeg(page, selector, outName, options = {}) {
  const pngPath = join(TMP_DIR, `${outName}.png`)
  const jpegPath = join(OUT_DIR, `${outName}.jpeg`)
  const target = selector ? page.locator(selector).first() : page
  await target.screenshot({ path: pngPath, type: 'png', animations: 'disabled', ...options })
  execSync(`sips -s format jpeg "${pngPath}" --out "${jpegPath}"`, { stdio: 'pipe' })
  console.log(`✓ ${jpegPath}`)
}

async function savePng(page, selector, outName, options = {}) {
  const pngPath = join(OUT_DIR, `${outName}.png`)
  const target = selector ? page.locator(selector).first() : page
  await target.screenshot({ path: pngPath, type: 'png', animations: 'disabled', ...options })
  console.log(`✓ ${pngPath}`)
}

async function dismissOnboarding(page) {
  const skip = page.getByRole('button', { name: /^(skip|omitir|пропустить|跳过)$/i })
  for (let i = 0; i < 40; i++) {
    if (await skip.isVisible().catch(() => false)) {
      await skip.click()
      await page.waitForTimeout(800)
    }
    if ((await page.locator('.v-overlay--active').count()) === 0) break
    await page.waitForTimeout(300)
  }
}

async function prepareApp(page) {
  await page.goto(BASE_URL)
  await page.locator('#app').waitFor({ state: 'visible', timeout: 60_000 })
  await page.locator('.v-application').waitFor({ state: 'visible', timeout: 60_000 })
  await dismissOnboarding(page)
  await page.request.put(`${BASE_URL}/api/Setting/sfwMode`, { data: { value: '1' } })
  await page.request.put(`${BASE_URL}/api/Setting/onboardingCompleted`, { data: { value: '1' } })
  await page.reload({ waitUntil: 'networkidle' })
  await dismissOnboarding(page)
}

async function waitForMediaGrid(page) {
  await page.goto(`${BASE_URL}/media?mediaTypeId=1`)
  await page.locator('.v-application').waitFor({ state: 'visible', timeout: 60_000 })
  await dismissOnboarding(page)
  await page.locator('.item, .items-page-grid, .items-masonry-grid, .items-virtual-grid').first().waitFor({
    state: 'visible',
    timeout: 90_000,
  })
  await page.waitForTimeout(2000)
}

async function openFilters(page) {
  const filterBtn = page.locator('.v-app-bar').getByRole('button', { name: /filter|фильтр|filtro|筛选/i }).first()
  if (await filterBtn.isVisible().catch(() => false)) {
    await filterBtn.click()
  } else {
    await page.locator('.v-app-bar button').filter({ has: page.locator('[class*="filter"]') }).first().click()
  }
  await page.locator('.filters-drawer').waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(800)
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  await mkdir(TMP_DIR, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 }).then((c) => c.newPage())

  try {
    console.log('Preparing app…')
    await prepareApp(page)

    console.log('Capturing media library…')
    await waitForMediaGrid(page)
    await saveJpeg(page, '.v-main', 'videos')

    console.log('Capturing filters panel…')
    await openFilters(page)
    await saveJpeg(page, '.v-application', 'filters')

    console.log('Capturing add-filter UI…')
    await page.locator('.filters-drawer .v-autocomplete').first().click()
    await page.waitForTimeout(700)
    await saveJpeg(page, '.v-application', 'add-filter')

    console.log('Capturing sort controls…')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    await page.locator('.v-main .v-select, .v-main .v-autocomplete').first().click()
    await page.waitForTimeout(600)
    await saveJpeg(page, '.v-main', 'sort')

    console.log('Capturing tags page…')
    await page.goto(`${BASE_URL}/meta?metaId=18`)
    await page.locator('.v-application').waitFor({ state: 'visible', timeout: 60_000 })
    await page.locator('.items-page-grid .item, .items-masonry-grid .item, .items-virtual-grid .item, .item').first().waitFor({
      state: 'visible',
      timeout: 90_000,
    })
    await page.waitForTimeout(1500)
    await saveJpeg(page, '.v-main', 'tags')

    console.log('Capturing tag edit dialog…')
    await page.locator('.item').first().click({ button: 'right' })
    await page.waitForTimeout(500)
    await page.locator('.v-overlay--active .v-list-item').filter({ hasText: /редакт|edit tag|editar|编辑/i }).first().click()
    await page.getByText(/^Editing$/).waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(800)
    await saveJpeg(page, '.v-overlay--active .v-card', 'edit-tag')

    console.log('Capturing meta settings…')
    await page.keyboard.press('Escape')
    await page.goto(`${BASE_URL}/settings?tab=library`)
    await page.locator('#settings-doc-tab-library').click()
    await page.locator('.meta-group .v-chip').first().waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForTimeout(1000)
    await page.locator('.meta-group .v-chip').first().click()
    await page.locator('.v-overlay--scroll-blocked .v-card').first().waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(800)
    await saveJpeg(page, '.v-overlay--scroll-blocked .v-card', 'edit-meta')

    console.log('Capturing hero poster…')
    await page.keyboard.press('Escape')
    await waitForMediaGrid(page)
    await savePng(page, '.v-main', 'filters-min')

    console.log('\nDone.')
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
