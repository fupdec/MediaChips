import type { SetItemsFiltersEvent } from '../../shared/api/responses'
import type { SavedViewLayout } from '@/utils/savedViewLayout'

export type ItemsPageCommands = {
  setFilters: (event: SetItemsFiltersEvent) => void | Promise<void>
  /** Reload the current list from DB using filters already in the items store. */
  reloadItems: () => void | Promise<void>
  setLimit: (limit: number) => void
  setSortBy: (sortBy: string) => void
  setSortDir: (sortDir: string) => void
  setView: (view: number | string) => void
  setGroupBy: (groupBy: string) => void
  /**
   * Apply saved view layout (sort/group/size/view) without reloading.
   * Callers that also change filters should reload afterwards.
   */
  applySavedViewLayout: (layout: SavedViewLayout) => void | Promise<void>
  refreshAssignedMeta: () => void | Promise<void>
  refreshCurrentMeta: () => void
  openRandomItem: (id: number) => void
}

let active: ItemsPageCommands | null = null

export function registerItemsPageCommands(api: ItemsPageCommands) {
  active = api
  return () => {
    if (active === api) active = null
  }
}

/** True once LayoutItems has mounted and registered page commands. */
export function isItemsPageCommandsRegistered(): boolean {
  return active != null
}

export function useItemsPageCommands(): ItemsPageCommands {
  return {
    setFilters: (event) => active?.setFilters(event),
    reloadItems: () => active?.reloadItems(),
    setLimit: (limit) => active?.setLimit(limit),
    setSortBy: (sortBy) => active?.setSortBy(sortBy),
    setSortDir: (sortDir) => active?.setSortDir(sortDir),
    setView: (view) => active?.setView(view),
    setGroupBy: (groupBy) => active?.setGroupBy(groupBy),
    applySavedViewLayout: (layout) => active?.applySavedViewLayout(layout),
    refreshAssignedMeta: () => active?.refreshAssignedMeta(),
    refreshCurrentMeta: () => active?.refreshCurrentMeta(),
    openRandomItem: (id) => active?.openRandomItem(id),
  }
}
