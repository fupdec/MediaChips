import type { FilterObject } from '../../shared/entities/filter'

export type ItemsFiltersController = {
  apply: () => void | Promise<void>
  applySaved: (filters: FilterObject[] | unknown) => void
  deactivate: (index: number) => void
  deactivateAll: () => void
}

let active: ItemsFiltersController | null = null

export function registerItemsFiltersController(api: ItemsFiltersController) {
  active = api
  return () => {
    if (active === api) active = null
  }
}

export function useItemsFiltersController(): ItemsFiltersController {
  return {
    apply: () => active?.apply(),
    applySaved: (filters) => active?.applySaved(filters),
    deactivate: (index) => active?.deactivate(index),
    deactivateAll: () => active?.deactivateAll(),
  }
}
