export const MAIN_SCROLL_SELECTOR = '.main-scroll'

export function getMainScrollEl(): Element | null {
  return document.querySelector(MAIN_SCROLL_SELECTOR)
}

interface ScrollMainToOptions {
  top?: number
  behavior?: ScrollBehavior
}

export function scrollMainTo(options: number | ScrollMainToOptions = {}): void {
  const el = getMainScrollEl()
  const top = typeof options === 'number' ? options : options.top ?? 0
  const behavior = typeof options === 'number' ? 'smooth' : options.behavior ?? 'smooth'

  if (el) {
    el.scrollTo({ top, behavior })
    return
  }

  window.scrollTo({ top, behavior })
}

interface ScrollMainToSelectorOptions {
  offset?: number
  behavior?: ScrollBehavior
  attempts?: number
}

export function scrollMainToSelector(
  selector: string,
  options: ScrollMainToSelectorOptions = {},
): void {
  const {
    offset = 8,
    behavior = 'smooth',
    attempts = 24,
  } = options

  const scrollContainer = getMainScrollEl() as HTMLElement | null
  const element = document.querySelector(selector) as HTMLElement | null

  if (scrollContainer && element) {
    const top = element.getBoundingClientRect().top
      - scrollContainer.getBoundingClientRect().top
      + scrollContainer.scrollTop

    scrollContainer.scrollTo({
      top: Math.max(0, top - offset),
      behavior,
    })
    return
  }

  if (attempts <= 0) return

  requestAnimationFrame(() => {
    scrollMainToSelector(selector, {...options, attempts: attempts - 1})
  })
}
