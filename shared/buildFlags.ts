/**
 * Build-time SFW / App Store strip flag.
 * Set MEDIA_CHIPS_SFW=1 for API, Electron main, and dist scripts.
 * Renderer also reads import.meta.env.MEDIA_CHIPS_SFW via Vite define.
 */
export function isSfwBuild(): boolean {
  return String(process.env.MEDIA_CHIPS_SFW || '').trim() === '1'
}
