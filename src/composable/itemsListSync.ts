import type { GetItemsFromDbEvent, RemoveEntitiesEvent } from '../../shared/api/responses'

export type ItemsListSync = {
  getItemsFromDb: (event: GetItemsFromDbEvent) => void
  removeEntitiesFromState: (event: RemoveEntitiesEvent) => void
}

let active: ItemsListSync | null = null

export function registerItemsListSync(api: ItemsListSync) {
  active = api
  return () => {
    if (active === api) active = null
  }
}

export function useItemsListSync(): ItemsListSync {
  return {
    getItemsFromDb: (event) => active?.getItemsFromDb(event),
    removeEntitiesFromState: (event) => active?.removeEntitiesFromState(event),
  }
}
