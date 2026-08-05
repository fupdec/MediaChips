/**
 * Quarantine gate for JS filter-worker list loaders.
 *
 * SQL paths in mediaItemsLoader / tagItemsLoader should own the happy path.
 * Legacy fallbacks remain for unsupported filter shapes, but are counted,
 * logged, and can be hard-disabled for CI:
 *   MEDIA_CHIPS_DISABLE_LEGACY_LIST_LOADERS=1
 *
 * Logging (dev always; prod with any of):
 *   MEDIA_CHIPS_LOG_LEGACY_LIST_LOADERS=1
 *   MEDIA_CHIPS_LOG_LEGACY_MEDIA_LOADER=1
 *   MEDIA_CHIPS_LOG_LEGACY_TAG_LOADER=1
 */

export type LegacyListLoaderKind = 'media' | 'tag'

const fallbackCounts = new Map<string, number>()

export class LegacyListLoaderDisabledError extends Error {
  readonly kind: LegacyListLoaderKind
  readonly reason: string

  constructor(kind: LegacyListLoaderKind, reason: string) {
    super(`[${kind}ItemsLoader] Legacy list loader disabled (reason: ${reason})`)
    this.name = 'LegacyListLoaderDisabledError'
    this.kind = kind
    this.reason = reason
  }
}

function envFlag(name: string): boolean {
  return process.env[name] === '1'
}

export function isLegacyListLoaderDisabled(): boolean {
  return envFlag('MEDIA_CHIPS_DISABLE_LEGACY_LIST_LOADERS')
}

export function shouldLogLegacyListLoader(kind: LegacyListLoaderKind): boolean {
  if (process.env.NODE_ENV !== 'production') return true
  if (envFlag('MEDIA_CHIPS_LOG_LEGACY_LIST_LOADERS')) return true
  if (kind === 'media' && envFlag('MEDIA_CHIPS_LOG_LEGACY_MEDIA_LOADER')) return true
  if (kind === 'tag' && envFlag('MEDIA_CHIPS_LOG_LEGACY_TAG_LOADER')) return true
  return false
}

function countKey(kind: LegacyListLoaderKind, reason: string): string {
  return `${kind}:${reason}`
}

export function getLegacyListLoaderFallbackStats(): Record<string, number> {
  return Object.fromEntries(fallbackCounts.entries())
}

export function resetLegacyListLoaderFallbackStats(): void {
  fallbackCounts.clear()
}

/**
 * Record a legacy fallback. Throws when quarantine kill-switch is on.
 */
export function enterLegacyListLoader(
  kind: LegacyListLoaderKind,
  reason: string,
  detail: string,
): void {
  const key = countKey(kind, reason)
  fallbackCounts.set(key, (fallbackCounts.get(key) || 0) + 1)

  if (isLegacyListLoaderDisabled()) {
    throw new LegacyListLoaderDisabledError(kind, reason)
  }

  if (!shouldLogLegacyListLoader(kind)) return

  const label = kind === 'media' ? 'mediaItemsLoader' : 'tagItemsLoader'
  console.warn(`[${label}] Using legacy JS filter path:`, reason, detail)
}
