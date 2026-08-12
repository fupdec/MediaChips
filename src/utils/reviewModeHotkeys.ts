import {isPlainKey} from '@/utils/playerHotkeys'

export type ReviewHotkeyAction =
  | {type: 'close'}
  | {type: 'prev'}
  | {type: 'next'}
  | {type: 'rating'; value: number | null}
  | {type: 'favorite'}
  | {type: 'tag'; code: string}
  | {type: 'play'}
  | {type: 'edit'}
  | {type: 'inboxDone'}

/**
 * Map a keyboard event to a review-mode action.
 * Digits = rating, Q–O = pinned tags, arrows = navigate.
 */
export function resolveReviewHotkey(
  event: KeyboardEvent,
  options: {fromInbox?: boolean} = {},
): ReviewHotkeyAction | null {
  if (!isPlainKey(event)) return null

  switch (event.code) {
    case 'Escape':
      return {type: 'close'}
    case 'ArrowLeft':
    case 'KeyH':
    case 'KeyK':
      return {type: 'prev'}
    case 'ArrowRight':
    case 'KeyL':
    case 'KeyJ':
      return {type: 'next'}
    case 'KeyD':
      return options.fromInbox ? {type: 'inboxDone'} : null
    case 'KeyF':
      return {type: 'favorite'}
    case 'Space':
      return {type: 'play'}
    case 'KeyP':
      return {type: 'edit'}
    case 'Digit0':
    case 'Numpad0':
    case 'Backquote':
      return {type: 'rating', value: null}
    case 'Digit1':
    case 'Numpad1':
      return {type: 'rating', value: 1}
    case 'Digit2':
    case 'Numpad2':
      return {type: 'rating', value: 2}
    case 'Digit3':
    case 'Numpad3':
      return {type: 'rating', value: 3}
    case 'Digit4':
    case 'Numpad4':
      return {type: 'rating', value: 4}
    case 'Digit5':
    case 'Numpad5':
      return {type: 'rating', value: 5}
    case 'KeyQ':
    case 'KeyW':
    case 'KeyE':
    case 'KeyR':
    case 'KeyT':
    case 'KeyY':
    case 'KeyU':
    case 'KeyI':
    case 'KeyO':
      return {type: 'tag', code: event.code}
    default:
      return null
  }
}
