import { ref } from 'vue'

/** IDs of items currently in or near the viewport. */
export const visibleItemIds = ref<number[]>([])

const visibleSet = new Set<number>()

function syncVisibleIds(): void {
  visibleItemIds.value = [...visibleSet]
}

export function markItemVisible(id: number | string): void {
  const normalized = Number(id)
  if (!Number.isFinite(normalized)) return
  if (visibleSet.has(normalized)) return
  visibleSet.add(normalized)
  syncVisibleIds()
}

export function markItemHidden(id: number | string): void {
  const normalized = Number(id)
  if (!visibleSet.has(normalized)) return
  visibleSet.delete(normalized)
  syncVisibleIds()
}

export function setVisibleItemIds(ids: Array<number | string>): void {
  visibleSet.clear()
  for (const id of ids) {
    const normalized = Number(id)
    if (Number.isFinite(normalized)) visibleSet.add(normalized)
  }
  syncVisibleIds()
}

export function clearVisibleItemIds(): void {
  visibleSet.clear()
  syncVisibleIds()
}
