import { ref, onMounted, onBeforeUnmount, watch, type Ref } from 'vue'
import { observeVisibility, unobserveVisibility } from '@/utils/sharedVisibilityObserver'

const DEFAULT_ROOT_MARGIN = '200px 0px'

type ElementRef = Ref<{ $el?: Element } | Element | null>

export function useLazyInView(
  elementRef: ElementRef,
  options: { rootMargin?: string } = {},
) {
  const isInView = ref(false)
  const wasInView = ref(false)
  const rootMargin = options.rootMargin || DEFAULT_ROOT_MARGIN
  let observedEl: Element | null = null

  const getElement = (): Element | null => {
    const value = elementRef.value
    if (!value) return null
    if ('$el' in value && value.$el instanceof Element) return value.$el
    if (value instanceof Element) return value
    return null
  }

  const handleVisibility = (visible: boolean) => {
    isInView.value = visible
    if (visible) wasInView.value = true
  }

  const unobserve = () => {
    if (observedEl) {
      unobserveVisibility(observedEl)
      observedEl = null
    }
  }

  const observe = () => {
    unobserve()
    const el = getElement()
    if (!el) return
    observedEl = el
    observeVisibility(el, handleVisibility, rootMargin)
  }

  onMounted(() => {
    observe()
  })
  onBeforeUnmount(unobserve)

  watch(elementRef, () => observe())

  return { isInView, wasInView }
}
