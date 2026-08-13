import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue'
import {useSettingsStore} from '@/stores/settings'
import {setOption} from '@/services/settingsService'
import {getMainScrollEl} from '@/utils/mainScroll'

/**
 * Sticky vs in-place control deck above the items grid.
 * Persists via settings.stickyControlDeck ('1' sticky, '0' scrolls away).
 */
export function useStickyControlDeck() {
  const settingsStore = useSettingsStore()
  const controlDeckSentinel = ref<HTMLElement | null>(null)
  const controlDeckStuck = ref(false)
  let deckStuckObserver: IntersectionObserver | null = null

  const stickyControlDeck = computed(() => settingsStore.stickyControlDeck !== '0')

  const controlDeckClass = computed(() => ({
    'items-control-deck--stuck': stickyControlDeck.value && controlDeckStuck.value,
    'items-control-deck--static': !stickyControlDeck.value,
  }))

  function teardownDeckStuckObserver() {
    deckStuckObserver?.disconnect()
    deckStuckObserver = null
  }

  function setupDeckStuckObserver() {
    teardownDeckStuckObserver()
    controlDeckStuck.value = false
    if (!stickyControlDeck.value) return

    const sentinel = controlDeckSentinel.value
    if (!sentinel) return

    const root = getMainScrollEl()
    deckStuckObserver = new IntersectionObserver(
      ([entry]) => {
        controlDeckStuck.value = Boolean(entry && !entry.isIntersecting)
      },
      {
        root: root instanceof Element ? root : null,
        threshold: 0,
        rootMargin: '-8px 0px 0px 0px',
      },
    )
    deckStuckObserver.observe(sentinel)
  }

  async function toggleStickyControlDeck() {
    const next = stickyControlDeck.value ? '0' : '1'
    await setOption(next, 'stickyControlDeck')
  }

  onMounted(() => {
    void nextTick(() => setupDeckStuckObserver())
  })

  onUnmounted(() => {
    teardownDeckStuckObserver()
  })

  watch(stickyControlDeck, () => {
    void nextTick(() => setupDeckStuckObserver())
  })

  return {
    controlDeckSentinel,
    controlDeckStuck,
    controlDeckClass,
    stickyControlDeck,
    toggleStickyControlDeck,
    setupDeckStuckObserver,
    teardownDeckStuckObserver,
  }
}
