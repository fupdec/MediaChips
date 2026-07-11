import { nextTick, onMounted, onUnmounted, ref, type Ref } from 'vue'

export function useAutoListHeight(listRef: Ref<HTMLElement | null>) {
  const listHeight = ref(240)
  let resizeObserver: ResizeObserver | null = null

  const update = () => {
    if (listRef.value) {
      listHeight.value = Math.max(120, listRef.value.clientHeight)
    }
  }

  onMounted(async () => {
    await nextTick()
    update()

    if (typeof ResizeObserver === 'undefined' || !listRef.value) return

    resizeObserver = new ResizeObserver(update)
    resizeObserver.observe(listRef.value)
  })

  onUnmounted(() => {
    resizeObserver?.disconnect()
    resizeObserver = null
  })

  return { listHeight }
}
