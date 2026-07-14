import fs from 'fs'
import fse from 'fs-extra'
import os from 'os'
import path from 'path'
import StreamZip from 'node-stream-zip'
import type {PluginCatalogEntry, PluginManifest, PluginPermission} from '../../shared/plugins'
import {normalizeMediaPath} from '../utils/normalizeUserPath'

const MANIFEST_NAMES = ['plugin.json', 'mediachips.plugin.json'] as const
const ALLOWED_PERMISSIONS = new Set<PluginPermission>([
  'ui.settings',
  'ui.menu',
  'ui.dialogs',
  'ui.routes',
  'api.routes',
  'network.external',
  'fs.read',
  'fs.write',
])

export function getPluginsRootDir(): string {
  const base = process.app_folder || path.join(os.homedir(), '.mediachips')
  return path.join(base, 'plugins')
}

export function ensurePluginsRoot(): string {
  const root = getPluginsRootDir()
  fs.mkdirSync(root, {recursive: true})
  return root
}

function isSafePluginId(id: string): boolean {
  return /^[a-z0-9]+(\.[a-z0-9_-]+)+$/i.test(id) && !id.includes('..')
}

function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function parseRelativeEntry(raw: unknown): string | null {
  if (raw == null) return null
  const value = String(raw).trim()
  if (!value) return null
  // Host token for bundled UI modules (official adult).
  if (value.startsWith('host:')) return value
  const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '')
  if (!normalized || normalized.includes('..') || path.isAbsolute(normalized)) {
    throw new Error('plugin.json mainEntry/uiEntry must be a relative path without ..')
  }
  return normalized
}

export function parsePluginManifest(raw: unknown): PluginManifest {
  if (!raw || typeof raw !== 'object') {
    throw new Error('plugin.json must be an object')
  }
  const data = raw as Record<string, unknown>
  const id = String(data.id || '').trim()
  const name = String(data.name || '').trim()
  const version = String(data.version || '').trim()
  if (!id || !isSafePluginId(id)) {
    throw new Error('plugin.json requires a valid id (e.g. mediachips.example)')
  }
  if (!name) throw new Error('plugin.json requires name')
  if (!version) throw new Error('plugin.json requires version')

  const enginesRaw = data.engines
  const engines =
    enginesRaw && typeof enginesRaw === 'object'
      ? (enginesRaw as Record<string, unknown>)
      : {}
  const mediachips = String(engines.mediachips || '').trim()
  if (!mediachips) {
    throw new Error('plugin.json requires engines.mediachips')
  }

  const permissionsRaw = Array.isArray(data.permissions) ? data.permissions : []
  const permissions = permissionsRaw
    .map((item) => String(item))
    .filter((item): item is PluginPermission => ALLOWED_PERMISSIONS.has(item as PluginPermission))

  return {
    id,
    name,
    version,
    description: data.description == null ? undefined : String(data.description),
    author: data.author == null ? undefined : String(data.author),
    homepage: data.homepage == null ? undefined : String(data.homepage),
    icon: data.icon == null ? undefined : String(data.icon).replace(/^mdi-/, ''),
    engines: {mediachips},
    requiresAdult: Boolean(data.requiresAdult),
    permissions,
    mainEntry: parseRelativeEntry(data.mainEntry),
    uiEntry: parseRelativeEntry(data.uiEntry),
  }
}

function readManifestFromDir(dir: string): PluginManifest {
  for (const name of MANIFEST_NAMES) {
    const filePath = path.join(dir, name)
    if (!fs.existsSync(filePath)) continue
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
    return parsePluginManifest(raw)
  }
  throw new Error('plugin.json not found in plugin package')
}

function resolvePackageRoot(extractedDir: string): string {
  const direct = MANIFEST_NAMES.some((name) => fs.existsSync(path.join(extractedDir, name)))
  if (direct) return extractedDir

  const children = fs.readdirSync(extractedDir, {withFileTypes: true})
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
  if (children.length === 1) {
    const nested = path.join(extractedDir, children[0]!.name)
    if (MANIFEST_NAMES.some((name) => fs.existsSync(path.join(nested, name)))) {
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
