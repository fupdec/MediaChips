import { defineStore } from 'pinia'
import { getRandomId } from '@/services/formatUtils'
import { cloneContextMenuPayload } from '@/utils/contextMenuClone'
import type { ContextMenuEntry, ContextMenuPayload } from '@/types/stores'

export const useContextMenu = defineStore('contextMenu', {
  state: () => ({
    show: false,
    content: null as ContextMenuEntry[] | null,
    tagMeta: null as unknown,
    targetItemId: null as number | null,
    targetNestedTagId: null as number | null,
    x: 0,
    y: 0,
  }),
  actions: {
    showContextMenu(contextMenuObj: ContextMenuPayload) {
      const parseMenu = (entry: ContextMenuEntry[]) => {
        for (const i of entry) {
          i.id = getRandomId()
          i.show = false
          if (i.type === 'menu' && i.menu) parseMenu(i.menu)
        }
      }

      const contextMenu = cloneContextMenuPayload(contextMenuObj)
      const targetItemId = contextMenu.targetItemId == null
        ? null
        : Number(contextMenu.targetItemId)
      const targetNestedTagId = contextMenu.targetNestedTagId == null
        ? null
        : Number(contextMenu.targetNestedTagId)

      if (contextMenu.content) {
        parseMenu(contextMenu.content)
      }

      setTimeout(() => {
        this.x = contextMenu.x || 0
        this.y = contextMenu.y || 0
        this.content = contextMenu.content || null
        this.tagMeta = contextMenu.tagMeta || null
        this.targetItemId = Number.isFinite(targetItemId) ? targetItemId : null
        this.targetNestedTagId = Number.isFinite(targetNestedTagId) ? targetNestedTagId : null
        this.show = true
      }, 10)
    },
  },
})

export default useContextMenu
