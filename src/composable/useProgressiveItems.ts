import {computed, onScopeDispose, ref, watch, type Ref} from 'vue'

/** Mount a few cards per paint; retain mounted cards when more data is appended. */
export function useProgressiveItems<T extends {id: number | string}>(
  source: Readonly<Ref<T[]>>,
  resetKey: Readonly<Ref<unknown>>,
  enabled: Readonly<Ref<boolean>> = ref(true),
  batchSize = 3,
) {
  const count = ref(0)
  const batch = Math.max(1, Math.floor(batchSize))
  let frame: number | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let previousIds: Array<number | string> = []
  let previousKey: unknown

  const cancel = () => {
    if (frame != null) cancelAnimationFrame(frame)
    if (timer != null) clearTimeout(timer)
    frame = null
    timer = null
  }

  const schedule = () => {
    if (count.value >= source.value.length) return
    // A timer after rAF gives the browser a paint opportunity before mounting more.
    frame = requestAnimationFrame(() => {
      frame = null
      timer = setTimeout(() => {
        timer = null
        count.value = Math.min(source.value.length, count.value + batch)
        schedule()
      }, 0)
    })
  }

  watch([source, () => source.value.length, resetKey, enabled], ([items, _length, key, active]) => {
    cancel()
    const samePrefix = key === previousKey
      && previousIds.length <= items.length
      && previousIds.every((id, index) => id === items[index].id)
    count.value = !active ? items.length
      : Math.min(items.length, samePrefix ? Math.max(count.value, batch) : batch)
    previousIds = items.map(item => item.id)
    previousKey = key
    schedule()
  }, {immediate: true})

  onScopeDispose(cancel)
  return {
    renderedItems: computed(() => source.value.slice(0, count.value)),
    isRendering: computed(() => count.value < source.value.length),
  }
}
