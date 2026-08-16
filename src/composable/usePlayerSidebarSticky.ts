import {computed, onBeforeUnmount, ref, watch} from 'vue'

export function usePlayerSidebarSticky() {
  const stickyEl = ref<HTMLElement | null>(null)
  const stickyHeight = ref(0)
  let observer: ResizeObserver | null = null

  function measure(el: HTMLElement | null) {
    observer?.disconnect()
    observer = null
    if (!el) {
      stickyHeight.value = 0
      return
    }
    const update = () => {
      stickyHeight.value = Math.ceil(el.getBoundingClientRect().height)
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    observer = new ResizeObserver(update)
    observer.observe(el)
  }

  watch(stickyEl, (el) => measure(el), {flush: 'post'})
  onBeforeUnmount(() => measure(null))

  const bodyStyle = computed(() => ({
    '--player-sidebar-sticky-h': `${stickyHeight.value}px`,
  }))

  return {stickyEl, bodyStyle}
}
