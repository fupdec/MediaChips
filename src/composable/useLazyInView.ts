import { ref, onMounted, onBeforeUnmount, watch, nextTick, type Ref } from 'vue'
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
    const el = getElement()
    if (el) unobserveVisibility(el)
  }

  const observe = () => {
    unobserve()
    const el = getElement()
    if (!el) return
    observeVisibility(el, handleVisibility, rootMargin)
  }

  const checkInitialVisibility = () => {
    const el = getElement()
    const root = document.querySelector('.main-scroll')
    if (!el) return

    const rect = el.getBoundingClientRect()
    const rootRect = root?.getBoundingClientRect() ?? {
      top: 0,
      bottom: window.innerHeight,
    }

    if (rect.bottom > rootRect.top && rect.top < rootRect.bottom) {
      isInView.value = true
      wasInView.value = true
    }
  }

  onMounted(() => {
    observe()
    nextTick(checkInitialVisibility)
  })
  onBeforeUnmount(unobserve)

  watch(elementRef, () => observe())

  return { isInView, wasInView }
}
