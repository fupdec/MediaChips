/** Renderer-side SFW build detection (Vite define + process.env). */
export function isSfwBuild(): boolean {
  return import.meta.env.MEDIA_CHIPS_SFW === 'true'
    || String(process.env.MEDIA_CHIPS_SFW || '').trim() === '1'
}
