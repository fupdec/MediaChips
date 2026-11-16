import {test, expect} from '@playwright/test'
import {disableFeatureHints, dismissOnboardingIfVisible, waitForAppShell} from './helpers'

for (const locale of ['en','ru']) {
  test(`global search opens a highlighted setting with Enter (${locale})`, async ({page}) => {
    await disableFeatureHints(page)
    await page.route('**/api/Setting', async route => {
      const response=await route.fetch()
      const rows=await response.json() as Array<{option:string;value:string}>
      await route.fulfill({response,json:[...rows.filter(row=>row.option!=='locale'),{option:'locale',value:locale}]})
    })
    await page.addInitScript(locale=>sessionStorage.setItem('mediachips.locale',locale),locale)
    await page.route('**/api/home/search',route=>route.fulfill({json:{media:[],tags:[]}}))
    const semantic:string[]=[]
    page.on('request',request=>{if(request.method()==='POST' && request.url().includes('/Media/semanticSearch'))semantic.push(request.url())})
    await page.goto('/')
    await waitForAppShell(page)
    await dismissOnboardingIfVisible(page)
    const input=page.locator('.global-search__input-text')
    // App hotkeys are ignored while any blocking overlay is still closing, so a single press can be lost on a busy run.
    await expect(async()=>{
      if(!await input.isVisible())await page.keyboard.press('/')
      await expect(input).toBeVisible({timeout:1_000})
    }).toPass({timeout:10_000})
    await input.fill(locale==='ru'?'разрешение конвертации':'conversion resolution')
    const result=page.locator('.global-search__setting')
    await expect(result).toHaveCount(1)
    await expect(result.locator('mark').first()).toBeVisible()
    await expect(page.locator('.global-search__status')).toHaveCount(0)
    await input.press('ArrowDown')
    await expect(result).toHaveClass(/global-search__item--active/)
    await input.press('Enter')
    await expect(page).toHaveURL(/\/settings\?tab=viewing&section=video_player/)
    await expect(page.locator('#settings-video-player')).toBeVisible()
    expect(semantic).toEqual([])
    await page.unrouteAll({behavior:'wait'})
  })
}

test('global search retains media results alongside settings and supports a setting click', async ({page}) => {
  await disableFeatureHints(page)
  await page.route('**/api/home/search',route=>route.fulfill({json:{
    media:[{id:987654,mediaTypeId:1,name:'conversion demo',path:'/test/demo.mp4'}],tags:[],
  }}))
  await page.goto('/')
  await waitForAppShell(page)
  await dismissOnboardingIfVisible(page)
  await page.keyboard.press('/')
  await page.locator('.global-search__input-text').fill('conversion')
  await expect(page.locator('.global-search__item').filter({hasText:'conversion demo'})).toBeVisible()
  const setting=page.locator('.global-search__setting').first()
  await expect(setting).toBeVisible()
  await page.screenshot({path:'/tmp/mediachips-global-settings-search.png'})
  await setting.click()
  await expect(page).toHaveURL(/section=video_player/)
  await page.unrouteAll({behavior:'wait'})
})
