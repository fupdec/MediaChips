import { getMainScrollEl } from '@/utils/mainScroll'

type VisibilityCallback = (visible: boolean) => void

const callbacks = new Map<Element, VisibilityCallback>()
let observer: IntersectionObserver | null = null
let currentRoot: Element | null = null

function getRoot(): Element | null {
  return getMainScrollEl()
}

function ensureObserver(rootMargin: string): IntersectionObserver {
  const root = getRoot()
  if (observer && currentRoot === root) {
    return observer
  }

  observer?.disconnect()
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        callbacks.get(entry.target)?.(entry.isIntersecting)
      }
    },
    { root, rootMargin, threshold: 0 },
  )
  currentRoot = root

  for (const element of callbacks.keys()) {
    observer.observe(element)
  }

  return observer
}

export function observeVisibility(
  element: Element,
  callback: VisibilityCallback,
  rootMargin: string,
): void {
  callbacks.set(element, callback)
  ensureObserver(rootMargin).observe(element)
}

export function unobserveVisibility(element: Element): void {
  callbacks.delete(element)
  observer?.unobserve(element)
}

export function resetVisibilityObserver(): void {
  observer?.disconnect()
  observer = null
  currentRoot = null
  callbacks.clear()
}
