import type { SetItemsFiltersEvent } from '../../shared/api/responses'

export type ItemsPageCommands = {
  setFilters: (event: SetItemsFiltersEvent) => void | Promise<void>
  setLimit: (limit: number) => void
  setSortBy: (sortBy: string) => void
  setSortDir: (sortDir: string) => void
  setView: (view: number | string) => void
  setGroupBy: (groupBy: string) => void
  refreshAssignedMeta: () => void | Promise<void>
  openRandomItem: (id: number) => void
}

let active: ItemsPageCommands | null = null

export function registerItemsPageCommands(api: ItemsPageCommands) {
  active = api
  return () => {
    if (active === api) active = null
  }
}

export function useItemsPageCommands(): ItemsPageCommands {
  return {
    setFilters: (event) => active?.setFilters(event),
    setLimit: (limit) => active?.setLimit(limit),
    setSortBy: (sortBy) => active?.setSortBy(sortBy),
    setSortDir: (sortDir) => active?.setSortDir(sortDir),
    setView: (view) => active?.setView(view),
    setGroupBy: (groupBy) => active?.setGroupBy(groupBy),
    refreshAssignedMeta: () => active?.refreshAssignedMeta(),
    openRandomItem: (id) => active?.openRandomItem(id),
  }
}
