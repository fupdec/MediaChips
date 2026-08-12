import type { OpenTagsAddWithNamesEvent } from '../../shared/api/responses'

export type AppShellHandlers = {
  showDocumentation: (id: string) => void
  showGlobalSearch: () => void
  showAddMediaDialog: () => void
  showKeyboardShortcuts: () => void
  showCommandPalette: () => void
  toggleCommandPalette: () => void
  openTasksMenu: () => void
  openTagsAddWithNames: (payload: OpenTagsAddWithNamesEvent | string[] | undefined) => void
}

const handlers: Partial<AppShellHandlers> = {}

export function registerAppShellHandler<K extends keyof AppShellHandlers>(
  key: K,
  fn: AppShellHandlers[K],
) {
  handlers[key] = fn
  return () => {
    if (handlers[key] === fn) delete handlers[key]
  }
}

export function useAppShell(): AppShellHandlers {
  return {
    showDocumentation: (id) => handlers.showDocumentation?.(id),
    showGlobalSearch: () => handlers.showGlobalSearch?.(),
    showAddMediaDialog: () => handlers.showAddMediaDialog?.(),
    showKeyboardShortcuts: () => handlers.showKeyboardShortcuts?.(),
    showCommandPalette: () => handlers.showCommandPalette?.(),
    toggleCommandPalette: () => handlers.toggleCommandPalette?.(),
    openTasksMenu: () => handlers.openTasksMenu?.(),
    openTagsAddWithNames: (payload) => handlers.openTagsAddWithNames?.(payload),
  }
}
