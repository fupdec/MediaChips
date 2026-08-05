import fs from 'fs'
import fse from 'fs-extra'
import os from 'os'
import path from 'path'
import StreamZip from 'node-stream-zip'
import type {PluginCatalogEntry, PluginManifest} from '../../shared/plugins'
import {normalizeMediaPath} from '../utils/normalizeUserPath'
import {isPathInside} from '../utils/isPathInside'
import {
  PLUGIN_MANIFEST_NAMES,
  isSafePluginId,
  parsePluginManifest,
} from '../../shared/pluginManifest'

export {parsePluginManifest} from '../../shared/pluginManifest'

export function getPluginsRootDir(): string {
  const base = process.app_folder || path.join(os.homedir(), '.mediachips')
  return path.join(base, 'plugins')
}

export function ensurePluginsRoot(): string {
  const root = getPluginsRootDir()
  fs.mkdirSync(root, {recursive: true})
  return root
}

function readManifestFromDir(dir: string): PluginManifest {
  for (const name of PLUGIN_MANIFEST_NAMES) {
    const filePath = path.join(dir, name)
    if (!fs.existsSync(filePath)) continue
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
    return parsePluginManifest(raw)
  }
  throw new Error('plugin.json not found in plugin package')
}

function resolvePackageRoot(extractedDir: string): string {
  const direct = PLUGIN_MANIFEST_NAMES.some((name) => fs.existsSync(path.join(extractedDir, name)))
  if (direct) return extractedDir

  const children = fs.readdirSync(extractedDir, {withFileTypes: true})
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
  if (children.length === 1) {
    const nested = path.join(extractedDir, children[0]!.name)
    if (PLUGIN_MANIFEST_NAMES.some((name) => fs.existsSync(path.join(nested, name)))) {
      return nested
    }
  }
  throw new Error('plugin.json not found at package root')
}

export function catalogEntryFromPluginDir(
  pluginDir: string,
  enabledPlugins: string[] = [],
): PluginCatalogEntry {
  const manifest = readManifestFromDir(pluginDir)
  const enabled = enabledPlugins.includes(manifest.id)
  return {
    manifest,
    source: 'user',
    state: enabled ? 'enabled' : 'installed',
    uiEntry: manifest.uiEntry ?? null,
    mainEntry: manifest.mainEntry ?? null,
    error: null,
    enabled,
  }
}

export function listInstalledUserPlugins(enabledPlugins: string[] = []): PluginCatalogEntry[] {
  const root = ensurePluginsRoot()
  const entries: PluginCatalogEntry[] = []
  for (const name of fs.readdirSync(root, {withFileTypes: true})) {
    if (!name.isDirectory() || name.name.startsWith('.')) continue
    const pluginDir = path.join(root, name.name)
    try {
      entries.push(catalogEntryFromPluginDir(pluginDir, enabledPlugins))
    } catch (error) {
      entries.push({
        manifest: {
          id: name.name,
          name: name.name,
          version: '0.0.0',
          description: 'Invalid plugin package',
          author: undefined,
          icon: 'alert',
          engines: {mediachips: '>=0.0.0'},
          requiresAdult: false,
          permissions: [],
        },
        source: 'user',
        state: 'error',
        uiEntry: null,
        mainEntry: null,
        error: error instanceof Error ? error.message : String(error),
        enabled: false,
      })
    }
  }
  return entries.sort((a, b) => a.manifest.id.localeCompare(b.manifest.id))
}

async function extractZipToTemp(zipPath: string): Promise<string> {
  const tempRoot = path.join(ensurePluginsRoot(), '.tmp')
  fs.mkdirSync(tempRoot, {recursive: true})
  const dest = path.join(tempRoot, `extract-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  fs.mkdirSync(dest, {recursive: true})

  const zip = new StreamZip.async({file: zipPath})
  try {
    const entries = await zip.entries()
    for (const entry of Object.values(entries)) {
      const name = String(entry.name || '')
      if (!name || name.endsWith('/')) continue
      const normalized = name.replace(/\\/g, '/')
      if (normalized.includes('..') || path.isAbsolute(normalized)) {
        throw new Error(`Unsafe zip entry: ${name}`)
      }
      const target = path.join(dest, normalized)
      if (!isPathInside(dest, target)) {
        throw new Error(`Unsafe zip entry path: ${name}`)
      }
    }
    await zip.extract(null, dest)
  } finally {
    await zip.close().catch(() => undefined)
  }
  return dest
}

export async function installPluginFromPath(inputPath: string): Promise<PluginCatalogEntry> {
  const sourcePath = normalizeMediaPath(inputPath)
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error('Plugin path does not exist')
  }

  const root = ensurePluginsRoot()
  const stats = fs.statSync(sourcePath)
  let packageDir: string
  let cleanupTemp: string | null = null

  if (stats.isFile() && path.extname(sourcePath).toLowerCase() === '.zip') {
    cleanupTemp = await extractZipToTemp(sourcePath)
    packageDir = resolvePackageRoot(cleanupTemp)
  } else {
    throw new Error('Choose a plugin .zip file')
  }

  const manifest = readManifestFromDir(packageDir)

  const targetDir = path.join(root, manifest.id)
  if (fs.existsSync(targetDir)) {
    await fse.remove(targetDir)
  }
  await fse.copy(packageDir, targetDir)

  if (cleanupTemp) {
    await fse.remove(cleanupTemp).catch(() => undefined)
  }

  return catalogEntryFromPluginDir(targetDir, [])
}

export async function uninstallPlugin(pluginId: string): Promise<void> {
  if (!isSafePluginId(pluginId)) {
    throw new Error('Invalid plugin id')
  }
  const targetDir = path.join(ensurePluginsRoot(), pluginId)
  if (!fs.existsSync(targetDir)) {
    throw new Error('Plugin is not installed')
  }
  await fse.remove(targetDir)
}
