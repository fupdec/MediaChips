/** Teleport target so overlay content stays visible in native player fullscreen. */
export const PLAYER_OVERLAY_ATTACH = '#player'

export type PlayerTooltipLocation = 'top' | 'bottom' | 'start' | 'end' | 'left' | 'right'

function overlayPlainText(value: unknown) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function playerTooltip(
  text: unknown,
  location: PlayerTooltipLocation = 'top',
) {
  const value = overlayPlainText(text)
  if (!value) return false
  return {
    text: value,
    location,
    attach: PLAYER_OVERLAY_ATTACH,
    zIndex: 4000,
  }
}
