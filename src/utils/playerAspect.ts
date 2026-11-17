/** Display aspect ratio override for the player video (e.g. re-encoded files with a wrong DAR). */
export const PLAYER_ASPECT_MODES = ['auto', '4:3', '16:9', '16:10', '21:9', '1:1', 'stretch', 'cover'] as const

export type PlayerAspectMode = typeof PLAYER_ASPECT_MODES[number]

/** Numeric width/height for a fixed-ratio mode, otherwise null. */
export function aspectModeRatio(mode: PlayerAspectMode): number | null {
  const match = /^(\d+):(\d+)$/.exec(mode)
  if (!match) return null
  return Number(match[1]) / Number(match[2])
}

/** Largest box with the given ratio that fits inside the container (px, rounded down). */
export function fitAspectBox(
  containerWidth: number,
  containerHeight: number,
  ratio: number,
): { width: number; height: number } | null {
  if (!(containerWidth > 0) || !(containerHeight > 0) || !(ratio > 0)) return null
  const width = Math.min(containerWidth, containerHeight * ratio)
  return { width: Math.floor(width), height: Math.floor(width / ratio) }
}
