import {describe, expect, it, beforeEach, afterEach} from 'vitest'
import fs from 'fs'
import fse from 'fs-extra'
import os from 'os'
import path from 'path'
import {spawnSync} from 'child_process'
import {
  installPluginFromPath,
  listInstalledUserPlugins,
  parsePluginManifest,
  uninstallPlugin,
} from './pluginInstall'

function writeMinimalPlugin(dir: string, id = 'mediachips.demo') {
  fs.mkdirSync(dir, {recursive: true})
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({
    id,
    name: 'Demo plugin',
    version: '1.2.3',
    description: 'Test plugin',
    author: 'MediaChips',
    icon: 'puzzle',
    engines: {mediachips: '>=1.0.0'},
    requiresAdult: false,
    permissions: ['ui.settings', 'fs.read'],
  }, null, 2))
}

describe('pluginInstall', () => {
  let tempRoot = ''
  let previousAppFolder: string | undefined

  beforeEach(async () => {
    tempRoot = await fse.mkdtemp(path.join(os.tmpdir(), 'mc-plugins-'))
    previousAppFolder = process.app_folder
    process.app_folder = tempRoot
  })

  afterEach(async () => {
    process.app_folder = previousAppFolder
    await fse.remove(tempRoot).catch(() => undefined)
  })

  it('parses a valid plugin manifest', () => {
    const manifest = parsePluginManifest({
      id: 'mediachips.demo',
      name: 'Demo',
      version: '0.1.0',
      engines: {mediachips: '>=1.0.0'},
      permissions: ['ui.settings', 'not.allowed'],
      icon: 'mdi-puzzle',
    })
    expect(manifest.id).toBe('mediachips.demo')
    expect(manifest.icon).toBe('puzzle')
    expect(manifest.permissions).toEqual(['ui.settings'])
  })

  it('installs from a folder and lists the plugin', async () => {
    const source = path.join(tempRoot, 'source-demo')
    writeMinimalPlugin(source)

    const entry = await installPluginFromPath(source)
    expect(entry.manifest.id).toBe('mediachips.demo')
    expect(entry.source).toBe('user')
    expect(entry.state).toBe('installed')
    expect(fs.existsSync(path.join(tempRoot, 'plugins', 'mediachips.demo', 'plugin.json'))).toBe(true)

    const listed = listInstalledUserPlugins([])
    expect(listed).toHaveLength(1)
    expect(listed[0]?.manifest.name).toBe('Demo plugin')
  })

  it('installs from a zip package', async () => {
    const folder = path.join(tempRoot, 'zip-source')
    writeMinimalPlugin(folder, 'mediachips.fromzip')
    const zipPath = path.join(tempRoot, 'plugin.zip')
    const zipResult = spawnSync('zip', ['-r', zipPath, '.'], {cwd: folder, encoding: 'utf8'})
    if (zipResult.status !== 0) {
      // Skip when system zip is unavailable (rare on macOS).
      expect(zipResult.status).toBe(0)
      return
    }

    const entry = await installPluginFromPath(zipPath)
    expect(entry.manifest.id).toBe('mediachips.fromzip')
    expect(fs.existsSync(path.join(tempRoot, 'plugins', 'mediachips.fromzip', 'plugin.json'))).toBe(true)
  })

  it('uninstalls a user plugin', async () => {
    const source = path.join(tempRoot, 'source-remove')
    writeMinimalPlugin(source, 'mediachips.remove')
    await installPluginFromPath(source)
    await uninstallPlugin('mediachips.remove')
    expect(fs.existsSync(path.join(tempRoot, 'plugins', 'mediachips.remove'))).toBe(false)
  })

  it('rejects invalid manifests', async () => {
    const source = path.join(tempRoot, 'bad')
    fs.mkdirSync(source, {recursive: true})
    fs.writeFileSync(path.join(source, 'plugin.json'), JSON.stringify({name: 'Nope'}))
    await expect(installPluginFromPath(source)).rejects.toThrow(/id/i)
  })
})
