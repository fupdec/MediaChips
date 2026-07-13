import {SFW_COMPILED} from './sfwCompiled'

/**
 * Build-time SFW / App Store strip flag.
 * - Compiler sets `SFW_COMPILED` when MEDIA_CHIPS_SFW=1 (baked into packaged apps).
 * - Env MEDIA_CHIPS_SFW=1 still works for local SFW without a rebuild of this flag.
 * - Renderer also reads import.meta.env.MEDIA_CHIPS_SFW via Vite define.
 */
export function isSfwBuild(): boolean {
  return SFW_COMPILED || String(process.env.MEDIA_CHIPS_SFW || '').trim() === '1'
}
