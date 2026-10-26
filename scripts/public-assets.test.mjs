// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {afterEach, expect, it} from 'vitest'
import {collectPublicAssets} from './public-assets.mjs'

const roots = []
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, {recursive: true, force: true}) })

it('packages static assets while excluding local configuration, backups and credentials', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-public-assets-'))
  roots.push(root)
  fs.mkdirSync(path.join(root, 'images', 'onboarding'), {recursive: true})
  fs.writeFileSync(path.join(root, 'images', 'onboarding', 'welcome.svg'), '<svg/>')
  fs.writeFileSync(path.join(root, 'images', 'config.json'), 'private runtime data')
  fs.writeFileSync(path.join(root, 'loading.html'), '<p>Loading</p>')
  for (const name of ['config.json', 'config.json.bak', 'drive-oauth-tokens.json', '.env', 'index.html']) {
    fs.writeFileSync(path.join(root, name), 'private runtime data')
  }
  fs.symlinkSync(path.join(root, 'config.json'), path.join(root, 'images', 'private.svg'))
  const assets = collectPublicAssets(root)
  expect(assets.map(asset => asset.fileName).sort()).toEqual(['images/onboarding/welcome.svg', 'loading.html'])
  expect(assets.find(asset => asset.fileName.endsWith('welcome.svg')).source.toString()).toBe('<svg/>')
})
