/**
 * Overwritten by `scripts/compile.mjs` when MEDIA_CHIPS_MSSTORE=1.
 * Packaged AppX does not inherit that env var, so the flag must be baked in.
 * Only Microsoft Store builds use this — not general SFW/smoke.
 */
export const MSSTORE_COMPILED = false
