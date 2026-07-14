/**
 * Overwritten by `scripts/compile.mjs` when MEDIA_CHIPS_SFW=1 (adult-strip channel).
 * Packaged Electron apps do not inherit that env var, so the flag must be baked in.
 */
export const SFW_COMPILED = false
