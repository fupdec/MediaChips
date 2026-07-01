import type { ContextMenuEntry, ContextMenuPayload } from '@/types/stores'

function cloneMenuEntry(entry: ContextMenuEntry): ContextMenuEntry {
  return {
    ...entry,
    menu: entry.menu?.map(cloneMenuEntry),
  }
}

export function cloneContextMenuPayload(payload: ContextMenuPayload): ContextMenuPayload {
  return {
    ...payload,
    content: payload.content?.map(cloneMenuEntry),
  }
}
