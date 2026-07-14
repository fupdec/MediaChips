import {SFW_COMPILED} from './sfwCompiled'
import {MSSTORE_COMPILED} from './msStoreCompiled'

/**
 * Store / “clean” build channel (adult not bundled).
 *
 * When true:
 * - Adult plugin is **not** bundled (no catalog entry, no scraper routes in asar).
 * - Users install Adult from https://mediachips.app/plugins (zip → mainEntry + host:bundled UI).
 *
 * When false (standard / general release):
 * - Adult is bundled and can be enabled in Settings → Plugins.
 *
 * Does **not** unlock licensing — that is `isMsStoreBuild()` only.
 */
export function isSfwBuild(): boolean {
  return SFW_COMPILED || String(process.env.MEDIA_CHIPS_SFW || '').trim() === '1'
}

/** Alias for adult-strip channel checks (same as SFW today). */
export function isStoreBuild(): boolean {
  return isSfwBuild()
}

/**
 * Official Microsoft Store AppX only (`MEDIA_CHIPS_MSSTORE=1` / `MSSTORE_COMPILED`).
 * Always-activated license bypass — not set for dist:store / dist:sfw smoke builds.
 */
export function isMsStoreBuild(): boolean {
  return MSSTORE_COMPILED || String(process.env.MEDIA_CHIPS_MSSTORE || '').trim() === '1'
}
