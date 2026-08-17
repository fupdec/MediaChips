export type FoldersHotkeyAction =
  | 'go-up'
  | 'history-back'
  | 'history-forward'
  | 'open-folder'
  | 'open-tags'
  | 'delete-media'
  | 'play-media'
  | 'edit-media'
  | null

export type FoldersFocusKind = 'folder' | 'media' | null

export function resolveFoldersHotkey(input: {
  code: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  focusedKind: FoldersFocusKind
}): FoldersHotkeyAction {
  const meta = Boolean(input.metaKey || input.ctrlKey)
  const alt = Boolean(input.altKey)
  const shift = Boolean(input.shiftKey)

  if (shift) return null

  if (meta && !alt && input.code === 'BracketLeft') return 'history-back'
  if (meta && !alt && input.code === 'BracketRight') return 'history-forward'

  if (alt && input.code === 'ArrowUp') return 'go-up'

  if (input.code === 'Backspace') {
    if (meta && input.focusedKind === 'media') return 'delete-media'
    return 'go-up'
  }

  if (input.code === 'Delete' && input.focusedKind === 'media') return 'delete-media'

  if (meta || alt) return null

  if (input.code === 'KeyT') return 'open-tags'

  if (input.code === 'Enter' || input.code === 'KeyE') {
    if (input.focusedKind === 'folder') return 'open-folder'
    if (input.focusedKind === 'media') return 'edit-media'
    return null
  }

  if (input.code === 'Space' && input.focusedKind === 'media') return 'play-media'

  return null
}
