import orderBy from 'lodash/orderBy'

export const LIBRARY_NAV_STATIC_KEYS = ['home', 'folders', 'playlists', 'markers'] as const

export type LibraryNavStaticKey = (typeof LIBRARY_NAV_STATIC_KEYS)[number]

export type LibraryNavKey = LibraryNavStaticKey | `media-${number}`

export interface LibraryNavLegacyFlags {
  showPlaylists?: boolean
  showMarkers?: boolean
}

export interface LibraryNavConfig {
  order: LibraryNavKey[]
  hidden: Record<string, boolean>
}

export interface LibraryNavMediaTypeRef {
  id: number
  order?: number | null
  hidden?: boolean | null
}

export function mediaTypeNavKey(id: number | string): `media-${number}` {
  return `media-${Number(id)}`
}

export function parseMediaTypeNavKey(key: string): number | null {
  const match = /^media-(\d+)$/.exec(key)
  if (!match) return null
  const id = Number(match[1])
  return Number.isFinite(id) && id > 0 ? id : null
}

export function isLibraryNavStaticKey(key: string): key is LibraryNavStaticKey {
  return (LIBRARY_NAV_STATIC_KEYS as readonly string[]).includes(key)
}

export function isLibraryNavKey(key: string, mediaTypeIds: Set<number>): key is LibraryNavKey {
  if (isLibraryNavStaticKey(key)) return true
  const id = parseMediaTypeNavKey(key)
  return id != null && mediaTypeIds.has(id)
}

export function buildDefaultLibraryNavConfig(
  mediaTypes: LibraryNavMediaTypeRef[],
  legacyFlags: LibraryNavLegacyFlags = {},
): LibraryNavConfig {
  const sorted = orderBy(mediaTypes, ['order', 'id'], ['asc', 'asc'])
  const order: LibraryNavKey[] = [
    'home',
    ...sorted.map((item) => mediaTypeNavKey(item.id)),
    'folders',
    'playlists',
    'markers',
  ]

  const hidden: Record<string, boolean> = {
    home: false,
    folders: false,
    playlists: legacyFlags.showPlaylists === false,
    markers: legacyFlags.showMarkers === false,
  }

  for (const item of mediaTypes) {
    hidden[mediaTypeNavKey(item.id)] = Boolean(item.hidden)
  }

  return {order, hidden}
}

function cloneConfig(config: LibraryNavConfig): LibraryNavConfig {
  return {
    order: [...config.order],
    hidden: {...config.hidden},
  }
}

export function mergeLibraryNavConfig(
  raw: string | LibraryNavConfig | null | undefined,
  mediaTypes: LibraryNavMediaTypeRef[],
  legacyFlags: LibraryNavLegacyFlags = {},
): LibraryNavConfig {
  const defaults = buildDefaultLibraryNavConfig(mediaTypes, legacyFlags)
  if (!raw) return defaults

  let parsed: Partial<LibraryNavConfig> = {}
  try {
    parsed = typeof raw === 'string' ? (JSON.parse(raw) as Partial<LibraryNavConfig>) : raw
  } catch {
    return defaults
  }

  const mediaTypeIds = new Set(mediaTypes.map((item) => item.id))
  const knownKeys = new Set<string>([
    ...LIBRARY_NAV_STATIC_KEYS,
    ...[...mediaTypeIds].map((id) => mediaTypeNavKey(id)),
  ])

  const order: LibraryNavKey[] = []
  const seen = new Set<string>()

  if (Array.isArray(parsed.order)) {
    for (const key of parsed.order) {
      if (typeof key !== 'string') continue
      if (!isLibraryNavKey(key, mediaTypeIds)) continue
      if (seen.has(key)) continue
      order.push(key)
      seen.add(key)
    }
  }

  for (const key of defaults.order) {
    if (seen.has(key)) continue
    order.push(key)
    seen.add(key)
  }

  const hidden: Record<string, boolean> = {}
  for (const key of knownKeys) {
    if (parsed.hidden && typeof parsed.hidden === 'object' && typeof parsed.hidden[key] === 'boolean') {
      hidden[key] = parsed.hidden[key]
      continue
    }
    hidden[key] = defaults.hidden[key] === true
  }

  // Empty / first-run config: honour legacy appearance switches when keys were not persisted yet.
  const hadPersistedHidden = Boolean(parsed.hidden && typeof parsed.hidden === 'object')
  if (!hadPersistedHidden) {
    if (legacyFlags.showPlaylists === false) hidden.playlists = true
    if (legacyFlags.showMarkers === false) hidden.markers = true
  }

  return {order, hidden}
}

export function parseLibraryNavConfig(
  raw: string | LibraryNavConfig | null | undefined,
  mediaTypes: LibraryNavMediaTypeRef[],
  legacyFlags: LibraryNavLegacyFlags = {},
): LibraryNavConfig {
  return mergeLibraryNavConfig(raw, mediaTypes, legacyFlags)
}

export function serializeLibraryNavConfig(config: LibraryNavConfig): string {
  return JSON.stringify(cloneConfig(config))
}

export function isLibraryNavItemHidden(config: LibraryNavConfig, key: string): boolean {
  return config.hidden[key] === true
}
