import {describe, expect, it, beforeEach, afterEach} from 'vitest'
import fs from 'fs'
import fse from 'fs-extra'
import os from 'os'
import path from 'path'
import express from 'express'
import {
  bindPluginMainRuntime,
  getMountedPluginMainIdsForTests,
  mountInstalledPluginMains,
  resetPluginMainRuntimeForTests,
} from './pluginMainRuntime'

describe('pluginMainRuntime', () => {
  let tempRoot = ''
  let previousAppFolder: string | undefined

  beforeEach(async () => {
    tempRoot = await fse.mkdtemp(path.join(os.tmpdir(), 'mc-plugin-main-'))
    previousAppFolder = process.app_folder
    process.app_folder = tempRoot
    resetPluginMainRuntimeForTests()
  })

  afterEach(async () => {
    process.app_folder = previousAppFolder
    resetPluginMainRuntimeForTests()
    await fse.remove(tempRoot).catch(() => undefined)
  })

  it('mounts mainEntry from an installed plugin package', () => {
    const pluginDir = path.join(tempRoot, 'plugins', 'mediachips.demo')
    fs.mkdirSync(pluginDir, {recursive: true})
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
      id: 'mediachips.demo',
      name: 'Demo',
      version: '0.1.0',
      engines: {mediachips: '>=1.0.0'},
      mainEntry: 'main.cjs',
      permissions: ['api.routes'],
    }))
    fs.writeFileSync(path.join(pluginDir, 'main.cjs'), `
      module.exports = function register(app) {
        app.get('/api/plugin-demo-ok', (_req, res) => res.status(200).send({ok: true}))
      }
    `)

    const app = express()
    bindPluginMainRuntime(app, {} as never)
    expect(getMountedPluginMainIdsForTests()).toContain('mediachips.demo')
  })

  it('skips missing mainEntry files', () => {
    const pluginDir = path.join(tempRoot, 'plugins', 'mediachips.bad')
    fs.mkdirSync(pluginDir, {recursive: true})
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
      id: 'mediachips.bad',
      name: 'Bad',
      version: '0.1.0',
      engines: {mediachips: '>=1.0.0'},
      mainEntry: 'main.cjs',
      permissions: [],
    }))
    const app = express()
    bindPluginMainRuntime(app, {} as never)
    mountInstalledPluginMains()
    expect(getMountedPluginMainIdsForTests()).not.toContain('mediachips.bad')
  })
})
