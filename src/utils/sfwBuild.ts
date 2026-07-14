/** Renderer-side SFW / adult-strip channel (Vite define + process.env). */
export function isSfwBuild(): boolean {
  return import.meta.env.MEDIA_CHIPS_SFW === 'true'
    || String(process.env.MEDIA_CHIPS_SFW || '').trim() === '1'
}

/** Adult-strip channel (same as SFW). Does not unlock licensing. */
export function isStoreBuild(): boolean {
  return isSfwBuild()
}

/**
 * Official Microsoft Store AppX only.
 * License bypass — not true for MEDIA_CHIPS_SFW smoke builds.
 */
export function isMsStoreBuild(): boolean {
  return import.meta.env.MEDIA_CHIPS_MSSTORE === 'true'
    || String(process.env.MEDIA_CHIPS_MSSTORE || '').trim() === '1'
}
