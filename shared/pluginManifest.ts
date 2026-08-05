import path from 'path'
import type {PluginManifest, PluginPermission} from './plugins'

export const PLUGIN_MANIFEST_NAMES = ['plugin.json', 'mediachips.plugin.json'] as const

export const ALLOWED_PLUGIN_PERMISSIONS = new Set<PluginPermission>([
  'ui.settings',
  'ui.menu',
  'ui.dialogs',
  'ui.routes',
  'api.routes',
  'network.external',
  'fs.read',
  'fs.write',
])

export function isSafePluginId(id: string): boolean {
  return /^[a-z0-9]+(\.[a-z0-9_-]+)+$/i.test(id) && !id.includes('..')
}

export function parseRelativePluginEntry(raw: unknown): string | null {
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
    .filter((item): item is PluginPermission => ALLOWED_PLUGIN_PERMISSIONS.has(item as PluginPermission))

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
    mainEntry: parseRelativePluginEntry(data.mainEntry),
    uiEntry: parseRelativePluginEntry(data.uiEntry),
  }
}
